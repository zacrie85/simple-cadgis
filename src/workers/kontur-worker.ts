/**
 * Web Worker kontur SIMPLE CADGIS.
 * Semua komputasi berat berjalan di sini agar UI tidak pernah beku:
 *   1. Sampling titik (cap 8000 — naik dari 2500 berkat IDW ber-bucket)
 *   2. Interpolasi IDW ke grid — tetangga 5x5 bucket spasial (bukan semua titik)
 *   3. Marching squares (d3-contour)
 *   4. Penyederhanaan Douglas-Peucker per garis (buang tangga grid, hasil halus & ringan)
 * Hasil: paths + levels + grid (dikirim balik utk cache 3D/volume).
 */

type Masuk = {
  type: "hitung";
  titik: { lat: number; lng: number; elev: number }[];
  interval: number | null;
};

import { contours as d3contour } from "d3-contour";

export type PesanKonturKeluar =
  | { type: "progres"; persen: number; tahap: string }
  | {
      type: "hasil";
      paths: { elev: number; coords: { lat: number; lng: number }[] }[];
      levels: number[];
      grid: {
        minLat: number;
        maxLat: number;
        minLng: number;
        maxLng: number;
        w: number;
        h: number;
        values: Float64Array;
      };
    }
  | { type: "error"; message: string };

const ctx = self as unknown as {
  postMessage: (m: PesanKonturKeluar, transfer?: Transferable[]) => void;
  addEventListener: (t: "message", cb: (e: MessageEvent<Masuk>) => void) => void;
};

const SAMPEL_MAKS = 8000;
const GRID_W = 220;
const GRID_H_MAKS = 220;
const BUCKET = 64; // resolusi bucket spasial utk pencarian tetangga

/** Sederhanakan poliline (iteratif Douglas-Peucker — aman dari stack overflow). */
function sederhanakan(
  pts: { x: number; y: number }[],
  toleransi: number
): { x: number; y: number }[] {
  const n = pts.length;
  if (n <= 2) return pts;
  const keep = new Uint8Array(n);
  keep[0] = 1;
  keep[n - 1] = 1;
  const stack: [number, number][] = [[0, n - 1]];
  const tol2 = toleransi * toleransi;
  while (stack.length) {
    const [awal, akhir] = stack.pop()!;
    let jarakMaks = -1;
    let idxMaks = -1;
    const ax = pts[awal].x;
    const ay = pts[awal].y;
    const bx = pts[akhir].x;
    const by = pts[akhir].y;
    const dx = bx - ax;
    const dy = by - ay;
    const panjang2 = dx * dx + dy * dy || 1e-12;
    for (let i = awal + 1; i < akhir; i++) {
      const px = pts[i].x;
      const py = pts[i].y;
      let t = ((px - ax) * dx + (py - ay) * dy) / panjang2;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const ex = px - (ax + t * dx);
      const ey = py - (ay + t * dy);
      const d2 = ex * ex + ey * ey;
      if (d2 > jarakMaks) {
        jarakMaks = d2;
        idxMaks = i;
      }
    }
    if (idxMaks > 0 && jarakMaks > tol2) {
      keep[idxMaks] = 1;
      stack.push([awal, idxMaks], [idxMaks, akhir]);
    }
  }
  const out: { x: number; y: number }[] = [];
  for (let i = 0; i < n; i++) if (keep[i]) out.push(pts[i]);
  return out;
}

function bulatkanManis(x: number): number {
  const pangkat = Math.pow(10, Math.floor(Math.log10(x)));
  const n = x / pangkat;
  const bulat = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10;
  return bulat * pangkat;
}

ctx.addEventListener("message", (e: MessageEvent<Masuk>) => {
  const { titik: titikElev, interval } = e.data;
  try {
    if (!titikElev || titikElev.length < 3) throw new Error("Minimal 3 titik berketinggian diperlukan");

    ctx.postMessage({ type: "progres", persen: 2, tahap: "Menyiapkan data…" });

    // 1) sampling merata (data besar tetap cepat, bentuk tetap terjaga)
    const langkahSampel = Math.ceil(titikElev.length / SAMPEL_MAKS);
    const pts = langkahSampel > 1 ? titikElev.filter((_, i) => i % langkahSampel === 0) : titikElev;

    let minLat = Infinity, maxLat = -Infinity, minLng = Infinity, maxLng = -Infinity;
    let elevMin = Infinity, elevMax = -Infinity;
    for (const p of pts) {
      if (p.lat < minLat) minLat = p.lat;
      if (p.lat > maxLat) maxLat = p.lat;
      if (p.lng < minLng) minLng = p.lng;
      if (p.lng > maxLng) maxLng = p.lng;
      if (p.elev < elevMin) elevMin = p.elev;
      if (p.elev > elevMax) elevMax = p.elev;
    }
    const rentangLat = Math.max(maxLat - minLat, 1e-6);
    const rentangLng = Math.max(maxLng - minLng, 1e-6);

    const w = GRID_W;
    const h = Math.max(40, Math.min(GRID_H_MAKS, Math.round((w * rentangLat) / rentangLng)));

    // 2) bucket spasial: tiap titik masuk sel 64x64 — pencarian tetangga jadi lokal
    const nb = BUCKET;
    const bucket: number[][] = Array.from({ length: nb * nb }, () => []);
    const gxDariTitik: number[] = new Array(pts.length);
    const gyDariTitik: number[] = new Array(pts.length);
    for (let i = 0; i < pts.length; i++) {
      const gx = ((pts[i].lng - minLng) / rentangLng) * (w - 1);
      const gy = (1 - (pts[i].lat - minLat) / rentangLat) * (h - 1);
      gxDariTitik[i] = gx;
      gyDariTitik[i] = gy;
      let bx = Math.floor((gx / (w - 1)) * (nb - 1));
      let by = Math.floor((1 - gy / (h - 1)) * (nb - 1));
      bx = bx < 0 ? 0 : bx > nb - 1 ? nb - 1 : bx;
      by = by < 0 ? 0 : by > nb - 1 ? nb - 1 : by;
      bucket[by * nb + bx].push(i);
    }

    const values = new Float64Array(w * h);
    const JARAK = 2; // cari tetangga dalam jendela 5x5 bucket
    for (let y = 0; y < h; y++) {
      const by = Math.min(nb - 1, Math.floor((y / (h - 1)) * (nb - 1)));
      for (let x = 0; x < w; x++) {
        const bx = Math.min(nb - 1, Math.floor((x / (w - 1)) * (nb - 1)));
        let num = 0;
        let den = 0;
        // kandidat dari bucket sekitar; perluas bila sepi (area titik jarang)
        for (let radius = JARAK; radius <= 8 && den === 0; radius += 3) {
          for (let dy = -radius; dy <= radius && den === 0; dy++) {
            const byy = by + dy;
            if (byy < 0 || byy >= nb) continue;
            for (let dx2 = -radius; dx2 <= radius && den === 0; dx2++) {
              const bxx = bx + dx2;
              if (bxx < 0 || bxx >= nb) continue;
              const b = bucket[byy * nb + bxx];
              for (let k = 0; k < b.length; k++) {
                const i = b[k];
                const ddx = x - gxDariTitik[i];
                const ddy = y - gyDariTitik[i];
                const d2 = ddx * ddx + ddy * ddy + 1e-9;
                if (d2 < 1e-6) {
                  num = pts[i].elev;
                  den = 1;
                  break;
                }
                const wt = 1 / d2; // setara pangkat 2
                num += wt * pts[i].elev;
                den += wt;
              }
            }
          }
        }
        values[y * w + x] = den > 0 ? num / den : elevMin;
      }
      if (y % 6 === 0) {
        ctx.postMessage({
          type: "progres",
          persen: 2 + Math.round((y / h) * 68),
          tahap: "Menginterpolasi grid…",
        });
      }
    }

    ctx.postMessage({ type: "progres", persen: 72, tahap: "Menyusun garis kontur…" });

    // 3) level kontur (logika sama dengan versi lama)
    let levels: number[];
    if (interval && interval > 0) {
      const awal = Math.ceil(elevMin / interval) * interval;
      levels = [];
      for (let v = awal; v <= elevMax; v += interval) levels.push(Math.round(v * 1000) / 1000);
    } else {
      const step = (elevMax - elevMin) / 10 || 1;
      const besar = bulatkanManis(step);
      levels = [];
      for (let v = Math.ceil(elevMin / besar) * besar; v <= elevMax; v += besar) {
        levels.push(Math.round(v * 1000) / 1000);
      }
    }
    if (levels.length === 0) levels = [Math.round(((elevMin + elevMax) / 2) * 1000) / 1000];

    // 4) marching squares + penyederhanaan (toleransi 0.65 sel grid)
    const generator = d3contour().size([w, h]).thresholds(levels);
    const polys = generator(Array.from(values));

    ctx.postMessage({ type: "progres", persen: 85, tahap: "Meringkas garis…" });

    const paths: { elev: number; coords: { lat: number; lng: number }[] }[] = [];
    for (const poly of polys) {
      const elev = Math.round(poly.value * 1000) / 1000;
      for (const polygon of poly.coordinates) {
        for (const ring of polygon) {
          if (ring.length < 2) continue;
          const ringGrid = ring.map(([gx, gy]) => ({ x: gx, y: gy }));
          const ringas = ringGrid.length > 8 ? sederhanakan(ringGrid, 0.65) : ringGrid;
          const koords: { lat: number; lng: number }[] = [];
          let prevX = NaN;
          let prevY = NaN;
          for (const g of ringas) {
            if (g.x === prevX && g.y === prevY) continue; // buang titik kembar
            prevX = g.x;
            prevY = g.y;
            koords.push({
              lng: minLng + (g.x / (w - 1)) * rentangLng,
              lat: minLat + (1 - g.y / (h - 1)) * rentangLat,
            });
          }
          if (koords.length > 1) paths.push({ elev, coords: koords });
        }
      }
    }

    ctx.postMessage({ type: "progres", persen: 100, tahap: "Selesai" });

    ctx.postMessage(
      {
        type: "hasil",
        paths,
        levels,
        grid: { minLat, maxLat, minLng, maxLng, w, h, values },
      },
      // buffer dikirim tanpa salin (zero-copy)
      [(values as unknown as { buffer: ArrayBuffer }).buffer]
    );
  } catch (err) {
    ctx.postMessage({
      type: "error",
      message: err instanceof Error ? err.message : String(err),
    });
  }
});

export {};
