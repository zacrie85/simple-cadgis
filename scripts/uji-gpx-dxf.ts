/**
 * Uji parser & generator GPX/DXF (Task 31) — jalan di Node/bun via jsdom-less:
 * parseGpx butuh DOMParser → pakai check globalThis (bun menyediakan? tidak) —
 * jadi uji GPX pakai DOMParser dari bun? BUN TIDAK punya DOMParser.
 * Solusi: uji GPX dijalankan hanya bila DOMParser tersedia; uji DXF murni teks.
 * Jalankan: bun scripts/uji-gpx-dxf.ts
 */
import {
  parseDxf,
  dxfSudahDerajat,
  dxfKeFitur,
  buatKonversiUtm,
  bangunGpx,
  bangunDxf,
  parseGpx,
} from "../src/lib/gis/gpxdxf";
import type { GisPoint, GisShape, GisLabel } from "../src/lib/gis/types";

let lulus = 0;
let gagal = 0;
function cek(nama: string, kondisi: boolean, detail = "") {
  if (kondisi) {
    lulus++;
    console.log(`  ✓ ${nama}`);
  } else {
    gagal++;
    console.error(`  ✗ ${nama}${detail ? " — " + detail : ""}`);
  }
}

// ==================== UJI DXF IMPOR ====================
console.log("\n[1] DXF impor — entitas lengkap (derajat)");
const dxfDerajat = [
  "0", "SECTION", "2", "ENTITIES",
  "0", "POINT", "8", "TOPO", "10", "110.5", "20", "-6.9", "30", "25.5",
  "0", "LINE", "8", "TOPO", "10", "110.4", "20", "-7.0", "11", "110.6", "21", "-6.8",
  "0", "LWPOLYLINE", "8", "BLOK", "90", "4", "70", "1",
  "10", "110.40", "20", "-7.05", "10", "110.41", "20", "-7.05",
  "10", "110.41", "20", "-7.06", "10", "110.40", "20", "-7.06",
  "0", "CIRCLE", "8", "TITIK", "10", "110.45", "20", "-6.95", "40", "0.005",
  "0", "ARC", "8", "JALAN", "10", "110.45", "20", "-6.95", "40", "0.004", "50", "0.0", "51", "90.0",
  "0", "TEXT", "8", "LABEL", "10", "110.44", "20", "-6.94", "40", "0.001", "1", "ODP-01 Semarang",
  "0", "ENDSEC", "0", "EOF",
].join("\r\n");
{
  const h = parseDxf(dxfDerajat);
  cek("tidak terdeteksi biner", !h.biner);
  cek("6 entitas terbaca", h.entitas.length === 6, `dapat ${h.entitas.length}`);
  cek("sudah derajat", dxfSudahDerajat(h.entitas));
  const fitur = dxfKeFitur(h.entitas, (x, y) => ({ lat: y, lng: x }));
  cek("1 titik (elev 25.5)", fitur.points.length === 1 && fitur.points[0].ele === 25.5);
  cek("4 bentuk (garis+poly+lingkaran+busur)", fitur.shapes.length === 4, `dapat ${fitur.shapes.length}`);
  cek("poly tertutup 4 verteks", fitur.shapes.some((s) => s.kind === "closed" && s.vertices.length === 4));
  cek("lingkaran 64 verteks", fitur.shapes.some((s) => s.name.includes("Lingkaran") && s.vertices.length === 64));
  cek("busur 49 verteks terbuka", fitur.shapes.some((s) => s.name.includes("Busur") && s.vertices.length === 49 && s.kind === "open"));
  cek("1 label teks", fitur.labels.length === 1 && fitur.labels[0].text === "ODP-01 Semarang");
  cek("atribut layer", fitur.shapes.some((s) => s.attrs.Layer === "BLOK"));
}

console.log("\n[2] DXF impor — koordinat UTM meter (bukan derajat)");
{
  const dxfUtm = [
    "0", "SECTION", "2", "ENTITIES",
    "0", "POINT", "8", "0", "10", "436975.31", "20", "9226844.12",
    "0", "LINE", "8", "0", "10", "436000", "20", "9226000", "11", "437000", "21", "9227000",
    "0", "ENDSEC", "0", "EOF",
  ].join("\r\n");
  const h = parseDxf(dxfUtm);
  cek("terdeteksi BUKAN derajat", !dxfSudahDerajat(h.entitas));
  // zona 49S (Semarang): 436975.31 / 9226844.12 ≈ 110.4294E, -6.9943 (toleransi ~0,001°)
  const conv = buatKonversiUtm(49, "S");
  const { lat, lng } = conv(436975.31, 9226844.12);
  cek("UTM 49S → lng ≈ 110.4294", Math.abs(lng - 110.4294) < 0.002, `dapat ${lng}`);
  cek("UTM 49S → lat ≈ -6.9943", Math.abs(lat - -6.9943) < 0.002, `dapat ${lat}`);
  const fitur = dxfKeFitur(h.entitas, conv);
  cek("1 titik hasil konversi", fitur.points.length === 1);
}

console.log("\n[3] DXF klasik R12 — POLYLINE/VERTEX/SEQEND");
{
  const dxfR12 = [
    "0", "SECTION", "2", "ENTITIES",
    "0", "POLYLINE", "8", "KABEL", "66", "1", "70", "0",
    "0", "VERTEX", "8", "KABEL", "10", "110.40", "20", "-7.00",
    "0", "VERTEX", "8", "KABEL", "10", "110.41", "20", "-7.01",
    "0", "VERTEX", "8", "KABEL", "10", "110.42", "20", "-7.00",
    "0", "SEQEND", "8", "KABEL",
    "0", "POINT", "8", "0", "10", "110.5", "20", "-6.9",
    "0", "ENDSEC", "0", "EOF",
  ].join("\r\n");
  const h = parseDxf(dxfR12);
  const polys = h.entitas.filter((e) => e.jenis === "poly");
  cek("POLYLINE klasik 3 verteks", polys.length === 1 && polys[0].jenis === "poly" && polys[0].pts.length === 3, `dapat ${polys.length}`);
  cek("POINT ikut terbaca", h.entitas.some((e) => e.jenis === "titik"));
  cek("total 2 entitas", h.entitas.length === 2, `dapat ${h.entitas.length}`);
}

console.log("\n[4] DXF biner + MTEXT");
{
  const h = parseDxf("AutoCAD Binary DXF\r\n\x1a\x00" + "sampah");
  cek("biner terdeteksi", h.biner && h.entitas.length === 0);
  const dxfMtext = [
    "0", "SECTION", "2", "ENTITIES",
    "0", "MTEXT", "8", "LABEL", "10", "110.4", "20", "-7.0", "40", "0.002", "3", "Tiang tumpu ", "1", "FO-12m",
    "0", "ENDSEC", "0", "EOF",
  ].join("\r\n");
  const h2 = parseDxf(dxfMtext);
  const t = h2.entitas.find((e) => e.jenis === "teks");
  cek("MTEXT 3+1 digabung", !!t && t.jenis === "teks" && t.teks === "Tiang tumpu FO-12m", t ? JSON.stringify(t.teks) : "tidak ada");
}

// ==================== EKSPOR → IMPOR (round-trip) ====================
console.log("\n[5] Round-trip: data aplikasi → DXF → parser");
{
  const points: GisPoint[] = [
    { id: "t1", lat: -6.993, lng: 110.428, title: "ODP-01", description: "", elevation: 12, attrs: {}, source: "manual", visible: true },
    { id: "t2", lat: -6.994, lng: 110.430, title: "TIANG-05", description: "", elevation: null, attrs: {}, source: "manual", visible: true },
  ];
  const shapes: GisShape[] = [
    {
      id: "s1", kind: "open", title: "Kabel FO Rute-A", description: "", color: "#10b981",
      vertices: [{ lat: -6.993, lng: 110.428 }, { lat: -6.994, lng: 110.430 }, { lat: -6.995, lng: 110.431 }],
      attrs: {}, source: "manual", visible: true,
    },
    {
      id: "s2", kind: "closed", title: "Area ODC", description: "", color: "#f59e0b",
      vertices: [{ lat: -6.9935, lng: 110.4285 }, { lat: -6.9935, lng: 110.4295 }, { lat: -6.9945, lng: 110.429 }],
      attrs: {}, source: "manual", visible: true,
    },
  ];
  const labels: GisLabel[] = [{ id: "l1", lat: -6.9932, lng: 110.4288, text: "Catatan: jarak 150 m" }];
  const teks = bangunDxf({ points, shapes, labels });
  cek("DXF berisi EOF", teks.trimEnd().endsWith("EOF"));
  const h = parseDxf(teks);
  cek("hasil ekspor terbaca & derajat", !h.biner && dxfSudahDerajat(h.entitas), `${h.entitas.length} entitas`);
  const fitur = dxfKeFitur(h.entitas, (x, y) => ({ lat: y, lng: x }));
  cek("2 titik kembali", fitur.points.length === 2, `dapat ${fitur.points.length}`);
  cek("2 bentuk kembali", fitur.shapes.length === 2, `dapat ${fitur.shapes.length}`);
  const polyKabel = fitur.shapes.find((s) => s.attrs.Layer === "Kabel_FO_Rute-A");
  cek("nama layer disanitasi & cocok", !!polyKabel && polyKabel.vertices.length === 3);
  // judul titik ikut diekspor sebagai TEXT (berguna di AutoCAD) → total teks = 2 judul + 1 label
  cek("label kembali (2 judul titik + 1 label)", fitur.labels.length === 3 && fitur.labels.some((l) => l.text === "Catatan: jarak 150 m"), `dapat ${fitur.labels.length}`);
  cek("koordinat bulat-balik ±1e-6", Math.abs(fitur.points[0].lat - -6.993) < 1e-6 && Math.abs(fitur.points[0].lng - 110.428) < 1e-6);
}

// ==================== GPX ====================
console.log("\n[6] GPX — ekspor & impor");
{
  const punyaDom = typeof DOMParser !== "undefined";
  if (!punyaDom) {
    console.log("  (DOMParser tidak tersedia di runtime ini — uji GPX dilewati, diuji di browser)");
  } else {
    const points: GisPoint[] = [
      { id: "t1", lat: -6.993, lng: 110.428, title: "ODP-01", description: "kabinet", elevation: 12, attrs: {}, source: "manual", visible: true },
    ];
    const shapes: GisShape[] = [
      {
        id: "s1", kind: "open", title: "Track Pendakian", description: "", color: "#10b981",
        vertices: [{ lat: -6.993, lng: 110.428 }, { lat: -6.994, lng: 110.430 }],
        attrs: {}, source: "manual", visible: true,
      },
      {
        id: "s2", kind: "closed", title: "Poligon Area", description: "", color: "#f59e0b",
        vertices: [{ lat: -7.0, lng: 110.4 }, { lat: -7.0, lng: 110.41 }, { lat: -7.01, lng: 110.405 }],
        attrs: {}, source: "manual", visible: true,
      },
    ];
    const gpx = bangunGpx({ points, shapes, labels: [{ id: "l1", lat: -6.99, lng: 110.43, text: "Teks Peta" }], namaDok: "Uji" });
    cek("GPX punya header + penutup", gpx.startsWith("<?xml") && gpx.includes("</gpx>"));
    const fitur = parseGpx(gpx);
    cek("1 waypoint kembali", fitur.points.length === 2, `dapat ${fitur.points.length}`); // 1 titik + 1 label→wpt
    cek("elev ikut", fitur.points[0].ele === 12);
    cek("2 track kembali", fitur.shapes.length === 2, `dapat ${fitur.shapes.length}`);
    cek("poligon → track 4 titik (loop)", fitur.shapes.some((s) => s.name === "Poligon Area" && s.vertices.length === 4));
    cek("koordinat bulat-balik", Math.abs(fitur.points[0].lat - -6.993) < 1e-9);
    // XML escape
    const gpxEsc = bangunGpx({ points: [{ ...points[0], title: 'ODP & "A"<B>' }], shapes: [], namaDok: "E" });
    const fiturEsc = parseGpx(gpxEsc);
    cek("escape XML bulat-balik", fiturEsc.points[0]?.name === 'ODP & "A"<B>');
    cek("GPX invalid → error", (() => { try { parseGpx("<bukan-gpx>"); return false; } catch { return true; } })());
  }
}

console.log(`\n========== HASIL: ${lulus} lulus, ${gagal} gagal ==========`);
process.exit(gagal > 0 ? 1 : 0);
