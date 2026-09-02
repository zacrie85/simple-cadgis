"use client";

import { useMemo } from "react";
import { useGis, PERF_DEFAULT, type PerfState } from "@/lib/gis/store";
import { simpanPerf } from "@/lib/gis/proyek";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Gauge, Zap, Trash2, Info, CheckCircle2, RotateCcw } from "lucide-react";

const BATAS_RENDER = [3000, 8000, 15000, 20000, 999999];
const BATAS_LABEL = [200, 500, 1000, 999999];

const fmt = (n: number) => n.toLocaleString("id-ID");
const tampilBatas = (n: number) => (n >= 999999 ? "Semua" : fmt(n));

/** Menu "Optimasi" — kendali manual performa aplikasi: batas render titik,
 *  batas label peta, animasi, dan pembersihan cache. Preferensi tersimpan
 *  otomatis di browser dan langsung diterapkan ke peta. */
export default function OptimasiDialog() {
  const open = useGis((s) => s.dialogs.optimasi);
  const setDialog = useGis((s) => s.setDialog);
  const points = useGis((s) => s.points);
  const shapes = useGis((s) => s.shapes);
  const contours = useGis((s) => s.contours);
  const labelMode = useGis((s) => s.labelMode);
  const setLabelMode = useGis((s) => s.setLabelMode);
  const perf = useGis((s) => s.perf);
  const setPerf = useGis((s) => s.setPerf);

  const terapkan = (patch: Partial<PerfState>) => {
    setPerf(patch);
    simpanPerf({ ...useGis.getState().perf, ...patch });
  };

  const dirender = Math.min(points.length, 20000, perf.batasRender);

  const jumlahLabel = useMemo(() => {
    if (labelMode === "sembunyi") return 0;
    let n = 0;
    if (labelMode === "semua") {
      for (const p of points) if (p.title) n++;
      for (const sh of shapes) if (sh.title) n++;
    } else {
      for (const p of points) if (p.labelTampil && p.title) n++;
      for (const sh of shapes) if (sh.labelTampil && sh.title) n++;
    }
    return n;
  }, [points, shapes, labelMode]);

  const jumlahKontur = useMemo(
    () => contours.reduce((n, c) => (c.visible ? n + c.paths.length : n), 0),
    [contours]
  );

  const labelDipotong = Math.min(jumlahLabel, perf.batasLabel);
  const modeRinganAktif =
    perf.batasRender <= 8000 && perf.batasLabel <= 1000 && !perf.animasi;

  if (!open) return null;

  const tutup = () => setDialog("optimasi", false);

  const modeRingan = () => {
    if (modeRinganAktif) {
      terapkan({ ...PERF_DEFAULT });
      toast.success("Mode normal dikembalikan", {
        description: "Render penuh (20.000 titik), label maks 1.000, animasi aktif.",
      });
    } else {
      terapkan({ batasRender: Math.min(perf.batasRender, 8000), batasLabel: Math.min(perf.batasLabel, 500), animasi: false });
      toast.success("MODE RINGAN aktif", {
        description: "Peta dirender lebih sedikit & tanpa animasi — seharusnya terasa jauh lebih enteng.",
      });
    }
  };

  const bersihkanCache = () => {
    window.dispatchEvent(new CustomEvent("geokita-bersihkan-cache"));
    toast.success("Cache tile peta dibersihkan", {
      description: "Tile peta di luar layar dilepas dari memori. Tile baru diunduh ulang saat peta digeser.",
    });
  };

  return (
    <Dialog open onOpenChange={(v) => !v && tutup()}>
      <DialogContent className="rounded-2xl sm:max-w-md max-h-[88vh] overflow-y-auto scrollbar-halus">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Gauge className="h-5 w-5 text-primary" />
            Optimasi Performa
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3.5 text-sm">
          {/* Status beban saat ini */}
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
              <span className="text-slate-400">Titik di peta</span>
              <p className="text-sm font-bold text-slate-700 tabular-nums">{fmt(dirender)}{dirender < points.length ? ` / ${fmt(points.length)}` : ""}</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
              <span className="text-slate-400">Poligon / garis</span>
              <p className="text-sm font-bold text-slate-700 tabular-nums">{fmt(shapes.length)}</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
              <span className="text-slate-400">Label tampil</span>
              <p className="text-sm font-bold text-slate-700 tabular-nums">
                {labelMode === "sembunyi" ? "0 (mode sembunyi)" : `${fmt(labelDipotong)}${jumlahLabel > labelDipotong ? ` dari ${fmt(jumlahLabel)}` : ""}`}
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
              <span className="text-slate-400">Garis kontur</span>
              <p className="text-sm font-bold text-slate-700 tabular-nums">{fmt(jumlahKontur)}</p>
            </div>
          </div>

          {/* Peringatan label banyak */}
          {labelMode !== "sembunyi" && jumlahLabel > 1000 && (
            <div className="flex items-start gap-2 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs px-3 py-2">
              <Info className="h-4 w-4 shrink-0 mt-0.5" />
              <div className="space-y-1.5">
                <p>
                  <b>{fmt(jumlahLabel)} label nama</b> mengikuti mode label &quot;{labelMode === "semua" ? "Semua" : "Terpilih"}&quot;.
                  Ribuan label adalah penyebab UTAMA peta terasa berat saat digeser.
                </p>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 rounded-lg text-xs border-amber-300 text-amber-900 hover:bg-amber-100"
                  onClick={() => {
                    setLabelMode("terpilih");
                    toast.success("Label diganti ke mode Terpilih", {
                      description: "Hanya fitur yang ditandai (tombol 🏷) yang menampilkan nama.",
                    });
                  }}
                >
                  <CheckCircle2 className="h-3.5 w-3.5" /> Ganti ke mode Terpilih
                </Button>
              </div>
            </div>
          )}

          {/* Mode ringan */}
          <button
            onClick={modeRingan}
            className={`w-full flex items-center gap-3 rounded-xl border-2 px-4 py-3 text-left transition-colors ${
              modeRinganAktif
                ? "border-emerald-400 bg-emerald-50 hover:bg-emerald-100"
                : "border-blue-200 bg-blue-50/60 hover:bg-blue-100"
            }`}
          >
            <Zap className={`h-6 w-6 shrink-0 ${modeRinganAktif ? "text-emerald-600" : "text-blue-600"}`} />
            <span className="flex-1">
              <span className="block text-sm font-bold text-slate-800">
                {modeRinganAktif ? "MODE RINGAN AKTIF — klik untuk kembali normal" : "MODE RINGAN — sekali klik, peta langsung lebih enteng"}
              </span>
              <span className="block text-xs text-slate-500 mt-0.5">
                Batasi render 8.000 titik • label maks 500 • animasi dimatikan. Semua data tetap utuh di tabel, analisis & ekspor.
              </span>
            </span>
          </button>

          {/* Pengaturan rinci */}
          <div className="space-y-2.5">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Pengaturan rinci</p>

            <label className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 px-3 py-2 text-xs">
              <span className="text-slate-600">
                Batas titik dirender ke peta
                <span className="block text-[11px] text-slate-400">Data lengkap tetap di tabel, analisis &amp; ekspor</span>
              </span>
              <select
                value={perf.batasRender}
                onChange={(e) => terapkan({ batasRender: Number(e.target.value) })}
                className="shrink-0 rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs"
                aria-label="Batas titik dirender"
              >
                {BATAS_RENDER.map((n) => (
                  <option key={n} value={n}>{tampilBatas(n)}</option>
                ))}
              </select>
            </label>

            <label className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 px-3 py-2 text-xs">
              <span className="text-slate-600">
                Batas label nama di peta
                <span className="block text-[11px] text-slate-400">Makin sedikit label = geser/zoom makin mulus</span>
              </span>
              <select
                value={perf.batasLabel}
                onChange={(e) => terapkan({ batasLabel: Number(e.target.value) })}
                className="shrink-0 rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs"
                aria-label="Batas label"
              >
                {BATAS_LABEL.map((n) => (
                  <option key={n} value={n}>{tampilBatas(n)}</option>
                ))}
              </select>
            </label>

            <label className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 px-3 py-2 text-xs cursor-pointer">
              <span className="text-slate-600">
                Animasi peta (zoom halus, inersia geser)
                <span className="block text-[11px] text-slate-400">Dimatikan = zoom instan, cocok untuk PC lama</span>
              </span>
              <input
                type="checkbox"
                checked={perf.animasi}
                onChange={(e) => terapkan({ animasi: e.target.checked })}
                className="h-4 w-4 accent-blue-600 shrink-0"
                aria-label="Animasi peta"
              />
            </label>
          </div>

          {/* Pembersihan cache */}
          <Button variant="outline" className="w-full rounded-xl" onClick={bersihkanCache}>
            <Trash2 className="h-4 w-4" /> Bersihkan Cache Tile Peta
          </Button>

          <button
            onClick={() => {
              terapkan({ ...PERF_DEFAULT });
              toast.info("Preferensi performa kembali ke bawaan");
            }}
            className="w-full text-xs text-slate-400 hover:text-slate-600 flex items-center justify-center gap-1.5"
          >
            <RotateCcw className="h-3 w-3" /> Kembalikan semua ke bawaan
          </button>

          <p className="flex items-start gap-2 rounded-xl bg-blue-50 text-blue-900 text-xs px-3 py-2">
            <Info className="h-4 w-4 shrink-0 mt-0.5" />
            <span>
              Preferensi tersimpan otomatis di browser ini dan langsung berlaku — tidak perlu muat ulang.
              Data tidak pernah dipotong: batas hanya untuk TAMPILAN peta.
            </span>
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
