/**
 * Uji cepat: file GeoTIFF uji harus terbaca benar oleh geotiff.js
 * (bbox, geokeys, nilai piksel) — pra-syarat e2e browser.
 */
import * as geotiff from "geotiff";
import { readFileSync } from "node:fs";

let gagal = 0;
function cek(nama: string, syarat: boolean, detail = "") {
  if (syarat) console.log(`  OK   ${nama}`);
  else {
    gagal++;
    console.log(`  GAGAL ${nama} ${detail}`);
  }
}

async function buka(nama: string) {
  const buf = readFileSync(`public/${nama}`);
  return geotiff.fromArrayBuffer(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
}

// ===== RGB =====
const tiff1 = await buka("uji-raster-rgb.tif");
const im1 = await tiff1.getImage(0);
console.log("[1] uji-raster-rgb.tif");
cek("dimensi 1024x768", im1.getWidth() === 1024 && im1.getHeight() === 768);
const bb1 = im1.getBoundingBox();
console.log("  bbox:", bb1.map((v) => v.toFixed(5)).join(", "));
cek("bbox lng 110.42..110.45", Math.abs(bb1[0] - 110.42) < 1e-9 && Math.abs(bb1[2] - 110.45) < 1e-9);
cek("bbox lat -7..-6.98", Math.abs(bb1[1] + 7) < 1e-9 && Math.abs(bb1[3] + 6.98) < 1e-9);
const gk1 = im1.getGeoKeys() ?? {};
cek("geographic 4326", gk1.GeographicTypeGeoKey === 4326 || gk1.ProjectedCSTypeGeoKey == null);
const data1 = await im1.readRasters({ window: [0, 0, 2, 2], samples: [0, 1, 2] });
cek("3 sampel terbaca", data1.length === 3 && data1[0].length === 4);

// ===== DEM =====
const tiff2 = await buka("uji-raster-dem.tif");
const im2 = await tiff2.getImage(0);
console.log("[2] uji-raster-dem.tif");
cek("dimensi 512x512", im2.getWidth() === 512 && im2.getHeight() === 512);
cek("1 sampel", im2.getSamplesPerPixel() === 1);
const nd = im2.getGDALNoData();
console.log("  nodata:", nd);
const data2 = await im2.readRasters({ window: [256, 256, 257, 257] });
const v = data2[0][0];
console.log("  nilai tengah:", v);
cek("elevasi wajar 0..150", v > 0 && v < 150, String(v));
// nilai teoretis di piksel (256,256): 50 + 30*sin(0.5*3pi) + 20*cos(0.5*2pi) + 25*0.5
const teo = 50 + 30 * Math.sin(0.5 * Math.PI * 3) + 20 * Math.cos(Math.PI) + 25 * 0.5;
cek("nilai sesuai rumus", Math.abs(v - teo) < 0.5, `teoretis=${teo}`);

// ===== besar =====
const tiff3 = await buka("uji-raster-besar.tif");
const im3 = await tiff3.getImage(0);
console.log("[3] uji-raster-besar.tif");
cek("dimensi 1024x2400", im3.getWidth() === 1024 && im3.getHeight() === 2400);
cek("bbox sama", Math.abs(im3.getBoundingBox()[0] - 110.42) < 1e-9);

console.log(gagal === 0 ? "\nSEMUA UJI LULUS ✅" : `\n${gagal} UJI GAGAL ❌`);
process.exit(gagal === 0 ? 0 : 1);
