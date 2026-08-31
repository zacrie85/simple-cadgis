import type { LatLng } from "./types";

const R_BUMI = 6378137; // radius ekuator WGS84 (meter)

/** Jarak haversine dua koordinat (meter). */
export function jarakHaversine(a: LatLng, b: LatLng): number {
  const φ1 = (a.lat * Math.PI) / 180;
  const φ2 = (b.lat * Math.PI) / 180;
  const dφ = φ2 - φ1;
  const dλ = ((b.lng - a.lng) * Math.PI) / 180;
  const h =
    Math.sin(dφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(dλ / 2) ** 2;
  return 2 * R_BUMI * Math.asin(Math.sqrt(h));
}

/**
 * Luas poligon geodesik (meter persegi) — rumus Chamberlain & Duquette
 * (dipakai juga oleh leaflet-geometryutil).
 */
export function luasPoligon(ring: LatLng[]): number {
  if (ring.length < 3) return 0;
  let area = 0;
  const len = ring.length;
  if (ring[0].lat === ring[len - 1].lat && ring[0].lng === ring[len - 1].lng) {
    // cincin sudah tertutup — abaikan titik terakhir
  } else {
    // kerjakan seolah tertutup secara implisit
  }
  for (let i = 0; i < len; i++) {
    const p1 = ring[i];
    const p2 = ring[(i + 1) % len];
    area +=
      ((p2.lng - p1.lng) * Math.PI) / 180 *
      (2 + Math.sin((p1.lat * Math.PI) / 180) + Math.sin((p2.lat * Math.PI) / 180));
  }
  return Math.abs((area * R_BUMI * R_BUMI) / 2);
}

/** Panjang total garis (meter). */
export function panjangGaris(pts: LatLng[]): number {
  let d = 0;
  for (let i = 1; i < pts.length; i++) d += jarakHaversine(pts[i - 1], pts[i]);
  return d;
}

/** Uji titik dalam poligon (ray casting). */
export function titikDalamPoligon(p: LatLng, ring: LatLng[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i].lng;
    const yi = ring[i].lat;
    const xj = ring[j].lng;
    const yj = ring[j].lat;
    const intersect =
      yi > p.lat !== yj > p.lat &&
      p.lng < ((xj - xi) * (p.lat - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

export function bbox(pts: LatLng[]): { minLat: number; maxLat: number; minLng: number; maxLng: number } {
  let minLat = 90, maxLat = -90, minLng = 180, maxLng = -180;
  for (const p of pts) {
    if (p.lat < minLat) minLat = p.lat;
    if (p.lat > maxLat) maxLat = p.lat;
    if (p.lng < minLng) minLng = p.lng;
    if (p.lng > maxLng) maxLng = p.lng;
  }
  return { minLat, maxLat, minLng, maxLng };
}

/**
 * Parsing string koordinat dalam 1 kolom, contoh: "(-6.994292,110.429400)".
 * Mendukung pemisah koma, titik-koma, atau spasi. Mengembalikan null jika gagal.
 */
export function parseKolomKoordinat(s: string): LatLng | null {
  if (!s) return null;
  const bersih = s.trim().replace(/^\(/, "").replace(/\)$/, "");
  const m = bersih.match(/^(-?\d+(?:\.\d+)?)\s*[,;\s]\s*(-?\d+(?:\.\d+)?)$/);
  if (!m) return null;
  const a = parseFloat(m[1]);
  const b = parseFloat(m[2]);
  // lazimnya (lat,lng); jika terbalik (|nilai pertama|>90 → lng), tukar otomatis
  if (Math.abs(a) > 90 && Math.abs(b) <= 90) return { lat: b, lng: a };
  if (Math.abs(a) <= 90 && Math.abs(b) <= 180) return { lat: a, lng: b };
  return null;
}

/** Format angka meter → teks mudah dibaca. */
export function fmtMeter(m: number): string {
  if (m >= 1000) return `${(m / 1000).toFixed(3)} km`;
  return `${m.toFixed(2)} m`;
}

export function fmtLuas(m2: number): string {
  if (m2 >= 10000) return `${(m2 / 10000).toFixed(4)} ha`;
  return `${m2.toFixed(2)} m²`;
}

export function fmtAngka(n: number, des = 2): string {
  return n.toLocaleString("id-ID", { maximumFractionDigits: des });
}

/** ID unik sederhana. */
let counter = 0;
export function uid(prefix = "id"): string {
  counter += 1;
  return `${prefix}-${Date.now().toString(36)}-${counter}`;
}
