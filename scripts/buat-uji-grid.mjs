/** Buat Excel uji grid 80 titik TANPA kolom elevasi — untuk verifikasi
 *  pengisian elevasi DEM "Hanya titik terpilih" (blok sebagian titik). */
import * as XLSX from "xlsx";

const rows = [["Nama", "X", "Y"]];
let no = 1;
for (let r = 0; r < 8; r++) {
  for (let c = 0; c < 10; c++) {
    const lat = -7.0 - r * 0.01;
    const lng = 110.42 + c * 0.01;
    rows.push([`P-${String(no).padStart(2, "0")}`, lng.toFixed(6), lat.toFixed(6)]);
    no++;
  }
}

const ws = XLSX.utils.aoa_to_sheet(rows);
const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, ws, "Titik");
XLSX.writeFile(wb, "/home/z/my-project/download/uji-grid.xlsx");
console.log("OK: download/uji-grid.xlsx — 80 titik grid tanpa elevasi");
