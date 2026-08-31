// Replikasi parseXlsx dua-pass dari src/workers/parse-worker.ts untuk debugging.
import { Unzip, UnzipInflate } from "fflate";
import { readFileSync } from "node:fs";

const buf = readFileSync("samples/uji-header-excel.xlsx");
const file = new Blob([buf]); // .size & .stream() sama seperti File
const MAX_ROWS = 300000;

function decodeXml(s) {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#x([0-9a-fA-F]+);/g, (_c, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_c, n) => String.fromCodePoint(Number(n)))
    .replace(/&amp;/g, "&");
}

async function alirankanFile(file, proses) {
  const reader = file.stream().getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    await proses(value);
  }
}

const sst = [];
let bufferSst = "";
let sisaSst = [];
let bytesReadSst = 0;
const decoderSst = new TextDecoder("utf-8");
const siRe = /<si>([\s\S]*?)<\/si>/g;

console.log("=== PASS 1 dimulai, size =", file.size);
const uzSst = new Unzip((zf) => {
  console.log("  entri ketemu:", zf.name);
  if (zf.name !== "xl/sharedStrings.xml") {
    zf.ondata = () => {};
    zf.start();
    return;
  }
  console.log("  -> sst mulai");
  zf.ondata = (err, data, final) => {
    if (err) {
      console.log("  sst ondata ERR:", err);
      return;
    }
    bufferSst += decoderSst.decode(data, { stream: !final });
    siRe.lastIndex = 0;
    let m;
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
    bytesReadSst += data.byteLength;
  };
  zf.start();
});
uzSst.register(UnzipInflate);
await alirankanFile(file, async (chunk) => uzSst.push(chunk, false));
uzSst.push(new Uint8Array(0), true);
if (sisaSst.length) {
  sst.push(...sisaSst);
  sisaSst = [];
}
console.log("PASS 1 selesai, sst =", sst.length, "contoh:", sst.slice(0, 4));

// ---- PASS 2 ----
function kolomKeIndex(huruf) {
  let n = 0;
  for (const c of huruf) n = n * 26 + (c.charCodeAt(0) - 64);
  return n - 1;
}
function parseRowXml(rowXml) {
  const cells = [];
  const cellRe = /<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g;
  let m;
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

const barisSemua = [];
let bufferSheet = "";
const decoderSheet = new TextDecoder("utf-8");
const rowRe = /<row[^>]*\/>|<row[^>]*>[\s\S]*?<\/row>/g;
let sheetDitangani = false;

console.log("=== PASS 2 dimulai");
const uzSheet = new Unzip((zf) => {
  console.log("  entri ketemu:", zf.name);
  const isSheet = /^xl\/worksheets\/sheet\d+\.xml$/.test(zf.name) && !sheetDitangani;
  if (!isSheet) {
    zf.ondata = () => {};
    zf.start();
    return;
  }
  sheetDitangani = true;
  console.log("  -> sheet mulai");
  zf.ondata = (err, data, final) => {
    if (err) {
      console.log("  sheet ondata ERR:", err);
      return;
    }
    bufferSheet += decoderSheet.decode(data, { stream: !final });
    rowRe.lastIndex = 0;
    let m;
    let last = 0;
    while ((m = rowRe.exec(bufferSheet))) {
      barisSemua.push(parseRowXml(m[0]));
      last = rowRe.lastIndex;
      if (barisSemua.length >= MAX_ROWS) throw new Error("batas");
    }
    if (last > 0) bufferSheet = bufferSheet.slice(last);
  };
  zf.start();
});
uzSheet.register(UnzipInflate);
await alirankanFile(file, async (chunk) => uzSheet.push(chunk, false));
uzSheet.push(new Uint8Array(0), true);

console.log("PASS 2 selesai, total baris =", barisSemua.length);
console.log("HEADER:", barisSemua[0]);
console.log("DATA[0]:", barisSemua[1]);
console.log("DATA[1]:", barisSemua[2]);
