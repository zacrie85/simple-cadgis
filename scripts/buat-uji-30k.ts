/**
 * Generator file uji: Excel 30.000 baris dengan sharedStrings PADAT
 * (banyak teks unik) untuk mereplikasi bug "Maximum call stack size exceeded"
 * saat impor Excel besar.
 * Output: public/uji-30k.xlsx (dilayani dev server utk pengujian browser).
 */
import * as XLSX from "xlsx";

const N = 30000;

const rows: (string | number)[][] = [];
rows.push(["No", "Nama Lokasi", "Keterangan", "Koordinat", "Elevasi (m)"]);

for (let i = 1; i <= N; i++) {
  const lat = (-7.15 + Math.random() * 0.3).toFixed(6);
  const lng = (110.35 + Math.random() * 0.3).toFixed(6);
  rows.push([
    i,
    `Lokasi Survey ${i} - Zona ${i % 97}`,
    `Titik ukur hasil pengamatan lapangan nomor ${i} oleh tim ${i % 13}; kondisi ${["cerah", "berawan", "hujan", "panas"][i % 4]}`,
    `(${lat},${lng})`,
    Math.round(2 + Math.random() * 900),
  ]);
}

const wb = XLSX.utils.book_new();
const ws = XLSX.utils.aoa_to_sheet(rows);
XLSX.utils.book_append_sheet(wb, ws, "Data");
XLSX.writeFile(wb, "public/uji-30k.xlsx");
console.log(`OK: public/uji-30k.xlsx — ${N.toLocaleString("id-ID")} baris`);
