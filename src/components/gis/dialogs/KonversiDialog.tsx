"use client";

/**
 * Menu Konversi Koordinat (Task 32) — universal:
 * - Konversi TUNGGAL: isi satu titik → hasil langsung di semua format (derajat, DMS, MGRS, UTM, dst).
 * - Konversi BATCH: tempel daftar (satu titik per baris) → tabel hasil → unduh CSV.
 * - Sumber: derajat / DMS teks / MGRS / UTM / Web Mercator / EPSG apa pun (online).
 */

import { useMemo, useState } from "react";
import { FloatingWindow } from "../Chips";
import CrsPicker from "./CrsPicker";
import {
  CRS_WGS84,
  crsUtm,
  dariLatlng,
  dariMgrs,
  formatDms,
  hemiDariLat,
  keLatlng,
  keMgrs,
  parseNilaiDms,
  zonaUtmDariLng,
  type CrsPilihan,
} from "@/lib/gis/crs";
import { unduhBlob, stempelWaktu } from "@/lib/gis/download";
import { useGis } from "@/lib/gis/store";
import { toast } from "sonner";
import { ArrowRightLeft, Loader2 } from "lucide-react";

type Mode = "tunggal" | "batch";

/** Satu baris input batch terurai menjadi titik derajat WGS84 (atau null bila gagal). */
function uraiBaris(
  baris: string,
  sumber: CrsPilihan
): { teks: string; ll: { lat: number; lng: number } | null; catatan: string } {
  const teks = baris.trim();
  if (!teks) return { teks, ll: null, catatan: "" };
  try {
    if (sumber.id === "mgrs") {
      return { teks, ll: dariMgrs(teks), catatan: "" };
    }
    if (sumber.id === "dms") {
      // pisahkan pasangan: "6°59'30.5"S, 106°46'48"BT" → dua nilai DMS
      const pisah = teks.split(/[;|]|(?<="[A-Za-z]{1,2})[\s,]+|(?<=[LSNB]\b)[\s,]+/i);
      const bagian = pisah.map((p) => p.trim()).filter(Boolean);
      if (bagian.length >= 2) {
        const lat = parseNilaiDms(bagian[0], "lat");
        const lng = parseNilaiDms(bagian[1], "lng");
        if (lat !== null && lng !== null) return { teks, ll: { lat, lng }, catatan: "" };
      }
      // coba urai gabungan "6°59'30.5"S 106°46'48"BT" via regex dua blok
      const blok = teks.match(/(\d+[°º][\d.,'\s"”′º*]*\s*[A-Za-z]{1,2})\s*[,;]?\s*(\d+[°º][\d.,'\s"”′º*]*\s*[A-Za-z]{1,2})/);
      if (blok) {
        const lat = parseNilaiDms(blok[1], "lat");
        const lng = parseNilaiDms(blok[2], "lng");
        if (lat !== null && lng !== null) return { teks, ll: { lat, lng }, catatan: "" };
      }
      return { teks, ll: null, catatan: "format DMS tidak terbaca" };
    }
    // angka: "x, y" / "x; y" / "x y" / "(x, y)" — sumber proyeksi/geografis
    const angka = teks.replace(/[()]/g, "").split(/[,;\t]+|\s{2,}|\s+/).map((v) => parseFloat(v.replace(",", "."))).filter((v) => isFinite(v));
    if (angka.length < 2) return { teks, ll: null, catatan: "butuh 2 angka (x, y)" };
    const ll = keLatlng(angka[0], angka[1], sumber);
    if (!isFinite(ll.lat) || !isFinite(ll.lng)) return { teks, ll: null, catatan: "hasil konversi tidak valid" };
    if (Math.abs(ll.lat) > 90 || Math.abs(ll.lng) > 180)
      return { teks, ll: null, catatan: "hasil di luar rentang bumi — periksa zona/CRS sumber" };
    return { teks, ll, catatan: "" };
  } catch (e) {
    return { teks, ll: null, catatan: e instanceof Error ? e.message : "gagal dikonversi" };
  }
}

const fmt = (n: number, d = 6) => n.toFixed(d).replace(/\.?0+$/, (m) => (m.includes(".") ? "" : m));
const fmtKoma = (n: number, d = 3) => n.toLocaleString("id-ID", { maximumFractionDigits: d });
/** Jalankan konversi format turunan dengan aman — MGRS menolak lintang kutub (|lat|>84°). */
const coba = (fn: () => string): string => {
  try {
    return fn();
  } catch {
    return "— di luar jangkauan format ini";
  }
};

export default function KonversiDialog() {
  const open = useGis((s) => s.dialogs.konversi);
  const setDialog = useGis((s) => s.setDialog);

  const [mode, setMode] = useState<Mode>("tunggal");
  const [sumber, setSumber] = useState<CrsPilihan | null>(CRS_WGS84);
  const [tujuan, setTujuan] = useState<CrsPilihan | null>(crsUtm(49, "S"));

  // tunggal
  const [inX, setInX] = useState("110.4294");
  const [inY, setInY] = useState("-6.9943");

  // batch
  const [batchTeks, setBatchTeks] = useState("");
  const [batchHasil, setBatchHasil] = useState<{ teks: string; lat: number; lng: number }[] | null>(null);
  const [proses, setProses] = useState(false);

  const sumberPakai = sumber ?? CRS_WGS84;

  // ---------- konversi tunggal (hasil multi-format sekaligus) ----------
  // CATATAN: useMemo diletakkan SEBELUM early-return `open` agar urutan hook selalu sama.
  const hasilTunggalMemo = useMemo(() => {
    const masukan = sumberPakai.id === "mgrs" ? inX : `${inX}, ${inY}`;
    const ll = uraiBaris(masukan, sumberPakai).ll;
    if (!ll) return null;
    const utmZ = zonaUtmDariLng(ll.lng);
    const daftar: { judul: string; nilai: string }[] = [
      { judul: "Derajat (lat, lng)", nilai: `${fmt(ll.lat)}, ${fmt(ll.lng)}` },
      { judul: "DMS Lintang", nilai: formatDms(ll.lat, "lat") },
      { judul: "DMS Bujur", nilai: formatDms(ll.lng, "lng") },
      { judul: `UTM Zona ${utmZ}${hemiDariLat(ll.lat)} (X, Y meter)`, nilai: coba(() => { const k = dariLatlng(ll, crsUtm(utmZ, hemiDariLat(ll.lat))); return `${fmtKoma(k.x)} , ${fmtKoma(k.y)}`; }) },
      { judul: "MGRS", nilai: coba(() => keMgrs(ll)) },
      { judul: "Web Mercator EPSG:3857 (X, Y)", nilai: coba(() => { const k = dariLatlng(ll, { id: "epsg:3857", jenis: "proyeksi", label: "", satuan: "meter", def: "+proj=merc +a=6378137 +b=6378137 +lat_ts=0 +lon_0=0 +x_0=0 +y_0=0 +k=1 +units=m +nadgrids=@null +no_defs +type=crs" }); return `${fmtKoma(k.x, 1)} , ${fmtKoma(k.y, 1)}`; }) },
    ];
    // CRS tujuan kustom (UTM lain/EPSG) tampil juga bila beda dari daftar di atas
    if (tujuan && tujuan.def) {
      const k = dariLatlng(ll, tujuan);
      daftar.push({ judul: tujuan.label, nilai: `${fmtKoma(k.x)} , ${fmtKoma(k.y)}` });
    }
    return { ll, daftar };
  }, [inX, inY, sumberPakai, tujuan]);

  if (!open) return null;
  const tutup = () => setDialog("konversi", false);

  // ---------- batch ----------
  const jalankanBatch = () => {
    setProses(true);
    try {
      const baris = batchTeks.split(/\r?\n/).filter((b) => b.trim() !== "");
      if (baris.length === 0) {
        toast.error("Belum ada data — tempel daftar koordinat dulu (satu titik per baris).");
        return;
      }
      if (baris.length > 20000) {
        toast.error("Maksimal 20.000 baris sekali konversi.", { description: "Untuk data lebih besar, impor langsung ke peta lalu gunakan Ekspor dengan pilihan CRS." });
        return;
      }
      const hasil = baris
        .map((b) => uraiBaris(b, sumberPakai))
        .map((r) => ({ teks: r.teks, lat: r.ll?.lat ?? NaN, lng: r.ll?.lng ?? NaN, catatan: r.catatan }));
      const gagal = hasil.filter((h) => !isFinite(h.lat));
      setBatchHasil(hasil);
      if (gagal.length === hasil.length) {
        toast.error("Semua baris gagal dibaca", { description: "Periksa format & sistem koordinat sumber." });
      } else {
        toast.success(`${hasil.length - gagal.length} dari ${hasil.length} baris terkonversi`, {
          description: gagal.length ? `${gagal.length} baris dilewati — lihat kolom catatan.` : "Hasil bisa diunduh sebagai CSV.",
        });
      }
    } finally {
      setProses(false);
    }
  };

  const unduhCsv = () => {
    if (!batchHasil) return;
    const judulCrs = tujuan?.label ?? "WGS84";
    const kolom = ["Input", "Lat_WGS84", "Lng_WGS84", "Hasil_" + judulCrs.replace(/[^\w]+/g, "_"), "Catatan"];
    const baris = batchHasil.map((h) => {
      let nilaiTujuan = "";
      if (isFinite(h.lat) && tujuan) {
        if (tujuan.id === "dms") nilaiTujuan = `${formatDms(h.lat, "lat")} ${formatDms(h.lng, "lng")}`;
        else if (tujuan.id === "mgrs") nilaiTujuan = coba(() => keMgrs({ lat: h.lat, lng: h.lng }));
        else {
          const k = dariLatlng({ lat: h.lat, lng: h.lng }, tujuan);
          nilaiTujuan = `${k.x.toFixed(3)}, ${k.y.toFixed(3)}`;
        }
      }
      return [h.teks, isFinite(h.lat) ? h.lat.toFixed(8) : "", isFinite(h.lng) ? h.lng.toFixed(8) : "", nilaiTujuan, (h as { catatan?: string }).catatan ?? ""];
    });
    const csv = [kolom, ...baris].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\r\n");
    unduhBlob("\uFEFF" + csv, `konversi-koordinat-${stempelWaktu()}.csv`, "text/csv;charset=utf-8");
    toast.success("CSV hasil konversi diunduh");
  };

  const clsInput =
    "w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm outline-none focus:border-blue-400";
  const clsBtnKat =
    "rounded-lg px-2.5 py-1 text-xs font-medium transition-colors";

  return (
    <FloatingWindow judul="Konversi Koordinat — Geografis / UTM / MGRS / EPSG" onClose={tutup} lebar="max-w-2xl w-[min(94vw,44rem)]">
      <div className="flex gap-1.5 mb-4">
        <button onClick={() => setMode("tunggal")} aria-pressed={mode === "tunggal"} className={`${clsBtnKat} ${mode === "tunggal" ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>
          Satu Titik
        </button>
        <button onClick={() => setMode("batch")} aria-pressed={mode === "batch"} className={`${clsBtnKat} ${mode === "batch" ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>
          Banyak Titik (Batch)
        </button>
      </div>

      {mode === "tunggal" ? (
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <CrsPicker label="Sistem koordinat ASAL" nilai={sumber} onChange={setSumber} />
            <CrsPicker label="Sistem koordinat TUJUAN (opsional — hasil sudah tampil semua)" nilai={tujuan} onChange={setTujuan} />
          </div>

          {sumberPakai.id === "mgrs" ? (
            <div>
              <label className="text-xs font-semibold text-slate-600">Kode MGRS</label>
              <input value={inX} onChange={(e) => setInX(e.target.value)} placeholder="48MUP1234567890" className={clsInput} aria-label="Kode MGRS" />
            </div>
          ) : sumberPakai.id === "dms" ? (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-slate-600">Lintang (DMS)</label>
                <input value={inY} onChange={(e) => setInY(e.target.value)} placeholder={'6°59\'30.5"S'} className={clsInput} aria-label="Lintang DMS" />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-600">Bujur (DMS)</label>
                <input value={inX} onChange={(e) => setInX(e.target.value)} placeholder={'106°46\'48.0"BT'} className={clsInput} aria-label="Bujur DMS" />
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-slate-600">
                  {sumberPakai.jenis === "geografis" ? "Bujur / Lng (derajat)" : "X (Easting)"}
                </label>
                <input value={inX} onChange={(e) => setInX(e.target.value)} inputMode="decimal" className={clsInput} aria-label="Nilai X / Bujur" />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-600">
                  {sumberPakai.jenis === "geografis" ? "Lintang / Lat (derajat)" : "Y (Northing)"}
                </label>
                <input value={inY} onChange={(e) => setInY(e.target.value)} inputMode="decimal" className={clsInput} aria-label="Nilai Y / Lintang" />
              </div>
            </div>
          )}

          {hasilTunggalMemo ? (
            <div className="rounded-xl border border-slate-200 overflow-hidden">
              <table className="w-full text-sm">
                <tbody>
                  {hasilTunggalMemo.daftar.map((d, i) => (
                    <tr key={i} className="border-b last:border-0">
                      <td className="px-3 py-2 text-slate-500 w-[45%]">{d.judul}</td>
                      <td className="px-3 py-2 font-mono font-semibold text-slate-800 break-all select-all">{d.nilai}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-xs text-amber-700 bg-amber-50 rounded-lg px-3 py-2 border border-amber-200">
              Nilai belum bisa dikonversi — periksa format input.
            </p>
          )}
          <p className="text-[11px] text-slate-400">
            Hasil ditampilkan dalam semua format utama sekaligus (derajat, DMS, UTM zona otomatis, MGRS, Web Mercator).
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <CrsPicker label="Sistem koordinat ASAL (data yang ditempel)" nilai={sumber} onChange={setSumber} utmAwal={{ zona: 49, hemi: "S" }} />
            <CrsPicker label="Kolom HASIL di CSV (tujuan)" nilai={tujuan} onChange={setTujuan} utmAwal={{ zona: 49, hemi: "S" }} />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-600">
              Daftar koordinat — satu titik per baris, format &quot;x, y&quot; (atau teks DMS / kode MGRS sesuai CRS asal)
            </label>
            <textarea
              value={batchTeks}
              onChange={(e) => setBatchTeks(e.target.value)}
              rows={8}
              placeholder={"436975.31, 9226844.12\n437050.00, 9226900.00\n436900.00, 9226800.00"}
              className={`${clsInput} font-mono text-xs`}
              aria-label="Daftar koordinat batch"
            />
          </div>
          <div className="flex gap-2 items-center">
            <button
              onClick={jalankanBatch}
              disabled={proses}
              className="rounded-xl bg-blue-600 text-white px-4 py-2 text-sm font-medium hover:bg-blue-700 flex items-center gap-1.5 disabled:opacity-60"
            >
              {proses ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRightLeft className="h-4 w-4" />}
              Konversi
            </button>
            {batchHasil && (
              <button onClick={unduhCsv} className="rounded-xl border border-slate-300 px-4 py-2 text-sm hover:bg-slate-50">
                Unduh CSV
              </button>
            )}
          </div>
          {batchHasil && (
            <div className="rounded-xl border border-slate-200 overflow-hidden max-h-64 overflow-y-auto">
              <table className="w-full text-xs">
                <thead className="bg-slate-50 sticky top-0">
                  <tr>
                    <th className="px-2 py-1.5 text-left font-semibold">Input</th>
                    <th className="px-2 py-1.5 text-left font-semibold">Lat</th>
                    <th className="px-2 py-1.5 text-left font-semibold">Lng</th>
                    <th className="px-2 py-1.5 text-left font-semibold">{tujuan?.label ?? "Tujuan"}</th>
                  </tr>
                </thead>
                <tbody>
                  {batchHasil.map((h, i) => (
                    <tr key={i} className="border-t border-slate-100">
                      <td className="px-2 py-1 font-mono">{h.teks}</td>
                      <td className="px-2 py-1 font-mono">{isFinite(h.lat) ? h.lat.toFixed(6) : <span className="text-red-500">gagal</span>}</td>
                      <td className="px-2 py-1 font-mono">{isFinite(h.lng) ? h.lng.toFixed(6) : <span className="text-red-500">gagal</span>}</td>
                      <td className="px-2 py-1 font-mono">{isFinite(h.lat) && tujuan ? (tujuan.id === "dms" ? `${formatDms(h.lat, "lat")} ${formatDms(h.lng, "lng")}` : tujuan.id === "mgrs" ? coba(() => keMgrs({ lat: h.lat, lng: h.lng })) : (() => { const k = dariLatlng({ lat: h.lat, lng: h.lng }, tujuan); return `${k.x.toFixed(2)}, ${k.y.toFixed(2)}`; })()) : (h as { catatan?: string }).catatan}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </FloatingWindow>
  );
}
