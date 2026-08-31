/**
 * Web Worker parsing streaming GeoKita.
 * Membaca Excel (xlsx), CSV, KML, KMZ secara TERPECAH-PECAH (chunk)
 * agar UI tidak pernah hang, sekalipun file 250MB.
 * Hasil dikirim bertahap (batch) ke thread utama.
 */

type Masuk = { type: "parse"; file: File };

import { Unzip, UnzipInflate } from "fflate";
type ZipFileCb = Parameters<ConstructorParameters<typeof Unzip>[0]>[0];

export type PesanKeluar =
  | { type: "progress"; bytes: number; total: number; rows?: number; features?: number }
  | { type: "rows"; rows: string[][]; totalRows: number }
  | {
      type: "features";
      points: { lat: number; lng: number; name: string; description: string; attrs: Record<string, string> }[];
      shapes: { kind: "closed" | "open"; vertices: { lat: number; lng: number }[]; name: string; description: string; attrs: Record<string, string> }[];
      total: number;
    }
  | { type: "done"; ringkas: string }
  | { type: "error"; message: string };

const MAX_ROWS = 300000;
const MAX_FEATURES = 50000;
const BATCH_ROWS = 2000;
const BATCH_FEATURES = 500;

const ctx = self as unknown as {
  postMessage: (m: PesanKeluar) => void;
  addEventListener: (t: "message", cb: (e: MessageEvent<Masuk>) => void) => void;
};

function kirim(m: PesanKeluar) {
  ctx.postMessage(m);
}

function decodeXml(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_c, n: string) => String.fromCharCode(Number(n)))
    .replace(/&amp;/g, "&");
}

/** Baca File per-chunk tanpa memuat seluruh isi ke memori. */
async function alirankanFile(
  file: File,
  proses: (chunk: Uint8Array) => Promise<void>
) {
  const reader = file.stream().getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    await proses(value);
  }
}

// ==================== XLSX STREAMING ====================

function kolomKeIndex(huruf: string): number {
  let n = 0;
  for (const c of huruf) n = n * 26 + (c.charCodeAt(0) - 64);
  return n - 1;
}

function parseRowXml(rowXml: string, sst: string[]): string[] {
  const cells: string[] = [];
  const cellRe = /<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g;
  let m: RegExpExecArray | null;
  let col = 0;
  while ((m = cellRe.exec(rowXml))) {
    const attrs = m[1] || "";
    const inner = m[2] || "";
    const r = /\br="([A-Z]+)\d+"/.exec(attrs);
    if (r) col = kolomKeIndex(r[1]);
    let val = "";
    const t = /\bt="([^"]+)"/.exec(attrs)?.[1];
    if (t === "inlineStr") {
      val = inner.replace(/<t[^>]*>([\s\S]*?)<\/t>/g, "$1");
    } else {
      const v = /<v>([\s\S]*?)<\/v>/.exec(inner)?.[1] ?? "";
      if (t === "s") val = sst[Number(v)] ?? "";
      else val = v;
    }
    cells[col] = decodeXml(val);
    col++;
  }
  return cells;
}

async function parseXlsx(file: File) {
  const sst: string[] = [];
  let totalRows = 0;
  let bufferSheet = "";
  let bufferSst = "";
  let sisaSst: string[] = [];
  let batch: string[][] = [];
  let bytesRead = 0;

  const rowRe = /<row[^>]*\/>|<row[^>]*>[\s\S]*?<\/row>/g;
  const siRe = /<si>([\s\S]*?)<\/si>/g;

  const flushRows = () => {
    if (batch.length >= 2000) {
      totalRows += batch.length;
      kirim({ type: "rows", rows: batch, totalRows });
      batch = [];
    }
  };

  const decoderSheet = new TextDecoder("utf-8");
  const decoderSst = new TextDecoder("utf-8");

  let sheetDitangani = false;

  const uz = new Unzip((zf: ZipFileCb) => {
    const nama = zf.name;
    const isSheet = /^xl\/worksheets\/sheet\d+\.xml$/.test(nama) && !sheetDitangani;
    const isSst = nama === "xl/sharedStrings.xml";
    if (!isSheet && !isSst) {
      zf.ondata = () => {};
      zf.start();
      return;
    }
    if (isSheet) sheetDitangani = true;
    const decoder = isSheet ? decoderSheet : decoderSst;
    zf.ondata = (err, data, final) => {
      if (err) return;
      try {
        const teks = decoder.decode(data, { stream: !final });
        if (isSheet) {
          bufferSheet += teks;
          rowRe.lastIndex = 0;
          let m: RegExpExecArray | null;
          let last = 0;
          while ((m = rowRe.exec(bufferSheet))) {
            batch.push(parseRowXml(m[0], sst));
            last = rowRe.lastIndex;
            flushRows();
            if (totalRows + batch.length >= MAX_ROWS) {
              throw new Error(`Berhenti: melebihi batas ${MAX_ROWS.toLocaleString("id-ID")} baris (melindungi memori).`);
            }
          }
          if (last > 0) bufferSheet = bufferSheet.slice(last);
        } else {
          bufferSst += teks;
          siRe.lastIndex = 0;
          let m: RegExpExecArray | null;
          let last = 0;
          while ((m = siRe.exec(bufferSst))) {
            const teksSi = m[1].replace(/<t[^>]*>([\s\S]*?)<\/t>/g, "$1");
            sisaSst.push(decodeXml(teksSi));
            last = siRe.lastIndex;
          }
          if (sisaSst.length >= 1000) {
            sst.push(...sisaSst);
            sisaSst = [];
          }
          if (last > 0) bufferSst = bufferSst.slice(last);
        }
        bytesRead += data.byteLength;
        kirim({
          type: "progress",
          bytes: bytesRead,
          total: file.size,
          rows: totalRows + batch.length,
        });
      } catch {
        /* batas baris dilempar sebagai error utama di bawah */
      }
    };
    zf.start();
  });
  uz.register(UnzipInflate);

  await alirankanFile(file, async (chunk) => {
    uz.push(chunk, false);
  });
  uz.push(new Uint8Array(0), true);

  if (sisaSst.length) {
    sst.push(...sisaSst);
    sisaSst = [];
  }
  if (batch.length) {
    totalRows += batch.length;
    kirim({ type: "rows", rows: batch, totalRows });
    batch = [];
  }
  kirim({ type: "done", ringkas: `Excel selesai: ${totalRows.toLocaleString("id-ID")} baris dibaca.` });
}

// ==================== CSV STREAMING ====================

async function parseCsv(file: File) {
  const decoder = new TextDecoder("utf-8");
  let field = "";
  let row: string[] = [];
  let inQuotes = false;
  let totalRows = 0;
  let batch: string[][] = [];

  const akhiriField = () => {
    row.push(field);
    field = "";
  };
  const akhiriRow = () => {
    akhiriField();
    totalRows++;
    batch.push(row);
    row = [];
    if (batch.length >= BATCH_ROWS) {
      kirim({ type: "rows", rows: batch, totalRows });
      batch = [];
    }
    if (totalRows >= MAX_ROWS) {
      throw new Error(`Berhenti: melebihi batas ${MAX_ROWS.toLocaleString("id-ID")} baris (melindungi memori).`);
    }
  };

  await alirankanFile(file, async (chunk) => {
    const teks = decoder.decode(chunk, { stream: true });
    for (let i = 0; i < teks.length; i++) {
      const c = teks[i];
      if (inQuotes) {
        if (c === '"') {
          if (teks[i + 1] === '"') {
            field += '"';
            i++;
          } else inQuotes = false;
        } else field += c;
      } else if (c === '"') {
        inQuotes = true;
      } else if (c === ",") {
        akhiriField();
      } else if (c === "\n") {
        akhiriRow();
      } else if (c !== "\r") {
        field += c;
      }
    }
    kirim({
      type: "progress",
      bytes: chunk.byteLength,
      total: file.size,
      rows: totalRows,
    });
  });
  if (field.length || row.length) akhiriRow();
  if (batch.length) kirim({ type: "rows", rows: batch, totalRows });
  kirim({ type: "done", ringkas: `CSV selesai: ${totalRows.toLocaleString("id-ID")} baris.` });
}

// ==================== KML / KMZ STREAMING ====================

function buatPlacemarkFeeder(emit: (xml: string) => void) {
  let buf = "";
  let searchFrom = 0;
  return {
    push(c: string) {
      buf += c;
      for (;;) {
        const idx = buf.indexOf("<Placemark", searchFrom);
        if (idx === -1) {
          searchFrom = Math.max(0, buf.length - 12);
          break;
        }
        const end = buf.indexOf("</Placemark>", idx);
        if (end === -1) {
          searchFrom = idx;
          break;
        }
        emit(buf.slice(idx, end + 12));
        buf = buf.slice(end + 12);
        searchFrom = 0;
      }
      if (buf.length > 4_000_000 && searchFrom === 0) {
        buf = buf.slice(Math.max(0, buf.lastIndexOf(">", buf.length - 2000)) + 1);
      }
    },
  };
}

function parsePlacemark(xml: string): {
  titik?: { lat: number; lng: number; name: string; description: string; attrs: Record<string, string> };
  bentuk?: { kind: "closed" | "open"; vertices: { lat: number; lng: number }[]; name: string; description: string; attrs: Record<string, string> };
} {
  const ambil = (tag: string): string => {
    const re = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`);
    return decodeXml(re.exec(xml)?.[1]?.trim() ?? "").replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1");
  };

  const attrs: Record<string, string> = {};
  const dataRe = /<Data\s+name="([^"]+)"[^>]*>\s*<value>([\s\S]*?)<\/value>/g;
  let dm: RegExpExecArray | null;
  while ((dm = dataRe.exec(xml))) {
    attrs[decodeXml(dm[1])] = decodeXml(dm[2].trim());
  }
  const simpleRe = /<SimpleData\s+name="([^"]+)"[^>]*>([\s\S]*?)<\/SimpleData>/g;
  while ((dm = simpleRe.exec(xml))) {
    attrs[decodeXml(dm[1])] = decodeXml(dm[2].trim());
  }

  const name = ambil("name") || "Tanpa Nama";
  const description = ambil("description");

  const parseCoords = (teks: string): { lat: number; lng: number }[] => {
    const out: { lat: number; lng: number }[] = [];
    for (const pasangan of teks.trim().split(/\s+/)) {
      if (!pasangan) continue;
      const bagian = pasangan.split(",");
      const la = parseFloat(bagian[1]);
      const lo = parseFloat(bagian[0]);
      if (!isNaN(la) && !isNaN(lo)) out.push({ lat: la, lng: lo });
    }
    return out;
  };

  const pm = /<Point[\s\S]*?<coordinates>([\s\S]*?)<\/coordinates>/.exec(xml);
  if (pm) {
    const koor = parseCoords(pm[1]);
    if (koor.length) {
      return { titik: { lat: koor[0].lat, lng: koor[0].lng, name, description, attrs } };
    }
  }
  const pg = /<Polygon[\s\S]*?outerBoundaryIs[\s\S]*?<coordinates>([\s\S]*?)<\/coordinates>/.exec(xml);
  if (pg) {
    const verts = parseCoords(pg[1]);
    if (verts.length >= 3) {
      return { bentuk: { kind: "closed", vertices: verts, name, description, attrs } };
    }
  }
  const ln = /<LineString[\s\S]*?<coordinates>([\s\S]*?)<\/coordinates>/.exec(xml);
  if (ln) {
    const verts = parseCoords(ln[1]);
    if (verts.length >= 2) {
      return { bentuk: { kind: "open", vertices: verts, name, description, attrs } };
    }
  }
  return {};
}

async function parseKmlUmum(
  namaFile: string,
  file: File,
  ekstrakKml: (proses: (teks: string) => void, file: File) => Promise<void>
) {
  let totalFeatures = 0;
  let batchTitik: { lat: number; lng: number; name: string; description: string; attrs: Record<string, string> }[] = [];
  let batchBentuk: { kind: "closed" | "open"; vertices: { lat: number; lng: number }[]; name: string; description: string; attrs: Record<string, string> }[] = [];

  const feeder = buatPlacemarkFeeder((xml) => {
    const { titik, bentuk } = parsePlacemark(xml);
    if (titik) {
      batchTitik.push(titik);
      totalFeatures++;
    } else if (bentuk) {
      batchBentuk.push(bentuk);
      totalFeatures++;
    }
    if (batchTitik.length + batchBentuk.length >= BATCH_FEATURES) {
      kirim({ type: "features", points: batchTitik, shapes: batchBentuk, total: totalFeatures });
      batchTitik = [];
      batchBentuk = [];
    }
    if (totalFeatures >= MAX_FEATURES) {
      throw new Error(`Berhenti: melebihi batas ${MAX_FEATURES.toLocaleString("id-ID")} fitur (melindungi memori).`);
    }
  });

  await ekstrakKml((teks) => feeder.push(teks), file);

  if (batchTitik.length + batchBentuk.length) {
    kirim({ type: "features", points: batchTitik, shapes: batchBentuk, total: totalFeatures });
  }
  kirim({
    type: "done",
    ringkas: `${namaFile}: ${totalFeatures.toLocaleString("id-ID")} fitur terbaca.`,
  });
}

async function parseKml(file: File) {
  await parseKmlUmum(file.name, file, async (proses, f) => {
    const decoder = new TextDecoder("utf-8");
    await alirankanFile(f, async (chunk) => {
      proses(decoder.decode(chunk, { stream: true }));
    });
  });
}

async function parseKmz(file: File) {
  let ketemu = false;
  let totalFeatures = 0;
  const decoder = new TextDecoder("utf-8");
  let batchTitik: { lat: number; lng: number; name: string; description: string; attrs: Record<string, string> }[] = [];
  let batchBentuk: { kind: "closed" | "open"; vertices: { lat: number; lng: number }[]; name: string; description: string; attrs: Record<string, string> }[] = [];

  const feeder = buatPlacemarkFeeder((xml) => {
    const { titik, bentuk } = parsePlacemark(xml);
    if (titik) {
      batchTitik.push(titik);
      totalFeatures++;
    } else if (bentuk) {
      batchBentuk.push(bentuk);
      totalFeatures++;
    }
    if (batchTitik.length + batchBentuk.length >= BATCH_FEATURES) {
      kirim({ type: "features", points: batchTitik, shapes: batchBentuk, total: totalFeatures });
      batchTitik = [];
      batchBentuk = [];
    }
    if (totalFeatures >= MAX_FEATURES) {
      throw new Error(`Berhenti: melebihi batas ${MAX_FEATURES.toLocaleString("id-ID")} fitur.`);
    }
  });

  const uz = new Unzip((zf: ZipFileCb) => {
    const isKml = zf.name.toLowerCase().endsWith(".kml");
    if (isKml && !ketemu) {
      ketemu = true;
      zf.ondata = (err, data, final) => {
        if (err) return;
        try {
          feeder.push(decoder.decode(data, { stream: !final }));
          kirim({ type: "progress", bytes: 0, total: file.size, features: totalFeatures });
        } catch {
          /* batas fitur dilempar sebagai error utama di bawah */
        }
      };
    } else {
      zf.ondata = () => {};
    }
    zf.start();
  });
  uz.register(UnzipInflate);

  await alirankanFile(file, async (chunk) => {
    uz.push(chunk, false);
  });
  uz.push(new Uint8Array(0), true);

  if (batchTitik.length + batchBentuk.length) {
    kirim({ type: "features", points: batchTitik, shapes: batchBentuk, total: totalFeatures });
  }
  if (!ketemu) throw new Error("KMZ tidak berisi file .kml di dalamnya.");
  kirim({
    type: "done",
    ringkas: `${file.name}: ${totalFeatures.toLocaleString("id-ID")} fitur terbaca dari KMZ.`,
  });
}

// ==================== DISPATCH ====================

ctx.addEventListener("message", async (e: MessageEvent<Masuk>) => {
  const { file } = e.data;
  const nama = file.name.toLowerCase();
  try {
    if (nama.endsWith(".xlsx") || nama.endsWith(".xlsm")) {
      await parseXlsx(file);
    } else if (nama.endsWith(".csv") || nama.endsWith(".txt")) {
      await parseCsv(file);
    } else if (nama.endsWith(".kml")) {
      await parseKml(file);
    } else if (nama.endsWith(".kmz")) {
      await parseKmz(file);
    } else if (nama.endsWith(".xls")) {
      throw new Error("Format .xls lama tidak didukung; simpan ulang sebagai .xlsx atau CSV.");
    } else {
      throw new Error("Format file tidak dikenali. Gunakan xlsx, csv, kml, atau kmz.");
    }
  } catch (err) {
    kirim({ type: "error", message: err instanceof Error ? err.message : String(err) });
  }
});

export {};
