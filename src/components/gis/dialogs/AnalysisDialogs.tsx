"use client";

import { useMemo, useRef, useState } from "react";
import { useGis } from "@/lib/gis/store";
import { simpanGridCache, type TitikElevasi } from "@/lib/gis/contours";
import { hitungVolume } from "@/lib/gis/volumes";
import { fmtAngka, fmtLuas, uid } from "@/lib/gis/geo";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Mountain, Loader2, Calculator, Trash2 } from "lucide-react";

const INTERVAL_METER = [1, 3, 5, 7, 10, 30, 50, 70, 100];

/** Dialog pembuatan kontur (otomatis / interval manual) + daftar layer kontur.
 *  Komputasi berat berjalan di Web Worker — aplikasi tetap responsif. */
export function ContourDialog() {
  const open = useGis((s) => s.dialogs.contour);
  const setDialog = useGis((s) => s.setDialog);
  const points = useGis((s) => s.points);
  const contours = useGis((s) => s.contours);

  const [mode, setMode] = useState<"otomatis" | "manual">("otomatis");
  const [interval, setInterval] = useState<number>(5);
  const [intervalCustom, setIntervalCustom] = useState("");
  const [proses, setProses] = useState(false);
  const [progres, setProgres] = useState({ persen: 0, tahap: "" });
  const workerRef = useRef<Worker | null>(null);

  const titikElev: TitikElevasi[] = useMemo(
    () =>
      points
        .filter((p) => typeof p.elevation === "number" && p.elevation !== null)
        .map((p) => ({ lat: p.lat, lng: p.lng, elev: p.elevation as number })),
    [points]
  );

  if (!open) return null;

  const hentikanWorker = () => {
    workerRef.current?.terminate();
    workerRef.current = null;
  };

  const tutup = () => {
    if (proses) {
      hentikanWorker();
      setProses(false);
    }
    setDialog("contour", false);
  };

  const buat = () => {
    if (titikElev.length < 3) {
      toast.error("Titik elevasi kurang", {
        description: "Minimal 3 titik dengan ketinggian. Isi kolom elevasi saat menambah titik, atau pilih kolom elevasi saat impor Excel.",
      });
      return;
    }
    const intervalFinal =
      mode === "otomatis" ? null : intervalCustom.trim() !== "" ? parseFloat(intervalCustom.replace(",", ".")) : interval;
    if (mode === "manual" && (!intervalFinal || intervalFinal <= 0)) {
      toast.error("Interval tidak valid");
      return;
    }
    hentikanWorker();
    setProses(true);
    setProgres({ persen: 0, tahap: "Memulai…" });

    const wk = new Worker(new URL("../../../workers/kontur-worker.ts", import.meta.url));
    workerRef.current = wk;
    wk.onmessage = (e: MessageEvent) => {
      const m = e.data as
        | { type: "progres"; persen: number; tahap: string }
        | {
            type: "hasil";
            paths: { elev: number; coords: { lat: number; lng: number }[] }[];
            levels: number[];
            grid: { minLat: number; maxLat: number; minLng: number; maxLng: number; w: number; h: number; values: Float64Array };
          }
        | { type: "error"; message: string };
      if (m.type === "progres") {
        setProgres({ persen: m.persen, tahap: m.tahap });
        return;
      }
      hentikanWorker();
      if (m.type === "error") {
        toast.error("Gagal membuat kontur", { description: m.message });
        setProses(false);
        return;
      }
      // hasil — isi cache grid (dipakai 3D & volume) lalu simpan layer kontur
      simpanGridCache({
        bbox: { minLat: m.grid.minLat, maxLat: m.grid.maxLat, minLng: m.grid.minLng, maxLng: m.grid.maxLng },
        w: m.grid.w,
        h: m.grid.h,
        values: m.grid.values,
      });
      if (m.paths.length === 0) {
        toast.error("Tidak ada garis kontur terbentuk", { description: "Rentang elevasi terlalu kecil atau titik terlalu berdekatan." });
        setProses(false);
        return;
      }
      useGis.getState().addContours({
        id: uid("kontur"),
        interval: intervalFinal ?? 0,
        levels: m.levels,
        paths: m.paths,
        createdAt: Date.now(),
        visible: true,
      });
      toast.success(`Kontur dibuat: ${m.paths.length} garis`, {
        description: intervalFinal ? `Interval ${intervalFinal} m • ${m.levels.length} level elevasi` : "Mode otomatis (±10 level)",
      });
      setProses(false);
      tutup();
    };
    wk.onerror = (e) => {
      hentikanWorker();
      toast.error("Gagal membuat kontur", { description: e.message || "Worker gagal dimuat." });
      setProses(false);
    };
    wk.postMessage({ type: "hitung", titik: titikElev, interval: intervalFinal });
  };

  // reduce (bukan Math.min(...arr)) — aman untuk puluhan ribu titik
  const eMin = titikElev.length ? titikElev.reduce((m, t) => Math.min(m, t.elev), Infinity) : 0;
  const eMax = titikElev.length ? titikElev.reduce((m, t) => Math.max(m, t.elev), -Infinity) : 0;

  return (
    <Dialog open onOpenChange={(v) => !v && tutup()}>
      <DialogContent className="rounded-2xl sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mountain className="h-5 w-5 text-primary" />
            Buat Kontur
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-xl bg-blue-50 border border-blue-100 px-3 py-2.5 text-sm">
            Titik berketinggian tersedia: <b>{titikElev.length}</b>
            {titikElev.length > 0 && (
              <span className="text-slate-500"> • rentang {fmtAngka(eMin, 1)} – {fmtAngka(eMax, 1)} m</span>
            )}
          </div>

          <div className="space-y-2">
            <Label>Mode interval</Label>
            <div className="flex gap-4 text-sm">
              <label className="flex items-center gap-1.5">
                <input type="radio" checked={mode === "otomatis"} onChange={() => setMode("otomatis")} />
                Otomatis (±10 level)
              </label>
              <label className="flex items-center gap-1.5">
                <input type="radio" checked={mode === "manual"} onChange={() => setMode("manual")} />
                Manual
              </label>
            </div>
          </div>

          {mode === "manual" && (
            <div className="space-y-2.5">
              <Label>Interval kontur (meter)</Label>
              <div className="flex flex-wrap gap-1.5">
                {INTERVAL_METER.map((n) => (
                  <button
                    key={n}
                    onClick={() => {
                      setInterval(n);
                      setIntervalCustom("");
                    }}
                    aria-pressed={interval === n && intervalCustom === ""}
                    className={`rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors ${
                      interval === n && intervalCustom === ""
                        ? "bg-blue-600 text-white border-blue-600"
                        : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
                    }`}
                  >
                    {n} m
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-500">Atau nilai bebas:</span>
                <Input
                  type="number"
                  step="0.1"
                  className="rounded-xl h-8 w-28"
                  placeholder="misal 2.5"
                  value={intervalCustom}
                  onChange={(e) => setIntervalCustom(e.target.value)}
                />
                <span className="text-xs text-slate-400">meter</span>
              </div>
            </div>
          )}

          {contours.length > 0 && (
            <div className="space-y-1.5">
              <Label>Layer kontur tersimpan</Label>
              <ul className="space-y-1 max-h-32 overflow-y-auto scrollbar-halus pr-1">
                {contours.map((c) => (
                  <li key={c.id} className="flex items-center gap-2 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs">
                    <label className="flex items-center gap-1.5 flex-1 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={c.visible}
                        onChange={() => useGis.getState().toggleContourVisible(c.id)}
                      />
                      Interval {c.interval > 0 ? `${c.interval} m` : "otomatis"} • {c.paths.length} garis
                    </label>
                    <button
                      onClick={() => {
                        useGis.getState().removeContours(c.id);
                        toast.success("Layer kontur dihapus");
                      }}
                      aria-label="Hapus layer kontur"
                      className="text-slate-400 hover:text-red-600"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {proses && (
          <div className="space-y-1.5">
            <div className="h-2.5 w-full rounded-full bg-slate-100 overflow-hidden">
              <div
                className="h-full rounded-full bg-gradient-to-r from-blue-600 to-sky-400 transition-all"
                style={{ width: `${progres.persen}%` }}
              />
            </div>
            <p className="text-xs text-slate-500 flex items-center gap-1.5">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              {progres.tahap || "Menghitung…"} {progres.persen}% — dihitung di latar belakang, peta tetap bisa digerakkan
            </p>
          </div>
        )}

        <DialogFooter className="gap-2">
          <Button variant="outline" className="rounded-xl" onClick={tutup}>
            {proses ? "Batalkan" : "Tutup"}
          </Button>
          <Button className="rounded-xl" onClick={buat} disabled={proses}>
            {proses ? <Loader2 className="h-4 w-4 animate-spin" /> : "Buat Kontur"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Dialog perhitungan cut & fill / overburden dalam poligon. */
export function VolumeDialog() {
  const open = useGis((s) => s.dialogs.volume);
  const setDialog = useGis((s) => s.setDialog);
  const shapes = useGis((s) => s.shapes);
  const points = useGis((s) => s.points);

  const [shapeId, setShapeId] = useState("");
  const [elevRencana, setElevRencana] = useState("");
  const [elevSeam, setElevSeam] = useState("");
  const [hasil, setHasil] = useState<ReturnType<typeof hitungVolume> | null>(null);
  const [proses, setProses] = useState(false);

  const poligon = shapes.filter((s) => s.kind === "closed");
  const titikElev = points
    .filter((p) => typeof p.elevation === "number" && p.elevation !== null)
    .map((p) => ({ lat: p.lat, lng: p.lng, elev: p.elevation as number }));

  if (!open) return null;

  const tutup = () => setDialog("volume", false);

  const hitung = () => {
    const sh = poligon.find((p) => p.id === shapeId);
    const e = parseFloat(elevRencana.replace(",", "."));
    if (!sh) {
      toast.error("Pilih poligon terlebih dahulu");
      return;
    }
    if (isNaN(e)) {
      toast.error("Elevasi rencana wajib diisi (angka)");
      return;
    }
    if (titikElev.length < 3) {
      toast.error("Titik elevasi kurang", { description: "Minimal 3 titik berketinggian untuk interpolasi topografi." });
      return;
    }
    const seam = elevSeam.trim() === "" ? null : parseFloat(elevSeam.replace(",", "."));
    setProses(true);
    setTimeout(() => {
      try {
        const h = hitungVolume(sh.vertices, titikElev, e, seam != null && !isNaN(seam) ? seam : null);
        setHasil(h);
      } catch (err) {
        toast.error("Gagal menghitung", { description: err instanceof Error ? err.message : String(err) });
      } finally {
        setProses(false);
      }
    }, 50);
  };

  const simpanKeDeskripsi = () => {
    if (!hasil || !shapeId) return;
    const sh = poligon.find((p) => p.id === shapeId);
    if (!sh) return;
    const teks = `Cut: ${fmtAngka(hasil.cutM3, 1)} m³ | Fill: ${fmtAngka(hasil.fillM3, 1)} m³ | Net: ${fmtAngka(hasil.netM3, 1)} m³ (elev. rencana ${elevRencana} m)`;
    useGis.getState().updateShape(sh.id, {
      description: sh.description ? `${sh.description}\n${teks}` : teks,
    });
    toast.success("Hasil disimpan ke deskripsi poligon");
  };

  return (
    <Dialog open onOpenChange={(v) => !v && tutup()}>
      <DialogContent className="rounded-2xl sm:max-w-md max-h-[85vh] overflow-y-auto scrollbar-halus">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Calculator className="h-5 w-5 text-primary" />
            Hitung Volume — Cut &amp; Fill / Overburden
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3.5">
          <div className="space-y-1.5">
            <Label>Poligon area</Label>
            <select
              value={shapeId}
              onChange={(e) => setShapeId(e.target.value)}
              className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm bg-white"
            >
              <option value="">— Pilih poligon tertutup —</option>
              {poligon.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.title} ({p.vertices.length} titik)
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="vol-rencana">Elevasi rencana / seam (m)</Label>
              <Input id="vol-rencana" type="number" step="0.01" className="rounded-xl" value={elevRencana} onChange={(e) => setElevRencana(e.target.value)} placeholder="misal 340" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="vol-seam">Elevasi seam / lapisan (opsional)</Label>
              <Input id="vol-seam" type="number" step="0.01" className="rounded-xl" value={elevSeam} onChange={(e) => setElevSeam(e.target.value)} placeholder="untuk overburden" />
            </div>
          </div>
          <p className="text-xs text-slate-400">
            Topografi diinterpolasi dari {titikElev.length} titik elevasi (metode IDW), lalu dibandingkan dengan elevasi rencana di dalam poligon.
          </p>

          {hasil && (
            <div className="rounded-xl border border-slate-200 divide-y text-sm">
              <div className="flex justify-between px-3 py-2">
                <span className="text-slate-500">Luas poligon</span>
                <b>{fmtLuas(hasil.luasM2)}</b>
              </div>
              <div className="flex justify-between px-3 py-2">
                <span className="text-slate-500">Cut (galian)</span>
                <b className="text-red-600">{fmtAngka(hasil.cutM3, 1)} m³</b>
              </div>
              <div className="flex justify-between px-3 py-2">
                <span className="text-slate-500">Fill (timbunan)</span>
                <b className="text-emerald-600">{fmtAngka(hasil.fillM3, 1)} m³</b>
              </div>
              <div className="flex justify-between px-3 py-2">
                <span className="text-slate-500">Net (cut − fill)</span>
                <b>{fmtAngka(hasil.netM3, 1)} m³</b>
              </div>
              {hasil.overburdenM3 > 0 && (
                <div className="flex justify-between px-3 py-2 bg-amber-50">
                  <span className="text-slate-600">Overburden</span>
                  <b className="text-amber-700">{fmtAngka(hasil.overburdenM3, 1)} m³</b>
                </div>
              )}
              <div className="flex justify-between px-3 py-2">
                <span className="text-slate-500">Elevasi topografi (min–rata–maks)</span>
                <b className="text-xs">
                  {fmtAngka(hasil.elevasiMin, 1)} / {fmtAngka(hasil.elevasiRata, 1)} / {fmtAngka(hasil.elevasiMax, 1)} m
                </b>
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          {hasil && (
            <Button variant="outline" className="rounded-xl mr-auto" onClick={simpanKeDeskripsi}>
              Simpan ke Poligon
            </Button>
          )}
          <Button variant="outline" className="rounded-xl" onClick={tutup}>
            Tutup
          </Button>
          <Button className="rounded-xl" onClick={hitung} disabled={proses}>
            {proses ? <Loader2 className="h-4 w-4 animate-spin" /> : "Hitung"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
