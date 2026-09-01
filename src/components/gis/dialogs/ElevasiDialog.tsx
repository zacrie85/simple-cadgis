"use client";

import { useRef, useState } from "react";
import { useGis } from "@/lib/gis/store";
import { isiElevasiKosong, type HasilIsi } from "@/lib/gis/elevasi";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { MountainSnow, LoaderCircle, Info, Play, XCircle } from "lucide-react";

/** Dialog pengisian elevasi otomatis dari DEM satelit (Copernicus GLO-90 via Open-Meteo).
 *  Hanya mengisi titik yang elevasinya masih kosong — data survei tidak ditimpa. */
export default function ElevasiDialog() {
  const open = useGis((s) => s.dialogs.elevasi);
  const setDialog = useGis((s) => s.setDialog);
  const points = useGis((s) => s.points);

  const [jalan, setJalan] = useState(false);
  const [progres, setProgres] = useState({ selesai: 0, total: 0, gagal: 0 });
  const [hasil, setHasil] = useState<HasilIsi | null>(null);
  const sinyalBatal = useRef({ dibatalkan: false });

  if (!open) return null;

  const tanpaElev = points.filter((p) => p.elevation == null).length;
  const sudahElev = points.length - tanpaElev;
  const persen = progres.total > 0 ? Math.round((progres.selesai / progres.total) * 100) : 0;

  const tutup = () => {
    if (jalan) sinyalBatal.current.dibatalkan = true;
    setDialog("elevasi", false);
  };

  const mulai = async () => {
    if (tanpaElev === 0) {
      toast.info("Semua titik sudah punya elevasi");
      return;
    }
    setJalan(true);
    setHasil(null);
    setProgres({ selesai: 0, total: tanpaElev, gagal: 0 });
    sinyalBatal.current = { dibatalkan: false };
    try {
      const h = await isiElevasiKosong(undefined, {
        sinyalBatal: sinyalBatal.current,
        onProgres: setProgres,
      });
      setHasil(h);
      if (h.dibatalkan) toast.warning("Pengambilan elevasi dibatalkan", { description: `${h.diisi} titik sudah terisi.` });
      else if (h.gagal > 0) toast.warning(`${h.diisi} titik terisi, ${h.gagal} gagal`, { description: "Periksa koneksi internet lalu coba lagi untuk yang belum terisi." });
      else toast.success(`${h.diisi} titik terisi elevasi DEM`);
    } catch {
      toast.error("Gagal mengambil elevasi", { description: "Periksa koneksi internet." });
    } finally {
      setJalan(false);
    }
  };

  return (
    <Dialog open onOpenChange={(v) => !v && tutup()}>
      <DialogContent className="rounded-2xl sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MountainSnow className="h-5 w-5 text-primary" />
            Elevasi Otomatis (DEM Satelit)
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3 text-sm">
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="rounded-xl bg-slate-100 px-2 py-2">
              <p className="text-lg font-bold text-slate-800 tabular-nums">{points.length.toLocaleString("id-ID")}</p>
              <p className="text-[11px] text-slate-500">total titik</p>
            </div>
            <div className="rounded-xl bg-emerald-50 px-2 py-2">
              <p className="text-lg font-bold text-emerald-700 tabular-nums">{sudahElev.toLocaleString("id-ID")}</p>
              <p className="text-[11px] text-emerald-600">sudah ada elevasi</p>
            </div>
            <div className="rounded-xl bg-amber-50 px-2 py-2">
              <p className="text-lg font-bold text-amber-700 tabular-nums">{tanpaElev.toLocaleString("id-ID")}</p>
              <p className="text-[11px] text-amber-600">belum ada</p>
            </div>
          </div>

          <p className="flex items-start gap-2 rounded-xl bg-blue-50 text-blue-900 text-xs px-3 py-2">
            <Info className="h-4 w-4 shrink-0 mt-0.5" />
            <span>
              Ketinggian diambil otomatis dari <b>DEM Copernicus (grid ±90 m)</b> via Open-Meteo —
              gratis, untuk seluruh bumi. Hanya titik <b>yang masih kosong</b> yang diisi;
              elevasi hasil survei/m impor <b>tidak ditimpa</b>. Cocok untuk kontur &amp; pratinjau,
              bukan pengganti survei presisi.
            </span>
          </p>

          {jalan && (
            <div className="space-y-1.5">
              <div className="h-2.5 w-full rounded-full bg-slate-100 overflow-hidden">
                <div className="h-full rounded-full bg-blue-600 transition-all" style={{ width: `${persen}%` }} />
              </div>
              <p className="text-xs text-slate-500 flex items-center gap-1.5">
                <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
                Mengambil elevasi… {progres.selesai.toLocaleString("id-ID")} / {progres.total.toLocaleString("id-ID")} titik ({persen}%)
                {progres.gagal > 0 && <span className="text-red-500">• {progres.gagal} gagal</span>}
              </p>
            </div>
          )}

          {hasil && !jalan && (
            <p className={`rounded-xl px-3 py-2 text-xs ${hasil.gagal === 0 ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-800"}`}>
              Selesai: <b>{hasil.diisi.toLocaleString("id-ID")}</b> titik terisi elevasi
              {hasil.gagal > 0 && <>, <b>{hasil.gagal.toLocaleString("id-ID")}</b> gagal (coba lagi untuk mengulang yang belum)</>}
              {hasil.dibatalkan && <> — dibatalkan, sisa bisa diulang kapan saja</>}
            </p>
          )}
        </div>

        <div className="flex gap-2 justify-end">
          {jalan ? (
            <Button variant="outline" className="rounded-xl" onClick={() => (sinyalBatal.current.dibatalkan = true)}>
              <XCircle className="h-4 w-4" /> Batal
            </Button>
          ) : (
            <>
              <Button variant="outline" className="rounded-xl" onClick={tutup}>
                Tutup
              </Button>
              <Button className="rounded-xl" onClick={mulai} disabled={tanpaElev === 0}>
                <Play className="h-4 w-4" />
                {tanpaElev > 0 ? `Isi ${tanpaElev.toLocaleString("id-ID")} Titik` : "Semua Terisi"}
              </Button>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
