/* Membuat file contoh: contoh-titik.xlsx dan contoh.kmz untuk uji impor */
const XLSX = require("xlsx");
const { zipSync, strToU8 } = require("fflate");
const fs = require("fs");

// ---- Excel: koordinat format 1 kolom "(-6.994292,110.429400)" ----
const rows = [["Nama", "Koordinat", "Ketinggian", "Keterangan"]];
const lat0 = -6.98,
  lng0 = 110.44;
for (let i = 0; i < 60; i++) {
  const la = (lat0 + (i % 10) * 0.0012).toFixed(6);
  const lo = (lng0 + Math.floor(i / 10) * 0.0013).toFixed(6);
  const elev = 100 + i * 1.7;
  rows.push([`P${i + 1}`, `(${la},${lo})`, elev.toFixed(1), `Uji impor baris ${i + 1}`]);
}
const wb = XLSX.utils.book_new();
const ws = XLSX.utils.aoa_to_sheet(rows);
XLSX.utils.book_append_sheet(wb, ws, "Data");
XLSX.writeFile(wb, "samples/contoh-titik.xlsx");

// ---- KML → KMZ: 1 titik + 1 poligon ----
const kml = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2"><Document>
<Placemark><name>Lokasi Uji KMZ</name><description>Titik dari KMZ</description>
<ExtendedData><Data name="Kode"><value>A-01</value></Data></ExtendedData>
<Point><coordinates>110.437,-6.975,0</coordinates></Point></Placemark>
<Placemark><name>Area Uji KMZ</name><description>Poligon dari KMZ</description>
<ExtendedData><Data name="Status"><value>Uji</value></Data></ExtendedData>
<Polygon><outerBoundaryIs><LinearRing><coordinates>
110.436,-6.976,0 110.442,-6.976,0 110.442,-6.970,0 110.436,-6.970,0 110.436,-6.976,0
</coordinates></LinearRing></outerBoundaryIs></Polygon></Placemark>
</Document></kml>`;
const kmz = zipSync({ "doc.kml": strToU8(kml) });
fs.writeFileSync("samples/contoh.kmz", Buffer.from(kmz));

console.log("Contoh dibuat:", fs.readdirSync("samples"));
