/**
 * Uji unit ekspor KML/KMZ berfolder — jalankan: bun scripts/uji-kml-folder.ts
 * Memverifikasi:
 *  1. Struktur folder: Titik Koordinat (sub-folder per ikon + Tanpa Ikon + Ikon Lainnya),
 *     Poligon, Kotak, Elips, Bulatan, Garis & Panah, Kontur — folder kosong tidak ditulis.
 *  2. tebakBentuk: data lama tanpa field bentuk → bulatan/elips/kotak terdeteksi dari geometri.
 *  3. Style: warna ikon & garis dalam format KML aabbggrr.
 */
import { bangunKML, kmlKeKmz } from "../src/lib/gis/kml";
import { tebakBentuk } from "../src/lib/gis/geo";
import { unzipSync, strFromU8 } from "fflate";
import type { GisPoint, GisShape } from "../src/lib/gis/types";

let lolos = 0;
let gagal = 0;
const cek = (nama: string, kondisi: boolean, detail = "") => {
  if (kondisi) {
    lolos++;
    console.log(`  ✓ ${nama}`);
  } else {
    gagal++;
    console.log(`  ✗ GAGAL: ${nama} ${detail}`);
  }
};

// ---------- pembuat geometri acuan (meniru MapCanvas) ----------
const pusat = { lat: -6.2, lng: 106.8 };
const mx = 111320 * Math.cos((pusat.lat * Math.PI) / 180);
const ring = (rx: number, ry: number, n = 64) =>
  Array.from({ length: n }, (_, i) => {
    const a = (i / n) * 2 * Math.PI;
    return { lat: pusat.lat + (ry * Math.sin(a)) / 110540, lng: pusat.lng + (rx * Math.cos(a)) / mx };
  });

const titik = (over: Partial<GisPoint>): GisPoint => ({
  id: "p", lat: -6.2, lng: 106.8, title: "T", description: "", attrs: {}, source: "manual", visible: true, ...over,
});
const bentuk = (over: Partial<GisShape>): GisShape => ({
  id: "s", kind: "closed", vertices: ring(50, 50), title: "S", description: "", color: "#ef4444",
  attrs: {}, source: "manual", visible: true, ...over,
});

// ---------- 1. tebakBentuk data lama ----------
console.log("— tebakBentuk (data lama tanpa field bentuk) —");
cek("cincin lingkaran 64 pt → bulatan", tebakBentuk({ kind: "closed", vertices: ring(80, 80) }) === "bulatan");
cek("cincin elips rx=120 ry=60 → elips", tebakBentuk({ kind: "closed", vertices: ring(120, 60) }) === "elips");
cek(
  "kotak 4 sudut sejajar sumbu → kotak",
  tebakBentuk({
    kind: "closed",
    vertices: [
      { lat: -6.2, lng: 106.8 },
      { lat: -6.2, lng: 106.801 },
      { lat: -6.201, lng: 106.801 },
      { lat: -6.201, lng: 106.8 },
    ],
  }) === "kotak"
);
cek(
  "poligon tak beraturan 5 pt → poligon",
  tebakBentuk({
    kind: "closed",
    vertices: [
      { lat: -6.2, lng: 106.8 },
      { lat: -6.2005, lng: 106.8013 },
      { lat: -6.2012, lng: 106.8008 },
      { lat: -6.2018, lng: 106.8019 },
      { lat: -6.2008, lng: 106.8024 },
    ],
  }) === "poligon"
);
cek("garis terbuka → garis", tebakBentuk({ kind: "open", vertices: ring(30, 30).slice(0, 20) }) === "garis");
cek("busur setengah lingkaran (open) → garis", tebakBentuk({ kind: "open", vertices: ring(70, 70).slice(0, 32) }) === "garis");

// ---------- 2. struktur folder ----------
console.log("— struktur folder KML —");
const points: GisPoint[] = [
  titik({ id: "1", title: "ODP-1", ikon: "odp" }),
  titik({ id: "2", title: "ODP-2", ikon: "odp" }),
  titik({ id: "3", title: "PIN-A", ikon: "pin-merah" }),
  titik({ id: "4", title: "TARIK-1", ikon: "titik-awal" }),
  titik({ id: "5", title: "POLOS-1" }),
  titik({ id: "6", title: "POLOS-2" }),
  titik({ id: "7", title: "LAMA-1", ikon: "ikon-tidak-ada" }),
];
const shapes: GisShape[] = [
  bentuk({ id: "b1", title: "Blok A", bentuk: "poligon" }),
  bentuk({ id: "b2", title: "Lahan", bentuk: "kotak", vertices: ring(60, 60).slice(0, 0).concat([
    { lat: -6.2, lng: 106.8 }, { lat: -6.2, lng: 106.801 }, { lat: -6.201, lng: 106.801 }, { lat: -6.201, lng: 106.8 },
  ]) }),
  bentuk({ id: "b3", title: "Radius 80 m", bentuk: "bulatan", vertices: ring(80, 80) }),
  bentuk({ id: "b4", title: "Jangkauan", bentuk: "elips", vertices: ring(120, 60) }),
  bentuk({ id: "b5", title: "Kabel 1", kind: "open", bentuk: "garis", vertices: ring(30, 30).slice(0, 12) }),
  bentuk({ id: "b6", title: "Arah Utara", kind: "open", panah: true, bentuk: "garis", vertices: ring(30, 30).slice(0, 6) }),
  // data LAMA tanpa bentuk → harus ditebak
  bentuk({ id: "l1", title: "Lama Bulatan", vertices: ring(45, 45) }),
  bentuk({ id: "l2", title: "Lama Elips", vertices: ring(200, 90) }),
  bentuk({ id: "l3", title: "Lama Kotak", vertices: [
    { lat: -6.19, lng: 106.8 }, { lat: -6.19, lng: 106.802 }, { lat: -6.192, lng: 106.802 }, { lat: -6.192, lng: 106.8 },
  ] }),
];
const kml = bangunKML({ points, shapes, namaDokumen: "Uji Folder" });

const folder = (nama: string): number => {
  const re = new RegExp(`<Folder>\\s*<name>${nama.replace(/[&]/g, "&amp;")}</name>`, "g");
  return (kml.match(re) ?? []).length;
};
cek("folder 'Titik Koordinat' ada", folder("Titik Koordinat") === 1);
cek("sub-folder 'ODP — Optical Distribution Point'", folder("ODP — Optical Distribution Point") === 1);
cek("sub-folder 'Pin Merah'", folder("Pin Merah") === 1);
cek("sub-folder 'Titik Awal Tarikan'", folder("Titik Awal Tarikan") === 1);
cek("sub-folder 'Tanpa Ikon' (2 titik)", folder("Tanpa Ikon") === 1);
cek("sub-folder 'Ikon Lainnya' (id tak dikenal)", folder("Ikon Lainnya") === 1);
cek("tidak ada sub-folder ikon kosong (Pin Biru dst)", folder("Pin Biru") === 0);
cek("folder 'Poligon'", folder("Poligon") === 1);
cek("folder 'Kotak'", folder("Kotak") === 1);
cek("folder 'Elips'", folder("Elips") === 1);
cek("folder 'Bulatan'", folder("Bulatan") === 1);
cek("folder 'Garis & Panah'", folder("Garis & Panah") === 1);
cek("folder Kontur TIDAK ditulis bila kosong", folder("Kontur") === 0);

// hitung placemark per folder dgn parsing sederhana
const antara = (a: string, b: string) => kml.split(a)[1]?.split(b)[0] ?? "";
const nPm = (seg: string) => (seg.match(/<Placemark>/g) ?? []).length;
cek("Bulatan berisi 2 (baru + lama)", nPm(antara('<Folder><name>Bulatan</name>', "</Folder>\n  <Folder")) === 2, `dapat ${nPm(antara('<Folder><name>Bulatan</name>', "</Folder>\n  <Folder"))}`);
cek("Elips berisi 2", nPm(antara('<Folder><name>Elips</name>', "</Folder>\n  <Folder")) === 2, `dapat ${nPm(antara('<Folder><name>Elips</name>', "</Folder>\n  <Folder"))}`);
cek("Kotak berisi 2", nPm(antara('<Folder><name>Kotak</name>', "</Folder>\n  <Folder")) === 2, `dapat ${nPm(antara('<Folder><name>Kotak</name>', "</Folder>\n  <Folder"))}`);
cek("Garis & Panah berisi 2 (garis + panah)", nPm(antara('<Folder><name>Garis &amp; Panah</name>', "</Folder>\n  <Folder")) === 2, `dapat ${nPm(antara('<Folder><name>Garis &amp; Panah</name>', "</Folder>\n  <Folder"))}`);
cek("ExtendedData Jenis=Panah utk bentuk panah", kml.includes("<Data name=\"Jenis\"><value>Panah</value></Data>"));
cek("ExtendedData Ikon=ODP utk titik berikon", kml.includes("<Data name=\"Ikon\"><value>ODP — Optical Distribution Point</value></Data>"));

// ---------- 3. style ----------
console.log("— style KML —");
cek("ikon paddle tint utk titik berikon", kml.includes("paddle/wht-blank.png"));
cek("lingkaran biru utk titik polos", kml.includes("placemark_circle.png"));
cek("warna ODP #f97316 → kml ff1673f9", kml.includes("ff1673f9"));
cek("LineStyle utk bentuk", kml.includes("<LineStyle><color>"));
cek("PolyStyle isi utk poligon tertutup", kml.includes("<PolyStyle><color>"));
cek("LabelStyle scale 0 saat mode sembunyi", bangunKML({ points, shapes, labelMode: "sembunyi" }).includes("<LabelStyle><scale>0</scale></LabelStyle>"));

// ---------- 4. KMZ berisi doc.kml yang sama ----------
console.log("— KMZ —");
const zip = kmlKeKmz(kml, "uji");
const isi = unzipSync(zip);
cek("KMZ berisi doc.kml", !!isi["doc.kml"]);
cek("doc.kml identik dgn KML asal", strFromU8(isi["doc.kml"]) === kml);

// ---------- 5. XML well-formed (parse DOMParser-ish via regex balance) ----------
console.log("— keseimbangan tag —");
for (const tag of ["Folder", "Placemark", "Document"]) {
  const buka = (kml.match(new RegExp(`<${tag}[ >]`, "g")) ?? []).length;
  const tutup = (kml.match(new RegExp(`</${tag}>`, "g")) ?? []).length;
  cek(`<${tag}> seimbang (${buka})`, buka === tutup, `buka=${buka} tutup=${tutup}`);
}

console.log(`\nHASIL: ${lolos} lolos, ${gagal} gagal`);
process.exit(gagal ? 1 : 0);
