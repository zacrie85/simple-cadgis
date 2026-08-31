import type { GisPoint, GisShape } from "./types";

/** Ekspor daftar titik/poligon/garis menjadi file .xlsx multi-sheet. */
export async function excelZip(
  opts: {
    points?: GisPoint[];
    shapes?: GisShape[];
    namaSheet?: string;
  },
  namaFile: string
): Promise<void> {
  const XLSX = await import("xlsx");
  const wb = XLSX.utils.book_new();

  if (opts.points) {
    const kunci = new Set<string>();
    for (const p of opts.points) Object.keys(p.attrs).forEach((k) => kunci.add(k));
    const header = [
      "Judul",
      "Keterangan",
      "Latitude",
      "Longitude",
      "Ketinggian (m)",
      ...Array.from(kunci),
    ];
    const baris = opts.points.map((p) => [
      p.title,
      p.description,
      p.lat,
      p.lng,
      p.elevation ?? "",
      ...Array.from(kunci).map((k) => p.attrs[k] ?? ""),
    ]);
    const ws = XLSX.utils.aoa_to_sheet([header, ...baris]);
    XLSX.utils.book_append_sheet(wb, ws, opts.namaSheet?.slice(0, 30) || "Titik");
  }

  if (opts.shapes) {
    const header = ["Judul", "Jenis", "Keterangan", "Jumlah Titik", "Daftar Titik (lat,lng; ...)"];
    const baris = opts.shapes.map((s) => [
      s.title,
      s.kind === "closed" ? "Poligon" : "Garis",
      s.description,
      s.vertices.length,
      s.vertices.map((v) => `${v.lat},${v.lng}`).join("; "),
    ]);
    const ws = XLSX.utils.aoa_to_sheet([header, ...baris]);
    XLSX.utils.book_append_sheet(wb, ws, "Poligon & Garis");
  }

  XLSX.writeFile(wb, namaFile);
}

/** Ekspor tabel umum (array of rows) ke xlsx. */
export async function excelTabel(
  header: string[],
  baris: (string | number)[][],
  namaFile: string,
  namaSheet = "Tabel"
): Promise<void> {
  const XLSX = await import("xlsx");
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([header, ...baris]);
  XLSX.utils.book_append_sheet(wb, ws, namaSheet.slice(0, 30) || "Tabel");
  XLSX.writeFile(wb, namaFile);
}
