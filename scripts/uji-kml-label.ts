/** Uji label KML: LabelStyle scale 0/1 sesuai labelMode. Jalankan: bun scripts/uji-kml-label.ts */
import { bangunKML } from "../src/lib/gis/kml";
import type { GisPoint, GisShape } from "../src/lib/gis/types";

const titik: GisPoint[] = [
  { id: "t1", lat: -6.99, lng: 110.42, title: "Titik Bertanda", description: "", attrs: {}, source: "manual", visible: true, labelTampil: true },
  { id: "t2", lat: -6.99, lng: 110.43, title: "Titik Biasa", description: "", attrs: {}, source: "manual", visible: true },
];
const bentuk: GisShape[] = [
  { id: "s1", kind: "closed", vertices: [{ lat: -6.99, lng: 110.42 }, { lat: -6.99, lng: 110.43 }, { lat: -7.0, lng: 110.42 }], title: "Poligon Bertanda", description: "", color: "#2563eb", attrs: {}, source: "manual", visible: true, labelTampil: true },
  { id: "s2", kind: "open", vertices: [{ lat: -6.98, lng: 110.42 }, { lat: -6.98, lng: 110.43 }], title: "Garis Biasa", description: "", color: "#ef4444", attrs: {}, source: "manual", visible: true },
];

function hitung(kml: string) {
  return {
    labelOff: (kml.match(/<LabelStyle><scale>0<\/scale><\/LabelStyle>/g) || []).length,
    labelOn: (kml.match(/<LabelStyle><scale>1<\/scale><\/LabelStyle>/g) || []).length,
  };
}

const semua = bangunKML({ points: titik, shapes: bentuk, labelMode: "semua" });
const terpilih = bangunKML({ points: titik, shapes: bentuk, labelMode: "terpilih" });
const sembunyi = bangunKML({ points: titik, shapes: bentuk, labelMode: "sembunyi" });

console.log("mode SEMUA   :", hitung(semua), "→ harapan: semua label tampil (0 style off)");
console.log("mode TERPILIH:", hitung(terpilih), "→ harapan: 2 off (Titik Biasa & Garis Biasa)");
console.log("mode SEMBUNYI:", hitung(sembunyi), "→ harapan: 4 off (semua)");

const cek = (nama: string, ok: boolean) => {
  console.log((ok ? "LULUS  " : "GAGAL  ") + nama);
  if (!ok) process.exit(1);
};

cek("semua: tidak ada label dimatikan", hitung(semua).labelOff === 0);
cek("terpilih: 2 label dimatikan (fitur tanpa tanda)", hitung(terpilih).labelOff === 2);
cek("sembunyi: 4 label dimatikan (semua fitur)", hitung(sembunyi).labelOff === 4);
cek("KML valid mengandung Placemark 4x", (terpilih.match(/<Placemark>/g) || []).length === 4);
console.log("\nSemua uji KML LULUS ✓");
