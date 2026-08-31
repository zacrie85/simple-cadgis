/** Util unduh file dari memori. */

// Uint8Array<ArrayBufferLike> dari pustaka zip (fflate) belum masuk tipe
// BlobPart pada TypeScript 5.9 — jadi terima keduanya lalu amankan lewat cast.
export type DataUnduh = BlobPart | Uint8Array;

export function unduhBlob(data: DataUnduh, namaFile: string, mime = "application/octet-stream") {
  const blob = new Blob([data as BlobPart], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = namaFile;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export function unduhTeks(teks: string, namaFile: string, mime = "text/plain") {
  unduhBlob(teks, namaFile, mime);
}

export function stempelWaktu(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
}
