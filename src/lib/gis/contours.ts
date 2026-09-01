/**
 * Kontur: cache grid hasil interpolasi (dipakai peta 3D) + util warna/label.
 * Komputasi berat (IDW + marching squares d3-contour) kini berjalan di
 * Web Worker (src/workers/kontur-worker.ts) agar UI tetap responsif untuk
 * puluhan ribu titik; hasilnya dikirim balik ke sini lewat simpanGridCache().
 */
import type { ContourPath, LatLng } from "./types";

export interface TitikElevasi {
  lat: number;
  lng: number;
  elev: number;
}

export interface GridCache {
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

/** Isi ulang cache grid (dipakai setelah worker kontur selesai menghitung). */
export function simpanGridCache(g: GridCache | null) {
  gridCache = g;
}

/** Warna elevasi: biru (rendah) → hijau → kuning → merah (tinggi). */
export function warnaElevasi(t: number): string {
  const tt = Math.min(1, Math.max(0, t));
  const hue = 240 - tt * 240; // 240 (biru) → 0 (merah)
  return `hsl(${hue}, 75%, 45%)`;
}

/** Dapatkan posisi label kontur: titik tengah cincin. */
export function titikLabel(path: ContourPath): LatLng {
  return path.coords[Math.floor(path.coords.length / 2)];
}
