// Uji logika feeder + parsePlacemark (replikasi dari parse-worker.ts)
import { readFileSync } from "node:fs";
import { unzipSync } from "node:zlib"; // tidak dipakai; KMZ dibaca via python dump

// Ambil doc.kml dari kmz memakai python (lebih mudah)
import { execSync } from "node:child_process";
const xml = execSync(
  `python3 -c "import zipfile;print(zipfile.ZipFile('samples/uji-popup-odp.kmz').read('doc.kml').decode())"`
).toString();

// ---- replikasi feeder ----
function buatPlacemarkFeeder(emit) {
  let buf = "";
  let searchFrom = 0;
  return {
    push(c) {
      buf += c;
      for (;;) {
        const idx = buf.indexOf("<Placemark", searchFrom);
        if (idx === -1) {
          searchFrom = Math.max(0, buf.length - 12);
          break;
        }
        const end = buf.indexOf("</Placemark>", idx);
        if (end === -1) {
          searchFrom = idx;
          break;
        }
        emit(buf.slice(idx, end + 12));
        buf = buf.slice(end + 12);
        searchFrom = 0;
      }
    },
  };
}

function decodeXml(s) {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#x([0-9a-fA-F]+);/g, (_c, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_c, n) => String.fromCodePoint(Number(n)))
    .replace(/&amp;/g, "&");
}

function parsePlacemark(xml) {
  const ambil = (tag) => {
    const re = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`);
    return decodeXml(re.exec(xml)?.[1]?.trim() ?? "").replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1");
  };
  const attrs = {};
  const name = ambil("name") || "Tanpa Nama";
  const description = ambil("description");

  const parseCoords = (teks) => {
    const out = [];
    for (const pasangan of teks.trim().split(/\s+/)) {
      if (!pasangan) continue;
      const bagian = pasangan.split(",");
      const la = parseFloat(bagian[1]);
      const lo = parseFloat(bagian[0]);
      if (!isNaN(la) && !isNaN(lo)) out.push({ lat: la, lng: lo });
    }
    return out;
  };

  const pm = /<Point[\s\S]*?<coordinates>([\s\S]*?)<\/coordinates>/.exec(xml);
  if (pm) {
    const koor = parseCoords(pm[1]);
    if (koor.length) return { titik: { lat: koor[0].lat, lng: koor[0].lng, name, description, attrs } };
  }
  const pg = /<Polygon[\s\S]*?outerBoundaryIs[\s\S]*?<coordinates>([\s\S]*?)<\/coordinates>/.exec(xml);
  if (pg) {
    const verts = parseCoords(pg[1]);
    if (verts.length >= 3) return { bentuk: { kind: "closed", vertices: verts, name, description, attrs } };
  }
  const ln = /<LineString[\s\S]*?<coordinates>([\s\S]*?)<\/coordinates>/.exec(xml);
  if (ln) {
    const verts = parseCoords(ln[1]);
    if (verts.length >= 2) return { bentuk: { kind: "open", vertices: verts, name, description, attrs } };
  }
  return {};
}

let nTitik = 0, nBentuk = 0;
const hasil = [];
const feeder = buatPlacemarkFeeder((x) => {
  const { titik, bentuk } = parsePlacemark(x);
  if (titik) { nTitik++; hasil.push(["titik", titik.name]); }
  else if (bentuk) { nBentuk++; hasil.push(["bentuk", bentuk.name, bentuk.vertices.length + "v"]); }
  else hasil.push(["GAGAL", x.slice(0, 120)]);
});
// umpan per 200 karakter seperti chunk sungguhan
for (let i = 0; i < xml.length; i += 200) feeder.push(xml.slice(i, i + 200));

console.log("titik:", nTitik, "bentuk:", nBentuk);
console.log(JSON.stringify(hasil, null, 1));
