/**
 * Generator file uji impor besar:
 *  - public/uji-30k.xlsx           : 30.000 baris DENGAN kolom elevasi (uji kontur)
 *  - public/uji-30k-tanpa-elev.xlsx: 30.000 baris TANPA elevasi (uji alur DEM Sekarang/Nanti)
 * Keduanya punya sharedStrings padat (banyak teks unik).
 */
import * as XLSX from "xlsx";

const N = 30000;

function buatRows(denganElevasi: boolean): (string | number)[][] {
  const rows: (string | number)[][] = [];
  rows.push(
    denganElevasi
      ? ["No", "Nama Lokasi", "Keterangan", "Koordinat", "Elevasi (m)"]
      : ["No", "Nama Lokasi", "Keterangan", "Koordinat"]
  );
  for (let i = 1; i <= N; i++) {
    // gelombang halus + noise supaya kontur berbentuk alami
    const lat = -7.15 + (i / N) * 0.22 + Math.sin(i / 340) * 0.004 + (Math.random() - 0.5) * 0.001;
    const lng = 110.35 + ((i * 37) % N / N) * 0.22 + Math.cos(i / 420) * 0.004 + (Math.random() - 0.5) * 0.001;
    const baris: (string | number)[] = [
      i,
      `Lokasi Survey ${i} - Zona ${i % 97}`,
      `Titik ukur hasil pengamatan lapangan nomor ${i} oleh tim ${i % 13}; kondisi ${["cerah", "berawan", "hujan", "panas"][i % 4]}`,
      `(${lat.toFixed(6)},${lng.toFixed(6)})`,
    ];
    if (denganElevasi) {
      baris.push(Math.round(50 + Math.sin(lat * 60) * 30 + Math.cos(lng * 55) * 20 + Math.random() * 4));
    }
    rows.push(baris);
  }
  return rows;
}

function tulis(rows: (string | number)[][], sheet: string, out: string) {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(rows);
  XLSX.utils.book_append_sheet(wb, ws, sheet);
  XLSX.writeFile(wb, out);
  console.log(`OK: ${out} — ${rows.length - 1} baris data`);
}

tulis(buatRows(true), "Data", "public/uji-30k.xlsx");
tulis(buatRows(false), "Data", "public/uji-30k-tanpa-elev.xlsx");
