/**
 * Uji perbaikan bug KML: folder "Poligon & Garis" memakai '&' mentah -> Google Earth
 * gagal "Parse error at line 5, column 25: not well-formed (invalid token)".
 * Verifikasi: (1) KML shapes-only baris 5 sudah &amp;, (2) SEMUA '&' di dokumen
 * adalah entity XML sah, (3) KMZ (doc.kml) ikut sah, (4) judul & deskripsi berisi
 * karakter khusus tetap di-escape, (5) poligon tertutup dapat titik penutup.
 */
import { unzipSync } from "fflate";
import { bangunKML, kmlKeKmz } from "../src/lib/gis/kml";
import type { GisShape, GisPoint } from "../src/lib/gis/types";

let gagal = 0;
function cek(nama: string, syarat: boolean, detail = "") {
  if (syarat) console.log(`  OK   ${nama}`);
  else {
    gagal++;
    console.log(`  GAGAL ${nama} ${detail}`);
  }
}

/** Semua '&' DI LUAR CDATA harus berupa entity sah: &amp; &lt; &gt; &quot; &apos; &#..; &#x..;.
 *  Di dalam <![CDATA[...]]> tanda '&' dan '<' mentah adalah sah menurut spesifikasi XML. */
function ampersandSah(xml: string): boolean {
  const tanpaCdata = xml.replace(/<!\[CDATA\[[\s\S]*?\]\]>/g, "");
  const jelek = tanpaCdata.match(/&(?!amp;|lt;|gt;|quot;|apos;|#\d+;|#x[0-9a-fA-F]+;)/g);
  if (jelek) console.log(`    ( '&' mentah ditemukan: ${JSON.stringify(jelek)} )`);
  return jelek === null;
}

const shapePoligon: GisShape = {
  id: "shape-1",
  kind: "closed",
  vertices: [
    { lat: -6.2, lng: 106.8 },
    { lat: -6.21, lng: 106.81 },
    { lat: -6.19, lng: 106.82 },
  ],
  title: 'Batas Lahan "A" & <Sekitar>',
  description: "Uji & cek <data>",
  color: "#10b981",
  attrs: { Pemilik: "Bpk. Agus & Ibu <Sari>" },
  source: "manual",
  visible: true,
  labelTampil: true,
  layerId: "layer-manual",
};

const shapeGaris: GisShape = { ...shapePoligon, id: "shape-2", kind: "open", title: "Jalur Ukur 1-80" };

const titik: GisPoint = {
  id: "p-1",
  lat: -6.2,
  lng: 106.8,
  title: "T-01 & uji",
  attrs: {},
  source: "manual",
  visible: true,
} as unknown as GisPoint;

// 1) SKENARIO USER: ekspor poligon saja (tanpa titik)
console.log("[1] KML shapes-only (skenario ekspor poligon dari titik)");
const kmlShape = bangunKML({ shapes: [shapePoligon, shapeGaris], namaDokumen: "Ekspor Poligon SIMPLE CADGIS" });
const baris = kmlShape.split("\n");
console.log("  --- 5 baris pertama ---");
baris.slice(0, 5).forEach((b, i) => console.log(`  L${i + 1}: ${b}`));
cek("baris 5 memakai &amp; (bukan & mentah)", baris[4]?.includes("Poligon &amp; Garis"), baris[4]);
cek("tidak ada '&' mentah di seluruh dokumen", ampersandSah(kmlShape));

// 2) KMZ: doc.kml di dalam zip juga sah
console.log("[2] KMZ (zip) -> doc.kml di dalamnya");
const kmz = kmlKeKmz(kmlShape, "uji");
const isi = unzipSync(kmz);
cek("doc.kml ada di dalam KMZ", !!isi["doc.kml"]);
const kmlDalam = new TextDecoder().decode(isi["doc.kml"]);
cek("doc.kml tanpa '&' mentah", ampersandSah(kmlDalam));

// 3) Escape judul & ExtendedData
console.log("[3] Escape judul/deskripsi/atribut berisi & < > \"");
cek("judul shape di-escape", kmlShape.includes("<name>Batas Lahan &quot;A&quot; &amp; &lt;Sekitar&gt;</name>"));
cek("ExtendedData di-escape", kmlShape.includes("Bpk. Agus &amp; Ibu &lt;Sari&gt;"));

// 4) Poligon tertutup: titik pertama diulang di akhir; garis terbuka memakai LineString
console.log("[4] Poligon tertutup menutup ring; garis terbuka pakai LineString");
cek("koordinat penutup = titik pertama", kmlShape.includes("106.8,-6.2,0</coordinates>"));
const kmlGarisSaja = bangunKML({ shapes: [shapeGaris], namaDokumen: "uji garis" });
cek("garis terbuka TIDAK menghasilkan <Polygon>", !kmlGarisSaja.includes("<Polygon>"));
cek("garis terbuka memakai <LineString>", kmlGarisSaja.includes("<LineString>"));

// 5) Kombinasi lengkap titik + shape + kontur
console.log("[5] KML gabungan titik + shape + kontur");
const kmlGabung = bangunKML({ points: [titik], shapes: [shapePoligon], contours: [{ id: "c-1", interval: 25, levels: [100], visible: true, createdAt: 0, paths: [{ elev: 100, coords: [{ lat: -6.2, lng: 106.8 }, { lat: -6.3, lng: 106.9 }] }] }], namaDokumen: "Ekspor Tabel SIMPLE CADGIS" });
cek("tanpa '&' mentah di luar CDATA (gabungan)", ampersandSah(kmlGabung));
cek("judul titik di-escape", kmlGabung.includes("T-01 &amp; uji"));

console.log(gagal === 0 ? "\nSEMUA UJI LULUS ✅" : `\n${gagal} UJI GAGAL ❌`);
process.exit(gagal === 0 ? 0 : 1);
