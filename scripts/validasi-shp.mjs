/* Validasi round-trip penulis Shapefile GeoKita (offset benar) */
import { unzipSync, strFromU8 } from "fflate";

const mod = await import("../src/lib/gis/shapefile.ts");

const zip = mod.shapefileZip({
  nama: "uji",
  points: [
    {
      p: { id: "1", lat: -6.994292, lng: 110.4294, title: "A", description: "tes", elevation: 100, attrs: { Kode: "X1" }, source: "manual", visible: true },
      attrs: { Kode: "X1" },
    },
    {
      p: { id: "2", lat: -6.98, lng: 110.44, title: "B", description: "", elevation: null, attrs: {}, source: "manual", visible: true },
      attrs: {},
    },
  ],
  shapes: [
    {
      s: { id: "s1", kind: "closed", vertices: [{ lat: -7.0, lng: 110.4 }, { lat: -7.0, lng: 110.5 }, { lat: -7.1, lng: 110.5 }, { lat: -7.1, lng: 110.4 }], title: "P", description: "", color: "#fff", attrs: {}, source: "manual", visible: true },
      attrs: {},
    },
  ],
});

const file = unzipSync(zip);
console.log("isi zip:", Object.keys(file));

// ---- SHP: pakai shape poligon (tipe 5) ----
const shp = file["uji.shp"];
const dv = new DataView(shp.buffer);
const tipe = dv.getInt32(32, true);
console.log("SHP magic:", dv.getInt32(0), "| tipe:", tipe, "(5=Polygon)");
let off = 100;
let recNum = 1;
let semuaOk = true;
while (off < shp.length) {
  const num = dv.getInt32(off);
  const lenWords = dv.getInt32(off + 4);
  const t = dv.getInt32(off + 8, true);
  const isiByte = lenWords * 2;
  const expected = t === 1 ? 20 : 44 + 16 * ((isiByte - 44) / 16);
  const ok = num === recNum && isiByte === expected;
  if (!ok) semuaOk = false;
  console.log(`Rec${num}: num=${num} tipe=${t} lenByte=${isiByte} expected=${expected} ${ok ? "OK" : "SALAH"}`);
  off += 8 + isiByte;
  recNum++;
}
console.log("SHP total sesuai:", off === shp.length ? "OK" : `SALAH (${off} vs ${shp.length})`);

// ---- DBF ----
const dbf = file["uji.dbf"];
const dvf = new DataView(dbf.buffer);
const nRec = dvf.getUint32(4, true);
const headerLen = dvf.getUint16(8, true);
const recLen = dvf.getUint16(10, true);
const enc = new TextDecoder();
const namaF1 = enc.decode(dbf.slice(32, 42)).replace(/\0.*$/, "");
const tipeF1 = String.fromCharCode(dbf[42 + 11]);
console.log("DBF: nRec=", nRec, "headerLen=", headerLen, "recLen=", recLen);
console.log("DBF ukuran:", dbf.length, "harus:", headerLen + nRec * recLen + 1, dbf.length === headerLen + nRec * recLen + 1 ? "OK" : "SALAH");
console.log("Field1:", namaF1, "tipe:", tipeF1, "| terminator header:", dbf[headerLen - 1] === 0x0d ? "OK" : "SALAH");
// baca record pertama
const rec1 = enc.decode(dbf.slice(headerLen, headerLen + recLen));
console.log("Record1 mentah:", JSON.stringify(rec1));
console.log("DBF EOF:", dbf[dbf.length - 1] === 0x1a ? "OK" : "SALAH");
console.log("PRJ:", strFromU8(file["uji.prj"]).includes("WGS_1984") ? "OK" : "SALAH");
console.log("SHX:", shx_len(file) === 100 + 8 * nRec ? "OK" : "SALAH");
function shx_len(f) { return f["uji.shx"].length; }
