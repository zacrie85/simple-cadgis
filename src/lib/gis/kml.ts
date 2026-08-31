import { zipSync, strToU8 } from "fflate";
import type { ContourLayer, GisPoint, GisShape, LabelMode } from "./types";

function escXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
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

/**
 * Style KML untuk mengatur label nama di Google Earth sesuai mode label aplikasi:
 * - "semua"    : label tampil (tanpa style khusus)
 * - "terpilih": hanya fitur bertanda labelTampil yang labelnya tampil
 * - "sembunyi": semua label disembunyikan (LabelStyle scale 0)
 */
function styleLabel(mode: LabelMode, tanda?: boolean): string {
  const tampil = mode === "semua" || (mode === "terpilih" && !!tanda);
  return tampil ? "" : "    <Style><LabelStyle><scale>0</scale></LabelStyle></Style>\n";
}

function pointPlacemark(p: GisPoint, labelMode: LabelMode): string {
  const desc = [
    p.description,
    p.elevation != null ? `Ketinggian: ${p.elevation} m` : "",
    p.photo ? `<img src="${p.photo}" alt="foto" style="max-width:300px"/>` : "",
  ]
    .filter(Boolean)
    .join("<br/>");
  return `  <Placemark>
    <name>${escXml(p.title || "Titik")}</name>
${styleLabel(labelMode, p.labelTampil)}    <description><![CDATA[${desc}]]></description>
${extendedData(p.attrs, {
  Keterangan: p.description,
  Ketinggian: p.elevation != null ? String(p.elevation) : "",
  Latitude: p.lat.toFixed(6),
  Longitude: p.lng.toFixed(6),
})}    <Point><coordinates>${p.lng},${p.lat},0</coordinates></Point>
  </Placemark>\n`;
}

function shapePlacemark(s: GisShape, labelMode: LabelMode): string {
  const coordStr = s.vertices.map((v) => `${v.lng},${v.lat},0`).join(" ");
  const geom =
    s.kind === "open"
      ? `    <LineString><tessellate>1</tessellate><coordinates>${coordStr}</coordinates></LineString>\n`
      : `    <Polygon><outerBoundaryIs><LinearRing><coordinates>${coordStr} ${s.vertices[0].lng},${s.vertices[0].lat},0</coordinates></LinearRing></outerBoundaryIs></Polygon>\n`;
  return `  <Placemark>
    <name>${escXml(s.title)}</name>
${styleLabel(labelMode, s.labelTampil)}    <description><![CDATA[${s.description ?? ""}]]></description>
${extendedData(s.attrs, { Keterangan: s.description ?? "", Jenis: s.kind === "closed" ? "Poligon" : "Garis" })}${geom}  </Placemark>\n`;
}

function contourPlacemark(path: { elev: number; coords: { lat: number; lng: number }[] }): string {
  const coordStr = path.coords.map((c) => `${c.lng},${c.lat},0`).join(" ");
  return `  <Placemark>
    <name>Kontur ${path.elev} m</name>
${extendedData({}, { Elevasi: `${path.elev} m` })}    <LineString><tessellate>1</tessellate><coordinates>${coordStr}</coordinates></LineString>
  </Placemark>\n`;
}

/** Bangun dokumen KML dari seleksi fitur. */
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
  if (points.length) {
    body += "  <Folder><name>Titik</name>\n";
    body += points.map((p) => pointPlacemark(p, labelMode)).join("");
    body += "  </Folder>\n";
  }
  if (shapes.length) {
    body += "  <Folder><name>Poligon & Garis</name>\n";
    body += shapes.map((sh) => shapePlacemark(sh, labelMode)).join("");
    body += "  </Folder>\n";
  }
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
