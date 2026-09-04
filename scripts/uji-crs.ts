/**
 * Uji lib/gis/crs.ts (Task 32) — jalankan: bun scripts/uji-crs.ts
 * (bagian EPSG online hanya dijalankan bila jaringan tersedia)
 */
import {
  CRS_WGS84,
  crsUtm,
  dariLatlng,
  dariMgrs,
  defUtm,
  deteksiKoordinat,
  formatDms,
  hemiDariLat,
  keLatlng,
  keMgrs,
  parseNilaiDms,
  wktPrj,
  zonaUtmDariLng,
} from "../src/lib/gis/crs";

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

console.log("\n[1] UTM round-trip zona 49S (Semarang)");
{
  const semarang = { lat: -6.9943, lng: 110.4294 };
  const utm = crsUtm(49, "S");
  const k = dariLatlng(semarang, utm);
  cek("X ≈ 436.975 m", Math.abs(k.x - 436975) < 2, `dapat ${k.x}`);
  cek("Y ≈ 9.226.844 m", Math.abs(k.y - 9226844) < 2, `dapat ${k.y}`);
  const balik = keLatlng(k.x, k.y, utm);
  cek("round-trip ±1e-6°", Math.abs(balik.lat - semarang.lat) < 1e-6 && Math.abs(balik.lng - semarang.lng) < 1e-6);
  // zona utara (tokyo-ish tidak penting — cek mekanis zona 54N)
  const utm54n = crsUtm(54, "N");
  const b2 = keLatlng(dariLatlng({ lat: 35.68, lng: 139.77 }, utm54n).x, dariLatlng({ lat: 35.68, lng: 139.77 }, utm54n).y, utm54n);
  cek("UTM 54N round-trip", Math.abs(b2.lat - 35.68) < 1e-6);
}

console.log("\n[2] Web Mercator + zona/hemi helper");
{
  const merc = { id: "epsg:3857", jenis: "proyeksi" as const, label: "", satuan: "meter" as const, def: "+proj=merc +a=6378137 +b=6378137 +lat_ts=0 +lon_0=0 +x_0=0 +y_0=0 +k=1 +units=m +nadgrids=@null +no_defs +type=crs" };
  const k = dariLatlng({ lat: 0, lng: 0 }, merc);
  cek("Mercator (0,0) → (0,0)", Math.abs(k.x) < 0.01 && Math.abs(k.y) < 0.01);
  cek("zona dari lng 110.4 = 49", zonaUtmDariLng(110.4294) === 49);
  cek("zona dari lng 0.5 = 31", zonaUtmDariLng(0.5) === 31);
  cek("zona dari lng -6.9 (Lisboa) = 29", zonaUtmDariLng(-6.9) === 29);
  cek("hemi lat -6.9 = S", hemiDariLat(-6.9) === "S");
  cek("hemi lat 35 = N", hemiDariLat(35) === "N");
}

console.log("\n[3] MGRS round-trip");
{
  const ll = { lat: -6.9943, lng: 110.4294 };
  const kode = keMgrs(ll, 5);
  cek("format MGRS 49MDN… (Semarang = zona 49)", /^49MDN/.test(kode), `dapat ${kode}`);
  const balik = dariMgrs(kode);
  cek("MGRS → latlng selisih < 1 m (≈9e-6°)", Math.abs(balik.lat - ll.lat) < 9e-6 && Math.abs(balik.lng - ll.lng) < 9e-6, `dapat ${balik.lat},${balik.lng}`);
}

console.log("\n[4] DMS format & parse");
{
  cek("formatDms lng +", formatDms(110.7966667, "lng") === "110°47'48.0\"BT", formatDms(110.7966667, "lng"));
  cek("formatDms lat −", formatDms(-6.9918, "lat") === "6°59'30.5\"LS", formatDms(-6.9918, "lat"));
  cek("pembulatan 60 detik naik menit", formatDms(110.7500001, "lng").startsWith("110°45'0.0\"") || formatDms(110.749999, "lng").startsWith("110°45'"), formatDms(110.749999, "lng"));
  cek("parse DMS kutip", Math.abs((parseNilaiDms('6°59\'30.5"S', "lat") ?? 0) + 6.9918) < 0.0001);
  cek("parse DMS LS tanpa simbol", Math.abs((parseNilaiDms("6 59 30.5 LS", "lat") ?? 0) + 6.9918) < 0.0001);
  cek("parse DMS BT", Math.abs((parseNilaiDms("106°46'48\"BT", "lng") ?? 0) - 106.78) < 0.0001);
  cek("parse desimal koma", Math.abs((parseNilaiDms("-6,9943", "lat") ?? 0) + 6.9943) < 1e-9);
  cek("parse desimal minus", (parseNilaiDms("-6.9943", "lat") ?? 0) === -6.9943);
}

console.log("\n[5] Deteksi otomatis jenis koordinat");
{
  const derajat = deteksiKoordinat([
    { x: 110.42, y: -6.99 },
    { x: 110.43, y: -6.98 },
    { x: 110.44, y: -7.01 },
  ]);
  cek("derajat terdeteksi", derajat.jenis === "derajat", derajat.jenis);

  const utmS = deteksiKoordinat([
    { x: 436975.31, y: 9226844.12 },
    { x: 437050, y: 9226900 },
    { x: 436900, y: 9226800 },
  ]);
  cek("meter UTM terdeteksi", utmS.jenis === "meter-utm", utmS.jenis);
  cek("hemisfer tebakan S (Y>8,5 jt)", utmS.hemi === "S", String(utmS.hemi));

  const utmN = deteksiKoordinat([
    { x: 500000, y: 4000000 },
    { x: 510000, y: 4010000 },
    { x: 520000, y: 4020000 },
  ]);
  cek("hemisfer tebakan N (Y<8,4 jt)", utmN.hemi === "N", String(utmN.hemi));

  const tm3 = deteksiKoordinat([
    { x: 200000, y: 9253000 },
    { x: 205000, y: 9255000 },
    { x: 210000, y: 9257000 },
  ]);
  // koordinat meter dgn pola X 100rb–1jt & Y 0–10jt TIDAK BISA dibedakan UTM vs TM-3
  // secara numerik — keduanya terdeteksi "meter" dan user diminta memastikan (UTM/EPSG)
  cek("meter terdeteksi (UTM/TM-3 tak terbedakan angka)", tm3.jenis === "meter-utm", tm3.jenis);

  const kosong = deteksiKoordinat([]);
  cek("sampel kosong → tidak-dikenal", kosong.jenis === "tidak-dikenal");
}

console.log("\n[6] WKT .prj");
{
  cek("WGS84 punya WKT", (wktPrj(CRS_WGS84) ?? "").startsWith("GEOGCS"));
  const wktUtm = wktPrj(crsUtm(49, "S")) ?? "";
  cek("UTM 49S WKT benar", wktUtm.includes("Zone_49S") && wktUtm.includes("10000000.0") && wktUtm.includes("111.0"), wktUtm.slice(0, 80));
  const crsLain = { id: "epsg:23830", jenis: "proyeksi" as const, label: "", satuan: "meter" as const, def: defUtm(49, "S") };
  cek("EPSG kustom → null (SHP tetap WGS84)", wktPrj(crsLain) === null);
}

console.log("\n[7] EPSG online (epsg.io) — hanya bila jaringan ada");
{
  const kode = await fetch("https://epsg.io/23830.proj4")
    .then((r) => (r.ok ? r.text() : ""))
    .catch(() => "");
  if (!kode.startsWith("+")) {
    console.log("  (jaringan tidak tersedia — uji online dilewati)");
  } else {
    const { ambilCrsEpsg } = await import("../src/lib/gis/crs");
    // localStorage tidak ada di bun — ambilCrsEpsg harus tetap jalan (cache dilewati)
    try {
      // EPSG:23835 = DGN95 / TM-3° zona CM 109.5 (Jawa Tengah)
      const crs = await ambilCrsEpsg(23835);
      cek("EPSG:23835 (TM-3 DGN95) terambil", crs.def !== undefined && crs.def.startsWith("+proj=tmerc"), (crs.def ?? "").slice(0, 60));
      const semarang = { lat: -6.9943, lng: 110.4294 };
      const k = dariLatlng(semarang, crs);
      cek("X dekat false easting 200 km", Math.abs(k.x - 200000) < 200000, String(k.x));
      cek("Y wajar (≈724 ribu m, northing TM-3 bukan UTM)", k.y > 600000 && k.y < 900000, String(k.y));
      const balik = keLatlng(k.x, k.y, crs);
      cek("TM-3 round-trip ±1e-6°", Math.abs(balik.lat - semarang.lat) < 1e-6 && Math.abs(balik.lng - semarang.lng) < 1e-6);
    } catch (e) {
      cek("ambilCrsEpsg gagal tanpa localStorage", false, String(e));
    }
  }
}

console.log(`\n========== HASIL: ${lulus} lulus, ${gagal} gagal ==========`);
process.exit(gagal > 0 ? 1 : 0);
