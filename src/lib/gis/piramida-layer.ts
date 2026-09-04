/**
 * Lapisan Leaflet utk piramida raster lokal — L.GridLayer yang menyaji tile JPEG
 * dari IndexedDB (hasil konverter otomatis di worker).
 *
 * Cara gambar satu tile dunia (z/x/y, ukuran 512):
 *  1. Proyeksikan bbox raster ke piksel-dunia pada zoom z → rect raster.
 *  2. Iris dengan rect tile dunia — kalau tak beririsan, tile transparan.
 *  3. Pilih LEVEL piramida: level terkecil yang lebarpx-nya ≥ lebar raster pada
 *     zoom ini (kalau semua lebih kecil → pakai level terhalus, tampil kabal/blur).
 *  4. Muat tile level yang beririsan, gambar ke canvas 512 dengan skala yang pas.
 * Tile kembali dipakai via cache URL + LRU (revoke saat diusir).
 */

import L from "leaflet";
import { ambilTilePiramida, kunciTile, type MetaPiramida } from "./piramida-db";

const TILE = 512;
const MAKS_CACHE_URL = 400;

export function buatLapisanPiramida(opsi: {
  meta: MetaPiramida;
  bounds: L.LatLngBounds;
  opasitas: number;
}): L.GridLayer {
  const { meta, bounds } = opsi;
  const level = meta.level; // terurut kasar → halus
  if (!level.length) throw new Error("Piramida kosong");

  // ---- cache URL blob + LRU sederhana ----
  const cacheUrl = new Map<string, { url: string; pakai: number }>();
  let detikPakai = 0;
  const urlTile = async (li: number, kolom: number, baris: number): Promise<string | null> => {
    const kunci = kunciTile(li, kolom, baris);
    const hit = cacheUrl.get(kunci);
    if (hit) {
      hit.pakai = ++detikPakai;
      return hit.url;
    }
    const blob = await ambilTilePiramida(meta.id, kunci);
    if (!blob) return null;
    const url = URL.createObjectURL(blob);
    cacheUrl.set(kunci, { url, pakai: ++detikPakai });
    if (cacheUrl.size > MAKS_CACHE_URL) {
      let kLama: string | null = null;
      let pLama = Infinity;
      for (const [k, v] of cacheUrl) {
        if (v.pakai < pLama) {
          pLama = v.pakai;
          kLama = k;
        }
      }
      if (kLama) {
        URL.revokeObjectURL(cacheUrl.get(kLama)!.url);
        cacheUrl.delete(kLama);
      }
    }
    return url;
  };

  const muatGambar = (url: string): Promise<HTMLImageElement | null> =>
    new Promise((resolve) => {
      const im = new Image();
      im.onload = () => resolve(im);
      im.onerror = () => resolve(null);
      im.src = url;
    });

  const gambarTile = async (
    canvas: HTMLCanvasElement,
    coords: L.Coords,
    selesai: L.DoneCallback
  ) => {
    try {
      const crs = L.CRS.EPSG3857;
      const W = crs.scale(coords.z) * 2; // lebar dunia px utk grid tile 512
      const nw = crs.latLngToPoint(bounds.getNorthWest(), coords.z).multiplyBy(2);
      const se = crs.latLngToPoint(bounds.getSouthEast(), coords.z).multiplyBy(2);
      const rx0 = nw.x;
      const ry0 = nw.y;
      const rw = se.x - nw.x;
      const rh = se.y - nw.y;
      const tx0 = coords.x * TILE;
      const ty0 = coords.y * TILE;
      const ix0 = Math.max(tx0, rx0);
      const iy0 = Math.max(ty0, ry0);
      const ix1 = Math.min(tx0 + TILE, rx0 + rw);
      const iy1 = Math.min(ty0 + TILE, ry0 + rh);
      if (ix1 <= ix0 || iy1 <= iy0) {
        selesai();
        return;
      }
      // pilih level: terkecil yang ≥ kebutuhan px (rw = lebar raster px-dunia)
      let pilih = level.length - 1;
      for (let i = 0; i < level.length; i++) {
        if (level[i].lebarPx >= rw) {
          pilih = i;
          break;
        }
      }
      const lv = level[pilih];
      const skala = rw / lv.lebarPx; // px dunia per px level
      // rentang tile level yang beririsan
      const lx0 = (ix0 - rx0) / skala;
      const ly0 = (iy0 - ry0) / skala;
      const lx1 = (ix1 - rx0) / skala;
      const ly1 = (iy1 - ry0) / skala;
      const k0 = Math.max(0, Math.floor(lx0 / TILE));
      const k1 = Math.min(lv.kolom - 1, Math.floor((lx1 - 1) / TILE));
      const b0 = Math.max(0, Math.floor(ly0 / TILE));
      const b1 = Math.min(lv.baris - 1, Math.floor((ly1 - 1) / TILE));
      const ctx = canvas.getContext("2d")!;
      ctx.imageSmoothingEnabled = true;
      const tugas: Promise<void>[] = [];
      for (let b = b0; b <= b1; b++) {
        for (let k = k0; k <= k1; k++) {
          tugas.push(
            (async () => {
              const url = await urlTile(pilih, k, b);
              if (!url) return;
              const im = await muatGambar(url);
              if (!im) return;
              const dx = rx0 + k * TILE * skala - tx0;
              const dy = ry0 + b * TILE * skala - ty0;
              ctx.drawImage(im, dx, dy, im.width * skala, im.height * skala);
            })()
          );
        }
      }
      await Promise.all(tugas);
    } catch (e) {
      // permudah diagnosa di konsol saat pengembangan
      (window as unknown as { __piramidaErr?: string }).__piramidaErr = String(e);
    }
    selesai();
  };

  const Impl = L.GridLayer.extend({
    createTile(coords: L.Coords, selesai: L.DoneCallback): HTMLElement {
      const canvas = document.createElement("canvas");
      canvas.width = TILE;
      canvas.height = TILE;
      canvas.className = "leaflet-tile";
      void gambarTile(canvas, coords, selesai);
      return canvas;
    },
  }) as unknown as new (opsi?: L.GridLayerOptions) => L.GridLayer;

  return new Impl({
    tileSize: TILE,
    bounds,
    opacity: opsi.opasitas,
    pane: "raster-pane",
    className: "geokita-raster geokita-piramida",
    updateWhenIdle: true,
    keepBuffer: 1,
  });
}
