/**
 * Generator GeoTIFF uji untuk e2e fitur Impor Raster SIMPLE CADGIS.
 * Output di public/ (agar bisa di-fetch saat uji browser):
 *  - uji-raster-rgb.tif   : RGB 1024×768, WGS84, menutupi area Demo (Semarang)
 *  - uji-raster-dem.tif   : float32 1 band 512×512, WGS84 (elevasi sintetis)
 *  - uji-raster-besar.tif : RGB 1024×2400 (multi-blok → uji progres bertahap)
 *  - uji-palsu.ecw        : file .ecw palsu (uji pesan penolakan sopan)
 */
import { writeArrayBuffer } from "geotiff";
import { mkdirSync, writeFileSync } from "node:fs";

const W = 110.42; // barat
const E = 110.45; // timur
const S = -7.0; // selatan
const N = -6.98; // utara

/** Metadata geo WGS84: writer membangun GeoKeyDirectory dari properti GeoKey. */
function metadataGeo(w: number, h: number) {
  return {
    width: w,
    height: h,
    ModelPixelScale: [(E - W) / w, (N - S) / h, 0],
    ModelTiepoint: [0, 0, 0, W, N, 0], // origin kiri-atas
    GeographicTypeGeoKey: 4326,
    GTModelTypeGeoKey: 2,
    SamplesPerPixel: 3,
    PhotometricInterpretation: 2,
    BitsPerSample: [8, 8, 8],
    SampleFormat: [1, 1, 1],
    PlanarConfiguration: 1,
    Compression: 1,
  };
}

/** Pola citra sintetis: gradasi + grid jalan + blok vegetasi (mudah dikenali visual). */
function buatRgb(w: number, h: number): Uint8Array {
  const data = new Uint8Array(w * h * 3);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 3;
      data[i] = Math.round(40 + (x / w) * 180); // merah: gradasi barat→timur
      data[i + 1] = Math.round(60 + (1 - y / h) * 150); // hijau: gradasi utara
      data[i + 2] = y % 64 < 3 || x % 64 < 3 ? 240 : 80; // biru: garis grid
    }
  }
  return data;
}

function buatDem(w: number, h: number): Float32Array {
  const data = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      data[y * w + x] =
        50 +
        30 * Math.sin((x / w) * Math.PI * 3) +
        20 * Math.cos((y / h) * Math.PI * 2) +
        (x / w) * 25; // miring ke timur
    }
  }
  return data;
}

function simpan(nama: string, buffer: ArrayBuffer) {
  writeFileSync(nama, new Uint8Array(buffer));
  console.log(`OK ${nama} (${(buffer.byteLength / 1024).toFixed(0)} KB)`);
}

mkdirSync("public", { recursive: true });

// 1) RGB standar
const rgbW = 1024;
const rgbH = 768;
simpan(
  "public/uji-raster-rgb.tif",
  writeArrayBuffer(buatRgb(rgbW, rgbH), metadataGeo(rgbW, rgbH)) as unknown as ArrayBuffer
);

// 2) DEM float32 1 band
const demW = 512;
const demH = 512;
const metaDem = {
  width: demW,
  height: demH,
  ModelPixelScale: [(E - W) / demW, (N - S) / demH, 0],
  ModelTiepoint: [0, 0, 0, W, N, 0],
  GeographicTypeGeoKey: 4326,
  GTModelTypeGeoKey: 2,
  SamplesPerPixel: 1,
  PhotometricInterpretation: 1,
  BitsPerSample: [32],
  SampleFormat: [3],
  PlanarConfiguration: 1,
  Compression: 1,
};
simpan("public/uji-raster-dem.tif", writeArrayBuffer(buatDem(demW, demH), metaDem) as unknown as ArrayBuffer);

// 3) RGB besar (multi-blok baris → uji progres)
const bsW = 1024;
const bsH = 2400;
simpan(
  "public/uji-raster-besar.tif",
  writeArrayBuffer(buatRgb(bsW, bsH), metadataGeo(bsW, bsH)) as unknown as ArrayBuffer
);

// 4) ECW palsu
writeFileSync("public/uji-palsu.ecw", new Uint8Array([0x45, 0x43, 0x57, 0x00, 1, 2, 3, 4]));
console.log("OK public/uji-palsu.ecw");
