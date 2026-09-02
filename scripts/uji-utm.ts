/** Uji jalur UTM: proj4 def yang dipakai worker harus mengonversi UTM 48S Semarang ↔ WGS84 dengan benar. */
import proj4 from "proj4";

let gagal = 0;
function cek(nama: string, syarat: boolean, detail = "") {
  if (syarat) console.log(`  OK   ${nama}`);
  else {
    gagal++;
    console.log(`  GAGAL ${nama} ${detail}`);
  }
}

// titik uji: Semarang (110.4294, -6.994292) — zona 49S (108°–114°BT)
const defUtm49s = "+proj=utm +zone=49 +south +datum=WGS84 +units=m +no_defs";
const [x, y] = proj4("EPSG:4326", defUtm49s, [110.4294, -6.994292]);
console.log("UTM 49S Semarang:", x.toFixed(1), "E,", y.toFixed(1), "N (selatan)");
cek("easting wajar 430rb..445rb (zona 49)", x > 430000 && x < 445000, String(x));
cek("northing (selatan) 9.2jt..9.24jt", y > 9200000 && y < 9240000, String(y));

// bulak-balik: UTM → WGS84 harus kembali ke titik awal (toleransi 1e-6°)
const [lng, lat] = proj4(defUtm49s, "EPSG:4326", [x, y]);
cek("balik ke lng awal", Math.abs(lng - 110.4294) < 1e-6, String(lng));
cek("balik ke lat awal", Math.abs(lat + 6.994292) < 1e-6, String(lat));

// zona utara (326xx) pada titik belahan selatan → northing negatif (memang beda definisi)
const defUtm49n = "+proj=utm +zone=49 +datum=WGS84 +units=m +no_defs";
const [, yn] = proj4("EPSG:4326", defUtm49n, [110.4294, -6.994292]);
cek("zona utara: northing negatif di belahan selatan", yn < 0, String(yn));

console.log(gagal === 0 ? "\nSEMUA UJI LULUS ✅" : `\n${gagal} UJI GAGAL ❌`);
process.exit(gagal === 0 ? 0 : 1);
