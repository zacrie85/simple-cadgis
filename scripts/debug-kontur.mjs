/* Debug cepat logika kontur */
import { contours as d3contours } from "d3-contour";

const lat0 = -6.994292, lng0 = 110.4294;
const pts = [];
for (let i = 0; i < 5; i++)
  for (let j = 0; j < 5; j++) {
    const dx = i - 2, dy = j - 2;
    const elev = 320 + 60 * Math.exp(-(dx * dx + dy * dy) / 2.6) + (i % 2) * 3 + j * 1.5;
    pts.push({ lat: lat0 + i * 0.0018, lng: lng0 + j * 0.0019, elev });
  }

const bb = { minLat: Math.min(...pts.map(p=>p.lat)), maxLat: Math.max(...pts.map(p=>p.lat)), minLng: Math.min(...pts.map(p=>p.lng)), maxLng: Math.max(...pts.map(p=>p.lng)) };
const rentangLat = bb.maxLat - bb.minLat, rentangLng = bb.maxLng - bb.minLng;
const w = 170;
const h = Math.max(40, Math.min(170, Math.round((w * rentangLat) / rentangLng)));
const values = new Float64Array(w * h);
const px = pts.map(p => ((p.lng - bb.minLng) / rentangLng) * (w - 1));
const py = pts.map(p => (1 - (p.lat - bb.minLat) / rentangLat) * (h - 1));

function idw(gx, gy) {
  let num = 0, den = 0;
  for (let i = 0; i < pts.length; i++) {
    const dx = gx - px[i], dy = gy - py[i];
    const d2 = dx * dx + dy * dy + 1e-9;
    if (d2 < 1e-6) return pts[i].elev;
    const wt = 1 / Math.pow(d2, 1);
    num += wt * pts[i].elev;
    den += wt;
  }
  return den > 0 ? num / den : 0;
}
for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) values[y*w+x] = idw(x, y);

let mn = Infinity, mx = -Infinity;
for (const v of values) { if (v < mn) mn = v; if (v > mx) mx = v; }
console.log("grid min/max:", mn.toFixed(1), mx.toFixed(1));

const levels = [330, 340, 350, 360, 370, 380];
const polys = d3contours().size([w, h]).thresholds(levels)(Array.from(values));
console.log("jumlah MultiPolygon:", polys.length);
for (const p of polys) {
  console.log(" level", p.value, "polygon:", p.coordinates.length, "ring pertama pts:", p.coordinates[0]?.[0]?.length);
}
