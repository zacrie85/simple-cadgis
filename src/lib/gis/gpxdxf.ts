/**
 * Dukungan GPX & DXF — impor & ekspor (Task 31).
 *
 * GPX  : standar terbuka GPS Exchange (XML) — wpt (waypoint), trk (track), rte (route).
 *        Koordinat SELALU WGS84 derajat → tidak perlu pertanyaan CRS.
 * DXF  : Drawing Exchange Format teks (ASCII) milik AutoCAD — kami baca entitas
 *        POINT, LINE, LWPOLYLINE, POLYLINE/VERTEX, CIRCLE, ARC, TEXT/MTEXT.
 *        Satuan koordinat DXF adalah satuan gambar (umumnya METER UTM) —
 *        bukan derajat — sehingga impor memakai pilihan CRS (zona UTM / derajat).
 * DWG  : biner proprietary AutoCAD — TIDAK mungkin dibaca langsung di browser
 *        (sama seperti ECW). Diberikan panduan konversi ke DXF.
 */

import proj4 from "proj4";
import type { GisLabel, GisPoint, GisShape, LatLng } from "./types";

// ============================= TIPE BERSAMA =============================

export type FiturGpxDxf = {
  points: {
    lat: number;
    lng: number;
    name: string;
    desc: string;
    ele: number | null;
    attrs: Record<string, string>;
  }[];
  shapes: {
    kind: "closed" | "open";
    vertices: LatLng[];
    name: string;
    desc: string;
    attrs: Record<string, string>;
  }[];
  labels: { lat: number; lng: number; text: string }[];
};

// ============================= ESCAPE XML =============================

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;")
    // buang kontrol chars yang dilarang XML 1.0
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "");
}

// ============================= GPX: IMPOR =============================

/** Baca teks GPX → fitur mentah (waypoint, track/route → garis terbuka). */
export function parseGpx(teks: string): FiturGpxDxf {
  const doc = new DOMParser().parseFromString(teks, "application/xml");
  if (doc.getElementsByTagName("parsererror").length > 0) {
    throw new Error("File GPX bukan XML yang valid.");
  }
  const hasil: FiturGpxDxf = { points: [], shapes: [], labels: [] };

  const teksAnak = (el: Element, tag: string): string =>
    el.getElementsByTagName(tag)[0]?.textContent?.trim() ?? "";

  // --- waypoint ---
  for (const wpt of Array.from(doc.getElementsByTagName("wpt"))) {
    const lat = parseFloat(wpt.getAttribute("lat") ?? "");
    const lng = parseFloat(wpt.getAttribute("lon") ?? "");
    if (!isFinite(lat) || !isFinite(lng)) continue;
    const name = teksAnak(wpt, "name");
    const desc = teksAnak(wpt, "desc") || teksAnak(wpt, "cmt");
    const eleRaw = parseFloat(teksAnak(wpt, "ele"));
    const sym = teksAnak(wpt, "sym");
    hasil.points.push({
      lat,
      lng,
      name: name || "Waypoint",
      desc,
      ele: isFinite(eleRaw) ? eleRaw : null,
      attrs: sym ? { sym } : {},
    });
  }

  // --- track (bisa multi-segmen; tiap segmen jadi satu garis) ---
  for (const trk of Array.from(doc.getElementsByTagName("trk"))) {
    const nama = teksAnak(trk, "name") || "Track";
    const desc = teksAnak(trk, "desc");
    const segmen = Array.from(trk.getElementsByTagName("trkseg"));
    segmen.forEach((seg, si) => {
      const verts: LatLng[] = [];
      let elePertama: number | null = null;
      for (const p of Array.from(seg.getElementsByTagName("trkpt"))) {
        const lat = parseFloat(p.getAttribute("lat") ?? "");
        const lng = parseFloat(p.getAttribute("lon") ?? "");
        if (!isFinite(lat) || !isFinite(lng)) continue;
        verts.push({ lat, lng });
        if (elePertama === null) {
          const e = parseFloat(teksAnak(p, "ele"));
          if (isFinite(e)) elePertama = e;
        }
      }
      if (verts.length >= 2) {
        hasil.shapes.push({
          kind: "open",
          vertices: verts,
          name: segmen.length > 1 ? `${nama} (${si + 1})` : nama,
          desc,
          attrs: {},
        });
      }
    });
  }

  // --- route ---
  for (const rte of Array.from(doc.getElementsByTagName("rte"))) {
    const nama = teksAnak(rte, "name") || "Route";
    const verts: LatLng[] = [];
    for (const p of Array.from(rte.getElementsByTagName("rtept"))) {
      const lat = parseFloat(p.getAttribute("lat") ?? "");
      const lng = parseFloat(p.getAttribute("lon") ?? "");
      if (isFinite(lat) && isFinite(lng)) verts.push({ lat, lng });
    }
    if (verts.length >= 2) hasil.shapes.push({ kind: "open", vertices: verts, name: nama, desc: "", attrs: {} });
  }

  return hasil;
}

// ============================= GPX: EKSPOR =============================

/** Bangun dokumen GPX 1.1 dari titik (wpt), bentuk (trk), dan label (wpt tanpa koordinat ganda). */
export function bangunGpx(opts: {
  points: GisPoint[];
  shapes: GisShape[];
  labels?: GisLabel[];
  namaDok: string;
}): string {
  const { points, shapes, labels = [], namaDok } = opts;
  const out: string[] = [];
  out.push('<?xml version="1.0" encoding="UTF-8"?>');
  out.push(
    '<gpx version="1.1" creator="SIMPLE CADGIS" xmlns="http://www.topografix.com/GPX/1/1">'
  );
  out.push(`<metadata><name>${escapeXml(namaDok)}</name><time>${new Date().toISOString()}</time></metadata>`);

  for (const p of points) {
    out.push(`  <wpt lat="${p.lat}" lon="${p.lng}">`);
    if (p.elevation != null) out.push(`    <ele>${p.elevation}</ele>`);
    out.push(`    <name>${escapeXml(p.title || "Titik")}</name>`);
    if (p.description) out.push(`    <desc>${escapeXml(p.description)}</desc>`);
    if (p.ikon && p.ikon !== "polos") out.push(`    <sym>${escapeXml(p.ikon)}</sym>`);
    out.push("  </wpt>");
  }

  for (const lb of labels) {
    out.push(`  <wpt lat="${lb.lat}" lon="${lb.lng}">`);
    out.push(`    <name>${escapeXml(lb.text)}</name>`);
    out.push("  </wpt>");
  }

  for (const sh of shapes) {
    // bentuk tertutup: ulangi titik pertama di akhir agar loop tampak di aplikasi GPS
    const verts = sh.kind === "closed" && sh.vertices.length >= 3 ? [...sh.vertices, sh.vertices[0]] : sh.vertices;
    out.push("  <trk>");
    out.push(`    <name>${escapeXml(sh.title || (sh.kind === "closed" ? "Poligon" : "Garis"))}</name>`);
    if (sh.description) out.push(`    <desc>${escapeXml(sh.description)}</desc>`);
    out.push("    <trkseg>");
    for (const v of verts) out.push(`      <trkpt lat="${v.lat}" lon="${v.lng}"></trkpt>`);
    out.push("    </trkseg>");
    out.push("  </trk>");
  }

  out.push("</gpx>");
  return out.join("\n");
}

// ============================= DXF: IMPOR =============================

export type DxfEntitas =
  | { jenis: "titik"; x: number; y: number; z: number | null; layer: string }
  | { jenis: "garis"; a: [number, number]; b: [number, number]; layer: string }
  | { jenis: "poly"; pts: [number, number][]; tertutup: boolean; layer: string }
  | { jenis: "lingkaran"; cx: number; cy: number; r: number; layer: string }
  | { jenis: "busur"; cx: number; cy: number; r: number; a0: number; a1: number; layer: string }
  | { jenis: "teks"; x: number; y: number; teks: string; tinggi: number; layer: string };

export type DxfHasil = { entitas: DxfEntitas[]; biner: boolean };

/** Parser DXF ASCII minimal — pasangan kode-nilai, ambil section ENTITIES. */
export function parseDxf(teks: string): DxfHasil {
  // DXF biner dimulai sentinel "AutoCAD Binary DXF\r\n\u001a\u0000"
  const biner = /^AutoCAD Binary DXF/.test(teks);
  if (biner) return { entitas: [], biner: true };

  const baris = teks.split(/\r\n|\r|\n/);
  type Pasang = { k: number; v: string };
  const pasang: Pasang[] = [];
  for (let i = 0; i + 1 < baris.length; i += 2) {
    const k = parseInt(baris[i].trim(), 10);
    if (!isFinite(k)) {
      // sinkron ulang: geser satu baris bila urutan kode-nilai lompat (file rusak/CRLF aneh)
      i -= 1;
      continue;
    }
    pasang.push({ k, v: baris[i + 1] ?? "" });
  }

  const entitas: DxfEntitas[] = [];
  let dalamEntities = false;
  let cur: Pasang[] = [];

  const selesaiEntitas = () => {
    if (!dalamEntities || cur.length === 0) {
      cur = [];
      return;
    }
    const get = (kode: number, def = NaN): number => {
      const f = cur.find((p) => p.k === kode);
      return f ? parseFloat(f.v) : def;
    };
    const getSemua = (kode: number): number[] =>
      cur.filter((p) => p.k === kode).map((p) => parseFloat(p.v));
    const getTeks = (kode: number): string =>
      cur.find((p) => p.k === kode)?.v?.trim() ?? "";
    const layer = getTeks(8) || "0";

    // gabung teks MTEXT: kode 3 (lanjutan) + 1 (isi/penutup)
    const teksGabung = () => {
      const bag3 = cur.filter((p) => p.k === 3).map((p) => p.v);
      const baris1 = getTeks(1);
      return (bag3.join("") + baris1).replace(/\\P/g, " ").replace(/\{[^}]*\}/g, "").trim();
    };

    const jenis = cur[0].v.toUpperCase();
    if (jenis === "POINT") {
      const x = get(10);
      const y = get(20);
      const z = get(30);
      if (isFinite(x) && isFinite(y)) entitas.push({ jenis: "titik", x, y, z: isFinite(z) ? z : null, layer });
    } else if (jenis === "LINE") {
      const a = get(10);
      const b = get(20);
      const c = get(11);
      const d = get(21);
      if (isFinite(a) && isFinite(b) && isFinite(c) && isFinite(d)) entitas.push({ jenis: "garis", a: [a, b], b: [c, d], layer });
    } else if (jenis === "LWPOLYLINE") {
      const xs = getSemua(10);
      const ys = getSemua(20);
      const flag = get(70, 0);
      if (xs.length >= 2 && xs.length === ys.length) {
        entitas.push({ jenis: "poly", pts: xs.map((x, i) => [x, ys[i]] as [number, number]), tertutup: (flag & 1) === 1, layer });
      }
    } else if (jenis === "POLYLINE" || jenis === "VERTEX" || jenis === "SEQEND") {
      // POLYLINE klasik (R12) ditangani gabungPolylineKlasik() — lewati di sini
    } else if (jenis === "CIRCLE") {
      const cx = get(10);
      const cy = get(20);
      const r = get(40);
      if (isFinite(cx) && isFinite(cy) && isFinite(r) && r > 0) entitas.push({ jenis: "lingkaran", cx, cy, r, layer });
    } else if (jenis === "ARC") {
      const cx = get(10);
      const cy = get(20);
      const r = get(40);
      const a0 = get(50, 0);
      const a1 = get(51, 360);
      if (isFinite(cx) && isFinite(cy) && isFinite(r) && r > 0) entitas.push({ jenis: "busur", cx, cy, r, a0, a1, layer });
    } else if (jenis === "TEXT" || jenis === "MTEXT") {
      const x = get(10);
      const y = get(20);
      const tinggi = get(40, 1);
      const teks = teksGabung();
      if (isFinite(x) && isFinite(y) && teks) entitas.push({ jenis: "teks", x, y, teks, tinggi: isFinite(tinggi) ? tinggi : 1, layer });
    }
    cur = [];
  };

  for (const p of pasang) {
    if (p.k === 0) {
      selesaiEntitas();
      const v = p.v.trim().toUpperCase();
      if (v === "SECTION") {
        dalamEntities = false; // tunggu kode 2
      } else if (v === "ENDSEC" || v === "EOF") {
        selesaiEntitas();
        dalamEntities = false;
        continue;
      } else {
        // mulai entitas baru
        cur.push(p);
        continue;
      }
      cur = [];
      continue;
    }
    if (p.k === 2 && cur.length === 0 && !dalamEntities) {
      // nama section setelah 0/SECTION
      if (p.v.trim().toUpperCase() === "ENTITIES") dalamEntities = true;
      continue;
    }
    if (dalamEntities) cur.push(p);
  }
  selesaiEntitas();

  // POLYLINE klasik (R12): POLYLINE … VERTEX … SEQEND — parser utama melewatinya,
  // jadi kumpulkan terpisah lalu GABUNGKAN dengan hasil utama.
  const klasik = gabungPolylineKlasik(pasang);
  return { entitas: [...entitas, ...klasik], biner: false };
}

/** Penanganan khusus POLYLINE klasik (R12): POLYLINE … VERTEX … VERTEX … SEQEND. */
function gabungPolylineKlasik(pasang: { k: number; v: string }[]): DxfEntitas[] {
  const entitas: DxfEntitas[] = [];
  let i = 0;
  const n = pasang.length;
  while (i < n) {
    const p = pasang[i];
    if (p.k === 0 && p.v.trim().toUpperCase() === "POLYLINE") {
      // kumpulkan atribut POLYLINE lalu VERTEX sampai SEQEND
      let flag = 0;
      let layer = "0";
      let j = i + 1;
      while (j < n && !(pasang[j].k === 0)) {
        if (pasang[j].k === 70) flag = parseInt(pasang[j].v, 10) || 0;
        if (pasang[j].k === 8) layer = pasang[j].v.trim() || "0";
        j++;
      }
      const pts: [number, number][] = [];
      while (j < n && !(pasang[j].k === 0 && pasang[j].v.trim().toUpperCase() === "SEQEND")) {
        if (pasang[j].k === 0 && pasang[j].v.trim().toUpperCase() === "VERTEX") {
          let x = NaN;
          let y = NaN;
          let k2 = j + 1;
          while (k2 < n && !(pasang[k2].k === 0)) {
            if (pasang[k2].k === 10) x = parseFloat(pasang[k2].v);
            if (pasang[k2].k === 20) y = parseFloat(pasang[k2].v);
            k2++;
          }
          if (isFinite(x) && isFinite(y)) pts.push([x, y]);
          j = k2 - 1;
        }
        j++;
      }
      if (pts.length >= 2) entitas.push({ jenis: "poly", pts, tertutup: (flag & 1) === 1, layer });
      i = j;
      continue;
    }
    // lewati entitas lain (sudah ditangani parser utama)
    let j = i + 1;
    while (j < n && !(pasang[j].k === 0)) j++;
    i = j;
  }
  return entitas;
}

// ============================= KONVERSI CRS =============================

/** Cek apakah seluruh koordinat entitas sudah dalam rentang derajat (WGS84). */
export function dxfSudahDerajat(entitas: DxfEntitas[]): boolean {
  let ada = false;
  let ok = true; // satu saja di luar rentang → false
  const uji = (x: number, y: number) => {
    ada = true;
    if (Math.abs(y) > 90.5 || Math.abs(x) > 180.5) ok = false;
  };
  for (const e of entitas) {
    switch (e.jenis) {
      case "titik":
        uji(e.x, e.y);
        break;
      case "garis":
        uji(e.a[0], e.a[1]);
        uji(e.b[0], e.b[1]);
        break;
      case "poly":
        for (const [x, y] of e.pts) uji(x, y);
        break;
      case "lingkaran":
      case "busur":
        uji(e.cx, e.cy);
        break;
      case "teks":
        uji(e.x, e.y);
        break;
    }
  }
  return ada && ok;
}

/** Proyeksi UTM zona tertentu → lat/lng (WGS84). */
export function buatKonversiUtm(zona: number, hemi: "N" | "S"): (x: number, y: number) => LatLng {
  const def = `+proj=utm +zone=${zona} ${hemi === "S" ? "+south " : ""}+datum=WGS84 +units=m +no_defs`;
  const conv = proj4(def, "EPSG:4326");
  return (x: number, y: number): LatLng => {
    const [lng, lat] = conv.forward([x, y]);
    return { lat, lng };
  };
}

/** Ubah entitas DXF (koordinat gambar) → lat/lng memakai konverter CRS. */
export function dxfKeFitur(entitas: DxfEntitas[], conv: (x: number, y: number) => LatLng): FiturGpxDxf {
  const hasil: FiturGpxDxf = { points: [], shapes: [], labels: [] };
  let iTitik = 0;
  let iPoly = 0;
  const N_LINGKARAN = 64;
  const N_BUSUR = 48;

  for (const e of entitas) {
    switch (e.jenis) {
      case "titik": {
        const { lat, lng } = conv(e.x, e.y);
        iTitik++;
        hasil.points.push({ lat, lng, name: `Titik DXF ${iTitik}`, desc: "", ele: e.z, attrs: { Layer: e.layer } });
        break;
      }
      case "garis": {
        const a = conv(e.a[0], e.a[1]);
        const b = conv(e.b[0], e.b[1]);
        iPoly++;
        hasil.shapes.push({
          kind: "open",
          vertices: [a, b],
          name: `Garis DXF ${iPoly}`,
          desc: "",
          attrs: { Layer: e.layer },
        });
        break;
      }
      case "poly": {
        if (e.pts.length < 2) break;
        const verts = e.pts.map(([x, y]) => conv(x, y));
        iPoly++;
        hasil.shapes.push({
          kind: e.tertutup && verts.length >= 3 ? "closed" : "open",
          vertices: verts,
          name: `${e.tertutup ? "Poligon" : "Polyline"} DXF ${iPoly}`,
          desc: "",
          attrs: { Layer: e.layer },
        });
        break;
      }
      case "lingkaran": {
        const verts: LatLng[] = Array.from({ length: N_LINGKARAN }, (_, i) => {
          const a = (i / N_LINGKARAN) * 2 * Math.PI;
          return conv(e.cx + e.r * Math.cos(a), e.cy + e.r * Math.sin(a));
        });
        iPoly++;
        hasil.shapes.push({ kind: "closed", vertices: verts, name: `Lingkaran DXF ${iPoly}`, desc: "", attrs: { Layer: e.layer } });
        break;
      }
      case "busur": {
        // DXF ARC: sudut derajat, CCW dari a0 ke a1 (a1 < a0 berarti lewat 360)
        let sap = e.a1 - e.a0;
        while (sap <= 0) sap += 360;
        const verts: LatLng[] = Array.from({ length: N_BUSUR + 1 }, (_, i) => {
          const a = ((e.a0 + (sap * i) / N_BUSUR) * Math.PI) / 180;
          return conv(e.cx + e.r * Math.cos(a), e.cy + e.r * Math.sin(a));
        });
        iPoly++;
        hasil.shapes.push({ kind: "open", vertices: verts, name: `Busur DXF ${iPoly}`, desc: "", attrs: { Layer: e.layer } });
        break;
      }
      case "teks": {
        const { lat, lng } = conv(e.x, e.y);
        hasil.labels.push({ lat, lng, text: e.teks });
        break;
      }
    }
  }
  return hasil;
}

// ============================= DXF: EKSPOR =============================

/**
 * Bangun DXF R12 ASCII dari data — koordinat derajat WGS84 (x=bujur, y=lintang),
 * sehingga file ter-georeferensi dan bisa diimpor balik ke aplikasi ini.
 */
export function bangunDxf(opts: {
  points: GisPoint[];
  shapes: GisShape[];
  labels?: GisLabel[];
  /** Proyeksi keluaran (Task 32): bila ada, koordinat ditulis dalam CRS ini (bukan derajat). */
  proyeksi?: (ll: LatLng) => { x: number; y: number };
}): string {
  const { points, shapes, labels = [] } = opts;
  const proy = opts.proyeksi;
  const kk = (ll: LatLng): { x: number; y: number; z: (z: number) => number } => {
    if (!proy) return { x: ll.lng, y: ll.lat, z: (z) => z };
    const k = proy(ll);
    return { x: k.x, y: k.y, z: () => 0 };
  };
  const out: string[] = [];
  const push = (...baris: (string | number)[]) => {
    for (const b of baris) out.push(String(b));
  };

  // nama layer DXF: sanitasi (huruf/angka/garis), unik
  const layerValid = new Set<string>();
  const bersihLayer = (nama: string): string => {
    const bersih = (nama || "CADGIS")
      .replace(/[^\w\-]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 31) || "CADGIS";
    let unik = bersih;
    let i = 2;
    while (layerValid.has(unik.toUpperCase())) unik = `${bersih}${i++}`;
    layerValid.add(unik.toUpperCase());
    return unik;
  };

  push(0, "SECTION", 2, "HEADER");
  push(9, "$ACADVER", 1, "AC1009");
  push(9, "$INSBASE", 10, 0.0, 20, 0.0, 30, 0.0);
  push(9, "$EXTMIN", 10, -180.0, 20, -90.0, 30, 0.0);
  push(9, "$EXTMAX", 10, 180.0, 20, 90.0, 30, 0.0);
  push(0, "ENDSEC");

  push(0, "SECTION", 2, "TABLES");
  push(0, "TABLE", 2, "LAYER", 70, 1);
  push(0, "LAYER", 2, "CADGIS", 70, 0, 62, 7, 6, "CONTINUOUS");
  push(0, "ENDTAB");
  push(0, "ENDSEC");

  push(0, "SECTION", 2, "ENTITIES");

  for (const p of points) {
    const k = kk(p);
    push(0, "POINT", 8, "CADGIS");
    push(10, k.x.toFixed(5), 20, k.y.toFixed(5), 30, k.z(p.elevation ?? 0).toFixed(3));
    if (p.title) {
      push(0, "TEXT", 8, "CADGIS");
      push(10, (k.x + (proy ? 1 : 1e-6)).toFixed(5), 20, k.y.toFixed(5), 30, 0.0);
      push(40, proy ? 2 : 0.0008, 1, p.title.slice(0, 250));
    }
  }

  for (const sh of shapes) {
    const layer = bersihLayer(sh.title);
    const verts = sh.kind === "closed" && sh.vertices.length >= 3 ? sh.vertices : sh.vertices;
    push(0, "POLYLINE", 8, layer, 66, 1, 70, sh.kind === "closed" ? 1 : 0);
    for (const v of verts) {
      const k = kk(v);
      push(0, "VERTEX", 8, layer);
      push(10, k.x.toFixed(5), 20, k.y.toFixed(5), 30, 0.0);
    }
    push(0, "SEQEND", 8, layer);
  }

  for (const lb of labels) {
    const k = kk(lb);
    push(0, "TEXT", 8, "CADGIS");
    push(10, k.x.toFixed(5), 20, k.y.toFixed(5), 30, 0.0);
    push(40, proy ? 2 : 0.0008, 1, lb.text.slice(0, 250));
  }

  push(0, "ENDSEC");
  push(0, "EOF");
  return out.join("\r\n");
}
