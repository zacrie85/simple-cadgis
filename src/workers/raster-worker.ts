/**
 * Web Worker raster SIMPLE CADGIS — impor GeoTIFF (orthophoto/citra & DEM) hingga 1 TB
 * TANPA membekukan UI: metadata → pratinjau (bertahap per blok baris / overview) →
 * gambar PNG/JPEG → sampling elevasi per titik (bilinear, lokal, tanpa internet).
 * CRS didukung: WGS84 (4326/4269), DGN95 geografis (4755), UTM WGS84 semua zona
 * (326xx/327xx), Web Mercator (3857), Indonesia TM-3 DGN95 (23830–23845), 9377.
 *
 * Prinsip anti-hang:
 *  - Semua dekode berjalan DI SINI (worker), UI utama tetap responsif.
 *  - Pembacaan raster dibagi per blok baris (±2 juta piksel/blok) → memori terkendali.
 *  - Pratinjau dipakai untuk tampilan (maks 2048 px) — file asli tidak pernah dimuat utuh.
 *  - Dukung pembatalan via AbortSignal di setiap tahap baca.
 *
 * Catatan ECW: format Enhanced Compressed Wavelets bersifat proprietary (SDK C++,
 * lisensinya melarang pemakaian web/browser) sehingga TIDAK ada dekoder JS — file
 * .ecw ditolak dengan pesan panduan konversi ke GeoTIFF (QGIS/GDAL).
 */

import * as geotiff from "geotiff";
import proj4 from "proj4";
import {
  ambilMetaPiramida,
  idPiramidaDariTanda,
  kunciTile,
  simpanMetaPiramida,
  simpanTilePiramida,
  type LevelPiramida,
  type MetaPiramida,
} from "../lib/gis/piramida-db";

export type InfoRaster = {
  lebarPx: number;
  tinggiPx: number;
  barat: number;
  timur: number;
  selatan: number;
  utara: number;
  sumberCrs: string;
  dem: boolean;
  resolusiLabel: string;
  ukuranFileMb: number;
};

type Masuk =
  | { type: "buka"; id: string; file: File; piramidaMb?: number }
  | { type: "batalkan-buka"; id: string }
  | { type: "batalkan-piramida"; id: string }
  | { type: "batalkan-elevasi" }
  | { type: "elevasi"; id: string; rasterId: string; titik: { lat: number; lng: number }[] };

// tipe turunan API geotiff (GeoTIFFImage tidak diekspor langsung)
type TiffDok = Awaited<ReturnType<typeof geotiff.fromBlob>>;
type CitraTiff = Awaited<ReturnType<TiffDok["getImage"]>>;

export type PesanRasterKeluar =
  | { type: "progres"; id: string; persen: number; tahap: string }
  | { type: "siap"; id: string; info: InfoRaster }
  | { type: "gambar"; id: string; blob: Blob }
  | { type: "elevasi-hasil"; id: string; nilai: (number | null)[] }
  | { type: "piramida"; id: string; persen: number; tahap: string; selesai?: boolean; gagal?: boolean; ukuranMb?: number; levelMaksPx?: number }
  | { type: "error"; id?: string; message: string };

const ctx = self as unknown as {
  postMessage: (m: PesanRasterKeluar, transfer?: Transferable[]) => void;
  addEventListener: (t: "message", cb: (e: MessageEvent<Masuk>) => void) => void;
};

const UKURAN_MAKS = 1024 * 1024 * 1024 * 1024; // 1 TB — baca bertahap (byte-range) jadi memori tetap terkendali
const PRATINJAU_MAKS = 2048; // dimensi pratinjau (px)
const BLOK_PIKSEL = 2_000_000; // piksel sumber per blok baca (hemat memori)
const MAKS_GRID_ELEVASI = 12_000_000; // ≤12 juta px → DEM dibaca utuh sekali (±48 MB)

/** Referensi raster yang sudah dibuka — dipakai ulang untuk sampling elevasi. */
type RefDem = {
  def: string | null; // proj4 def CRS sumber (null = sudah WGS84)
  minX: number;
  minY: number;
  maxX: number;
  maxY: number; // bbox pada CRS sumber
  w: number;
  h: number;
  sx: number;
  sy: number; // ukuran piksel pada CRS sumber
  nodata: number;
  image: CitraTiff;
};
const refDem = new Map<string, RefDem>();
const batalBuka = new Map<string, AbortController>();

/** Ambil nilai tag TIFF dinamis — eager via getValue, deferred via loadValue. */
async function tagRaster(im: CitraTiff, nama: string): Promise<unknown> {
  const fd = im.getFileDirectory() as unknown as {
    getValue: (t: string) => unknown;
    loadValue: (t: string) => Promise<unknown>;
  };
  try {
    return fd.getValue(nama);
  } catch {
    return await fd.loadValue(nama);
  }
}

function kirim(id: string, persen: number, tahap: string) {
  ctx.postMessage({ type: "progres", id, persen, tahap });
}

/** Zona TM-3 DGN95 (EPSG 23830–23845, urut kode): label zona resmi BPN. */
const ZONA_TM3 = [
  "46.2", "47.1", "47.2", "48.1", "48.2", "49.1", "49.2", "50.1",
  "50.2", "51.1", "51.2", "52.1", "52.2", "53.1", "53.2", "54.1",
] as const;

/**
 * Definisi proj4 dari GeoKeys — dukung WGS84 & DGN95 geografis, Web Mercator,
 * seluruh zona UTM WGS84, Indonesia TM-3 DGN95 (BPN/kadaster), dan 9377.
 */
function crsDariGeoKeys(gk: Partial<Record<string, number>>): { def: string | null; label: string } {
  const proj = gk.ProjectedCSTypeGeoKey;
  const geo = gk.GeographicTypeGeoKey;
  const utmN = typeof proj === "number" && proj >= 32601 && proj <= 32660;
  const utmS = typeof proj === "number" && proj >= 32701 && proj <= 32760;
  if (utmN) {
    const zona = proj - 32600;
    return { def: `+proj=utm +zone=${zona} +datum=WGS84 +units=m +no_defs`, label: `EPSG:${proj} (UTM Zona ${zona}N)` };
  }
  if (utmS) {
    const zona = proj - 32700;
    return { def: `+proj=utm +zone=${zona} +south +datum=WGS84 +units=m +no_defs`, label: `EPSG:${proj} (UTM Zona ${zona}S)` };
  }
  if (proj === 3857) return { def: "EPSG:3857", label: "EPSG:3857 (Web Mercator)" };
  // Indonesia TM-3 (DGN95, EPSG 23830–23845) — sistem resmi BPN utk kadaster:
  // TM 3°, k=0.9999, x0=200000, y0=1500000, CM 94.5°E–139.5°E (tiap kode +3°).
  // Datum DGN95 ≈ WGS84 (ellipsoid sama, geseran < 1 m) — aman utk tampilan.
  if (typeof proj === "number" && proj >= 23830 && proj <= 23845) {
    const cm = 94.5 + (proj - 23830) * 3;
    return {
      def: `+proj=tmerc +lat_0=0 +lon_0=${cm} +k=0.9999 +x_0=200000 +y_0=1500000 +ellps=WGS84 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs`,
      label: `EPSG:${proj} (DGN95 / Indonesia TM-3 zona ${ZONA_TM3[proj - 23830]})`,
    };
  }
  // EPSG:9377 — MAGNA-SIRGAS 2018 / Origen-Nacional (TM utuh negeri, k=0.9992).
  if (proj === 9377) {
    return {
      def: "+proj=tmerc +lat_0=4 +lon_0=-73 +k=0.9992 +x_0=5000000 +y_0=2000000 +ellps=GRS80 +units=m +no_defs",
      label: "EPSG:9377 (MAGNA-SIRGAS 2018 / Origen-Nacional)",
    };
  }
  if (!proj || proj === 32767) {
    if (geo === 4755) return { def: null, label: "EPSG:4755 (DGN95 — ≈ WGS84)" };
    if (geo && geo !== 4326 && geo !== 4269 && geo !== 32767) {
      throw new Error(
        `Sistem koordinat EPSG:${geo} belum didukung. Yang didukung: WGS84 (4326/4755), UTM WGS84 (326xx/327xx), Web Mercator (3857), Indonesia TM-3 DGN95 (23830–23845), dan 9377. Simpan ulang via QGIS: Raster → Conversion → Translate, pilih salah satu CRS itu.`
      );
    }
    return { def: null, label: "EPSG:4326 (WGS84)" };
  }
  if (proj) {
    throw new Error(
      `Sistem koordinat EPSG:${proj} belum didukung. Yang didukung: WGS84 (4326/4755), UTM WGS84 (326xx/327xx), Web Mercator (3857), Indonesia TM-3 DGN95 (23830–23845), dan 9377. Simpan ulang via QGIS: Raster → Conversion → Translate, pilih salah satu CRS itu.`
    );
  }
  return { def: null, label: "EPSG:4326 (WGS84)" };
}

/** Pilih gambar terbaik untuk pratinjau: overview terbesar yang ≤ 4096 px, atau basis. */
async function pilihGambarPratinjau(tiff: TiffDok, basis: CitraTiff): Promise<CitraTiff> {
  let terbaik: CitraTiff | null = null;
  const jumlah = await tiff.getImageCount();
  for (let i = 1; i < jumlah; i++) {
    try {
      const im = await tiff.getImage(i);
      const tipe = await tagRaster(im, "NewSubfileType");
      if (tipe !== 1) continue; // bukan overview (reduced-resolution)
      if (im.getWidth() <= 4096 && (!terbaik || im.getWidth() > terbaik.getWidth())) terbaik = im;
    } catch {
      break; // IFD rusak/terpotong — pakai yang sudah didapat
    }
  }
  return terbaik ?? basis;
}

/** Nilai aman dari TypedArray numerik apa pun (Uint8/Int16/Float32/…). */
function nilai(arr: ArrayLike<number>, i: number): number {
  return arr[i];
}

/** Bilinear di grid nilai; kembali null bila ada tetangga nodata. */
function bilinear(
  arr: ArrayLike<number>,
  w: number,
  h: number,
  px: number,
  py: number,
  nodata: number
): number | null {
  const x0 = Math.floor(px);
  const y0 = Math.floor(py);
  if (x0 < 0 || y0 < 0 || x0 >= w - 1 || y0 >= h - 1) return null;
  const fx = px - x0;
  const fy = py - y0;
  const a = nilai(arr, y0 * w + x0);
  const b = nilai(arr, y0 * w + x0 + 1);
  const c = nilai(arr, (y0 + 1) * w + x0);
  const d = nilai(arr, (y0 + 1) * w + x0 + 1);
  if (a === nodata || b === nodata || c === nodata || d === nodata) return null;
  return a * (1 - fx) * (1 - fy) + b * fx * (1 - fy) + c * (1 - fx) * fy + d * fx * fy;
}

/** ====== BUKA RASTER: metadata + pratinjau ====== */
async function bukaRaster(id: string, file: File, piramidaMb: number) {
  if (file.size > UKURAN_MAKS) {
    const mb = file.size / 1048576;
    const ukuran = mb >= 1024 ? `${(mb / 1024).toFixed(1)} GB` : `${mb.toFixed(0)} MB`;
    throw new Error(
      `Ukuran file ${ukuran} melebihi batas 1 TB. Kompres dulu (QGIS: Raster → Conversion → Translate, kompresi JPEG/Deflate) atau potong per wilayah.`
    );
  }
  const nama = file.name.toLowerCase();
  if (nama.endsWith(".ecw")) {
    throw new Error(
      "ECW tidak dapat dibuka di aplikasi web (format proprietary — lisensinya melarang dekoder browser). Konversi dulu ke GeoTIFF: buka di QGIS → Raster → Conversion → Translate (format GTiff) → simpan, lalu impor hasilnya di sini."
    );
  }

  const ac = new AbortController();
  batalBuka.set(id, ac);

  kirim(id, 2, "Membuka file…");
  const tiff = await geotiff.fromBlob(file);
  const image = await tiff.getImage(0);
  const w = image.getWidth();
  const h = image.getHeight();

  // georeferensi wajib (getBoundingBox melempar error bila tanpa transform affine)
  let bbox: number[];
  let skala: number[];
  try {
    bbox = image.getBoundingBox(); // [minX,minY,maxX,maxY] di CRS sumber
    skala = image.getResolution(); // [sx, sy, sz]
    await image.getTiePoints(); // validasi bergeoreferensi (deferred-safe)
  } catch {
    throw new Error(
      "File TIFF ini TIDAK bergeoreferensi (tidak ada ModelPixelScale/ModelTiepoint). Pastikan mengimpor GeoTIFF — TIFF biasa (foto/scan) tidak punya posisi peta."
    );
  }
  if (!skala || !skala[0] || !skala[1]) {
    throw new Error(
      "File TIFF ini TIDAK bergeoreferensi (ModelPixelScale kosong). Pastikan mengimpor GeoTIFF yang sudah punya koordinat peta."
    );
  }

  kirim(id, 6, "Membaca sistem koordinat…");
  const gk = (image.getGeoKeys() ?? {}) as Partial<Record<string, number>>;
  const { def, label: sumberCrs } = crsDariGeoKeys(gk);
  const [minX, minY, maxX, maxY] = bbox;

  // 4 sudut CRS sumber → WGS84 (untuk raster proyeksi, tepi lengkung diabaikan —
  // cukup akurat untuk cakupan survei yang biasanya kecil)
  const konversi = def ? proj4(def, "EPSG:4326") : null;
  const sudut = [
    [minX, minY],
    [maxX, minY],
    [maxX, maxY],
    [minX, maxY],
  ].map(([x, y]) => (konversi ? konversi.forward([x, y]) : [x, y]));
  const lngs = sudut.map((c) => c[0]);
  const lats = sudut.map((c) => c[1]);
  const barat = Math.min(...lngs);
  const timur = Math.max(...lngs);
  const selatan = Math.min(...lats);
  const utara = Math.max(...lats);

  const spp = image.getSamplesPerPixel();
  const dem = spp <= 2;
  const nd = image.getGDALNoData();
  const nodata = nd == null || isNaN(nd) ? -9999 : nd;

  // label resolusi
  let resolusiLabel: string;
  if (def) {
    const rata = (skala[0] + Math.abs(skala[1])) / 2;
    resolusiLabel = `±${rata.toFixed(rata < 10 ? 2 : 0)} m/piksel`;
  } else {
    const derajat = (skala[0] + Math.abs(skala[1])) / 2;
    const meter = derajat * 111320;
    resolusiLabel =
      meter >= 1 ? `±${meter.toFixed(0)} m/piksel` : `±${derajat.toFixed(7)}°/piksel`;
  }
  // simpan referensi DEM (dipakai menu Elevasi → "Dari File Lokal")
  refDem.set(id, { def, minX, minY, maxX, maxY, w, h, sx: skala[0], sy: Math.abs(skala[1]), nodata, image });
  const info: InfoRaster = {
    lebarPx: w,
    tinggiPx: h,
    barat,
    timur,
    selatan,
    utara,
    sumberCrs,
    dem,
    resolusiLabel,
    ukuranFileMb: file.size / 1048576,
  };

  // ===== pratinjau =====
  kirim(id, 10, "Menyiapkan pratinjau…");
  const tw = Math.max(1, Math.min(PRATINJAU_MAKS, w));
  const th = Math.max(1, Math.round((h / w) * tw));
  const gambarPratinjau = dem ? "image/png" : "image/jpeg";
  const canvas = new OffscreenCanvas(tw, th);
  const ctx2d = canvas.getContext("2d")!;

  if (dem) {
    // DEM/1-band: susun grid pratinjau lalu render hillshade + abu-abu
    await bacaDemKeGrid(tiff, image, ac.signal, tw, th, (p, t) =>
      kirim(id, 10 + Math.round(p * 0.8), `Membaca raster ${t}`)
    ).then((grid) => {
      kirim(id, 92, "Merender pratinjau DEM…");
      renderDem(ctx2d, grid, tw, th, nodata);
    });
  } else {
    const src = await pilihGambarPratinjau(tiff, image);
    const pakaiOverview = src !== image;
    const samples = spp >= 3 ? [0, 1, 2] : [0];
    const fotometri = await tagRaster(image, "PhotometricInterpretation");
    const palet = fotometri === 3 ? ((await tagRaster(image, "ColorMap")) as number[] | undefined) : undefined;
    if (pakaiOverview) {
      // overview kecil → baca utuh sekali (memori aman), lalu skala ke pratinjau
      const sw = src.getWidth();
      const sh = src.getHeight();
      const data = await src.readRasters({ samples, fillValue: 0, signal: ac.signal });
      kirim(id, 80, "Merender pratinjau…");
      const tmp = new OffscreenCanvas(sw, sh);
      const tctx = tmp.getContext("2d")!;
      const img = tctx.createImageData(sw, sh);
      isiPikselRgb(img.data, data, sw * sh, palet);
      tctx.putImageData(img, 0, 0);
      ctx2d.drawImage(tmp, 0, 0, sw, sh, 0, 0, tw, th);
    } else {
      // tanpa overview → baca basis per blok baris (anti-hang & hemat memori)
      const barisBlok = Math.max(1, Math.floor(BLOK_PIKSEL / w));
      let y = 0;
      while (y < h) {
        if (ac.signal.aborted) throw new Error("DIBATALKAN");
        const y1 = Math.min(h, y + barisBlok);
        const data = await image.readRasters({
          window: [0, y, w, y1],
          samples,
          fillValue: 0,
          signal: ac.signal,
        });
        const thBlok = Math.max(1, Math.round(((y1 - y) / h) * th));
        const dstY = Math.round((y / h) * th);
        const tmp = new OffscreenCanvas(w, y1 - y);
        const tctx = tmp.getContext("2d")!;
        const img = tctx.createImageData(w, y1 - y);
        isiPikselRgb(img.data, data, w * (y1 - y), palet);
        tctx.putImageData(img, 0, 0);
        ctx2d.drawImage(tmp, 0, 0, w, y1 - y, 0, dstY, tw, thBlok);
        y = y1;
        kirim(id, 10 + Math.round((y / h) * 78), `Membaca raster ${(y / 1000).toFixed(0)}k/${(h / 1000).toFixed(0)}k baris`);
      }
    }
  }

  kirim(id, 96, "Mengemas gambar…");
  const blob = await canvas.convertToBlob({ type: gambarPratinjau, quality: 0.85 });
  batalBuka.delete(id);

  const infoFinal = { ...info, lebarPx: w, tinggiPx: h };
  ctx.postMessage({ type: "siap", id, info: infoFinal });
  ctx.postMessage({ type: "gambar", id, blob });

  // ===== piramida detail (opsional) — berjalan SETELAH pratinjau dipakai =====
  if (piramidaMb > 0 && !dem && w > LEV_PIRAMIDA_AWAL) {
    void bangunPiramida(id, file, piramidaMb);
  }
}

/** ====== PIRAMIDA RASTER: konverter otomatis → tile JPEG bertingkat (IndexedDB) ======
 * File asli (sampai 1 TB) dibaca SEKALI per level — bila file punya overview (bawaan
 * GDAL/QGIS), level dibaca dari overview yang jauh lebih kecil → cepat. Hasil ±50–200 MB
 * tersimpan lokal: peta zoom tajam tanpa membaca ulang file asli, tahan tutup aplikasi.
 */
const UKURAN_TILE = 512; // px per tile
const LEV_PIRAMIDA_AWAL = 4096; // level terkecil (pratinjau 2048 sudah dari impor)
const BITA_PER_PX_JPEG = 0.19; // taksiran JPEG q0.8 RGB ortofoto
const ctrlPiramida = new Map<string, AbortController>();

function laporPiramida(
  id: string,
  persen: number,
  tahap: string,
  ekstra?: { selesai?: boolean; gagal?: boolean; ukuranMb?: number; levelMaksPx?: number }
) {
  ctx.postMessage({ type: "piramida", id, persen, tahap, ...ekstra });
}

async function bangunPiramida(layerId: string, file: File, targetMb: number) {
  const tanda = `${file.name}|${file.size}|${file.lastModified}`;
  const pid = idPiramidaDariTanda(tanda);
  const ac = new AbortController();
  ctrlPiramida.set(layerId, ac);
  try {
    // file yang sama pernah dikonversi → pakai cache (import ulang / buka lagi = instan)
    const lama = await ambilMetaPiramida(pid);
    if (lama?.siap && lama.level.length) {
      laporPiramida(layerId, 100, "Piramida dipakai dari cache lokal", {
        selesai: true,
        ukuranMb: lama.ukuranBita / 1048576,
        levelMaksPx: lama.level[lama.level.length - 1]?.lebarPx,
      });
      return;
    }

    const ref = refDem.get(layerId);
    if (!ref) throw new Error("Referensi raster hilang.");
    if (ref.image.getSamplesPerPixel() <= 2) {
      laporPiramida(layerId, 100, "DEM tidak perlu piramida", { selesai: true, ukuranMb: 0 });
      return;
    }

    // kumpulkan overview (NewSubfileType=1) kecil → besar — baca level dari ini = murah
    const tiff = await geotiff.fromBlob(file);
    const sumber: CitraTiff[] = [];
    const jumlah = await tiff.getImageCount();
    for (let i = 1; i < jumlah; i++) {
      try {
        const im = await tiff.getImage(i);
        const tipe = await tagRaster(im, "NewSubfileType");
        if (tipe !== 1 || im.getSamplesPerPixel() < 3) continue;
        sumber.push(im);
      } catch {
        /* overview rusak — lewati */
      }
    }
    sumber.sort((a, b) => a.getWidth() - b.getWidth());

    // palet (bila raster terindeks) — dibaca dari basis agar warna benar
    const fotometri = await tagRaster(ref.image, "PhotometricInterpretation");
    const palet = fotometri === 3 ? ((await tagRaster(ref.image, "ColorMap")) as number[] | undefined) : undefined;

    // rencana level: 4096, 8192, 16384, … ≤ lebar basis
    const { w: bw, h: bh } = ref;
    const rencana: { w: number; h: number }[] = [];
    for (let lw = LEV_PIRAMIDA_AWAL; lw < bw; lw *= 2) {
      rencana.push({ w: lw, h: Math.max(1, Math.round((bh / bw) * lw)) });
    }
    if (!rencana.length) {
      laporPiramida(layerId, 100, "Raster kecil — piramida tidak perlu", { selesai: true, ukuranMb: 0 });
      return;
    }
    // potong sesuai anggaran ukuran (mulai kasar → halus); level pertama selalu masuk
    const anggaran = targetMb * 1048576;
    const level: LevelPiramida[] = [];
    let kumulatif = 0;
    for (const r of rencana) {
      const taksiran = r.w * r.h * BITA_PER_PX_JPEG;
      if (level.length > 0 && kumulatif + taksiran > anggaran) break;
      level.push({
        lebarPx: r.w,
        tinggiPx: r.h,
        kolom: Math.ceil(r.w / UKURAN_TILE),
        baris: Math.ceil(r.h / UKURAN_TILE),
      });
      kumulatif += taksiran;
    }

    const meta: MetaPiramida = { id: pid, tanda, level: [], siap: false, ukuranBita: 0, dibuat: Date.now() };
    await simpanMetaPiramida(meta);
    let totalBita = 0;
    for (let li = 0; li < level.length; li++) {
      if (ac.signal.aborted) throw new Error("DIBATALKAN");
      const lv = level[li];
      // sumber terkecil yang ≥ level → kalau ada overview, ini overview (baca cepat)
      let src = ref.image;
      for (const s of sumber) {
        if (s.getWidth() >= lv.lebarPx) {
          src = s;
          break;
        }
      }
      const sw = src.getWidth();
      const sh = src.getHeight();
      const scaleBaca = lv.lebarPx / sw;
      const scaleBacaY = lv.tinggiPx / sh;
      for (let baris = 0; baris < lv.baris; baris++) {
        if (ac.signal.aborted) throw new Error("DIBATALKAN");
        const y0 = baris * UKURAN_TILE;
        const y1 = Math.min(lv.tinggiPx, y0 + UKURAN_TILE);
        const bandH = y1 - y0;
        // jendela sumber utk pita baris ini (dalam px sumber)
        const sy0 = Math.max(0, Math.floor(y0 / scaleBacaY));
        const sy1 = Math.min(sh, Math.max(sy0 + 1, Math.ceil(y1 / scaleBacaY)));
        const data = await src.readRasters({ window: [0, sy0, sw, sy1], samples: [0, 1, 2], fillValue: 0, signal: ac.signal });
        const tmp = new OffscreenCanvas(sw, sy1 - sy0);
        const tctx = tmp.getContext("2d")!;
        const img = tctx.createImageData(sw, sy1 - sy0);
        isiPikselRgb(img.data, data, sw * (sy1 - sy0), palet);
        tctx.putImageData(img, 0, 0);
        // pecah pita jadi tile 512 px level → JPEG q0.8
        const entri: { kunci: string; blob: Blob }[] = [];
        for (let kol = 0; kol < lv.kolom; kol++) {
          const x0 = kol * UKURAN_TILE;
          const x1 = Math.min(lv.lebarPx, x0 + UKURAN_TILE);
          const tc = new OffscreenCanvas(x1 - x0, bandH);
          tc.getContext("2d")!.drawImage(
            tmp,
            x0 / scaleBaca,
            y0 / scaleBacaY - sy0,
            (x1 - x0) / scaleBaca,
            bandH / scaleBacaY,
            0,
            0,
            x1 - x0,
            bandH
          );
          const blob = await tc.convertToBlob({ type: "image/jpeg", quality: 0.8 });
          totalBita += blob.size;
          entri.push({ kunci: kunciTile(li, kol, baris), blob });
        }
        await simpanTilePiramida(pid, entri);
        const persen = Math.min(99, Math.round(((li + (baris + 1) / lv.baris) / level.length) * 100));
        laporPiramida(layerId, persen, `Level ${lv.lebarPx}px — baris ${baris + 1}/${lv.baris}`);
      }
      meta.level = level.slice(0, li + 1);
      meta.ukuranBita = totalBita;
      await simpanMetaPiramida(meta); // progres tahan crash
    }
    meta.level = level;
    meta.siap = true;
    meta.ukuranBita = totalBita;
    await simpanMetaPiramida(meta);
    laporPiramida(layerId, 100, `Piramida siap — ${level.length} level`, {
      selesai: true,
      ukuranMb: totalBita / 1048576,
      levelMaksPx: level[level.length - 1].lebarPx,
    });
  } catch (err) {
    const dibatal = err instanceof Error && err.message === "DIBATALKAN";
    laporPiramida(layerId, 0, dibatal ? "Piramida dibatalkan" : "Piramida gagal — pratinjau tetap dipakai", {
      selesai: true,
      gagal: true,
    });
  } finally {
    ctrlPiramida.delete(layerId);
  }
}

/** Isi buffer RGBA dari hasil readRasters (RGB langsung / grayscale / palet). */
function isiPikselRgb(
  out: Uint8ClampedArray,
  data: ArrayLike<number>[],
  n: number,
  palet: number[] | undefined
) {
  const rgb = data.length >= 3;
  if (palet) {
    const nj = palet.length / 3;
    for (let i = 0; i < n; i++) {
      const idx = Math.min(nj - 1, Math.max(0, nilai(data[0], i)));
      out[i * 4] = palet[idx] / 257;
      out[i * 4 + 1] = palet[nj + idx] / 257;
      out[i * 4 + 2] = palet[2 * nj + idx] / 257;
      out[i * 4 + 3] = 255;
    }
    return;
  }
  for (let i = 0; i < n; i++) {
    if (rgb) {
      out[i * 4] = nilai(data[0], i);
      out[i * 4 + 1] = nilai(data[1], i);
      out[i * 4 + 2] = nilai(data[2], i);
    } else {
      const g = nilai(data[0], i);
      out[i * 4] = g;
      out[i * 4 + 1] = g;
      out[i * 4 + 2] = g;
    }
    out[i * 4 + 3] = 255;
  }
}

/** Baca DEM ke grid pratinjau (tw×th) — per blok baris bila tak ada overview. */
async function bacaDemKeGrid(
  tiff: TiffDok,
  basis: CitraTiff,
  signal: AbortSignal,
  tw: number,
  th: number,
  laporkan: (p: number, t: string) => void
): Promise<Float32Array> {
  const w = basis.getWidth();
  const h = basis.getHeight();
  const grid = new Float32Array(tw * th).fill(NaN);
  const isi = nodataFill(basis);
  const src = await pilihGambarPratinjau(tiff, basis);
  if (src !== basis) {
    const data = await src.readRasters({ samples: [0], fillValue: isi, signal });
    const sw = src.getWidth();
    const sh = src.getHeight();
    for (let y = 0; y < th; y++) {
      const sy = Math.min(sh - 1, Math.floor((y / th) * sh));
      for (let x = 0; x < tw; x++) {
        const sx = Math.min(sw - 1, Math.floor((x / tw) * sw));
        grid[y * tw + x] = nilai(data[0], sy * sw + sx);
      }
    }
    laporkan(1, "selesai");
    return grid;
  }
  const barisBlok = Math.max(1, Math.floor(BLOK_PIKSEL / w));
  let y = 0;
  while (y < h) {
    if (signal.aborted) throw new Error("DIBATALKAN");
    const y1 = Math.min(h, y + barisBlok);
    const data = await basis.readRasters({ window: [0, y, w, y1], samples: [0], fillValue: isi, signal });
    const gy0 = Math.round((y / h) * th);
    const gy1 = Math.max(gy0 + 1, Math.round((y1 / h) * th));
    for (let gy = gy0; gy < Math.min(th, gy1); gy++) {
      const sy = Math.min(y1 - 1, Math.floor(((gy + 0.5) / th) * h));
      for (let gx = 0; gx < tw; gx++) {
        const sx = Math.min(w - 1, Math.floor(((gx + 0.5) / tw) * w));
        grid[gy * tw + gx] = nilai(data[0], (sy - y) * w + sx);
      }
    }
    y = y1;
    laporkan(y / h, `${(y / 1000).toFixed(0)}k/${(h / 1000).toFixed(0)}k baris`);
  }
  return grid;
}

function nodataFill(image: CitraTiff): number {
  const v = image.getGDALNoData();
  return v == null || isNaN(v) ? -9999 : v;
}

/** Render grid DEM → hillshade abu-abu; nodata transparan. */
function renderDem(ctx2d: OffscreenCanvasRenderingContext2D, grid: Float32Array, tw: number, th: number, nodata: number) {
  let min = Infinity;
  let max = -Infinity;
  for (let i = 0; i < grid.length; i++) {
    const v = grid[i];
    if (v === nodata || isNaN(v)) continue;
    if (v < min) min = v;
    if (v > max) max = v;
  }
  if (!isFinite(min)) { min = 0; max = 1; }
  const rentang = Math.max(1e-6, max - min);
  const img = ctx2d.createImageData(tw, th);
  const out = img.data;
  for (let y = 0; y < th; y++) {
    for (let x = 0; x < tw; x++) {
      const i = y * tw + x;
      const v = grid[i];
      const o = i * 4;
      if (v === nodata || isNaN(v)) {
        out[o + 3] = 0;
        continue;
      }
      // hillshade sederhana: gradien tetangga → terang/gelap
      const kiri = x > 0 ? grid[i - 1] : v;
      const kanan = x < tw - 1 ? grid[i + 1] : v;
      const atas = y > 0 ? grid[i - tw] : v;
      const bawah = y < th - 1 ? grid[i + tw] : v;
      const dzdx = (kanan === nodata || kiri === nodata ? 0 : kanan - kiri) / rentang;
      const dzdy = (bawah === nodata || atas === nodata ? 0 : bawah - atas) / rentang;
      const bayang = Math.max(0.35, Math.min(1.65, 1 + (dzdx + dzdy) * 2.2));
      const t = (v - min) / rentang;
      const g = Math.round(t * 255 * bayang);
      out[o] = g;
      out[o + 1] = g;
      out[o + 2] = g;
      out[o + 3] = 255;
    }
  }
  ctx2d.putImageData(img, 0, 0);
}

/** ====== SAMPLING ELEVASI dari DEM lokal ====== */
async function elevasiLokal(pesanId: string, rasterId: string, titik: { lat: number; lng: number }[]) {
  const ref = refDem.get(rasterId);
  if (!ref) throw new Error("Raster DEM tidak ditemukan — impor ulang file DEM-nya lalu coba lagi.");
  const { def, minX, minY, maxX, maxY, w, h, sx, sy, nodata, image } = ref;

  // lat/lng → koordinat CRS sumber → piksel
  const target: { idx: number; px: number; py: number }[] = [];
  for (let i = 0; i < titik.length; i++) {
    const [x, y] = def ? proj4("EPSG:4326", def, [titik[i].lng, titik[i].lat]) : [titik[i].lng, titik[i].lat];
    const px = (x - minX) / sx;
    const py = (maxY - y) / sy;
    if (px >= 0 && py >= 0 && px <= w - 1 && py <= h - 1) target.push({ idx: i, px, py });
  }
  const hasil: (number | null)[] = new Array(titik.length).fill(null);

  if (w * h <= MAKS_GRID_ELEVASI) {
    // DEM kecil/sedang → baca utuh sekali, sampling cepat di memori
    kirim(pesanId, 10, "Membaca DEM ke memori…");
    const data = await image.readRasters({ samples: [0], fillValue: nodata });
    const band = data[0];
    target.forEach((t, j) => {
      const v = bilinear(band, w, h, t.px, t.py, nodata);
      hasil[t.idx] = v != null && v > -8000 ? v : null;
      if (j % 2000 === 0) kirim(pesanId, 10 + Math.round((j / target.length) * 88), "Mengambil elevasi titik…");
    });
  } else {
    // DEM raksasa → baca per blok baris, titik diurutkan menurut barisnya
    target.sort((a, b) => a.py - b.py);
    const barisBlok = Math.max(1, Math.floor(BLOK_PIKSEL / w));
    let mulai = 0;
    while (mulai < target.length) {
      if (batalElevasi) throw new Error("DIBATALKAN");
      const y0 = Math.max(0, Math.floor(target[mulai].py) - 1);
      const y1 = Math.min(h, y0 + barisBlok);
      let akhir = mulai;
      while (akhir < target.length && Math.floor(target[akhir].py) < y1) akhir++;
      const data = await image.readRasters({ window: [0, y0, w, y1], samples: [0], fillValue: nodata });
      const band = data[0];
      for (let j = mulai; j < akhir; j++) {
        const t = target[j];
        const v = bilinear(band, w, y1 - y0, t.px, t.py - y0, nodata);
        hasil[t.idx] = v != null && v > -8000 ? v : null;
      }
      kirim(pesanId, Math.round((akhir / target.length) * 96), "Mengambil elevasi titik…");
      mulai = akhir;
    }
  }
  ctx.postMessage({ type: "elevasi-hasil", id: pesanId, nilai: hasil });
}

let batalElevasi = false;

ctx.addEventListener("message", (e) => {
  const m = e.data;
  if (m.type === "buka") {
    bukaRaster(m.id, m.file, m.piramidaMb ?? 0).catch((err: Error) => {
      batalBuka.delete(m.id);
      const pesan = err?.message === "DIBATALKAN" ? "Impor raster dibatalkan." : err?.message || "Gagal membaca raster.";
      ctx.postMessage({ type: "error", id: m.id, message: pesan });
    });
  } else if (m.type === "batalkan-buka") {
    batalBuka.get(m.id)?.abort();
  } else if (m.type === "batalkan-piramida") {
    ctrlPiramida.get(m.id)?.abort();
  } else if (m.type === "elevasi") {
    batalElevasi = false;
    elevasiLokal(m.id, m.rasterId, m.titik).catch((err: Error) => {
      const pesan = err?.message === "DIBATALKAN" ? "Pengambilan elevasi dibatalkan." : err?.message || "Gagal membaca DEM.";
      ctx.postMessage({ type: "error", id: m.id, message: pesan });
    });
  } else if (m.type === "batalkan-elevasi") {
    batalElevasi = true;
  }
});
