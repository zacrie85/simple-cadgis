/** Buat file Excel uji: N baris × 80 kolom atribut untuk verifikasi tabel semua kolom.
 *  Usage: bun scripts/buat-uji-80-kolom.mjs [jumlahBaris] [jumlahKolom] [pathOutput] */
import * as XLSX from "xlsx";

const JUMLAH_BARIS = Number(process.argv[2] ?? 30);
const JUMLAH_KOLOM = Number(process.argv[3] ?? 80);
const OUT = process.argv[4] ?? "/home/z/my-project/download/uji-80-kolom.xlsx";

const headers = ["Nama", "X", "Y", "Z", ...Array.from({ length: JUMLAH_KOLOM - 4 }, (_, i) => `Atribut_${i + 5}`)];

const rows = [];
for (let r = 0; r < JUMLAH_BARIS; r++) {
  const baris = [
    `TP-${String(r + 1).padStart(3, "0")}`,
    +(109.7 + r * 0.001).toFixed(6),
    -6.9 + r * 0.0008,
    5 + r * 2.5,
  ];
  for (let c = 4; c < JUMLAH_KOLOM; c++) {
    baris.push(`${headers[c]}-nilai-${r + 1}`);
  }
  rows.push(baris);
}

const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, ws, "Data");
XLSX.writeFile(wb, OUT);
console.log("OK:", OUT, "—", JUMLAH_BARIS, "baris x", JUMLAH_KOLOM, "kolom");
