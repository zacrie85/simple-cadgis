/**
 * Dukungan world file (.tfw/.jgw/.pgw/.wld) — pasangan gambar (PNG/JPG/TIFF) +
 * 6 angka georeferensi. Dipakai bersama oleh RasterDialog (deteksi & UI zona)
 * dan raster-worker (hitung batas + konversi CRS → WGS84 via proj4).
 *
 * Format world file (6 baris):
 *   baris 1 : A — ukuran piksel arah X
 *   baris 2 : D — rotasi terhadap sumbu Y (biasanya 0)
 *   baris 3 : B — rotasi terhadap sumbu X (biasanya 0)
 *   baris 4 : E — ukuran piksel arah Y (selalu negatif)
 *   baris 5 : C — koordinat X pusat piksel kiri-atas
 *   baris 6 : F — koordinat Y pusat piksel kiri-atas
 * Transform affine: X = C + A·kolom + D·baris ; Y = F + B·kolom + E·baris
 *
 * World file TIDAK menyimpan sistem koordinat — pemakai memilih zona
 * (UTM / TM-3) saat impor; koordinat derajat otomatis terdeteksi.
 */

/** Label zona Indonesia TM-3 DGN95 (EPSG 23830–23845, urut kode). */
export const ZONA_TM3 = [
  "46.2", "47.1", "47.2", "48.1", "48.2", "49.1", "49.2", "50.1",
  "50.2", "51.1", "51.2", "52.1", "52.2", "53.1", "53.2", "54.1",
] as const;

/** Zona UTM yang mencakup Indonesia. */
export const ZONA_UTM_INDONESIA = [46, 47, 48, 49, 50, 51, 52, 53, 54] as const;

export type DataWorldFile = { a: number; d: number; b: number; e: number; c: number; f: number };

/** Pilihan zona utk gambar+world file: "geo" | "utm-<n>s" | "utm-<n>n" | "tm3-<z>". */
export type ZonaGambar = string;

/** Baca isi world file → 6 angka (dipisah spasi/baris baru). Null bila tidak valid. */
export function parseWorldFile(teks: string): DataWorldFile | null {
  const angka = teks
    .split(/[\r\n\t ]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .map(Number)
    .filter((n) => Number.isFinite(n));
  if (angka.length < 6) return null;
  const [a, d, b, e, c, f] = angka;
  if (a === 0 || e === 0) return null;
  return { a, d, b, e, c, f };
}

/** True bila koordinat world file adalah derajat geografis (bukan meter proyeksi). */
export function apakahGeografis(d: DataWorldFile): boolean {
  return Math.abs(d.c) <= 180.5 && Math.abs(d.f) <= 90.5 && Math.abs(d.a) < 1 && Math.abs(d.e) < 1;
}

/** 4 sudut LUAR citra pada CRS sumber (mendukung world file yang dirotasi). */
export function sudutWorld(d: DataWorldFile, lebarPx: number, tinggiPx: number): [number, number][] {
  const kolom = [-0.5, lebarPx - 0.5];
  const baris = [-0.5, tinggiPx - 0.5];
  const keluar: [number, number][] = [];
  for (const r of baris) {
    for (const c of kolom) {
      keluar.push([d.c + d.a * c + d.d * r, d.f + d.b * c + d.e * r]);
    }
  }
  return keluar;
}

/** Definisi proj4 + label tampilan dari pilihan zona (dipakai worker). */
export function defZona(zona: ZonaGambar): { def: string | null; label: string } {
  if (zona.startsWith("utm-")) {
    const n = zona.slice(4, -1);
    const sisi = zona.endsWith("s") ? "S" : "N";
    return {
      def: `+proj=utm +zone=${n} +datum=WGS84 +units=m +no_defs${sisi === "S" ? " +south" : ""}`,
      label: `World file — UTM Zona ${n}${sisi} (WGS84)`,
    };
  }
  if (zona.startsWith("tm3-")) {
    const z = zona.slice(4);
    const idx = (ZONA_TM3 as readonly string[]).indexOf(z);
    const cm = 94.5 + Math.max(0, idx) * 3;
    return {
      def: `+proj=tmerc +lat_0=0 +lon_0=${cm} +k=0.9999 +x_0=200000 +y_0=1500000 +ellps=WGS84 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs`,
      label: `World file — Indonesia TM-3 zona ${z} (DGN95)`,
    };
  }
  return { def: null, label: "World file — geografis (WGS84)" };
}

/** Tebak zona awal untuk UI: hemisfer dari northing, angka zona dari pemakaian terakhir. */
export function tebakZonaAwal(d: DataWorldFile): ZonaGambar {
  if (apakahGeografis(d)) return "geo";
  let angka = "48";
  try {
    const simpan = localStorage.getItem("geokita-zona-gambar");
    if (simpan) angka = simpan;
  } catch {
    /* abaikan */
  }
  if (d.f >= 8_400_000) return `utm-${angka}s`; // northing selatan (10 jt − jarak dr khatulistiwa)
  if (d.f <= 830_000) return d.c <= 400_000 ? `tm3-${ZONA_TM3[0]}` : `utm-${angka}n`;
  // 830 rb – 8,4 jt: rentang northing TM-3 (y0 = 1.500.000) — easting TM-3 maks ±366 rb
  if (d.c <= 400_000) return `tm3-${ZONA_TM3[0]}`;
  return `utm-${angka}s`;
}

/** Simpan angka zona UTM terakhir (dipakai sebagai tebakan berikutnya). */
export function simpanZonaTerakhir(zona: ZonaGambar): void {
  const m = /^utm-(\d+)[sn]$/.exec(zona);
  if (!m) return;
  try {
    localStorage.setItem("geokita-zona-gambar", m[1]);
  } catch {
    /* abaikan */
  }
}
