"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useGis } from "@/lib/gis/store";
import { isiElevasiKosong, type HasilIsi } from "@/lib/gis/elevasi";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { MountainSnow, LoaderCircle, Info, Play, XCircle, SquareDashedMousePointer } from "lucide-react";

type Cakupan = "semua" | "terpilih";

/** Dialog pengisian elevasi otomatis dari DEM satelit (Copernicus GLO-90 via Open-Meteo).
 *  Hanya mengisi titik yang elevasinya masih kosong — data survei tidak ditimpa.
 *  Cakupan bisa dipilih: SEMUA titik, atau HANYA titik terpilih (hasil Blok /
 *  centang Tabel Data) — praktis untuk data puluhan ribu titik. */
export default function ElevasiDialog() {
  const open = useGis((s) => s.dialogs.elevasi);
  const setDialog = useGis((s) => s.setDialog);
  const points = useGis((s) => s.points);
  const selection = useGis((s) => s.selection);

  const [jalan, setJalan] = useState(false);
  const [progres, setProgres] = useState({ selesai: 0, total: 0, gagal: 0 });
  const [hasil, setHasil] = useState<HasilIsi | null>(null);
  const [cakupan, setCakupan] = useState<Cakupan>("semua");
  const sinyalBatal = useRef({ dibatalkan: false });

  // jumlah titik tanpa elevasi — loop (bukan filter spread) hemat memori utk 30rb+ titik
  const tanpaElev = useMemo(() => {
    let n = 0;
    for (const p of points) if (p.elevation == null) n++;
    return n;
  }, [points]);

  // ringkasan seleksi: selection bisa berisi id bentuk/label — hitung hanya titik
  const infoTerpilih = useMemo(() => {
    const kumpulan = new Set(selection);
    let total = 0;
    let kosong = 0;
    for (const p of points) {
      if (!kumpulan.has(p.id)) continue;
      total++;
      if (p.elevation == null) kosong++;
    }
    return { total, kosong };
  }, [points, selection]);

  // default cerdas tiap kali dialog DIBUKA: bila ada titik terpilih yang masih
  // kosong elevasinya → langsung fokus ke "Hanya titik terpilih"
  const terbuka = useRef(false);
  useEffect(() => {
    if (open && !terbuka.current) {
      const st = useGis.getState();
      const kumpulan = new Set(st.selection);
      let kosong = 0;
      for (const p of st.points) {
        if (kumpulan.has(p.id) && p.elevation == null) kosong++;
      }
      setCakupan(kosong > 0 ? "terpilih" : "semua");
      setHasil(null);
    }
    terbuka.current = open;
  }, [open]);

  if (!open) return null;

  const sudahElev = points.length - tanpaElev;
  const persen = progres.total > 0 ? Math.round((progres.selesai / progres.total) * 100) : 0;
  const targetKosong = cakupan === "terpilih" ? infoTerpilih.kosong : tanpaElev;

  const tutup = () => {
    if (jalan) sinyalBatal.current.dibatalkan = true;
    setDialog("elevasi", false);
  };

  const mulai = async () => {
    if (cakupan === "terpilih" && infoTerpilih.kosong === 0) {
      toast.info("Semua titik terpilih sudah punya elevasi");
      return;
    }
    if (cakupan === "semua" && tanpaElev === 0) {
      toast.info("Semua titik sudah punya elevasi");
      return;
    }
    // cakupan & daftar id DIKUNCI saat tombol ditekan — perubahan seleksi
    // di tengah proses tidak mengubah target yang sedang berjalan
    let ids: string[] | undefined;
    if (cakupan === "terpilih") {
      const kumpulan = new Set(selection);
      ids = [];
      for (const p of points) {
        if (kumpulan.has(p.id)) ids.push(p.id);
      }
    }
    const total = cakupan === "terpilih" ? infoTerpilih.kosong : tanpaElev;
    setJalan(true);
    setHasil(null);
    setProgres({ selesai: 0, total, gagal: 0 });
    sinyalBatal.current = { dibatalkan: false };
    try {
      const h = await isiElevasiKosong(ids, {
        sinyalBatal: sinyalBatal.current,
        onProgres: setProgres,
      });
      setHasil(h);
      if (h.dibatalkan) toast.warning("Pengambilan elevasi dibatalkan", { description: `${h.diisi} titik sudah terisi.` });
      else if (h.gagal > 0) toast.warning(`${h.diisi} titik terisi, ${h.gagal} gagal`, { description: "Periksa koneksi internet lalu coba lagi untuk yang belum terisi." });
      else if (cakupan === "terpilih") toast.success(`${h.diisi} titik terpilih terisi elevasi DEM`, { description: "Hanya titik yang di-blok yang diisi." });
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

          <div className="space-y-1.5">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Cakupan pengisian</p>
            <label
              className={`flex items-start gap-2.5 rounded-xl border px-3 py-2.5 cursor-pointer transition-colors ${
                cakupan === "semua" ? "border-blue-400 bg-blue-50" : "border-slate-200 hover:bg-slate-50"
              } ${jalan ? "pointer-events-none opacity-70" : ""}`}
            >
              <input
                type="radio"
                name="cakupan-elevasi"
                className="mt-0.5 h-4 w-4 accent-blue-600"
                checked={cakupan === "semua"}
                onChange={() => setCakupan("semua")}
              />
              <span className="text-sm">
                <b>Semua titik</b>
                <span className="block text-xs text-slate-500">
                  {tanpaElev.toLocaleString("id-ID")} titik belum ada elevasi
                </span>
              </span>
            </label>
            <label
              className={`flex items-start gap-2.5 rounded-xl border px-3 py-2.5 transition-colors ${
                cakupan === "terpilih" ? "border-blue-400 bg-blue-50" : "border-slate-200"
              } ${
                jalan || infoTerpilih.total === 0
                  ? "opacity-50"
                  : "cursor-pointer hover:bg-slate-50"
              }`}
            >
              <input
                type="radio"
                name="cakupan-elevasi"
                className="mt-0.5 h-4 w-4 accent-blue-600"
                checked={cakupan === "terpilih"}
                disabled={jalan || infoTerpilih.total === 0}
                onChange={() => setCakupan("terpilih")}
              />
              <span className="text-sm">
                <b>Hanya titik terpilih</b>
                <span className="block text-xs text-slate-500">
                  {infoTerpilih.total === 0
                    ? "belum ada titik yang di-blok"
                    : `${infoTerpilih.total.toLocaleString("id-ID")} titik di-blok • ${infoTerpilih.kosong.toLocaleString("id-ID")} belum ada elevasi`}
                </span>
              </span>
            </label>
            {infoTerpilih.total === 0 && (
              <p className="flex items-start gap-1.5 text-xs text-slate-400 px-1">
                <SquareDashedMousePointer className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                <span>
                  Untuk mengisi sebagian saja: aktifkan tombol <b>Blok</b> lalu seret kotak pada titik yang diinginkan
                  (atau centang baris di Tabel Data), lalu buka menu ini lagi.
                </span>
              </p>
            )}
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
              {hasil.dibatalkan
                ? <> — <b>{hasil.gagal.toLocaleString("id-ID")}</b> titik belum diproses karena dibatalkan (bisa dilanjutkan kapan saja)</>
                : hasil.gagal > 0 && <>, <b>{hasil.gagal.toLocaleString("id-ID")}</b> gagal (coba lagi untuk mengulang yang belum)</>}
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
              <Button className="rounded-xl" onClick={mulai} disabled={targetKosong === 0}>
                <Play className="h-4 w-4" />
                {targetKosong > 0
                  ? cakupan === "terpilih"
                    ? `Isi ${targetKosong.toLocaleString("id-ID")} Titik Terpilih`
                    : `Isi ${targetKosong.toLocaleString("id-ID")} Titik`
                  : cakupan === "terpilih"
                    ? "Terpilih Sudah Terisi"
                    : "Semua Terisi"}
              </Button>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
