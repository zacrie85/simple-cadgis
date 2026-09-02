"use client";

import { useState } from "react";
import { useGis } from "@/lib/gis/store";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import {
  Eye,
  EyeOff,
  Layers,
  Trash2,
  Crosshair,
  Pencil,
  Check,
  X,
  Mountain,
  HelpCircle,
} from "lucide-react";
import type { GisLayer } from "@/lib/gis/types";

/** Panel layer: daftar semua layer data dengan tombol tampil/sembunyi, rename, zoom, hapus.
 *  Layer kontur (hasil analisis) juga ditampilkan karena punya visibilitas sendiri. */
export default function LayerPanel() {
  const open = useGis((s) => s.dialogs.layer);
  const setDialog = useGis((s) => s.setDialog);
  const layers = useGis((s) => s.layers);
  const points = useGis((s) => s.points);
  const shapes = useGis((s) => s.shapes);
  const labels = useGis((s) => s.labels);
  const contours = useGis((s) => s.contours);
  const setLayerTerlihat = useGis((s) => s.setLayerTerlihat);
  const setSemuaLayerTerlihat = useGis((s) => s.setSemuaLayerTerlihat);
  const setLayerNama = useGis((s) => s.setLayerNama);
  const hapusLayerIsi = useGis((s) => s.hapusLayerIsi);
  const lepasLayer = useGis((s) => s.lepasLayer);
  const toggleContourVisible = useGis((s) => s.toggleContourVisible);
  const removeContours = useGis((s) => s.removeContours);

  const [editId, setEditId] = useState<string | null>(null);
  const [namaEdit, setNamaEdit] = useState("");
  const [hapusId, setHapusId] = useState<string | null>(null);

  if (!open) return null;

  const tutup = () => setDialog("layer", false);

  const hitung = (id: string) => ({
    titik: points.filter((p) => p.layerId === id).length,
    bentuk: shapes.filter((sh) => sh.layerId === id).length,
  });
  const nTanpa = points.filter((p) => !p.layerId).length + shapes.filter((sh) => !sh.layerId).length;

  const zoomKeLayer = (l: GisLayer) => {
    const koordinat: [number, number][] = [
      ...points.filter((p) => p.layerId === l.id).map((p) => [p.lat, p.lng] as [number, number]),
      ...shapes.filter((sh) => sh.layerId === l.id).flatMap((sh) => sh.vertices.map((v) => [v.lat, v.lng] as [number, number])),
    ];
    if (koordinat.length === 0) {
      toast.info("Layer masih kosong", { description: `Tidak ada data untuk di-zoom pada layer "${l.nama}".` });
      return;
    }
    window.dispatchEvent(new CustomEvent("geokita-fit-bounds", { detail: koordinat }));
    tutup();
    toast.success(`Zoom ke layer: ${l.nama}`);
  };

  const konfirmasiHapus = (mode: "isi" | "lepas") => {
    if (!hapusId) return;
    const l = layers.find((x) => x.id === hapusId);
    if (!l) return setHapusId(null);
    const h = mode === "isi" ? hapusLayerIsi(hapusId) : lepasLayer(hapusId);
    setHapusId(null);
    if (mode === "isi") {
      toast.success(`Layer dihapus beserta isinya`, { description: `${l.nama}: ${h.titik} titik + ${h.bentuk} bentuk dihapus.` });
    } else {
      toast.success(`Layer dihapus — isi dilepas ke "Tanpa Layer"`, { description: `${l.nama}: ${h.titik} titik + ${h.bentuk} bentuk tetap ada & tampak.` });
    }
  };

  return (
    <Dialog open onOpenChange={(v) => !v && tutup()}>
      <DialogContent className="rounded-2xl sm:max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Layers className="h-5 w-5 text-blue-700" /> Panel Layer
          </DialogTitle>
        </DialogHeader>

        <p className="text-xs text-slate-500 -mt-1">
          Klik ikon mata untuk <b>menampilkan / menyembunyikan</b> layer. Layer otomatis dibuat saat impor data & gambar manual.
        </p>

        {/* aksi cepat */}
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="flex-1" onClick={() => { setSemuaLayerTerlihat(true); toast.success("Semua layer ditampilkan"); }}>
            <Eye className="h-4 w-4" /> Tampil Semua
          </Button>
          <Button variant="outline" size="sm" className="flex-1" onClick={() => { setSemuaLayerTerlihat(false); toast.success("Semua layer disembunyikan"); }}>
            <EyeOff className="h-4 w-4" /> Sembunyikan Semua
          </Button>
        </div>

        {/* daftar layer data */}
        <div className="border border-slate-200 rounded-xl divide-y divide-slate-100">
          {layers.length === 0 && nTanpa === 0 && (
            <p className="text-sm text-slate-400 text-center py-6 px-4">
              Belum ada layer. Impor Excel/KMZ atau gambar di peta — layer dibuat otomatis.
            </p>
          )}
          {[...layers].reverse().map((l) => {
            const c = hitung(l.id);
            const kosong = c.titik + c.bentuk === 0;
            return (
              <div key={l.id} className={`flex items-center gap-2 px-3 py-2 ${l.terlihat ? "" : "bg-slate-50"}`}>
                <button
                  onClick={() => setLayerTerlihat(l.id, !l.terlihat)}
                  title={l.terlihat ? "Sembunyikan layer ini" : "Tampilkan layer ini"}
                  aria-label={l.terlihat ? "Sembunyikan layer ini" : "Tampilkan layer ini"}
                  className={`shrink-0 h-8 w-8 rounded-lg flex items-center justify-center transition-colors ${l.terlihat ? "text-blue-700 hover:bg-blue-50" : "text-slate-400 hover:bg-slate-100"}`}
                >
                  {l.terlihat ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                </button>

                <div className="min-w-0 flex-1">
                  {editId === l.id ? (
                    <div className="flex items-center gap-1">
                      <Input
                        autoFocus
                        value={namaEdit}
                        onChange={(e) => setNamaEdit(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") { setLayerNama(l.id, namaEdit); setEditId(null); }
                          if (e.key === "Escape") setEditId(null);
                        }}
                        className="h-7 text-sm"
                      />
                      <button onClick={() => { setLayerNama(l.id, namaEdit); setEditId(null); }} className="text-emerald-600 hover:bg-emerald-50 rounded p-1" title="Simpan nama"><Check className="h-4 w-4" /></button>
                      <button onClick={() => setEditId(null)} className="text-slate-400 hover:bg-slate-100 rounded p-1" title="Batal"><X className="h-4 w-4" /></button>
                    </div>
                  ) : (
                    <button
                      onClick={() => { setEditId(l.id); setNamaEdit(l.nama); }}
                      className="flex items-center gap-1.5 group max-w-full"
                      title="Klik untuk mengganti nama layer"
                    >
                      <span className={`text-sm font-medium truncate ${l.terlihat ? "text-slate-800" : "text-slate-400 line-through"}`}>{l.nama}</span>
                      <Pencil className="h-3 w-3 text-slate-300 group-hover:text-slate-500 shrink-0" />
                    </button>
                  )}
                  <p className="text-[11px] text-slate-400 leading-none mt-0.5">
                    {kosong ? "layer kosong" : `${c.titik.toLocaleString("id-ID")} titik • ${c.bentuk.toLocaleString("id-ID")} bentuk`}
                  </p>
                </div>

                <button onClick={() => zoomKeLayer(l)} disabled={kosong} title="Zoom ke layer" className="shrink-0 h-8 w-8 rounded-lg flex items-center justify-center text-slate-500 hover:bg-slate-100 disabled:text-slate-200 disabled:cursor-not-allowed">
                  <Crosshair className="h-4 w-4" />
                </button>
                <button onClick={() => setHapusId(l.id)} title="Hapus layer" className="shrink-0 h-8 w-8 rounded-lg flex items-center justify-center text-slate-500 hover:bg-red-50 hover:text-red-600">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            );
          })}

          {nTanpa > 0 && (
            <div className="flex items-center gap-2 px-3 py-2 bg-slate-50/60">
              <span className="shrink-0 h-8 w-8 flex items-center justify-center text-slate-300"><HelpCircle className="h-4 w-4" /></span>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-slate-500">Tanpa Layer</p>
                <p className="text-[11px] text-slate-400 leading-none mt-0.5">selalu tampil • {nTanpa.toLocaleString("id-ID")} data lama</p>
              </div>
            </div>
          )}
        </div>

        {/* konfirmasi hapus */}
        {hapusId && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-3">
            <p className="text-sm font-medium text-red-800">
              Hapus layer &quot;{layers.find((x) => x.id === hapusId)?.nama}&quot;?
            </p>
            <div className="flex flex-col sm:flex-row gap-2 mt-2">
              <Button size="sm" className="bg-red-600 hover:bg-red-700 text-white flex-1" onClick={() => konfirmasiHapus("isi")}>
                <Trash2 className="h-4 w-4" /> Hapus + Isinya
              </Button>
              <Button size="sm" variant="outline" className="flex-1" onClick={() => konfirmasiHapus("lepas")}>
                Hapus Layer Saja
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setHapusId(null)}>Batal</Button>
            </div>
          </div>
        )}

        {/* layer kontur */}
        {contours.length > 0 && (
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1.5">Layer Kontur (hasil analisis)</p>
            <div className="border border-slate-200 rounded-xl divide-y divide-slate-100">
              {[...contours].reverse().map((c) => (
                <div key={c.id} className={`flex items-center gap-2 px-3 py-2 ${c.visible ? "" : "bg-slate-50"}`}>
                  <button onClick={() => toggleContourVisible(c.id)} className={`shrink-0 h-8 w-8 rounded-lg flex items-center justify-center transition-colors ${c.visible ? "text-blue-700 hover:bg-blue-50" : "text-slate-400 hover:bg-slate-100"}`} title={c.visible ? "Sembunyikan kontur" : "Tampilkan kontur"}>
                    {c.visible ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                  </button>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-800 truncate">Interval {c.interval} m</p>
                    <p className="text-[11px] text-slate-400 leading-none mt-0.5">
                      {c.paths.length.toLocaleString("id-ID")} garis • {c.levels.length} tinggi
                    </p>
                  </div>
                  <button onClick={() => { removeContours(c.id); toast.success("Layer kontur dihapus"); }} title="Hapus kontur" className="shrink-0 h-8 w-8 rounded-lg flex items-center justify-center text-slate-500 hover:bg-red-50 hover:text-red-600">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="flex items-center gap-2 text-[11px] text-slate-400">
          <Mountain className="h-3 w-3" />
          {labels.length > 0 ? `${labels.length.toLocaleString("id-ID")} label teks ikut mengikuti layer masing-masing.` : "Kontrol visibilitas juga berlaku di tabel data."}
        </div>
      </DialogContent>
    </Dialog>
  );
}
