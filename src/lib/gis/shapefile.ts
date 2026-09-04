/**
 * Penulis Shapefile minimalis (ESRI Shapefile) murni TypeScript:
 * menghasilkan .shp + .shx + .dbf + .prj dikompres zip.
 * Mendukung ShapeType: 1 (Point), 3 (PolyLine), 5 (Polygon). WGS84.
 */
import { zipSync, strFromU8 } from "fflate";
import type { GisPoint, GisShape, LatLng } from "./types";

const PRJ_WGS84 =
  'GEOGCS["GCS_WGS_1984",DATUM["D_WGS_1984",SPHEROID["WGS_1984",6378137.0,298.257223563]],PRIMEM["Greenwich",0.0],UNIT["Degree",0.0174532925199433]]';

function le32(u8: Uint8Array, off: number, v: number) {
  u8[off] = v & 0xff;
  u8[off + 1] = (v >> 8) & 0xff;
  u8[off + 2] = (v >> 16) & 0xff;
  u8[off + 3] = (v >> 24) & 0xff;
}
function be32(u8: Uint8Array, off: number, v: number) {
  u8[off] = (v >>> 24) & 0xff;
  u8[off + 1] = (v >> 16) & 0xff;
  u8[off + 2] = (v >> 8) & 0xff;
  u8[off + 3] = v & 0xff;
}
function le64(u8: Uint8Array, off: number, v: number) {
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  dv.setFloat64(off, v, true);
}
function box(points: LatLng[]): [number, number, number, number] {
  let minX = 180, minY = 90, maxX = -180, maxY = -90;
  for (const p of points) {
    if (p.lng < minX) minX = p.lng;
    if (p.lng > maxX) maxX = p.lng;
    if (p.lat < minY) minY = p.lat;
    if (p.lat > maxY) maxY = p.lat;
  }
  return [minX, minY, maxX, maxY];
}

interface ShapeRekam {
  tipe: 1 | 3 | 5;
  points: LatLng[]; // titik tunggal / urutan garis / cincin poligon (dipastikan tertutup)
}

function rekamDariPoint(p: GisPoint): ShapeRekam {
  return { tipe: 1, points: [{ lat: p.lat, lng: p.lng }] };
}
function rekamDariShape(s: GisShape): ShapeRekam {
  const pts = [...s.vertices];
  if (s.kind === "closed") {
    const first = pts[0];
    const last = pts[pts.length - 1];
    if (first.lat !== last.lat || first.lng !== last.lng) pts.push({ ...first });
  }
  return { tipe: s.kind === "closed" ? 5 : 3, points: pts };
}

function tulisShp(rekam: ShapeRekam[]): Uint8Array {
  const ukuranIsi = rekam.map((r) =>
    r.tipe === 1 ? 20 : 48 + 16 * r.points.length
  );
  const totalByte =
    100 + rekam.reduce((acc, _, i) => acc + 8 + ukuranIsi[i], 0);
  const u8 = new Uint8Array(totalByte);
  const dv = new DataView(u8.buffer);

  // Header 100 byte
  be32(u8, 0, 9994);
  // 4..23 kosong
  be32(u8, 24, totalByte / 2); // panjang file dalam kata 16-bit
  le32(u8, 28, 1000); // versi
  le32(u8, 32, rekam.length ? rekam[0].tipe : 0);
  if (rekam.length) {
    const semua: LatLng[] = [];
    // loop bertingkat (bukan spread) — aman untuk rekam dengan puluhan ribu verteks
    for (const r of rekam) for (const p of r.points) semua.push(p);
    const [minX, minY, maxX, maxY] = box(semua);
    le64(u8, 36, minX); le64(u8, 44, minY);
    le64(u8, 52, maxX); le64(u8, 60, maxY);
  } else {
    le64(u8, 36, 0); le64(u8, 44, 0); le64(u8, 52, 0); le64(u8, 60, 0);
  }
  le64(u8, 68, 0); le64(u8, 76, 0); le64(u8, 84, 0); le64(u8, 92, 0);

  let off = 100;
  let recNum = 1;
  for (let i = 0; i < rekam.length; i++) {
    const r = rekam[i];
    be32(u8, off, recNum);
    be32(u8, off + 4, ukuranIsi[i] / 2);
    let c = off + 8;
    le32(u8, c, r.tipe);
    c += 4;
    if (r.tipe === 1) {
      le64(u8, c, r.points[0].lng); c += 8;
      le64(u8, c, r.points[0].lat); c += 8;
    } else {
      const [minX, minY, maxX, maxY] = box(r.points);
      le64(u8, c, minX); c += 8;
      le64(u8, c, minY); c += 8;
      le64(u8, c, maxX); c += 8;
      le64(u8, c, maxY); c += 8;
      le32(u8, c, 1); c += 4; // numParts
      le32(u8, c, r.points.length); c += 4; // numPoints
      le32(u8, c, 0); c += 4; // parts[0]
      for (const p of r.points) {
        le64(u8, c, p.lng); c += 8;
        le64(u8, c, p.lat); c += 8;
      }
    }
    off = c;
    recNum++;
  }
  return u8;
}

function tulisShx(rekam: ShapeRekam[]): Uint8Array {
  const total = 100 + 8 * rekam.length;
  const u8 = new Uint8Array(total);
  be32(u8, 0, 9994);
  be32(u8, 24, total / 2);
  le32(u8, 28, 1000);
  let off = 100;
  let posisi = 50; // dalam kata 16-bit (header 100 byte = 50 kata)
  rekam.forEach((r, i) => {
    const panjangIsi = (r.tipe === 1 ? 20 : 48 + 16 * r.points.length) / 2;
    be32(u8, off, posisi);
    be32(u8, off + 4, panjangIsi);
    off += 8;
    posisi += panjangIsi + 4;
  });
  return u8;
}

// ---------- DBF ----------

interface FieldDbf {
  key: string;
  name: string;
  type: "C" | "N";
  len: number;
  dec: number;
}

function bersihkanNamaField(nama: string, dipakai: Set<string>): string {
  let n = nama
    .normalize("NFKD")
    .replace(/[^\w]/g, "_")
    .slice(0, 10)
    .toUpperCase() || "FIELD";
  let basis = n;
  let i = 1;
  while (dipakai.has(n)) {
    n = `${basis.slice(0, 8)}_${i++}`;
  }
  dipakai.add(n);
  return n;
}

function tulisDbf(
  rekamBaris: Record<string, string | number>[]
): Uint8Array {
  const tanggal = new Date();
  const kunciField: string[] = [];
  for (const baris of rekamBaris) {
    for (const k of Object.keys(baris)) {
      if (!kunciField.includes(k)) kunciField.push(k);
    }
  }
  const dipakai = new Set<string>();
  const fields: FieldDbf[] = kunciField.slice(0, 100).map((k) => {
    const semuaVal = rekamBaris.map((r) => r[k]);
    const semuaAngka =
      semuaVal.length > 0 && semuaVal.every((v) => typeof v === "number" || /^-?\d+(\.\d+)?$/.test(String(v).trim()));
    if (semuaAngka) {
      return { key: k, name: bersihkanNamaField(k, dipakai), type: "N", len: 19, dec: 6 };
    }
    const maks = Math.max(
      1,
      ...semuaVal.map((v) => new TextEncoder().encode(String(v ?? "")).length)
    );
    return { key: k, name: bersihkanNamaField(k, dipakai), type: "C", len: Math.min(253, Math.max(1, maks)), dec: 0 };
  });

  const recordLen = 1 + fields.reduce((a, f) => a + f.len, 0);
  const headerLen = 32 + 32 * fields.length + 1;
  const total = headerLen + recordLen * rekamBaris.length + 1;
  const u8 = new Uint8Array(total);
  const enc = new TextEncoder();

  u8[0] = 0x03; // dBase III tanpa memo
  u8[1] = tanggal.getFullYear() - 1900;
  u8[2] = tanggal.getMonth() + 1;
  u8[3] = tanggal.getDate();
  le32(u8, 4, rekamBaris.length);
  // headerLen (uint16 @8) dan recordLen (uint16 @10) — WAJIB agar DBF terbaca GIS
  u8[8] = headerLen & 0xff;
  u8[9] = (headerLen >> 8) & 0xff;
  u8[10] = recordLen & 0xff;
  u8[11] = (recordLen >> 8) & 0xff;
  u8[headerLen - 1] = 0x0d; // terminator header

  let off = 32;
  for (const f of fields) {
    const nama = enc.encode(f.name);
    u8.set(nama.slice(0, 10), off);
    u8[off + 11] = f.type.charCodeAt(0);
    u8[off + 16] = f.len;
    u8[off + 17] = f.dec;
    off += 32;
  }

  let recOff = headerLen;
  for (const baris of rekamBaris) {
    u8[recOff] = 0x20; // belum terhapus
    let fOff = recOff + 1;
    for (const f of fields) {
      const mentah = baris[f.key];
      if (f.type === "N") {
        const num = Number(String(mentah ?? "").replace(",", ".")) || 0;
        const teks = num.toFixed(f.dec).padStart(f.len, " ");
        u8.set(enc.encode(teks).slice(0, f.len), fOff);
      } else {
        const teks = mentah === undefined || mentah === null ? "" : String(mentah);
        const bytes = enc.encode(teks);
        u8.set(bytes.slice(0, f.len), fOff);
        for (let i = bytes.length; i < f.len; i++) u8[fOff + i] = 0x20;
      }
      fOff += f.len;
    }
    recOff += recordLen;
  }
  u8[total - 1] = 0x1a; // EOF
  return u8;
}

/** Ubah daftar fitur menjadi zip shapefile dan picu unduhan. */
export function shapefileZip(opts: {
  nama: string;
  points?: { p: GisPoint; attrs: Record<string, string | number> }[];
  shapes?: { s: GisShape; attrs: Record<string, string | number> }[];
  /** Proyeksi keluaran (Task 32): bila ada, geometri ditulis dalam CRS ini (atribut lat/lng tetap WGS84). */
  proyeksi?: (ll: LatLng) => { x: number; y: number };
  /** WKT .prj yang sesuai proyeksi (wktPrj dari lib/gis/crs). Kosong = WGS84. */
  prjWkt?: string | null;
}): Uint8Array {
  const { nama } = opts;
  const proy = opts.proyeksi;
  const proyPoint = (p: GisPoint): GisPoint => {
    if (!proy) return p;
    const k = proy({ lat: p.lat, lng: p.lng });
    return { ...p, lat: k.y, lng: k.x };
  };
  const proyShape = (s: GisShape): GisShape => {
    if (!proy) return s;
    return { ...s, vertices: s.vertices.map((v) => { const k = proy(v); return { lat: k.y, lng: k.x }; }) };
  };
  const rekam: ShapeRekam[] = [];
  const baris: Record<string, string | number>[] = [];
  const tipeFile =
    opts.points && opts.points.length ? 1 : opts.shapes?.[0]?.s.kind === "closed" ? 5 : 3;

  if (opts.points) {
    for (const { p, attrs } of opts.points) {
      rekam.push(rekamDariPoint(proyPoint(p)));
      baris.push({
        Judul: p.title,
        Keterangan: p.description,
        Latitude: p.lat,
        Longitude: p.lng,
        Ketinggian: p.elevation ?? "",
        ...attrs,
      });
    }
  }
  if (opts.shapes) {
    for (const { s, attrs } of opts.shapes) {
      rekam.push(rekamDariShape(proyShape(s)));
      baris.push({
        Judul: s.title,
        Keterangan: s.description,
        Jenis: s.kind === "closed" ? "Poligon" : "Garis",
        JumlahTitik: s.vertices.length,
        ...attrs,
      });
    }
  }

  const shp = tulisShp(rekam);
  const shx = tulisShx(rekam);
  const dbf = tulisDbf(baris);
  const prj = new TextEncoder().encode(opts.prjWkt ?? PRJ_WGS84);
  void tipeFile;
  return zipSync(
    {
      [`${nama}.shp`]: shp,
      [`${nama}.shx`]: shx,
      [`${nama}.dbf`]: dbf,
      [`${nama}.prj`]: prj,
    },
    { level: 6 }
  );
}

/** Helper tes cepat (tidak dipakai di UI). */
export function bacaZipInfo(z: Uint8Array): string[] {
  return Object.keys(JSON.parse(strFromU8(z, true) || "{}") as object);
}
