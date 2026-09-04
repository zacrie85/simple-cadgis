import type { GisLabel } from "./types";

/** Ukuran huruf bawaan label teks (px). */
export const UKURAN_LABEL_BAWAAN = 12;
/** Batas ukuran huruf saat resize manual. */
export const UKURAN_LABEL_MIN = 8;
export const UKURAN_LABEL_MAKS = 144;

/**
 * Kelas CSS untuk render label teks — dipakai MapCanvas (peta) & LayoutView (cetak)
 * agar keduanya tampil identik:
 * - teks mengandung "\n" → mode paragraf (multi-baris, putus otomatis)
 * - arah "vertikal" → tulisan berdiri (atas → bawah)
 */
export function kelasLabel(lb: Pick<GisLabel, "text" | "arah">): string {
  const paragraf = lb.text.includes("\n");
  const vertikal = lb.arah === "vertikal";
  return `geokita-label${paragraf ? " geokita-label-paragraf" : ""}${vertikal ? " geokita-label-vertikal" : ""}`;
}

/** Gaya inline ukuran huruf label (px) — dari field ukuran atau bawaan. */
export function gayaLabel(lb: Pick<GisLabel, "ukuran">): string {
  const u = Math.min(Math.max(lb.ukuran ?? UKURAN_LABEL_BAWAAN, UKURAN_LABEL_MIN), UKURAN_LABEL_MAKS);
  return `font-size:${u}px`;
}
