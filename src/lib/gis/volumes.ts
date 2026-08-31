/**
 * Perhitungan volume tanah: Cut & Fill dan Overburden (meter kubik)
 * dengan basis grid interpolasi IDW di dalam poligon.
 */
import type { LatLng } from "./types";
import { bbox, titikDalamPoligon, luasPoligon } from "./geo";
import { ambilGridCache } from "./contours";
import type { TitikElevasi } from "./contours";

export interface HasilVolume {
  luasM2: number;
  cutM3: number;
  fillM3: number;
  netM3: number;
  overburdenM3: number;
  elevasiMin: number;
  elevasiMax: number;
  elevasiRata: number;
  jumlahSel: number;
}

/**
 * Bangun grid IDW lokal untuk area poligon dari titik elevasi.
 * (Fungsi ini duplikat ringan agar tidak bergantung cache global.)
 */
function gridLokal(pts: TitikElevasi[], area: LatLng[], res = 90) {
  const bb = bbox([...area, ...pts.map((p) => ({ lat: p.lat, lng: p.lng }))]);
  const rentangLat = Math.max(bb.maxLat - bb.minLat, 1e-7);
  const rentangLng = Math.max(bb.maxLng - bb.minLng, 1e-7);
  const w = res;
  const h = Math.max(30, Math.min(res, Math.round((res * rentangLat) / rentangLng)));
  const values = new Float64Array(w * h);
  const selLat = rentangLat / h;
  const selLng = rentangLng / w;

  // Sampling titik agar cepat
  const maks = 2000;
  const langkah = Math.ceil(pts.length / maks);
  const sampel = langkah > 1 ? pts.filter((_, i) => i % langkah === 0) : pts;

  for (let y = 0; y < h; y++) {
    const lat = bb.maxLat - (y + 0.5) * selLat;
    for (let x = 0; x < w; x++) {
      const lng = bb.minLng + (x + 0.5) * selLng;
      let num = 0;
      let den = 0;
      for (const p of sampel) {
        const d2 =
          Math.pow((lng - p.lng) * 111320 * Math.cos((lat * Math.PI) / 180), 2) +
          Math.pow((lat - p.lat) * 110540, 2);
        if (d2 < 0.01) {
          num = p.elev;
          den = 1;
          break;
        }
        const w2 = 1 / d2; // pangkat 1 pada jarak meter-kuadrat ≈ pangkat 2 jarak
        num += w2 * p.elev;
        den += w2;
      }
      values[y * w + x] = den > 0 ? num / den : 0;
    }
  }
  return { bb, w, h, values, selLat, selLng };
}

/**
 * Hitung cut & fill antara topografi (dari titik elevasi) dan elevasi rencana.
 * - cutM3  = tanah digali (topografi > rencana)
 * - fillM3 = tanah ditimbun (rencana > topografi)
 * - overburdenM3 = volume material di atas elevasi seam/lapisan (jika diisi)
 */
export function hitungVolume(
  poligon: LatLng[],
  titikElev: TitikElevasi[],
  elevasiRencana: number,
  elevasiSeam?: number | null
): HasilVolume {
  if (poligon.length < 3) throw new Error("Poligon tidak valid");
  if (titikElev.length < 3) throw new Error("Minimal 3 titik berketinggian diperlukan");

  const { bb, w, h, values, selLat, selLng } = gridLokal(titikElev, poligon);

  // luas sel nyata (meter) di tengah poligon
  const latTengah = (bb.maxLat + bb.minLat) / 2;
  const lebarSelM = selLng * 111320 * Math.cos((latTengah * Math.PI) / 180);
  const tinggiSelM = selLat * 110540;
  const luasSel = lebarSelM * tinggiSelM;

  let cut = 0;
  let fill = 0;
  let overburden = 0;
  let jumlahSel = 0;
  let eMin = Infinity;
  let eMax = -Infinity;
  let eSum = 0;

  for (let y = 0; y < h; y++) {
    const lat = bb.maxLat - (y + 0.5) * selLat;
    for (let x = 0; x < w; x++) {
      const lng = bb.minLng + (x + 0.5) * selLng;
      if (!titikDalamPoligon({ lat, lng }, poligon)) continue;
      const e = values[y * w + x];
      jumlahSel++;
      if (e < eMin) eMin = e;
      if (e > eMax) eMax = e;
      eSum += e;
      const d = e - elevasiRencana;
      if (d > 0) cut += d * luasSel;
      else fill += -d * luasSel;
      if (elevasiSeam != null && e > elevasiSeam) {
        overburden += (e - elevasiSeam) * luasSel;
      }
    }
  }

  void ambilGridCache; // grid global tidak dipakai di sini

  return {
    luasM2: luasPoligon(poligon),
    cutM3: cut,
    fillM3: fill,
    netM3: cut - fill,
    overburdenM3: overburden,
    elevasiMin: jumlahSel ? eMin : 0,
    elevasiMax: jumlahSel ? eMax : 0,
    elevasiRata: jumlahSel ? eSum / jumlahSel : 0,
    jumlahSel,
  };
}
