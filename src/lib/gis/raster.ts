/**
 * Klien worker raster (main thread) — antarmuka untuk src/workers/raster-worker.ts.
 * Worker DIPERTAHANKAN hidup (singleton) karena menyimpan referensi GeoTIFF yang
 * dipakai ulang oleh fitur "Elevasi dari File Lokal" tanpa membaca ulang file.
 */

import type { InfoRaster, PesanRasterKeluar } from "../../workers/raster-worker";

export type { InfoRaster };

export interface HasilBukaRaster {
  info: InfoRaster;
  blob: Blob;
}

export interface OpsiProses {
  /** Kunci registrasi worker (opsional) — dipakai agar id layer = id referensi DEM di worker. */
  kunci?: string;
  onProgres?: (p: { persen: number; tahap: string }) => void;
  sinyalBatal?: { dibatalkan: boolean };
}

let wk: Worker | null = null;

function pastikanWorker(): Worker {
  if (!wk) {
    wk = new Worker(new URL("../../workers/raster-worker.ts", import.meta.url));
  }
  return wk;
}

/** Buka GeoTIFF → info georeferensi + blob gambar pratinjau (PNG/JPEG). */
export function bukaRaster(file: File, opsi: OpsiProses = {}): Promise<HasilBukaRaster> {
  const id = opsi.kunci ?? `rst-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const worker = pastikanWorker();
  return new Promise<HasilBukaRaster>((resolve, reject) => {
    let info: InfoRaster | null = null;
    const bersih = () => {
      worker.removeEventListener("message", dengar);
      worker.removeEventListener("error", gagal);
    };
    const dengar = (e: MessageEvent<PesanRasterKeluar>) => {
      const m = e.data;
      if (m.id !== id) return;
      if (m.type === "progres") {
        opsi.onProgres?.({ persen: m.persen, tahap: m.tahap });
        return;
      }
      if (m.type === "siap") {
        info = m.info;
        return; // tunggu pesan "gambar" untuk id yang sama
      }
      bersih();
      if (opsi.sinyalBatal?.dibatalkan) {
        reject(new Error("Dibatalkan."));
        return;
      }
      if (m.type === "error") {
        reject(new Error(m.message));
        return;
      }
      if (m.type === "gambar" && info) {
        resolve({ info, blob: m.blob });
      } else {
        reject(new Error("Respons worker tidak lengkap."));
      }
    };
    const gagal = (e: ErrorEvent) => {
      bersih();
      reject(new Error(e.message || "Worker raster gagal dimuat."));
    };
    worker.addEventListener("message", dengar);
    worker.addEventListener("error", gagal);
    worker.postMessage({ type: "buka", id, file });
  });
}

/** Sampling elevasi per titik dari DEM lokal yang sudah diimpor (bilinear, lokal). */
export function elevasiDariRaster(
  rasterId: string,
  titik: { lat: number; lng: number }[],
  opsi: OpsiProses = {}
): Promise<(number | null)[]> {
  const id = `elv-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const worker = pastikanWorker();
  return new Promise<(number | null)[]>((resolve, reject) => {
    const bersih = () => {
      worker.removeEventListener("message", dengar);
      worker.removeEventListener("error", gagal);
    };
    const dengar = (e: MessageEvent<PesanRasterKeluar>) => {
      const m = e.data;
      if (m.id !== id) return;
      if (m.type === "progres") {
        opsi.onProgres?.({ persen: m.persen, tahap: m.tahap });
        return;
      }
      bersih();
      if (opsi.sinyalBatal?.dibatalkan || m.type === "error") {
        reject(new Error(m.type === "error" ? m.message : "Dibatalkan."));
        return;
      }
      if (m.type === "elevasi-hasil") {
        resolve(m.nilai);
      }
    };
    const gagal = (e: ErrorEvent) => {
      bersih();
      reject(new Error(e.message || "Worker raster gagal dimuat."));
    };
    worker.addEventListener("message", dengar);
    worker.addEventListener("error", gagal);
    worker.postMessage({ type: "elevasi", id, rasterId, titik });
  });
}

/** Minta worker menghentikan proses elevasi yang sedang berjalan. */
export function batalElevasiRaster() {
  wk?.postMessage({ type: "batalkan-elevasi" });
}
