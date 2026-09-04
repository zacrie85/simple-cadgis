/**
 * Sistem koordinat (CRS) — Task 32.
 *
 * - Katalog bawaan OFFLINE: WGS84 geografis, UTM seluruh zona (1–60 N/S),
 *   Web Mercator (EPSG:3857), dan MGRS (Military Grid).
 * - CRS LAIN (ribuan): cari via KODE EPSG secara online (epsg.io — CORS terbuka),
 *   definisi proj4-nya di-cache di localStorage agar perangkat lama tetap bisa dipakai.
 * - Deteksi otomatis jenis koordinat dari sampel nilai (derajat / DMS / meter UTM / meter lain).
 * - Parser & format teks DMS (6°59'30.5"S, 106°46'48"BT, dll).
 */

import proj4 from "proj4";
import { forward as mgrsForward, inverse as mgrsInverse, toPoint as mgrsToPoint } from "mgrs";
import type { LatLng } from "./types";

// ============================= TIPE =============================

export type CrsJenis = "geografis" | "dms" | "mgrs" | "proyeksi";

export interface CrsPilihan {
  /** id unik: "wgs84" | "utm:<zona><N|S>" | "epsg:23830" | "epsg:3857" | "dms" | "mgrs" */
  id: string;
  jenis: CrsJenis;
  /** Nama tampil di dropdown. */
  label: string;
  /** Satuan keluaran (untuk penjelasan UI). */
  satuan: "derajat" | "meter" | "teks";
  /** Definisi proj4 (wajib utk jenis "proyeksi"). */
  def?: string;
}

export type DeteksiKoord = {
  jenis: "derajat" | "dms" | "meter-utm" | "meter-lain" | "tidak-dikenal";
  label: string;
  zona?: number;
  hemi?: "N" | "S";
};

// ============================= KATALOG DASAR =============================

export const CRS_WGS84: CrsPilihan = {
  id: "wgs84",
  jenis: "geografis",
  label: "WGS84 — Derajat (lat, lng)",
  satuan: "derajat",
};

export const CRS_DMS: CrsPilihan = {
  id: "dms",
  jenis: "dms",
  label: "WGS84 — Derajat-Menit-Detik (teks)",
  satuan: "teks",
};

export const CRS_MGRS: CrsPilihan = {
  id: "mgrs",
  jenis: "mgrs",
  label: "MGRS — Military Grid Reference",
  satuan: "teks",
};

export const CRS_MERCATOR: CrsPilihan = {
  id: "epsg:3857",
  jenis: "proyeksi",
  label: "Web Mercator (EPSG:3857) — meter",
  satuan: "meter",
  def: "+proj=merc +a=6378137 +b=6378137 +lat_ts=0 +lon_0=0 +x_0=0 +y_0=0 +k=1 +units=m +nadgrids=@null +no_defs +type=crs",
};

/** Definisi UTM WGS84 untuk satu zona & hemisfer. */
export function defUtm(zona: number, hemi: "N" | "S"): string {
  return `+proj=utm +zone=${zona} ${hemi === "S" ? "+south " : ""}+datum=WGS84 +units=m +no_defs +type=crs`;
}

export function crsUtm(zona: number, hemi: "N" | "S"): CrsPilihan {
  return {
    id: `utm:${zona}${hemi}`,
    jenis: "proyeksi",
    label: `UTM Zona ${zona}${hemi} (WGS84) — meter`,
    satuan: "meter",
    def: defUtm(zona, hemi),
  };
}

/** Zona UTM dari bujur (utk saran otomatis). */
export function zonaUtmDariLng(lng: number): number {
  let z = Math.floor((lng + 180) / 6) + 1;
  if (z < 1) z = 1;
  if (z > 60) z = 60;
  return z;
}

/** Hemisfer dari lintang. */
export function hemiDariLat(lat: number): "N" | "S" {
  return lat >= 0 ? "N" : "S";
}

// ============================= KONVERSI INTI =============================

/** Ubah titik CRS sumber → lat/lng WGS84. UNTUK TEKS (dms/mgrs) satuan titik = string. */
export function keLatlng(x: number, y: number, crs: CrsPilihan): LatLng {
  if (crs.jenis === "geografis") return { lat: y, lng: x };
  if (!crs.def) return { lat: y, lng: x };
  const [lng, lat] = proj4(crs.def, "EPSG:4326", [x, y]);
  return { lat, lng };
}

/** Ubah lat/lng WGS84 → koordinat pada CRS tujuan. */
export function dariLatlng(ll: LatLng, crs: CrsPilihan): { x: number; y: number } {
  if (crs.jenis === "geografis") return { x: ll.lng, y: ll.lat };
  if (!crs.def) return { x: ll.lng, y: ll.lat };
  const [x, y] = proj4("EPSG:4326", crs.def, [ll.lng, ll.lat]);
  return { x, y };
}

/** lat/lng → string MGRS (presisi digit: 5=±1 m). */
export function keMgrs(ll: LatLng, presisi = 5): string {
  return mgrsForward([ll.lng, ll.lat], presisi);
}

/** string MGRS → lat/lng (titik tengah sel grid). */
export function dariMgrs(teks: string): LatLng {
  const [lng, lat] = mgrsToPoint(teks.trim().toUpperCase());
  return { lat, lng };
}

// ============================= TEKS DMS =============================

/** Format derajat desimal → D°M'S.s"H (LS/BT/LU/BB ala peta topografi Indonesia). */
export function formatDms(nilai: number, sumbu: "lat" | "lng", desimalDetik = 1): string {
  const hemi = sumbu === "lat" ? (nilai < 0 ? "LS" : "LU") : nilai < 0 ? "BB" : "BT";
  const a = Math.abs(nilai);
  let d = Math.floor(a);
  let m = Math.floor((a - d) * 60);
  let s = ((a - d) * 60 - m) * 60; // sisa menit → detik
  s = Math.round(s * Math.pow(10, desimalDetik)) / Math.pow(10, desimalDetik);
  if (s >= 60) {
    s = 0;
    m += 1;
  }
  if (m >= 60) {
    m = 0;
    d += 1;
  }
  return `${d}°${m}'${s.toFixed(desimalDetik)}"${hemi}`;
}

/**
 * Parse satu nilai koordinat teks:
 * - DMS: 6°59'30.5"S / 6° 59' 30.5 LS / 106°46'48"BT / 6-59-30 S
 * - desimal biasa: -6.993
 * Sumbu dipakai hanya untuk memilih huruf arah yang valid.
 */
export function parseNilaiDms(teks: string, sumbu: "lat" | "lng"): number | null {
  const t = teks.trim();
  if (!t) return null;
  // huruf arah di akhir/awal (LS/LU/BT/BB/S/N/E/W)
  const huruf = /([LSNB EW]{1,2})$/i.exec(t)?.[1] ?? /^[LSNBEW]{1,2}(?=\s*\d)/i.exec(t)?.[1] ?? "";
  const terapkanHemi = (n: number): number => {
    const h = huruf.toUpperCase();
    const minus = h === "S" || h === "W" || h === "LS" || h === "BB";
    return minus ? -Math.abs(n) : n;
  };
  // --- desimal murni (boleh koma): "-6,9943" / "-6.9943 S" — tanpa simbol °'" dan tanpa spasi antar angka
  const inti = t.replace(/\s*(LS|LU|BT|BB|N|S|E|W)$/i, "").trim();
  if (/^-?\d+(?:[.,]\d+)?$/.test(inti)) {
    const n = parseFloat(inti.replace(",", "."));
    if (isFinite(n)) return terapkanHemi(n);
  }
  // --- jalur DMS: 6°59'30.5"S / 6 59 30.5 LS / 106°46'48"BT
  const angka = t.replace(/[°º*]/g, " ").replace(/['’′]/g, " ").replace(/["”″]/g, " ").replace(/[^\d.,\-+\s]/g, " ").trim();
  const bagian = angka.split(/[\s,]+/).filter((v) => v !== "" && v !== "-");
  if (bagian.length === 0) return null;
  let nilai: number;
  if (bagian.length === 1) {
    nilai = parseFloat(bagian[0].replace(",", "."));
  } else {
    const d = parseFloat(bagian[0]);
    const m = bagian.length > 1 ? parseFloat(bagian[1]) : 0;
    const s = bagian.length > 2 ? parseFloat(bagian[2]) : 0;
    if (!isFinite(d)) return null;
    nilai = d + (isFinite(m) ? m : 0) / 60 + (isFinite(s) ? s : 0) / 3600;
  }
  if (!isFinite(nilai)) return null;
  return terapkanHemi(nilai);
}

// ============================= DETEKSI OTOMATIS =============================

/**
 * Tebak jenis koordinat dari sampel pasangan (x, y) — dipakai saat impor
 * Excel/CSV/DXF: derajat / DMS / meter (UTM?) / meter (proyeksi lain?).
 */
export function deteksiKoordinat(sampel: { x: number; y: number }[]): DeteksiKoord {
  const bersih = sampel.filter(
    (s) => isFinite(s.x) && isFinite(s.y) && (s.x !== 0 || s.y !== 0)
  );
  if (bersih.length === 0) return { jenis: "tidak-dikenal", label: "Tidak ada angka koordinat terbaca" };

  const maksAbsX = Math.max(...bersih.map((s) => Math.abs(s.x)));
  const maksAbsY = Math.max(...bersih.map((s) => Math.abs(s.y)));
  const minY = Math.min(...bersih.map((s) => s.y));

  // derajat: y max |<=90|, x max |<=180|
  if (maksAbsY <= 90.5 && maksAbsX <= 180.5) {
    return { jenis: "derajat", label: "Derajat geografis (lintang, bujur) — WGS84" };
  }

  // meter gaya UTM: x (easting) 100 ribu–1 juta, y (northing) 0–10 juta
  const xSepertiUtm = bersih.every((s) => s.x >= 90000 && s.x <= 999000);
  const ySepertiUtm = bersih.every((s) => s.y >= 0 && s.y <= 10_100_000);
  if (xSepertiUtm && ySepertiUtm && maksAbsX > 90) {
    // tebak hemisfer: Indonesia selatan umumnya Y > 9 juta; utara Y < 8,4 juta
    const hemi: "N" | "S" = minY > 8_500_000 || (maksAbsY > 9_000_000) ? "S" : minY < 8_400_000 ? "N" : "S";
    return {
      jenis: "meter-utm",
      label: `Meter — sangat mungkin UTM (X ±${Math.round(maksAbsX).toLocaleString("id-ID")}, Y ±${Math.round(maksAbsY).toLocaleString("id-ID")})`,
      hemi,
    };
  }

  // angka besar lain → proyeksi lokal (TM-3, RSO, kustom)
  if (maksAbsX > 180 || maksAbsY > 90) {
    return {
      jenis: "meter-lain",
      label: "Meter — proyeksi lokal/nasional (perlu kode EPSG, mis. TM-3 DGN95 = 23830…23864)",
    };
  }

  return { jenis: "tidak-dikenal", label: "Jenis koordinat tidak dikenali — pilih manual" };
}

// ============================= EPSG ONLINE (cache) =============================

const KUNCI_CACHE = "cadgis-crs-cache-v1";

type CacheCrs = Record<string, { def: string; label: string }>;

function bacaCache(): CacheCrs {
  try {
    return JSON.parse(localStorage.getItem(KUNCI_CACHE) ?? "{}") as CacheCrs;
  } catch {
    return {};
  }
}

function tulisCache(c: CacheCrs) {
  try {
    localStorage.setItem(KUNCI_CACHE, JSON.stringify(c));
  } catch {
    // kuota penuh — abaikan (def tetap dipakai di sesi ini)
  }
}

/** Daftar CRS EPSG yang pernah dicari (tersimpan di perangkat — bisa dipakai offline). */
export function daftarEpsgTersimpan(): CrsPilihan[] {
  const c = bacaCache();
  return Object.entries(c).map(([id, v]) => ({
    id,
    jenis: "proyeksi" as const,
    label: v.label,
    satuan: "meter" as const,
    def: v.def,
  }));
}

export function hapusCacheEpsg() {
  try {
    localStorage.removeItem(KUNCI_CACHE);
  } catch {
    // abaikan
  }
}

/**
 * Ambil definisi proj4 dari epsg.io untuk kode EPSG apa pun (thousands CRS).
 * Berhasil → disimpan ke cache perangkat. Gagal (offline/kode salah) → lempar Error.
 */
export async function ambilCrsEpsg(kode: number): Promise<CrsPilihan> {
  const id = `epsg:${kode}`;
  const c = bacaCache();
  if (c[id]) {
    return { id, jenis: "proyeksi", label: c[id].label, satuan: "meter", def: c[id].def };
  }
  const res = await fetch(`https://epsg.io/${kode}.proj4`);
  if (!res.ok) throw new Error(`Kode EPSG:${kode} tidak ditemukan (HTTP ${res.status}).`);
  const def = (await res.text()).trim();
  if (!def.startsWith("+")) throw new Error(`Definisi EPSG:${kode} tidak valid.`);
  // label dari nama resmi bila tersedia di def? epsg.io .proj4 tak memuat nama — pakai kode
  const label = `EPSG:${kode} (dari epsg.io)`;
  c[id] = { def, label };
  tulisCache(c);
  return { id, jenis: "proyeksi", label, satuan: "meter", def };
}

// ============================= WKT UNTUK .prj SHAPEFILE =============================

/**
 * WKT .prj untuk CRS yang didukung ekspor SHP (hanya definisi yang pasti benar):
 * WGS84 derajat, UTM zona WGS84, Web Mercator. CRS lain → null (SHP tetap WGS84 + peringatan).
 */
export function wktPrj(crs: CrsPilihan): string | null {
  if (crs.jenis === "geografis" || !crs.def) {
    return 'GEOGCS["GCS_WGS_1984",DATUM["D_WGS_1984",SPHEROID["WGS_1984",6378137.0,298.257223563]],PRIMEM["Greenwich",0.0],UNIT["Degree",0.0174532925199433]]';
  }
  if (crs.id.startsWith("utm:")) {
    const m = /^utm:(\d+)(N|S)$/.exec(crs.id);
    if (!m) return null;
    const zona = m[1];
    const selatan = m[2] === "S";
    return `PROJCS["WGS_1984_UTM_Zone_${zona}${selatan ? "S" : "N"}",GEOGCS["GCS_WGS_1984",DATUM["D_WGS_1984",SPHEROID["WGS_1984",6378137.0,298.257223563]],PRIMEM["Greenwich",0.0],UNIT["Degree",0.0174532925199433]],PROJECTION["Transverse_Mercator"],PARAMETER["False_Easting",500000.0],PARAMETER["False_Northing",${selatan ? "10000000.0" : "0.0"}],PARAMETER["Central_Meridian",${(parseInt(zona, 10) - 1) * 6 - 180 + 3}.0],PARAMETER["Scale_Factor",0.9996],PARAMETER["Latitude_Of_Origin",0.0],UNIT["Meter",1.0]]`;
  }
  if (crs.id === "epsg:3857") {
    return 'PROJCS["WGS_1984_Web_Mercator_Auxiliary_Sphere",GEOGCS["GCS_WGS_1984",DATUM["D_WGS_1984",SPHEROID["WGS_1984",6378137.0,298.257223563]],PRIMEM["Greenwich",0.0],UNIT["Degree",0.0174532925199433]],PROJECTION["Mercator"],PARAMETER["False_Easting",0.0],PARAMETER["False_Northing",0.0],PARAMETER["Central_Meridian",0.0],PARAMETER["Standard_Parallel_1",0.0],PARAMETER["Auxiliary_Sphere_Type",0.0],PARAMETER["Auxiliary_Sphere_Radius",6378137.0],UNIT["Meter",1.0]]';
  }
  return null;
}
