import { zipSync, strToU8 } from "fflate";
import { DAFTAR_IKON, cariIkon } from "./ikon-titik";
import { tebakBentuk } from "./geo";
import type { ContourLayer, GisPoint, GisShape, JBentuk, LabelMode } from "./types";

function escXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Amankan isi CDATA: urutan "]]>" di tengah teks akan memutus blok CDATA. */
function cdataAman(s: string): string {
  return s.replace(/\]\]>/g, "]]]]><![CDATA[>");
}

/** #rrggbb → warna KML aabbggrr (urutan KML: alpha, biru, hijau, merah). alpha 0..1. */
function hexKeKml(hex: string, alpha = 1): string {
  const m = /#?([0-9a-fA-F]{6})/.exec(hex.trim());
  if (!m) return "";
  const rr = m[1].slice(0, 2);
  const gg = m[1].slice(2, 4);
  const bb = m[1].slice(4, 6);
  const aa = Math.round(Math.min(Math.max(alpha, 0), 1) * 255)
    .toString(16)
    .padStart(2, "0");
  return `${aa}${bb}${gg}${rr}`.toLowerCase();
}

/** Warna utama ikon titik diambil dari fill pertama SVG ikonnya (satu sumber warna). */
const warnaIkonSvg = (svg: string): string => /fill="(#[0-9a-fA-F]{6})"/.exec(svg)?.[1] ?? "#ef4444";

/**
 * Tabel HTML semua atribut untuk balloon Google Earth.
 * GE tidak merender <ExtendedData> di balloon secara otomatis, jadi data tabel
 * ditulis juga sebagai tabel di <description> (ExtendedData tetap ditulis untuk
 * software GIS seperti QGIS).
 */
function tabelBalloon(attrs: Record<string, string> | undefined): string {
  const entri = Object.entries(attrs || {}).filter(([, v]) => v !== undefined && v !== "");
  if (entri.length === 0) return "";
  const baris = entri
    .map(([k, v]) => `<tr><td><b>${escXml(k)}</b></td><td>${escXml(String(v))}</td></tr>`)
    .join("");
  return `<table border="1" cellpadding="4" cellspacing="0">${baris}</table>`;
}

function extendedData(attrs: Record<string, string>, extra: Record<string, string> = {}): string {
  const all = { ...attrs, ...extra };
  const entries = Object.entries(all).filter(([, v]) => v !== undefined && v !== "");
  if (entries.length === 0) return "";
  const items = entries
    .map(([k, v]) => `      <Data name="${escXml(k)}"><value>${escXml(String(v))}</value></Data>`)
    .join("\n");
  return `    <ExtendedData>\n${items}\n    </ExtendedData>\n`;
}

/** Label disembunyikan? mode "terpilih" → hanya fitur bertanda labelTampil. */
const labelSembunyi = (mode: LabelMode, tanda?: boolean): boolean =>
  mode === "sembunyi" || (mode === "terpilih" && !tanda);

/**
 * Style titik: warna & bentuk ikon mengikuti ikon yang dipilih di aplikasi —
 * berikon → paddle putih di-tint warna ikonnya; polos → lingkaran biru.
 * Dipakai bersama LabelStyle agar perilaku mode label tetap sama.
 */
function styleTitik(p: GisPoint, labelMode: LabelMode): string {
  const ik = cariIkon(p.ikon);
  const ikon = ik
    ? `<IconStyle><color>${hexKeKml(warnaIkonSvg(ik.svg))}</color><scale>1.15</scale>` +
      `<Icon><href>http://maps.google.com/mapfiles/kml/paddle/wht-blank.png</href></Icon></IconStyle>`
    : `<IconStyle><color>${hexKeKml("#3b82f6")}</color>` +
      `<Icon><href>http://maps.google.com/mapfiles/kml/shapes/placemark_circle.png</href></Icon></IconStyle>`;
  const label = labelSembunyi(labelMode, p.labelTampil) ? "<LabelStyle><scale>0</scale></LabelStyle>" : "";
  return `    <Style>${label}${ikon}</Style>\n`;
}

function pointPlacemark(p: GisPoint, labelMode: LabelMode): string {
  const ik = cariIkon(p.ikon);
  const desc = [
    p.description ? escXml(p.description).replace(/\n/g, "<br/>") : "",
    tabelBalloon(p.attrs),
    p.elevation != null ? `Ketinggian: ${p.elevation} m` : "",
    p.photo ? `<img src="${p.photo}" alt="foto" style="max-width:300px"/>` : "",
  ]
    .filter(Boolean)
    .join("<br/>");
  return `  <Placemark>
    <name>${escXml(p.title || "Titik")}</name>
${styleTitik(p, labelMode)}    <description><![CDATA[${cdataAman(desc)}]]></description>
${extendedData(p.attrs, {
  Keterangan: p.description,
  Ikon: ik?.nama ?? "",
  Ketinggian: p.elevation != null ? String(p.elevation) : "",
  Latitude: p.lat.toFixed(6),
  Longitude: p.lng.toFixed(6),
})}    <Point><coordinates>${p.lng},${p.lat},0</coordinates></Point>
  </Placemark>\n`;
}

/** Jenis bentuk utk pengelompokan & label Jenis: field `bentuk`, data lama ditebak. */
const jenisBentuk = (s: GisShape): JBentuk => s.bentuk ?? tebakBentuk(s);

const NAMA_JENIS: Record<JBentuk, string> = {
  poligon: "Poligon",
  kotak: "Kotak",
  bulatan: "Bulatan",
  elips: "Elips",
  garis: "Garis",
};

function shapePlacemark(s: GisShape, labelMode: LabelMode): string {
  const coordStr = s.vertices.map((v) => `${v.lng},${v.lat},0`).join(" ");
  const geom =
    s.kind === "open"
      ? `    <LineString><tessellate>1</tessellate><coordinates>${coordStr}</coordinates></LineString>\n`
      : `    <Polygon><outerBoundaryIs><LinearRing><coordinates>${coordStr} ${s.vertices[0].lng},${s.vertices[0].lat},0</coordinates></LinearRing></outerBoundaryIs></Polygon>\n`;
  const desc = [
    s.description ? escXml(s.description).replace(/\n/g, "<br/>") : "",
    tabelBalloon(s.attrs),
  ]
    .filter(Boolean)
    .join("<br/>");
  const jb = jenisBentuk(s);
  const namaJenis = jb === "garis" && s.panah ? "Panah" : NAMA_JENIS[jb];
  return `  <Placemark>
    <name>${escXml(s.title)}</name>
${styleBentuk(s, labelMode)}    <description><![CDATA[${cdataAman(desc)}]]></description>
${extendedData(s.attrs, { Keterangan: s.description ?? "", Jenis: namaJenis })}${geom}  </Placemark>\n`;
}

/** Style bentuk: warna garis & isi mengikuti warna di aplikasi (isi poligon = isiOpasitas). */
function styleBentuk(s: GisShape, labelMode: LabelMode): string {
  const label = labelSembunyi(labelMode, s.labelTampil) ? "<LabelStyle><scale>0</scale></LabelStyle>" : "";
  const kml = hexKeKml(s.color);
  const garis = kml ? `<LineStyle><color>${kml}</color><width>3</width></LineStyle>` : "";
  const isi = s.kind === "closed" && kml ? `<PolyStyle><color>${hexKeKml(s.color, s.isiOpasitas ?? 0.15)}</color></PolyStyle>` : "";
  if (!label && !garis && !isi) return "";
  return `    <Style>${label}${garis}${isi}</Style>\n`;
}

function contourPlacemark(path: { elev: number; coords: { lat: number; lng: number }[] }): string {
  const coordStr = path.coords.map((c) => `${c.lng},${c.lat},0`).join(" ");
  return `  <Placemark>
    <name>Kontur ${path.elev} m</name>
${extendedData({}, { Elevasi: `${path.elev} m` })}    <LineString><tessellate>1</tessellate><coordinates>${coordStr}</coordinates></LineString>
  </Placemark>\n`;
}

/**
 * Bangun dokumen KML dari seleksi fitur — tersusun FOLDER per jenis agar rapi
 * saat dibuka di Google Earth:
 *   Titik Koordinat → sub-folder per ikon (Pin Merah, ODP, Titik Awal Tarikan, …)
 *   Poligon / Kotak / Elips / Bulatan → folder masing-masing
 *   Garis & Panah → satu folder gabungan
 *   Kontur → folder tersendiri.
 * Folder kosong tidak ditulis.
 */
export function bangunKML(opts: {
  points?: GisPoint[];
  shapes?: GisShape[];
  contours?: ContourLayer[];
  namaDokumen?: string;
  labelMode?: LabelMode;
}): string {
  const points = opts.points ?? [];
  const shapes = opts.shapes ?? [];
  const contours = opts.contours ?? [];
  const labelMode = opts.labelMode ?? "semua";
  let body = "";

  // ---------- Titik Koordinat: sub-folder per ikon ----------
  if (points.length) {
    body += "  <Folder>\n    <name>Titik Koordinat</name>\n";
    const kelompok = new Map<string, GisPoint[]>();
    for (const p of points) {
      const k = cariIkon(p.ikon) ? p.ikon! : p.ikon ? "?" : "";
      const arr = kelompok.get(k) ?? [];
      arr.push(p);
      kelompok.set(k, arr);
    }
    for (const ik of DAFTAR_IKON) {
      const kel = kelompok.get(ik.id);
      if (!kel) continue;
      body += `    <Folder><name>${escXml(ik.nama)}</name>\n`;
      body += kel.map((p) => pointPlacemark(p, labelMode)).join("");
      body += "    </Folder>\n";
    }
    const asing = kelompok.get("?");
    if (asing) {
      body += `    <Folder><name>${escXml("Ikon Lainnya")}</name>\n`;
      body += asing.map((p) => pointPlacemark(p, labelMode)).join("");
      body += "    </Folder>\n";
    }
    const polos = kelompok.get("");
    if (polos) {
      body += `    <Folder><name>${escXml("Tanpa Ikon")}</name>\n`;
      body += polos.map((p) => pointPlacemark(p, labelMode)).join("");
      body += "    </Folder>\n";
    }
    body += "  </Folder>\n";
  }

  // ---------- Bentuk: folder per jenis ----------
  const kelBentuk: Record<JBentuk, GisShape[]> = { poligon: [], kotak: [], bulatan: [], elips: [], garis: [] };
  for (const sh of shapes) kelBentuk[jenisBentuk(sh)].push(sh);
  for (const j of ["poligon", "kotak", "elips", "bulatan", "garis"] as JBentuk[]) {
    if (!kelBentuk[j].length) continue;
    body += `  <Folder><name>${escXml(j === "garis" ? "Garis & Panah" : NAMA_JENIS[j])}</name>\n`;
    body += kelBentuk[j].map((sh) => shapePlacemark(sh, labelMode)).join("");
    body += "  </Folder>\n";
  }

  // ---------- Kontur ----------
  if (contours.length) {
    body += "  <Folder><name>Kontur</name>\n";
    for (const layer of contours) {
      if (!layer.visible) continue;
      body += layer.paths.map(contourPlacemark).join("");
    }
    body += "  </Folder>\n";
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
<Document>
  <name>${escXml(opts.namaDokumen ?? "SIMPLE CADGIS Ekspor")}</name>
${body}</Document>
</kml>`;
}

/** Bungkus KML menjadi KMZ (zip). */
export function kmlKeKmz(kml: string, nama: string): Uint8Array {
  return zipSync({ "doc.kml": strToU8(kml) }, { level: 6 });
}

/** Unduh KML mentah (.kml). */
export function kmlString(kml: string): string {
  return kml;
}
