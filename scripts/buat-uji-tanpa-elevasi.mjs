/** Buat Excel uji TANPA kolom elevasi — untuk verifikasi pengisian elevasi DEM otomatis.
 *  Titik disebar dari dataran Semarang sampai kawasan Ungaran/Bawen agar ketinggian bervariasi. */
import * as XLSX from "xlsx";

const data = [
  ["SMG-01", -6.9932, 110.4203], // dekat pelabuhan
  ["SMG-02", -6.9985, 110.4381], // pusat kota rendah
  ["SMG-03", -7.0213, 110.4612], // pedalaman selatan
  ["SMG-04", -7.0701, 110.4907], // menuju Ungaran
  ["SMG-05", -7.1044, 110.5052], // kaki Ungaran
  ["SMG-06", -7.1398, 110.4931], // Ungaran barat
  ["SMG-07", -7.2451, 110.4926], // Bawen
  ["SMG-08", -7.3312, 110.5063], // Salatiga utara
  ["SMG-09", -6.9502, 110.4418], // utara pesisir
  ["SMG-10", -7.5301, 110.8305], // lereng Merbabu
];

const ws = XLSX.utils.aoa_to_sheet([["Nama", "X", "Y"], ...data.map((d) => [d[0], d[2], d[1]])]);
const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, ws, "Titik");
XLSX.writeFile(wb, "/home/z/my-project/download/uji-tanpa-elevasi.xlsx");
console.log("OK: download/uji-tanpa-elevasi.xlsx — 10 baris, kolom: Nama, X(lng), Y(lat)");
