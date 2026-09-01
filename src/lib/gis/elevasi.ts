"use client";

import { useGis } from "./store";

/** Elevasi otomatis dari DEM (Digital Elevation Model) satelit.
 *  Sumber: Copernicus DEM GLO-90 via API Open-Meteo — gratis, tanpa API key,
 *  maksimal 100 koordinat per permintaan, CORS terbuka (aman dari browser).
 *  Prinsip: HANYA titik yang elevasinya masih kosong (null) yang diisi —
 *  data survei yang sudah ada tidak pernah ditimpa. */

const URL_API = "https://api.open-meteo.com/v1/elevation";
const UKURAN_BATCH = 100;

export interface ProgresElevasi {
  selesai: number;
  total: number;
  gagal: number;
}

export interface HasilIsi {
  diisi: number;
  gagal: number;
  dibatalkan: boolean;
}

export interface OpsiElevasi {
  onProgres?: (p: ProgresElevasi) => void;
  /** Dipanggil setelah tiap batch selesai: mulai = indeks awal batch, nilai = hasil batch (null = gagal). */
  onBatch?: (mulai: number, nilai: (number | null)[]) => void;
  /** Set `dibatalkan = true` dari luar untuk menghentikan batch berikutnya. */
  sinyalBatal?: { dibatalkan: boolean };
}

function tidur(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** Ambil elevasi DEM untuk daftar koordinat. Hasil sejajar input (null = gagal). */
export async function ambilElevasiDEM(
  titik: { lat: number; lng: number }[],
  opsi: OpsiElevasi = {}
): Promise<(number | null)[]> {
  const hasil: (number | null)[] = new Array(titik.length).fill(null);
  if (titik.length === 0) return hasil;

  // pecah jadi batch maks 100 koordinat
  const batch: number[][] = [];
  for (let i = 0; i < titik.length; i += UKURAN_BATCH) {
    batch.push(Array.from({ length: Math.min(UKURAN_BATCH, titik.length - i) }, (_, j) => i + j));
  }

  let selesai = 0;
  let gagal = 0;

  for (const idxs of batch) {
    if (opsi.sinyalBatal?.dibatalkan) break;
    const lats = idxs.map((i) => titik[i].lat.toFixed(6)).join(",");
    const lngs = idxs.map((i) => titik[i].lng.toFixed(6)).join(",");
    let ok = false;
    // 3 percobaan per batch dengan jeda memanjang
    for (let coba = 0; coba < 3 && !ok; coba++) {
      try {
        const res = await fetch(`${URL_API}?latitude=${lats}&longitude=${lngs}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json: unknown = await res.json();
        const elev = (json as { elevation?: unknown }).elevation;
        if (!Array.isArray(elev)) throw new Error("Respon tidak valid");
        idxs.forEach((idxAsal, j) => {
          const v = (elev as unknown[])[j];
          hasil[idxAsal] = typeof v === "number" && isFinite(v) ? Math.round(v * 10) / 10 : null;
        });
        ok = true;
      } catch (e) {
        console.warn(`[elevasi] percobaan ${coba + 1} gagal:`, e);
        if (coba < 2) await tidur(800 * (coba + 1));
      }
    }
    if (!ok) gagal += idxs.length;
    selesai += idxs.length;
    // hasil batch tersalurkan lewat parameter — bukan closure atas `hasil`
    if (ok && opsi.onBatch) opsi.onBatch(idxs[0], idxs.map((i) => hasil[i]));
    opsi.onProgres?.({ selesai, total: titik.length, gagal });
  }

  return hasil;
}

/** Isi elevasi DEM untuk semua titik di store yang masih kosong
 *  (atau hanya id tertentu bila diberikan). Titik ber-elevasi diabaikan.
 *  Store diperbarui bertahap per batch agar progres langsung terlihat di peta. */
export async function isiElevasiKosong(
  ids?: string[],
  opsi: OpsiElevasi = {}
): Promise<HasilIsi> {
  const st0 = useGis.getState();
  // Set (bukan ids.includes) — pencarian O(1) per titik, aman saat 30rb+ titik
  // diseleksi dari total ratusan ribu baris
  const kumpulanId = ids ? new Set(ids) : null;
  const saring = (p: { id: string; elevation?: number | null }) =>
    p.elevation == null && (!kumpulanId || kumpulanId.has(p.id));
  const target = st0.points.filter(saring);

  if (target.length === 0) return { diisi: 0, gagal: 0, dibatalkan: false };

  const titik = target.map((p) => ({ lat: p.lat, lng: p.lng }));

  const hasil = await ambilElevasiDEM(titik, {
    onProgres: opsi.onProgres,
    sinyalBatal: opsi.sinyalBatal,
    onBatch: (mulai, nilai) => {
      const st = useGis.getState();
      for (let j = 0; j < nilai.length; j++) {
        const e = nilai[j];
        if (e != null) st.updatePoint(target[mulai + j].id, { elevation: e });
      }
    },
  });

  let diisi = 0;
  for (let i = 0; i < target.length; i++) {
    if (hasil[i] != null) diisi++;
  }
  const dibatalkan = opsi.sinyalBatal?.dibatalkan ?? false;

  return { diisi, gagal: target.length - diisi, dibatalkan };
}
