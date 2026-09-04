import type { GisPoint, GisShape, LatLng } from "./types";

/** Ekspor daftar titik/poligon/garis menjadi file .xlsx multi-sheet. */
export async function excelZip(
  opts: {
    points?: GisPoint[];
    shapes?: GisShape[];
    namaSheet?: string;
    /** Proyeksi keluaran (Task 32): bila ada, kolom X/Y tambahan dalam CRS ini (lat/lng tetap ada). */
    proyeksi?: (ll: LatLng) => { x: number; y: number };
    labelCrs?: string;
  },
  namaFile: string
): Promise<void> {
  const XLSX = await import("xlsx");
  const wb = XLSX.utils.book_new();
  const proy = opts.proyeksi;
  const sufiks = opts.labelCrs ? ` (${opts.labelCrs})` : "";

  if (opts.points) {
    const kunci = new Set<string>();
    for (const p of opts.points) Object.keys(p.attrs).forEach((k) => kunci.add(k));
    const header = [
      "Judul",
      "Keterangan",
      "Latitude",
      "Longitude",
      ...(proy ? [`X${sufiks}`, `Y${sufiks}`] : []),
      "Ketinggian (m)",
      ...Array.from(kunci),
    ];
    const baris = opts.points.map((p) => {
      const k = proy ? proy({ lat: p.lat, lng: p.lng }) : null;
      return [
        p.title,
        p.description,
        p.lat,
        p.lng,
        ...(proy && k ? [k.x, k.y] : []),
        p.elevation ?? "",
        ...Array.from(kunci).map((k2) => p.attrs[k2] ?? ""),
      ];
    });
    const ws = XLSX.utils.aoa_to_sheet([header, ...baris]);
    XLSX.utils.book_append_sheet(wb, ws, opts.namaSheet?.slice(0, 30) || "Titik");
  }

  if (opts.shapes) {
    const header = proy
      ? ["Judul", "Jenis", "Keterangan", "Jumlah Titik", "Daftar Titik (lat,lng; ...)", `Daftar X/Y${sufiks}`]
      : ["Judul", "Jenis", "Keterangan", "Jumlah Titik", "Daftar Titik (lat,lng; ...)"];
    const baris = opts.shapes.map((s) => {
      const daftarProy = proy
        ? s.vertices
            .map((v) => {
              const k = proy(v);
              return `${k.x.toFixed(3)},${k.y.toFixed(3)}`;
            })
            .join("; ")
        : null;
      return [
        s.title,
        s.kind === "closed" ? "Poligon" : "Garis",
        s.description,
        s.vertices.length,
        s.vertices.map((v) => `${v.lat},${v.lng}`).join("; "),
        ...(proy ? [daftarProy] : []),
      ];
    });
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
