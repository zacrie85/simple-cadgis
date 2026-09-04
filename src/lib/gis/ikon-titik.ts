/**
 * Ikon penanda titik koordinat — khusus desain as-plan-build jaringan kabel
 * fiber optik (tiang tumpu, ODP, ODC, closure, handhole, menara, dst) + pin
 * warna klasik gaya palet GPS (lihat referensi user).
 *
 * Semua ikon SVG inline 24×30 px — ringan, tajam di semua zoom, ikut tercetak
 * di layout (html2canvas) & tidak butuh file gambar eksternal.
 *
 * CATATAN: modul ini BEBAS leaflet (aman untuk prerender/SSR).
 * Pembungkus L.DivIcon ada di ikon-divicon.ts (client-only).
 */

export interface IkonTitik {
  id: string;
  nama: string;
  svg: string; // penuh, ujung pin di (12,29)
}

/** Bodi pin tetesan (teardrop) klasik — warna diisi per ikon. */
const pin = (warna: string, glyph: string): string =>
  `<svg width="24" height="30" viewBox="0 0 24 30" xmlns="http://www.w3.org/2000/svg">` +
  `<path d="M12 .9C6.1.9 1.4 5.6 1.4 11.4 1.4 19.3 12 29.1 12 29.1s10.6-9.8 10.6-17.7C22.6 5.6 17.9.9 12 .9Z" fill="${warna}" stroke="#fff" stroke-width="1.6"/>` +
  glyph +
  `</svg>`;

/** Titik pusat putih kecil untuk pin warna polos (gaya palet GPS). */
const titikPutih = `<circle cx="12" cy="11.2" r="3" fill="#fff"/>`;

export const DAFTAR_IKON: IkonTitik[] = [
  { id: "pin-merah", nama: "Pin Merah", svg: pin("#ef4444", titikPutih) },
  { id: "pin-biru", nama: "Pin Biru", svg: pin("#2563eb", titikPutih) },
  { id: "pin-ungu", nama: "Pin Ungu", svg: pin("#8b5cf6", titikPutih) },
  { id: "pin-hijau", nama: "Pin Hijau", svg: pin("#10b981", titikPutih) },
  {
    id: "titik-awal",
    nama: "Titik Awal Tarikan",
    svg: pin(
      "#f59e0b",
      `<circle cx="12" cy="11.2" r="3.3" fill="none" stroke="#fff" stroke-width="1.5"/>` +
        `<circle cx="12" cy="11.2" r="1.2" fill="#fff"/>` +
        `<path d="M12 6v2M12 14.4v2M6.8 11.2h2M15.2 11.2h2" stroke="#fff" stroke-width="1.4" stroke-linecap="round"/>`
    ),
  },
  {
    id: "tiang",
    nama: "Tiang Tumpu",
    svg: pin(
      "#64748b",
      `<rect x="6.8" y="7.4" width="10.4" height="2.1" rx="0.6" fill="#fff"/>` +
        `<rect x="10.9" y="5.4" width="2.2" height="11.6" rx="0.6" fill="#fff"/>` +
        `<rect x="7.8" y="15" width="8.4" height="1.4" rx="0.5" fill="#fff"/>`
    ),
  },
  {
    id: "odp",
    nama: "ODP — Optical Distribution Point",
    svg: pin(
      "#f97316",
      `<rect x="6.2" y="6" width="11.6" height="10" rx="1.2" fill="#fff"/>` +
        `<circle cx="9.1" cy="9" r="1.1" fill="#f97316"/><circle cx="12" cy="9" r="1.1" fill="#f97316"/>` +
        `<circle cx="14.9" cy="9" r="1.1" fill="#f97316"/><circle cx="9.1" cy="13" r="1.1" fill="#f97316"/>` +
        `<circle cx="12" cy="13" r="1.1" fill="#f97316"/><circle cx="14.9" cy="13" r="1.1" fill="#f97316"/>` +
        `<rect x="7.4" y="7.1" width="9.2" height="0.9" rx="0.4" fill="#f97316" opacity=".55"/>`
    ),
  },
  {
    id: "odc",
    nama: "ODC — Optical Distribution Cabinet",
    svg: pin(
      "#0ea5e9",
      `<rect x="5.8" y="4.9" width="12.4" height="12.2" rx="1.2" fill="#fff"/>` +
        `<path d="M7.7 7.6h8.6M7.7 10h8.6M7.7 12.4h8.6" stroke="#0ea5e9" stroke-width="1.2" stroke-linecap="round"/>` +
        `<rect x="7.7" y="14.2" width="8.6" height="1.4" rx="0.5" fill="#0ea5e9" opacity=".55"/>`
    ),
  },
  {
    id: "closure",
    nama: "Closure / Sambungan Splicing",
    svg: pin(
      "#16a34a",
      `<rect x="4.9" y="8.1" width="14.2" height="6.4" rx="3.2" fill="#fff"/>` +
        `<path d="M8.2 8.1v6.4M15.8 8.1v6.4" stroke="#16a34a" stroke-width="1.3"/>` +
        `<path d="M10.4 11.3h3.2" stroke="#16a34a" stroke-width="1.1" stroke-linecap="round"/>`
    ),
  },
  {
    id: "handhole",
    nama: "Handhole / Manhole",
    svg: pin(
      "#a16207",
      `<rect x="6.1" y="5.9" width="11.8" height="10.2" rx="1.1" fill="#fff"/>` +
        `<path d="M6.1 5.9l11.8 10.2M17.9 5.9 6.1 16.1" stroke="#a16207" stroke-width="1.4"/>` +
        `<rect x="6.1" y="5.9" width="11.8" height="10.2" rx="1.1" fill="none" stroke="#a16207" stroke-width="1.2"/>`
    ),
  },
  {
    id: "menara",
    nama: "Menara / Tower Transmisi",
    svg: pin(
      "#334155",
      `<path d="M12 4.2 7.2 16.9h2.3L12 9.6l2.5 7.3h2.3L12 4.2Z" fill="#fff"/>` +
        `<path d="M9 12.7h6M9.9 10h4.2" stroke="#fff" stroke-width="1.1"/>`
    ),
  },
];

/** HTML titik polos (bulat biru — gaya lama) untuk pratinjau picker. */
export const htmlPolos =
  `<div style="width:14px;height:14px;border-radius:9999px;background:#3b82f6;border:2px solid #1d4ed8;box-sizing:border-box"></div>`;

/** Cari ikon berdasar id. */
export const cariIkon = (id: string | undefined): IkonTitik | undefined =>
  id ? DAFTAR_IKON.find((i) => i.id === id) : undefined;

/**
 * HTML lengkap ikon (untuk L.divIcon maupun pratinjau).
 * Terpilih → diberi cincin/halo biru agar kontras saat di-blok.
 */
export function ikonHtml(id: string | undefined, terpilih: boolean): string | null {
  const ik = cariIkon(id);
  if (!ik) return null;
  const filter = terpilih
    ? "filter:drop-shadow(0 0 2px #1d4ed8) drop-shadow(0 0 5px rgba(37,99,235,.9));"
    : "filter:drop-shadow(0 1px 1.5px rgba(0,0,0,.45));";
  return `<div style="width:24px;height:30px;${filter}">${ik.svg}</div>`;
}

/** Pratinjau kecil untuk tombol picker (24×30). Polos → titik bulat biru. */
export function ikonPratinjauHtml(id: string | undefined): string {
  return ikonHtml(id, false) ?? htmlPolos;
}
