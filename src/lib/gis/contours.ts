/**
 * Pembuatan kontur: interpolasi IDW ke grid → marching squares (d3-contour)
 * → garis kontur berlabel elevasi.
 */
import { contours as d3contours } from "d3-contour";
import type { ContourPath, LatLng } from "./types";
import { bbox } from "./geo";

export interface TitikElevasi {
  lat: number;
  lng: number;
  elev: number;
}

interface GridCache {
  bbox: { minLat: number; maxLat: number; minLng: number; maxLng: number };
  w: number;
  h: number;
  values: Float64Array;
}

/** Cache grid terakhir — dipakai ulang oleh tampilan 3D & volume. */
let gridCache: GridCache | null = null;
export function ambilGridCache(): GridCache | null {
  return gridCache;
}

/** Warna elevasi: biru (rendah) → hijau → kuning → merah (tinggi). */
export function warnaElevasi(t: number): string {
  const tt = Math.min(1, Math.max(0, t));
  const hue = 240 - tt * 240; // 240 (biru) → 0 (merah)
  return `hsl(${hue}, 75%, 45%)`;
}

function idwNilai(
  gx: number,
  gy: number,
  pts: TitikElevasi[],
  px: number[], // posisi x grid tiap titik
  py: number[],
  pangkat = 2
): number {
  let num = 0;
  let den = 0;
  for (let i = 0; i < pts.length; i++) {
    const dx = gx - px[i];
    const dy = gy - py[i];
    const d2 = dx * dx + dy * dy + 1e-9;
    if (d2 < 1e-6) return pts[i].elev;
    const w = 1 / Math.pow(d2, pangkat / 2);
    num += w * pts[i].elev;
    den += w;
  }
  return den > 0 ? num / den : 0;
}

export interface HasilKontur {
  paths: ContourPath[];
  levels: number[];
}

/**
 * Hasilkan kontur dari titik-titik elevasi.
 * @param interval Jarak antar level (meter); jika null → otomatis (≈10 level).
 */
export function hasilkanKontur(
  titikElev: TitikElevasi[],
  interval: number | null
): HasilKontur {
  if (titikElev.length < 3) throw new Error("Minimal 3 titik berketinggian diperlukan");

  // Sampling maksimum agar tetap responsif
  const pts = titikElev.length > 2500 ? sample(titikElev, 2500) : titikElev;
  const bb = bbox(pts);
  const rentangLat = Math.max(bb.maxLat - bb.minLat, 1e-6);
  const rentangLng = Math.max(bb.maxLng - bb.minLng, 1e-6);

  const w = 170;
  const h = Math.max(40, Math.min(170, Math.round((w * rentangLat) / rentangLng)));
  const values = new Float64Array(w * h);

  const px = pts.map((p) => ((p.lng - bb.minLng) / rentangLng) * (w - 1));
  const py = pts.map((p) => (1 - (p.lat - bb.minLat) / rentangLat) * (h - 1));

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      values[y * w + x] = idwNilai(x, y, pts, px, py);
    }
  }

  gridCache = { bbox: bb, w, h, values };

  // Tentukan level
  let min = Infinity;
  let max = -Infinity;
  for (const p of pts) {
    if (p.elev < min) min = p.elev;
    if (p.elev > max) max = p.elev;
  }
  let levels: number[];
  if (interval && interval > 0) {
    const awal = Math.ceil(min / interval) * interval;
    levels = [];
    for (let v = awal; v <= max; v += interval) levels.push(Math.round(v * 1000) / 1000);
  } else {
    // Otomatis: ±10 level merata
    const langkah = (max - min) / 10 || 1;
    const besar = bulatkanManis(langkah);
    levels = [];
    for (let v = Math.ceil(min / besar) * besar; v <= max; v += besar) {
      levels.push(Math.round(v * 1000) / 1000);
    }
  }
  if (levels.length === 0) levels = [Math.round(((min + max) / 2) * 1000) / 1000];

  const generator = d3contours().size([w, h]).thresholds(levels);
  const polys = generator(Array.from(values));

  const paths: ContourPath[] = [];
  for (const poly of polys) {
    const elev = Math.round(poly.value * 1000) / 1000;
    // struktur GeoJSON MultiPolygon: coordinates[polygon][ring][titik]
    for (const polygon of poly.coordinates) {
      for (const ring of polygon) {
        const koords: LatLng[] = [];
        for (const [gx, gy] of ring) {
          const lng = bb.minLng + (gx / (w - 1)) * rentangLng;
          const lat = bb.minLat + (1 - gy / (h - 1)) * rentangLat;
          koords.push({ lat, lng });
        }
        if (koords.length > 1) paths.push({ elev, coords: koords });
      }
    }
  }

  return { paths, levels };
}

function bulatkanManis(x: number): number {
  const pangkat = Math.pow(10, Math.floor(Math.log10(x)));
  const n = x / pangkat;
  const bulat = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10;
  return bulat * pangkat;
}

function sample<T>(arr: T[], n: number): T[] {
  const langkah = Math.ceil(arr.length / n);
  const out: T[] = [];
  for (let i = 0; i < arr.length; i += langkah) out.push(arr[i]);
  return out;
}

/** Dapatkan posisi label kontur: titik tengah cincin. */
export function titikLabel(path: ContourPath): LatLng {
  return path.coords[Math.floor(path.coords.length / 2)];
}
