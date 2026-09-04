/**
 * Piramida raster — penyimpanan tile lokal via IndexedDB.
 * Dipakai BERSAMA oleh:
 *  - Web Worker raster (menulis tile hasil konversi otomatis)
 *  - Main thread (membaca tile utk L.GridLayer, menghapus saat layer dihapus)
 *
 * Konsep: file GeoTIFF raksasa (mis. 1 TB) dibaca SEKALI bertahap, lalu dibuatkan
 * "piramida" gambar bertingkat (level 4096/8192/16384 px dst, tile JPEG 512 px).
 * Hasilnya puluhan–ratusan MB tersimpan LOKAL di browser → peta tampil tajam
 * per zoom tanpa menyentuh file asli lagi, bahkan setelah aplikasi ditutup.
 *
 * File ini TIDAK boleh mengimpor leaflet/anything-DOM (dipakai di worker).
 */

export const NAMA_DB = "simplecadgis-raster-piramida";
const VERSI_DB = 1;
const STORE_TILES = "tiles";
const STORE_META = "meta";

/** Denah satu level piramida. */
export interface LevelPiramida {
  lebarPx: number;
  tinggiPx: number;
  kolom: number; // jumlah tile horizontal (tile 512 px)
  baris: number;
}

/** Metadata piramida satu raster (kunci: idPiramida stabil dari tanda file). */
export interface MetaPiramida {
  id: string; // "pir-<hash>"
  tanda: string; // `${nama}|${size}|${lastModified}` — identitas file sumber
  level: LevelPiramida[]; // terurut kasar → halus (4096, 8192, …)
  siap: boolean;
  ukuranBita: number; // total byte tile tersimpan
  dibuat: number;
}

let dbJanji: Promise<IDBDatabase> | null = null;

/** Buka (dan upgrade) DB — singleton aman worker & main thread. */
export function bukaDbPiramida(): Promise<IDBDatabase> {
  if (dbJanji) return dbJanji;
  dbJanji = new Promise((resolve, reject) => {
    const req = indexedDB.open(NAMA_DB, VERSI_DB);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_TILES)) db.createObjectStore(STORE_TILES);
      if (!db.objectStoreNames.contains(STORE_META)) db.createObjectStore(STORE_META);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("IndexedDB gagal dibuka"));
  });
  return dbJanji;
}

/** Hash FNV-1a ringan — id stabil dari tanda file (nama|ukuran|modified). */
export function hashTanda(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

/** idPiramida stabil untuk sebuah file — import ulang file yang sama = cache terpakai. */
export function idPiramidaDariTanda(tanda: string): string {
  return `pir-${hashTanda(tanda)}`;
}

export async function simpanMetaPiramida(meta: MetaPiramida): Promise<void> {
  const db = await bukaDbPiramida();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_META, "readwrite");
    tx.objectStore(STORE_META).put(meta, meta.id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function ambilMetaPiramida(id: string): Promise<MetaPiramida | null> {
  const db = await bukaDbPiramida();
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE_META, "readonly").objectStore(STORE_META).get(id);
    req.onsuccess = () => resolve((req.result as MetaPiramida) ?? null);
    req.onerror = () => reject(req.error);
  });
}

/** Simpan banyak tile sekaligus dalam SATU transaksi (cepat). */
export async function simpanTilePiramida(
  id: string,
  entri: { kunci: string; blob: Blob }[]
): Promise<void> {
  if (!entri.length) return;
  const db = await bukaDbPiramida();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_TILES, "readwrite");
    const st = tx.objectStore(STORE_TILES);
    for (const e of entri) st.put(e.blob, `${id}/${e.kunci}`);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function ambilTilePiramida(id: string, kunci: string): Promise<Blob | null> {
  const db = await bukaDbPiramida();
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE_TILES, "readonly").objectStore(STORE_TILES).get(`${id}/${kunci}`);
    req.onsuccess = () => resolve((req.result as Blob) ?? null);
    req.onerror = () => reject(req.error);
  });
}

/** Hapus seluruh tile + meta piramida (dipanggil saat layer raster dihapus). */
export async function hapusPiramida(id: string): Promise<void> {
  const db = await bukaDbPiramida();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction([STORE_TILES, STORE_META], "readwrite");
    const st = tx.objectStore(STORE_TILES);
    const rentang = IDBKeyRange.bound(`${id}/`, `${id}/\uffff`);
    st.delete(rentang);
    tx.objectStore(STORE_META).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/** Kunci tile: "level-kolom-baris". */
export function kunciTile(levelIdx: number, kolom: number, baris: number): string {
  return `${levelIdx}-${kolom}-${baris}`;
}
