/** Bantu gambar mata panah (garis anak panah) — dipakai MapCanvas (peta, px layar)
 *  & LayoutView (anotasi layout, px sheet). Semua sudut dalam derajat layar (y ke bawah). */

import type { LatLng } from "./types";

/** Sudut layar (derajat, 0 = ke kanan, searah jarum jam) dari dua titik px. */
export function sudutPx(ax: number, ay: number, bx: number, by: number): number {
  return (Math.atan2(by - ay, bx - ax) * 180) / Math.PI;
}

/** Sudut layar dua koordinat geografis pada peta Leaflet (px container → conformal Mercator,
 *  sudut layar stabil lintas zoom). */
export function sudutPeta(map: { latLngToContainerPoint(ll: LatLng | [number, number]): { x: number; y: number } }, a: LatLng, b: LatLng): number {
  const pa = map.latLngToContainerPoint([a.lat, a.lng]);
  const pb = map.latLngToContainerPoint([b.lat, b.lng]);
  return sudutPx(pa.x, pa.y, pb.x, pb.y);
}

/** Titik-titik segitiga mata panah di ujung garis (ruang px, untuk <polygon> SVG).
 *  Ujung (tip) tepat di titik akhir; panjang & lebar dalam px. */
export function segitigaPanahPx(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  panjang = 15,
  lebar = 5.5
): string {
  const dx = bx - ax;
  const dy = by - ay;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len; // arah maju
  const nx = -uy;
  const ny = ux; // tegak lurus
  const p1 = `${bx},${by}`;
  const p2 = `${bx - ux * panjang + nx * lebar},${by - uy * panjang + ny * lebar}`;
  const p3 = `${bx - ux * panjang - nx * lebar},${by - uy * panjang - ny * lebar}`;
  return `${p1} ${p2} ${p3}`;
}

/** HTML ikon MATA PANAH (SVG) untuk L.divIcon Leaflet — diputar mengelilingi ujungnya.
 *  Batang garis sudah disediakan polyline induk; ikonAnchor = ujung panah (19,10). */
export function htmlPanah(sudutDeg: number, warna: string, ukuran = 20): string {
  const k = ukuran / 20;
  return (
    `<svg width="${ukuran}" height="${ukuran}" viewBox="0 0 20 20" ` +
    `style="transform:rotate(${sudutDeg}deg);transform-origin:${19 * k}px ${10 * k}px;display:block;overflow:visible">` +
    `<path d="M${19 * k} ${10 * k} L${5 * k} ${4 * k} L${9 * k} ${10 * k} L${5 * k} ${16 * k} Z" ` +
    `fill="${warna}" stroke="white" stroke-width="1" stroke-linejoin="round"/>` +
    `</svg>`
  );
}
