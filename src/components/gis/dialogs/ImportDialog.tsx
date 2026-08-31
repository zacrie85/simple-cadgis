"use client";

import { useCallback, useRef, useState } from "react";
import { useGis } from "@/lib/gis/store";
import { FloatingWindow } from "../Chips";
import { ParseStream } from "@/lib/gis/parse-client";
import { parseKolomKoordinat, uid } from "@/lib/gis/geo";
import type { GisPoint, GisShape } from "@/lib/gis/types";
import { toast } from "sonner";
import { Upload, Loader2, CheckCircle2, FileSpreadsheet } from "lucide-react";

type Fase = "pilih" | "proses" | "peta-kolom" | "selesai";

interface ProgresInfo {
  bytes: number;
  total: number;
  rows?: number;
  features?: number;
}

export default function ImportDialog() {
  const open = useGis((s) => s.dialogs.import);
  const setDialog = useGis((s) => s.setDialog);
  const fitData = useGis((s) => s.fitData);

  const [fase, setFase] = useState<Fase>("pilih");
  const [namaFile, setNamaFile] = useState("");
  const [jenis, setJenis] = useState<"tabel" | "kml">("tabel");
  const [progres, setProgres] = useState<ProgresInfo>({ bytes: 0, total: 0 });
  const [pesanProses, setPesanProses] = useState("");

  const headersRef = useRef<string[]>([]);
  const rowsRef = useRef<string[][]>([]);
  const totalRowsRef = useRef(0);
  const fiturRef = useRef<{ points: GisPoint[]; shapes: GisShape[] }>({ points: [], shapes: [] });
  const workerRef = useRef<ParseStream | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // pemetaan kolom
  const [modeKoordinat, setModeKoordinat] = useState<"gabungan" | "pisah">("gabungan");
  const [kolomGabung, setKolomGabung] = useState(0);
  const [kolomLat, setKolomLat] = useState(0);
  const [kolomLng, setKolomLng] = useState(1);
  const [kolomElev, setKolomElev] = useState(-1);
  const [kolomJudul, setKolomJudul] = useState(-1);

  const tutup = useCallback(() => {
    workerRef.current?.hentikan();
    setDialog("import", false);
    setTimeout(() => {
      setFase("pilih");
      setProgres({ bytes: 0, total: 0 });
      setNamaFile("");
      headersRef.current = [];
      rowsRef.current = [];
      fiturRef.current = { points: [], shapes: [] };
    }, 200);
  }, [setDialog]);

  const mulaiParse = (file: File) => {
    const nama = file.name.toLowerCase();
    const isKml = nama.endsWith(".kml") || nama.endsWith(".kmz");
    setNamaFile(file.name);
    setJenis(isKml ? "kml" : "tabel");
    setFase("proses");
    setProgres({ bytes: 0, total: file.size });
    headersRef.current = [];
    rowsRef.current = [];
    totalRowsRef.current = 0;
    fiturRef.current = { points: [], shapes: [] };

    const parser = new ParseStream();
    workerRef.current = parser;
    parser.mulai(file, {
      onProgress: (p) => setProgres({ bytes: p.bytes, total: p.total, rows: p.rows, features: p.features }),
      onRows: (rows, total) => {
        if (headersRef.current.length === 0 && rows.length > 0) {
          headersRef.current = rows[0].map((h, i) => h.trim() || `Kolom ${i + 1}`);
          rowsRef.current = rows.slice(1);
          // tebak kolom koordinat gabungan dari header
          const idx = headersRef.current.findIndex((h) => /coord|koordinat|lat.*lng|titik/i.test(h));
          setKolomGabung(idx >= 0 ? idx : 0);
          const idxLat = headersRef.current.findIndex((h) => /^lat/i.test(h));
          const idxLng = headersRef.current.findIndex((h) => /^(lng|lon|long)/i.test(h));
          setKolomLat(idxLat >= 0 ? idxLat : 0);
          setKolomLng(idxLng >= 0 ? idxLng : Math.min(1, headersRef.current.length - 1));
          const idxElev = headersRef.current.findIndex((h) => /elev|ketinggian|z|mdpl|rl/i.test(h));
          setKolomElev(idxElev);
          const idxJudul = headersRef.current.findIndex((h) => /nama|judul|title|id|no/i.test(h));
          setKolomJudul(idxElev >= 0 ? idxJudul : 0);
        } else {
          rowsRef.current.push(...rows);
        }
        totalRowsRef.current = total;
      },
      onFeatures: (points, shapes) => {
        for (const p of points) {
          fiturRef.current.points.push({
            id: uid("titik"),
            lat: p.lat,
            lng: p.lng,
            title: p.name,
            description: p.description,
            attrs: p.attrs,
            source: "kml",
            visible: true,
          });
        }
        for (const sh of shapes) {
          fiturRef.current.shapes.push({
            id: uid("shape"),
            kind: sh.kind,
            vertices: sh.vertices,
            title: sh.name,
            description: sh.description,
            color: sh.kind === "closed" ? "#f59e0b" : "#10b981",
            attrs: sh.attrs,
            source: "kml",
            visible: true,
          });
        }
      },
      onDone: (ringkas) => {
        setPesanProses(ringkas);
        if (jenis === "tabel" || rowsRef.current.length > 0) {
          if (headersRef.current.length > 0) {
            setFase("peta-kolom");
          } else {
            terapkanFiturKml();
          }
        } else {
          terapkanFiturKml();
        }
      },
      onError: (msg) => {
        toast.error("Gagal membaca file", { description: msg });
        setFase("pilih");
      },
    });
  };

  const terapkanFiturKml = () => {
    const st = useGis.getState();
    if (fiturRef.current.points.length) st.addPoints(fiturRef.current.points);
    for (const sh of fiturRef.current.shapes) st.addShape(sh);
    toast.success("Impor KML/KMZ berhasil", {
      description: `${fiturRef.current.points.length} titik + ${fiturRef.current.shapes.length} poligon/garis ditambahkan.`,
    });
    fitData();
    setFase("selesai");
    setTimeout(tutup, 600);
  };

  const prosentase = progres.total > 0 ? Math.min(100, Math.round((progres.bytes / progres.total) * 100)) : 0;

  const hitungDanTambah = () => {
    const st = useGis.getState();
    const semuaRows = rowsRef.current;
    const baru: GisPoint[] = [];
    let gagal = 0;

    const ambil = (row: string[], i: number) => row[i] ?? "";

    for (const row of semuaRows) {
      let ll: ReturnType<typeof parseKolomKoordinat> = null;
      if (modeKoordinat === "gabungan") {
        ll = parseKolomKoordinat(ambil(row, kolomGabung));
      } else {
        const la = parseFloat(String(ambil(row, kolomLat)).replace(",", "."));
        const lo = parseFloat(String(ambil(row, kolomLng)).replace(",", "."));
        if (!isNaN(la) && !isNaN(lo) && Math.abs(la) <= 90 && Math.abs(lo) <= 180) {
          ll = { lat: la, lng: lo };
        }
      }
      if (!ll) {
        gagal++;
        continue;
      }
      const elevRaw = kolomElev >= 0 ? parseFloat(String(ambil(row, kolomElev)).replace(",", ".")) : NaN;
      const attrs: Record<string, string> = {};
      headersRef.current.forEach((h, i) => {
        const v = ambil(row, i);
        if (v !== "") attrs[h] = v;
      });
      baru.push({
        id: uid("titik"),
        lat: ll.lat,
        lng: ll.lng,
        title: kolomJudul >= 0 ? ambil(row, kolomJudul) || `Titik ${baru.length + 1}` : `Titik ${baru.length + 1}`,
        description: "",
        elevation: !isNaN(elevRaw) ? elevRaw : null,
        attrs,
        source: namaFile.toLowerCase().endsWith(".csv") ? "csv" : "excel",
        visible: true,
      });
    }

    // tambahkan bertahap agar UI tetap responsif
    const ukuranBatch = 2000;
    let i = 0;
    const tambahBertahap = () => {
      const potongan = baru.slice(i, i + ukuranBatch);
      st.addPoints(potongan);
      i += ukuranBatch;
      if (i < baru.length) {
        setTimeout(tambahBertahap, 0);
      } else {
        toast.success(`${baru.length.toLocaleString("id-ID")} titik ditambahkan ke peta`, {
          description: gagal > 0 ? `${gagal.toLocaleString("id-ID")} baris dilewati (koordinat tidak valid).` : undefined,
        });
        fitData();
        setFase("selesai");
        setTimeout(tutup, 700);
      }
    };
    if (baru.length === 0) {
      toast.error("Tidak ada titik valid ditemukan", {
        description: "Periksa pilihan kolom koordinat. Format contoh: (-6.994292,110.429400)",
      });
      return;
    }
    tambahBertahap();
  };

  if (!open) return null;

  const pratinjau = rowsRef.current.slice(0, 6);
  const opsiKolom = headersRef.current.map((h, i) => (
    <option key={i} value={i}>
      {h}
    </option>
  ));

  return (
    <FloatingWindow judul="Impor Data — Excel / CSV / KML / KMZ" onClose={tutup} lebar="max-w-3xl w-[min(94vw,56rem)]">
      {fase === "pilih" && (
        <div>
          <div
            onClick={() => inputRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              const f = e.dataTransfer.files?.[0];
              if (f) mulaiParse(f);
            }}
            className="cursor-pointer rounded-2xl border-2 border-dashed border-blue-300 bg-blue-50/40 hover:bg-blue-50 transition-colors flex flex-col items-center justify-center gap-3 py-12"
            role="button"
            aria-label="Pilih atau jatuhkan file"
            tabIndex={0}
            onKeyDown={(e) => e.key === "Enter" && inputRef.current?.click()}
          >
            <div className="h-14 w-14 rounded-2xl bg-blue-100 flex items-center justify-center">
              <Upload className="h-7 w-7 text-blue-600" />
            </div>
            <p className="font-semibold text-slate-800">Klik pilih file atau seret ke sini</p>
            <p className="text-sm text-slate-500">
              Mendukung <b>.xlsx</b> <b>.csv</b> <b>.kml</b> <b>.kmz</b> — hingga <b>250 MB</b>
            </p>
            <p className="text-xs text-slate-400">
              File besar diproses terpecah-pecah (streaming) agar aplikasi tidak hang
            </p>
          </div>
          <input
            ref={inputRef}
            type="file"
            accept=".xlsx,.xlsm,.csv,.txt,.kml,.kmz"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) mulaiParse(f);
              e.target.value = "";
            }}
          />
        </div>
      )}

      {fase === "proses" && (
        <div className="py-8 flex flex-col items-center gap-4">
          <Loader2 className="h-10 w-10 animate-spin text-blue-600" />
          <div className="text-center">
            <p className="font-semibold text-slate-800">Membaca {namaFile}…</p>
            <p className="text-sm text-slate-500 mt-1">
              {jenis === "kml"
                ? `${(fiturRef.current.points.length + fiturRef.current.shapes.length).toLocaleString("id-ID")} fitur ditemukan`
                : `${(progres.rows ?? 0).toLocaleString("id-ID")} baris terbaca`}
            </p>
          </div>
          <div className="w-full max-w-md">
            <div className="h-3 rounded-full bg-slate-100 overflow-hidden">
              <div
                className="h-full rounded-full bg-gradient-to-r from-blue-500 to-sky-400 transition-all"
                style={{ width: `${prosentase}%` }}
              />
            </div>
            <div className="flex justify-between text-xs text-slate-400 mt-1.5">
              <span>{prosentase}%</span>
              <span>
                {(progres.bytes / 1048576).toFixed(1)} / {(progres.total / 1048576).toFixed(1)} MB
              </span>
            </div>
          </div>
          <button
            onClick={() => {
              workerRef.current?.hentikan();
              setFase("pilih");
            }}
            className="text-xs text-red-600 hover:underline"
          >
            Batalkan proses
          </button>
        </div>
      )}

      {fase === "peta-kolom" && (
        <div className="space-y-5">
          <div className="flex items-start gap-2.5 rounded-xl bg-emerald-50 border border-emerald-200 p-3">
            <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0 mt-0.5" />
            <div className="text-sm">
              <p className="font-medium text-emerald-800">
                {totalRowsRef.current.toLocaleString("id-ID")} baris berhasil dibaca
              </p>
              <p className="text-emerald-600 text-xs mt-0.5">
                Sekarang pilih kolom yang berisi koordinat.
              </p>
            </div>
          </div>

          <div className="space-y-3">
            <p className="text-sm font-semibold text-slate-700">Kolom Koordinat</p>
            <div className="flex gap-4">
              <label className="flex items-center gap-1.5 text-sm">
                <input type="radio" checked={modeKoordinat === "gabungan"} onChange={() => setModeKoordinat("gabungan")} />
                1 kolom gabungan: <code className="text-xs bg-slate-100 px-1 rounded">(-6.994292,110.429400)</code>
              </label>
              <label className="flex items-center gap-1.5 text-sm">
                <input type="radio" checked={modeKoordinat === "pisah"} onChange={() => setModeKoordinat("pisah")} />
                2 kolom terpisah (lat &amp; lng)
              </label>
            </div>

            <div className="grid sm:grid-cols-2 gap-3">
              {modeKoordinat === "gabungan" ? (
                <label className="block">
                  <span className="text-xs font-medium text-slate-500">Kolom koordinat gabungan</span>
                  <select
                    value={kolomGabung}
                    onChange={(e) => setKolomGabung(Number(e.target.value))}
                    className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm bg-white"
                  >
                    {opsiKolom}
                  </select>
                </label>
              ) : (
                <>
                  <label className="block">
                    <span className="text-xs font-medium text-slate-500">Kolom Latitude</span>
                    <select value={kolomLat} onChange={(e) => setKolomLat(Number(e.target.value))} className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm bg-white">
                      {opsiKolom}
                    </select>
                  </label>
                  <label className="block">
                    <span className="text-xs font-medium text-slate-500">Kolom Longitude</span>
                    <select value={kolomLng} onChange={(e) => setKolomLng(Number(e.target.value))} className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm bg-white">
                      {opsiKolom}
                    </select>
                  </label>
                </>
              )}
              <label className="block">
                <span className="text-xs font-medium text-slate-500">Kolom ketinggian / elevasi (opsional — untuk kontur)</span>
                <select value={kolomElev} onChange={(e) => setKolomElev(Number(e.target.value))} className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm bg-white">
                  <option value={-1}>— Tidak ada —</option>
                  {opsiKolom}
                </select>
              </label>
              <label className="block">
                <span className="text-xs font-medium text-slate-500">Kolom judul titik (opsional)</span>
                <select value={kolomJudul} onChange={(e) => setKolomJudul(Number(e.target.value))} className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm bg-white">
                  <option value={-1}>— Otomatis —</option>
                  {opsiKolom}
                </select>
              </label>
            </div>
          </div>

          <div>
            <p className="text-sm font-semibold text-slate-700 mb-2">Pratinjau 6 baris pertama</p>
            <div className="overflow-x-auto rounded-xl border border-slate-200 scrollbar-halus">
              <table className="min-w-full text-xs">
                <thead>
                  <tr className="bg-slate-50">
                    {headersRef.current.map((h, i) => (
                      <th key={i} className="px-2.5 py-2 text-left font-semibold text-slate-600 border-b whitespace-nowrap">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {pratinjau.map((row, ri) => (
                    <tr key={ri} className="border-b last:border-0">
                      {headersRef.current.map((_, ci) => (
                        <td key={ci} className="px-2.5 py-1.5 text-slate-700 whitespace-nowrap max-w-[180px] truncate">
                          {row[ci] ?? ""}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="flex gap-2 justify-end">
            <button onClick={() => setFase("pilih")} className="rounded-xl border border-slate-300 px-4 py-2 text-sm hover:bg-slate-50">
              Ganti File
            </button>
            <button
              onClick={hitungDanTambah}
              className="rounded-xl bg-blue-600 text-white px-4 py-2 text-sm font-medium hover:bg-blue-700 flex items-center gap-1.5"
            >
              <FileSpreadsheet className="h-4 w-4" />
              Tambahkan Titik ke Peta
            </button>
          </div>
        </div>
      )}

      {fase === "selesai" && (
        <div className="py-8 flex flex-col items-center gap-3">
          <CheckCircle2 className="h-10 w-10 text-emerald-500" />
          <p className="font-medium text-slate-700">{pesanProses || "Impor selesai"}</p>
        </div>
      )}

    </FloatingWindow>
  );
}
