"use client";

/**
 * Proyek & sesi kerja SIMPLE CADGIS.
 * - File proyek .cadgis.json : seluruh isi peta (layer, titik, bentuk, label, kontur, tampilan)
 * - Sesi otomatis (localStorage): cadangan pekerjaan agar tidak hilang saat halaman ditutup
 */

import { useGis } from "./store";
import { unduhTeks, stempelWaktu } from "./download";
import type { GisPoint, ProyekData } from "./types";

const VERSI_PROYEK = 1;
const KUNCI_SESI = "cadgis-sesi-v1";

/** Susun data proyek dari store saat ini. */
export function bangunProyek(nama?: string): ProyekData {
  const s = useGis.getState();
  return {
    app: "SIMPLE CADGIS",
    versi: VERSI_PROYEK,
    disimpanPada: new Date().toISOString(),
    nama: nama?.trim() || undefined,
    layers: s.layers,
    points: s.points,
    shapes: s.shapes,
    labels: s.labels,
    contours: s.contours,
    tampilan: {
      basemap: s.basemap,
      lat: s.mapView.lat,
      lng: s.mapView.lng,
      zoom: s.mapView.zoom,
    },
  };
}

/** Unduh proyek saat ini sebagai file .cadgis.json. */
export function unduhProyek(nama?: string): string {
  const data = bangunProyek(nama);
  const aman = (nama ?? "Proyek")
    .trim()
    .replace(/[^\w\- ]+/g, "")
    .replace(/\s+/g, "-")
    .slice(0, 60) || "Proyek";
  const namaFile = `${aman}-${stempelWaktu()}.cadgis.json`;
  unduhTeks(JSON.stringify(data), namaFile, "application/json");
  return namaFile;
}

/** Baca & validasi file proyek dari input pengguna. */
export function bacaFileProyek(file: File): Promise<ProyekData> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("File tidak dapat dibaca"));
    reader.onload = () => {
      try {
        const data = JSON.parse(String(reader.result)) as ProyekData;
        if (!data || typeof data !== "object") throw new Error("Bukan file proyek");
        if (!Array.isArray(data.points) && !Array.isArray(data.shapes) && !Array.isArray(data.layers)) {
          throw new Error("Struktur proyek tidak dikenali");
        }
        resolve(data);
      } catch (e) {
        reject(e instanceof Error ? e : new Error("JSON tidak valid"));
      }
    };
    reader.readAsText(file);
  });
}

// ================= Sesi otomatis (localStorage) =================

export interface SesiTersimpan {
  data: ProyekData;
  fotoLepas: boolean;
  waktu: number;
}

/** Buang foto (dataURL) dari daftar titik — dipakai bila kuota penyimpanan penuh. */
function tanpaFoto(points: GisPoint[]): GisPoint[] {
  return points.map((p) => (p.photo ? { ...p, photo: undefined } : p));
}

/** Simpan sesi kerja ke localStorage. Diam-diam gagal bila data terlalu besar. */
export function simpanSesiOtomatis(): void {
  try {
    const data = bangunProyek();
    // tidak ada data berarti → hapus sesi (hindari pulihkan sesi kosong)
    if (data.points.length === 0 && data.shapes.length === 0 && data.labels.length === 0 && data.contours.length === 0) {
      hapusSesi();
      return;
    }
    const muatan = JSON.stringify({ ...data, fotoLepas: false });
    try {
      localStorage.setItem(KUNCI_SESI, muatan);
    } catch {
      // kuota penuh → coba lagi tanpa foto
      const tanpa = JSON.stringify({ ...data, points: tanpaFoto(data.points), fotoLepas: true });
      try {
        localStorage.setItem(KUNCI_SESI, tanpa);
      } catch {
        // benar-benar terlalu besar — sesi otomatis dilewati (file proyek tetap bisa dipakai)
      }
    }
  } catch {
    // jangan ganggu pengguna karena kegagalan penyimpanan sisi
  }
}

/** Ambil sesi tersimpan (null bila tidak ada/rusak). */
export function bacaSesiTersimpan(): SesiTersimpan | null {
  try {
    const mentah = localStorage.getItem(KUNCI_SESI);
    if (!mentah) return null;
    const data = JSON.parse(mentah) as ProyekData;
    const adaIsi =
      (data.points?.length ?? 0) + (data.shapes?.length ?? 0) + (data.labels?.length ?? 0) + (data.contours?.length ?? 0) > 0;
    if (!adaIsi) return null;
    return { data, fotoLepas: !!data.fotoLepas, waktu: Date.parse(data.disimpanPada ?? "") || 0 };
  } catch {
    return null;
  }
}

/** Hapus sesi tersimpan (dipakai saat pengguna menolak memulihkan). */
export function hapusSesi(): void {
  try {
    localStorage.removeItem(KUNCI_SESI);
  } catch {
    // abaikan
  }
}
