"use client";

/**
 * Dialog Impor Raster Georeferensi (GeoTIFF / ECW).
 * - GeoTIFF (.tif/.tiff) hingga 1 TB: dibaca bertahap di Web Worker
 *   → pratinjau overlay di peta pada koordinat yang benar, UI tidak pernah beku.
 * - DEM 1 band otomatis terdeteksi → bisa dipakai sumber elevasi LOKAL di menu Elevasi DEM.
 * - ECW: tidak ada dekoder browser (lisensi proprietary) → tampilkan panduan konversi via QGIS/GDAL.
 * - Layer raster hanya tersimpan selama aplikasi terbuka (gambar terlalu besar untuk localStorage).
 */

import { useEffect, useRef, useState } from "react";
import { useGis } from "@/lib/gis/store";
import { batalPiramidaRaster, bukaRaster, padaPiramida } from "@/lib/gis/raster";
import { idPiramidaDariTanda } from "@/lib/gis/piramida-db";
import { uid } from "@/lib/gis/geo";
import type { RasterLayer } from "@/lib/gis/types";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  Image as ImageIcon,
  LoaderCircle,
  Info,
  XCircle,
  Upload,
  Trash2,
  Eye,
  EyeOff,
  TriangleAlert,
  Download,
  Layers,
} from "lucide-react";

const UKURAN_MAKS = 1024 * 1024 * 1024 * 1024; // 1 TB

/** Pilihan anggaran ukuran piramida (konverter otomatis). */
const KUALITAS_PIRAMIDA = [
  { v: 0, label: "Nonaktif — pratinjau saja" },
  { v: 50, label: "Ringan — ±50 MB" },
  { v: 100, label: "Seimbang — ±100 MB (disarankan)" },
  { v: 200, label: "Maksimal — ±200 MB" },
] as const;

export default function RasterDialog() {
  const open = useGis((s) => s.dialogs.raster);
  const setDialog = useGis((s) => s.setDialog);
  const rasters = useGis((s) => s.rasters);
  const tambahRaster = useGis((s) => s.tambahRaster);
  const hapusRaster = useGis((s) => s.hapusRaster);
  const setRasterTerlihat = useGis((s) => s.setRasterTerlihat);
  const setRasterOpasitas = useGis((s) => s.setRasterOpasitas);

  const inputRef = useRef<HTMLInputElement>(null);
  const sinyalBatal = useRef({ dibatalkan: false });
  const [jalan, setJalan] = useState(false);
  const [progres, setProgres] = useState({ persen: 0, tahap: "" });
  const [drag, setDrag] = useState(false);
  const [piramidaMb, setPiramidaMb] = useState(100);

  // langganan progres piramida (dikirim worker SETELAH impor sukses)
  const setPiramidaRaster = useGis((s) => s.setPiramidaRaster);
  useEffect(() => {
    const berhenti = padaPiramida((m) => {
      setPiramidaRaster(m.id, {
        piramidaProgres: m.persen,
        piramidaTahap: m.tahap,
        ...(m.selesai === true
          ? { piramidaSiap: !m.gagal, piramidaGagal: !!m.gagal, piramidaUkuranMb: m.ukuranMb, piramidaLevelPx: m.levelMaksPx }
          : {}),
      });
    });
    return berhenti;
  }, [setPiramidaRaster]);

  const terbuka = useRef(false);
  useEffect(() => {
    if (open && !terbuka.current) {
      sinyalBatal.current = { dibatalkan: false };
      setJalan(false);
      setProgres({ persen: 0, tahap: "" });
    }
    terbuka.current = open;
  }, [open]);

  if (!open) return null;

  const tutup = () => {
    if (jalan) sinyalBatal.current.dibatalkan = true;
    setDialog("raster", false);
  };

  const proses = async (file: File) => {
    const nama = file.name.toLowerCase();
    if (nama.endsWith(".ecw")) {
      toast.error("Format ECW tidak didukung browser", {
        description:
          "Tidak ada dekoder ECW untuk aplikasi web (lisensi proprietary). Gunakan tombol “Skrip ECW Bridge” di dialog ini untuk konversi otomatis via QGIS.",
        duration: 12000,
      });
      return;
    }
    if (!nama.endsWith(".tif") && !nama.endsWith(".tiff")) {
      toast.error("Format tidak dikenali", {
        description: "Gunakan GeoTIFF (.tif / .tiff). File ECW dikonversi dulu ke GeoTIFF via QGIS/GDAL.",
      });
      return;
    }
    if (file.size > UKURAN_MAKS) {
      const mb = file.size / 1048576;
      const ukuran = mb >= 1024 ? `${(mb / 1024).toFixed(1)} GB` : `${mb.toFixed(0)} MB`;
      toast.error("File terlalu besar", {
        description: `Ukuran ${ukuran} melebihi batas 1 TB. Kompres/potong dulu via QGIS (kompresi JPEG atau Deflate).`,
      });
      return;
    }
    setJalan(true);
    setProgres({ persen: 0, tahap: "Memulai…" });
    sinyalBatal.current = { dibatalkan: false };
    // id layer DIBUAT DI AWAL & dipakai sebagai kunci worker — agar fitur
    // "Elevasi dari DEM lokal" menemukan raster yang sudah dibuka worker
    const idLayer = uid("raster");
    try {
      const { info, blob } = await bukaRaster(file, {
        kunci: idLayer,
        onProgres: setProgres,
        sinyalBatal: sinyalBatal.current,
        piramidaMb,
      });
      const layer: RasterLayer = {
        id: idLayer,
        nama: file.name,
        terlihat: true,
        opasitas: 1,
        gambarUrl: URL.createObjectURL(blob),
        barat: info.barat,
        timur: info.timur,
        selatan: info.selatan,
        utara: info.utara,
        lebarPx: info.lebarPx,
        tinggiPx: info.tinggiPx,
        sumberCrs: info.sumberCrs,
        dem: info.dem,
        resolusiLabel: info.resolusiLabel,
        ukuranFileMb: info.ukuranFileMb,
        dibuat: Date.now(),
        piramidaId:
          piramidaMb > 0 && !info.dem && info.lebarPx > 4096
            ? idPiramidaDariTanda(`${file.name}|${file.size}|${file.lastModified}`)
            : undefined,
      };
      tambahRaster(layer);
      // zoom ke cakupan raster supaya hasil impor langsung terlihat
      toast.success(
        `Raster diimpor: ${file.name} (${info.lebarPx.toLocaleString("id-ID")}×${info.tinggiPx.toLocaleString("id-ID")} px)`,
        {
          description: info.dem
            ? `${info.sumberCrs} • ${info.resolusiLabel} • DEM 1 band — bisa dipakai menu Elevasi DEM → "Dari File Lokal"`
            : layer.piramidaId
              ? `${info.sumberCrs} • ${info.resolusiLabel} • konversi otomatis berjalan — detail tajam menyusul`
              : `${info.sumberCrs} • ${info.resolusiLabel}`,
        }
      );
    } catch (err) {
      const pesan = err instanceof Error ? err.message : "Gagal membaca raster.";
      if (sinyalBatal.current.dibatalkan || pesan.includes("Dibatalkan") || pesan.includes("dibatalkan")) {
        toast.warning("Impor raster dibatalkan");
      } else {
        toast.error("Gagal mengimpor raster", { description: pesan, duration: 12000 });
      }
    } finally {
      setJalan(false);
    }
  };

  const pilihFile = (files: FileList | null) => {
    const file = files?.[0];
    if (file) void proses(file);
  };

  return (
    <Dialog open onOpenChange={(v) => !v && tutup()}>
      <DialogContent className="rounded-2xl sm:max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ImageIcon className="h-5 w-5 text-primary" />
            Impor Raster Georeferensi
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3 text-sm">
          {/* area pilih/drop file */}
          {!jalan && (
            <div
              className={`rounded-xl border-2 border-dashed px-4 py-6 text-center transition-colors ${
                drag ? "border-blue-500 bg-blue-50" : "border-slate-300 hover:bg-slate-50"
              }`}
              onDragOver={(e) => {
                e.preventDefault();
                setDrag(true);
              }}
              onDragLeave={() => setDrag(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDrag(false);
                pilihFile(e.dataTransfer.files);
              }}
            >
              <Upload className="mx-auto h-7 w-7 text-slate-400" />
              <p className="mt-2 text-slate-600">
                Tarik-lepas file ke sini, atau
                <button className="ml-1 font-semibold text-blue-700 underline" onClick={() => inputRef.current?.click()}>
                  pilih file
                </button>
              </p>
              <p className="mt-1 text-xs text-slate-400">
                GeoTIFF (.tif / .tiff) — maksimal 1 TB • orthophoto/citra &amp; DEM
              </p>
              {/* kualitas konversi otomatis (piramida) */}
              <div className="mt-3 flex items-center gap-2 rounded-lg bg-slate-50 border border-slate-200 px-2.5 py-2 text-left">
                <Layers className="h-4 w-4 shrink-0 text-slate-400" />
                <div className="min-w-0 flex-1">
                  <label className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 block">
                    Konverter otomatis (piramida detail)
                  </label>
                  <select
                    value={piramidaMb}
                    onChange={(e) => setPiramidaMb(Number(e.target.value))}
                    className="mt-0.5 w-full rounded-md border border-slate-200 bg-white px-2 py-1 text-xs"
                  >
                    {KUALITAS_PIRAMIDA.map((k) => (
                      <option key={k.v} value={k.v}>
                        {k.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <input
                ref={inputRef}
                type="file"
                accept=".tif,.tiff,.ecw"
                className="hidden"
                onChange={(e) => {
                  pilihFile(e.target.files);
                  e.target.value = "";
                }}
              />
            </div>
          )}

          {/* progres */}
          {jalan && (
            <div className="space-y-1.5">
              <div className="h-2.5 w-full rounded-full bg-slate-100 overflow-hidden">
                <div className="h-full rounded-full bg-blue-600 transition-all" style={{ width: `${progres.persen}%` }} />
              </div>
              <p className="text-xs text-slate-500 flex items-center gap-1.5">
                <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
                {progres.tahap || "Memproses…"} ({progres.persen}%)
              </p>
              <p className="text-[11px] text-slate-400">
                Berjalan di latar belakang (Web Worker) — aplikasi tetap bisa dipakai.
              </p>
            </div>
          )}

          {/* peringatan ECW + jembatan konversi */}
          <div className="rounded-xl bg-amber-50 text-amber-900 text-xs px-3 py-2.5 space-y-2">
            <p className="flex items-start gap-2">
              <TriangleAlert className="h-4 w-4 shrink-0 mt-0.5" />
              <span>
                <b>ECW:</b> format proprietary — tidak ada dekoder untuk browser, jadi file .ecw tidak bisa
                dibuka langsung. Jalan resmi &amp; legal: konversi sekali lewat <b>QGIS (gratis)</b> memakai
                skrip otomatis di bawah ini — hasilnya .tif yang langsung terbaca di sini.
              </span>
            </p>
            <a
              href="ecw-bridge-qgis.py"
              download="ECW-Bridge-SIMPLE-CADGIS.py"
              className="inline-flex items-center gap-1.5 rounded-lg bg-amber-600 px-3 py-1.5 font-semibold text-white hover:bg-amber-700"
            >
              <Download className="h-3.5 w-3.5" />
              Skrip ECW Bridge (.py)
            </a>
            <ol className="list-decimal ml-4 space-y-0.5 text-amber-800">
              <li>Buka QGIS → menu <b>Plugins → Python Console</b></li>
              <li>Klik <b>Show Editor</b> → <b>Open Script</b> → pilih file ini → <b>Run</b></li>
              <li>Pilih file .ecw (bisa banyak sekaligus) → pilih folder hasil → selesai</li>
              <li>Impor hasil .tif ke dialog ini</li>
            </ol>
          </div>

          {/* daftar raster terimpor */}
          {rasters.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Raster terimpor ({rasters.length})
              </p>
              {rasters.map((r) => (
                <div key={r.id} className="rounded-xl border border-slate-200 px-3 py-2.5 space-y-2">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setRasterTerlihat(r.id, !r.terlihat)}
                      title={r.terlihat ? "Sembunyikan" : "Tampilkan"}
                      className="h-8 w-8 shrink-0 rounded-lg flex items-center justify-center text-slate-500 hover:bg-slate-100"
                    >
                      {r.terlihat ? <Eye className="h-4 w-4 text-blue-700" /> : <EyeOff className="h-4 w-4" />}
                    </button>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-slate-800">{r.nama}</p>
                      <p className="text-[11px] text-slate-500">
                        {r.lebarPx.toLocaleString("id-ID")}×{r.tinggiPx.toLocaleString("id-ID")} px • {r.sumberCrs} •{" "}
                        {r.resolusiLabel}
                        {r.dem && " • DEM 1 band"}
                      </p>
                    </div>
                    <button
                      onClick={() => {
                        hapusRaster(r.id);
                        toast.success("Raster dihapus dari peta");
                      }}
                      title="Hapus raster"
                      className="h-8 w-8 shrink-0 rounded-lg flex items-center justify-center text-red-500 hover:bg-red-50"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] text-slate-500 shrink-0">Opasitas</span>
                    <input
                      type="range"
                      min={0.1}
                      max={1}
                      step={0.05}
                      value={r.opasitas}
                      onChange={(e) => setRasterOpasitas(r.id, parseFloat(e.target.value))}
                      className="flex-1 accent-blue-600"
                    />
                    <span className="text-[11px] text-slate-500 tabular-nums w-9 text-right">
                      {Math.round(r.opasitas * 100)}%
                    </span>
                  </div>
                  {/* status konversi otomatis (piramida detail) */}
                  {r.piramidaId && !r.dem && (
                    r.piramidaSiap ? (
                      <p className="text-[11px] text-emerald-700 bg-emerald-50 rounded-lg px-2 py-1 flex items-start gap-1.5">
                        <Layers className="h-3 w-3 shrink-0 mt-0.5" />
                        <span>
                          Piramida detail siap
                          {r.piramidaUkuranMb
                            ? ` — ±${r.piramidaUkuranMb < 10 ? r.piramidaUkuranMb.toFixed(1) : Math.round(r.piramidaUkuranMb)} MB`
                            : ""}
                          {r.piramidaLevelPx
                            ? ` • tajam s/d ${r.piramidaLevelPx.toLocaleString("id-ID")} px`
                            : ""}
                          {" • "}import ulang file yang sama = instan (cache)
                        </span>
                      </p>
                    ) : r.piramidaGagal ? (
                      <p className="text-[11px] text-slate-500 bg-slate-50 rounded-lg px-2 py-1">
                        Konversi otomatis gagal — pratinjau tetap dipakai
                      </p>
                    ) : (
                      <div className="space-y-1">
                        <div className="h-1.5 w-full rounded-full bg-slate-100 overflow-hidden">
                          <div
                            className="h-full rounded-full bg-emerald-500 transition-all"
                            style={{ width: `${r.piramidaProgres ?? 0}%` }}
                          />
                        </div>
                        <p className="text-[11px] text-slate-500 flex items-center gap-1.5">
                          <LoaderCircle className="h-3 w-3 animate-spin shrink-0" />
                          <span className="min-w-0 truncate">
                            Konversi otomatis {r.piramidaProgres ?? 0}% — {r.piramidaTahap || "menyiapkan…"}
                          </span>
                          <button
                            onClick={() => batalPiramidaRaster(r.id)}
                            className="ml-auto shrink-0 text-red-500 hover:underline"
                          >
                            batalkan
                          </button>
                        </p>
                      </div>
                    )
                  )}
                </div>
              ))}
            </div>
          )}

          <p className="flex items-start gap-2 rounded-xl bg-blue-50 text-blue-900 text-xs px-3 py-2">
            <Info className="h-4 w-4 shrink-0 mt-0.5" />
            <span>
              Raster <b>DEM</b> (1 band) otomatis dikenali — buka menu <b>Elevasi DEM</b> lalu pilih sumber{" "}
              <b>&quot;Dari File Lokal&quot;</b> untuk mengisi elevasi tanpa internet. <b>Konverter otomatis</b> membuat
              piramida detail (±50–200 MB) tersimpan lokal di browser: peta zoom tajam tanpa membaca ulang file asli,
              dan tahan tutup aplikasi — file sama diimpor ulang = langsung pakai cache. Layer raster sendiri tersimpan
              selama aplikasi terbuka; Simpan/Muat proyek tidak menyertakan raster.
            </span>
          </p>
        </div>

        <div className="flex gap-2 justify-end">
          {jalan ? (
            <Button variant="outline" className="rounded-xl" onClick={() => (sinyalBatal.current.dibatalkan = true)}>
              <XCircle className="h-4 w-4" /> Batal
            </Button>
          ) : (
            <Button variant="outline" className="rounded-xl" onClick={tutup}>
              Tutup
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
