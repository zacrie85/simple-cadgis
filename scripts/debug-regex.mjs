// Debug regex poligon terhadap placemark asli
import { execSync } from "node:child_process";
const xml = execSync(
  `python3 -c "import zipfile;print(zipfile.ZipFile('samples/uji-popup-odp.kmz').read('doc.kml').decode())"`
).toString();

const awal = xml.indexOf("<Placemark>\n      <name>Area Kerja A");
const akhir = xml.indexOf("</Placemark>", awal) + 12;
const placemark = xml.slice(awal, akhir);

const pmRe = /<Point[\s\S]*?<coordinates>([\s\S]*?)<\/coordinates>/;
const pgRe = /<Polygon[\s\S]*?outerBoundaryIs[\s\S]*?<coordinates>([\s\S]*?)<\/coordinates>/;
console.log("match Point:", pmRe.test(placemark));
console.log("match Polygon:", pgRe.test(placemark));
console.log(JSON.stringify(placemark));
