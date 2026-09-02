"use client";

import { useEffect, useRef, useState } from "react";
import { useGis } from "@/lib/gis/store";
import {
  bangunProyek,
  bacaFileProyek,
  bacaSesiTersimpan,
  hapusSesi,
  simpanSesiOtomatis,
  unduhProyek,
} from "@/lib/gis/proyek";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Save, FolderOpen, FileJson, History, Trash2, LoaderCircle } from "lucide-react";
import type { ProyekData } from "@/lib/gis/types";

// ================= Dialog Simpan Proyek =================

export function SimpanProyekDialog() {
  const open = useGis((s) => s.dialogs.simpan);
  const setDialog = useGis((s) => s.setDialog);
  const points = useGis((s) => s.points);
  const shapes = useGis((s) => s.shapes);
  const labels = useGis((s) => s.labels);
  const contours = useGis((s) => s.contours);
  const layers = useGis((s) => s.layers);

  const [nama, setNama] = useState(() => `Proyek-${new Date().toISOString().slice(0, 10)}`);

  if (!open) return null;

  const tutup = () => setDialog("simpan", false);
  const adaFoto = points.some((p) => !!p.photo);
  const ukuranKira = Math.round(JSON.stringify(bangunProyek(nama)).length / 1024);

  const simpan = () => {
    const file = unduhProyek(nama);
    tutup();
    toast.success("Proyek tersimpan", {
      description: `${file} — ${points.length.toLocaleString("id-ID")} titik, ${shapes.length.toLocaleString("id-ID")} bentuk, ${layers.length} layer${contours.length ? `, ${contours.length} kontur` : ""}.`,
    });
  };

  return (
    <Dialog open onOpenChange={(v) => !v && tutup()}>
      <DialogContent className="rounded-2xl sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Save className="h-5 w-5 text-blue-700" /> Simpan Proyek
          </DialogTitle>
        </DialogHeader>
        <p className="text-xs text-slate-500 -mt-1">
          Seluruh pekerjaan (layer, titik, bentuk, label, kontur, posisi peta) disimpan dalam <b>satu file</b> yang bisa dibuka lagi lewat menu <b>Muat</b>.
        </p>
        <label className="text-xs font-medium text-slate-600">Nama proyek</label>
        <Input value={nama} onChange={(e) => setNama(e.target.value)} placeholder="Proyek-2026" onKeyDown={(e) => e.key === "Enter" && simpan()} />
        <div className="text-xs text-slate-500 bg-slate-50 rounded-lg p-3 space-y-0.5">
          <p>• {points.length.toLocaleString("id-ID")} titik • {shapes.length.toLocaleString("id-ID")} poligon/garis • {labels.length.toLocaleString("id-ID")} label</p>
          <p>• {layers.length} layer{contours.length > 0 ? ` • ${contours.length} layer kontur` : ""} • ukuran ± {ukuranKira.toLocaleString("id-ID")} KB</p>
          {adaFoto && <p className="text-amber-600">• Foto titik ikut disimpan — membuat file lebih besar.</p>}
        </div>
        <div className="flex gap-2 justify-end">
          <Button variant="outline" onClick={tutup}>Batal</Button>
          <Button onClick={simpan} className="bg-blue-700 hover:bg-blue-800 text-white">
            <FileJson className="h-4 w-4" /> Unduh File Proyek
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ================= Dialog Muat Proyek =================

export function MuatProyekDialog() {
  const open = useGis((s) => s.dialogs.muat);
  const setDialog = useGis((s) => s.setDialog);
  const muatProyekData = useGis((s) => s.muatProyekData);
  const fitData = useGis((s) => s.fitData);

  const [data, setData] = useState<ProyekData | null>(null);
  const [baca, setBaca] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  if (!open) return null;

  const tutup = () => { setData(null); setBaca(false); setDialog("muat", false); };

  const pilihFile = async (f: File | undefined) => {
    if (!f) return;
    setBaca(true);
    try {
      const d = await bacaFileProyek(f);
      setData(d);
    } catch (e) {
      toast.error("Gagal membaca proyek", { description: e instanceof Error ? e.message : "File tidak valid." });
    } finally {
      setBaca(false);
    }
  };

  const terapkan = (mode: "ganti" | "gabung") => {
    if (!data) return;
    const h = muatProyekData(data, mode);
    tutup();
    fitData();
    toast.success(mode === "ganti" ? "Proyek dimuat (ganti semua)" : "Proyek digabungkan", {
      description: `${h.titik.toLocaleString("id-ID")} titik, ${h.bentuk.toLocaleString("id-ID")} bentuk, ${h.layer} layer${h.kontur ? `, ${h.kontur} kontur` : ""}.`,
    });
  };

  return (
    <Dialog open onOpenChange={(v) => !v && tutup()}>
      <DialogContent className="rounded-2xl sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FolderOpen className="h-5 w-5 text-blue-700" /> Muat Proyek
          </DialogTitle>
        </DialogHeader>

        {!data ? (
          <>
            <p className="text-xs text-slate-500 -mt-1">Pilih file proyek <b>.cadgis.json</b> yang pernah disimpan lewat menu Simpan.</p>
            <input
              ref={inputRef}
              type="file"
              accept=".json,.cadgis,application/json"
              className="hidden"
              onChange={(e) => pilihFile(e.target.files?.[0])}
            />
            <button
              onClick={() => inputRef.current?.click()}
              className="border-2 border-dashed border-slate-300 rounded-xl py-8 flex flex-col items-center gap-2 text-slate-500 hover:border-blue-400 hover:text-blue-700 transition-colors"
            >
              {baca ? <LoaderCircle className="h-6 w-6 animate-spin" /> : <FileJson className="h-6 w-6" />}
              <span className="text-sm font-medium">{baca ? "Membaca file..." : "Klik untuk memilih file proyek"}</span>
            </button>
          </>
        ) : (
          <>
            <div className="text-xs text-slate-600 bg-slate-50 rounded-lg p-3 space-y-0.5">
              <p className="font-semibold text-slate-800">{data.nama || "Proyek tanpa nama"}</p>
              <p>Disimpan: {data.disimpanPada ? new Date(data.disimpanPada).toLocaleString("id-ID") : "-"}</p>
              <p>{(data.points?.length ?? 0).toLocaleString("id-ID")} titik • {(data.shapes?.length ?? 0).toLocaleString("id-ID")} bentuk • {(data.layers?.length ?? 0)} layer{(data.contours?.length ?? 0) > 0 ? ` • ${data.contours.length} kontur` : ""}</p>
              {data.fotoLepas && <p className="text-amber-600">Foto titik tidak ikut tersimpan di file ini.</p>}
            </div>
            <p className="text-xs text-slate-500">
              <b>Ganti semua</b> = kosongkan data sekarang lalu isi dari file. <b>Gabungkan</b> = tambahkan isinya ke data yang sudah ada.
            </p>
            <div className="flex flex-col gap-2">
              <Button onClick={() => terapkan("ganti")} className="bg-blue-700 hover:bg-blue-800 text-white">
                Ganti Semua Data
              </Button>
              <Button variant="outline" onClick={() => terapkan("gabung")}>
                Gabungkan ke Data Sekarang
              </Button>
              <Button variant="ghost" onClick={() => setData(null)}>Pilih file lain</Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ================= Dialog Bersihkan Semua =================

export function BersihkanDialog() {
  const open = useGis((s) => s.dialogs.bersih);
  const setDialog = useGis((s) => s.setDialog);
  const kosongkanSemua = useGis((s) => s.kosongkanSemua);
  const points = useGis((s) => s.points);
  const shapes = useGis((s) => s.shapes);
  const labels = useGis((s) => s.labels);
  const contours = useGis((s) => s.contours);
  const layers = useGis((s) => s.layers);

  if (!open) return null;

  const tutup = () => setDialog("bersih", false);

  const bersihkan = () => {
    const h = kosongkanSemua();
    hapusSesi(); // buang cadangan sesi otomatis agar tidak muncul tawaran pulihkan
    tutup();
    toast.success("Semua data dibersihkan", {
      description: `${h.titik.toLocaleString("id-ID")} titik, ${h.bentuk.toLocaleString("id-ID")} poligon/garis, ${h.label.toLocaleString("id-ID")} label, ${h.kontur} kontur, ${h.layer} layer dihapus. Aplikasi siap untuk proyek baru.`,
    });
  };

  return (
    <Dialog open onOpenChange={(v) => !v && tutup()}>
      <DialogContent className="rounded-2xl sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Trash2 className="h-5 w-5 text-red-600" /> Bersihkan Semua Data?
          </DialogTitle>
        </DialogHeader>
        <p className="text-xs text-slate-500 -mt-1">
          Seluruh pekerjaan akan dihapus dari aplikasi. Bila masih diperlukan, simpan dulu lewat menu <b>Simpan</b>.
        </p>
        <div className="text-xs text-slate-700 bg-red-50 border border-red-100 rounded-lg p-3 space-y-0.5">
          <p>• {points.length.toLocaleString("id-ID")} titik • {shapes.length.toLocaleString("id-ID")} poligon/garis • {labels.length.toLocaleString("id-ID")} label</p>
          <p>• {contours.length} layer kontur • {layers.length} layer data</p>
          <p>• hasil ukur sementara &amp; seleksi blok</p>
          <p>• sesi otomatis tersimpan di browser ini</p>
        </div>
        <p className="text-[11px] text-slate-400">
          Basemap &amp; posisi peta tidak berubah. Tindakan ini tidak bisa dibatalkan.
        </p>
        <div className="flex gap-2 justify-end">
          <Button variant="outline" onClick={tutup}>Batal</Button>
          <Button onClick={bersihkan} className="bg-red-600 hover:bg-red-700 text-white">
            <Trash2 className="h-4 w-4" /> Ya, Hapus Semua
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ================= Sesi otomatis & pulihkan =================

/** Pasang autosave: HANYA perubahan DATA yang disimpan ke localStorage (debounce 1,5 detik).
 *  Dulu: semua perubahan store — termasuk posisi peta yang berubah di setiap selesai geser/zoom —
 *  memicu JSON.stringify seluruh proyek; pada 30rb+ titik ini membekukan UI berulang kali. */
export function useSesiOtomatis() {
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const lepas = useGis.subscribe((st, prev) => {
      // tampilan/seleksi/dialog/alat/urutan poligon tidak perlu autosave —
      // bandingkan referensi array/objek data saja (murah, tanpa stringify)
      if (
        st.points === prev.points &&
        st.shapes === prev.shapes &&
        st.labels === prev.labels &&
        st.contours === prev.contours &&
        st.layers === prev.layers
      ) {
        return;
      }
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => simpanSesiOtomatis(), 1500);
    });
    return () => {
      lepas?.();
      if (timer) clearTimeout(timer);
    };
  }, []);
}

/** Dialog penawaran pemulihan sesi terakhir saat aplikasi dibuka dengan data kosong. */
export function SesiPulihkanDialog() {
  const [sesi, setSesi] = useState<Awaited<ReturnType<typeof bacaSesiTersimpan>>>(null);
  const [periksa, setPeriksa] = useState(true);
  const points = useGis((s) => s.points);
  const shapes = useGis((s) => s.shapes);
  const labels = useGis((s) => s.labels);
  const contours = useGis((s) => s.contours);
  const muatProyekData = useGis((s) => s.muatProyekData);
  const fitData = useGis((s) => s.fitData);

  useEffect(() => {
    // tunggu hydrasi selesai & beri jeda agar tidak mengganggu render pertama
    const t = setTimeout(() => {
      const kosong = points.length + shapes.length + labels.length + contours.length === 0;
      if (kosong) setSesi(bacaSesiTersimpan());
      setPeriksa(false);
    }, 700);
    return () => clearTimeout(t);
  }, []);

  if (periksa || !sesi) return null;
  const d = sesi.data;

  const pulihkan = () => {
    muatProyekData(d, "ganti");
    setSesi(null);
    fitData();
    toast.success("Sesi terakhir dipulihkan", {
      description: sesi.fotoLepas
        ? `${(d.points?.length ?? 0).toLocaleString("id-ID")} titik, ${(d.shapes?.length ?? 0).toLocaleString("id-ID")} bentuk. (Foto tidak ikut tersimpan di sesi otomatis)`
        : `${(d.points?.length ?? 0).toLocaleString("id-ID")} titik, ${(d.shapes?.length ?? 0).toLocaleString("id-ID")} bentuk.`,
    });
  };

  const buang = () => {
    hapusSesi();
    setSesi(null);
    toast.info("Sesi lama dibuang");
  };

  return (
    <Dialog open onOpenChange={(v) => !v && setSesi(null)}>
      <DialogContent className="rounded-2xl sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <History className="h-5 w-5 text-blue-700" /> Pulihkan Sesi Terakhir?
          </DialogTitle>
        </DialogHeader>
        <p className="text-sm text-slate-600">
          Ada pekerjaan tersimpan otomatis{sesi.waktu ? ` (${new Date(sesi.waktu).toLocaleString("id-ID")})` : ""}:
        </p>
        <div className="text-xs text-slate-600 bg-slate-50 rounded-lg p-3">
          <p>{(d.points?.length ?? 0).toLocaleString("id-ID")} titik • {(d.shapes?.length ?? 0).toLocaleString("id-ID")} bentuk • {(d.labels?.length ?? 0).toLocaleString("id-ID")} label • {(d.contours?.length ?? 0)} kontur</p>
          {sesi.fotoLepas && <p className="text-amber-600 mt-1">Foto titik tidak ikut tersimpan di sesi otomatis (batas penyimpanan).</p>}
        </div>
        <div className="flex gap-2 justify-end">
          <Button variant="ghost" onClick={buang}>
            <Trash2 className="h-4 w-4" /> Buang
          </Button>
          <Button onClick={pulihkan} className="bg-blue-700 hover:bg-blue-800 text-white">Pulihkan</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
