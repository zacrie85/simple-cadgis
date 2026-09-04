"use client";

import { useEffect, useRef, useState } from "react";
import { useGis } from "@/lib/gis/store";
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
  RotateCcw,
  GripVertical,
} from "lucide-react";
import type { GisLayer } from "@/lib/gis/types";

/** Posisi & ukuran panel disimpan di localStorage — dibuka lagi, tetap di tempat yang sama. */
const KUNCI_RECT = "cadgis_layerpanel_rect";
const MIN_W = 320;
const MIN_H = 240;

type Rect = { x: number; y: number; w: number; h: number };
type ModeGeser = "move" | "e" | "s" | "se"; // header geser posisi; tepi kanan/bawah/pojok untuk resize

const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);

/** Posisi default: melayang di sisi kanan, di bawah toolbar. */
function rectDefault(): Rect {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const w = clamp(Math.min(400, vw - 24), MIN_W, vw);
  const h = clamp(Math.min(560, vh - 140), MIN_H, vh);
  return { x: Math.max(8, vw - w - 12), y: 64, w, h };
}

function bacaRect(): Rect {
  try {
    const raw = localStorage.getItem(KUNCI_RECT);
    if (raw) {
      const r = JSON.parse(raw) as Rect;
      if ([r.x, r.y, r.w, r.h].every((n) => typeof n === "number" && isFinite(n))) {
        // clamp ke ukuran layar saat ini (layar bisa berubah sejak disimpan)
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        const w = clamp(r.w, MIN_W, vw);
        const h = clamp(r.h, MIN_H, vh);
        return {
          w,
          h,
          x: clamp(r.x, -(w - 90), vw - 90), // minimal 90px panel masih terlihat
          y: clamp(r.y, 0, vh - 48), // header tidak boleh hilang dari layar
        };
      }
    }
  } catch {
    /* rusak / tak ada — pakai default */
  }
  return rectDefault();
}

function simpanRect(r: Rect) {
  try {
    localStorage.setItem(KUNCI_RECT, JSON.stringify(r));
  } catch {
    /* diamkan */
  }
}

/** Panel layer mengambang: bisa DIGESER (header) & DI-RESIZE (tepi kanan/bawah/pojok).
 *  Daftar semua layer data dengan tombol tampil/sembunyi, rename, zoom, hapus.
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

  // rect dihitung lazy: null hanya saat SSR (window tak ada) — di client langsung terisi.
  // Karena panel tertutup saat render pertama (open=false), output render SSR & client tetap sama.
  const [rect, setRect] = useState<Rect | null>(() => (typeof window === "undefined" ? null : bacaRect()));
  const rectRef = useRef<Rect | null>(null);

  // layar berubah ukuran → jaga panel tetap terlihat
  useEffect(() => {
    const onResize = () => {
      setRect((r) => {
        if (!r) return r;
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        const nr: Rect = { ...r, w: clamp(r.w, MIN_W, vw), h: clamp(r.h, MIN_H, vh) };
        nr.x = clamp(nr.x, -(nr.w - 90), vw - 90);
        nr.y = clamp(nr.y, 0, vh - 48);
        rectRef.current = nr;
        simpanRect(nr);
        return nr;
      });
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  /** Mulai geser posisi (mode "move") atau resize ("e"/"s"/"se") — pointer event, mouse & sentuh. */
  const mulaiGeser = (mode: ModeGeser) => (e: React.PointerEvent) => {
    if (mode === "move" && (e.target as HTMLElement).closest("button")) return; // tombol header tak memicu geser
    e.preventDefault();
    e.stopPropagation();
    const orig = rectRef.current ?? rect ?? bacaRect();
    const sx = e.clientX;
    const sy = e.clientY;

    const onMove = (ev: PointerEvent) => {
      const dx = ev.clientX - sx;
      const dy = ev.clientY - sy;
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      setRect(() => {
        let nr: Rect;
        if (mode === "move") {
          nr = {
            w: orig.w,
            h: orig.h,
            x: clamp(orig.x + dx, -(orig.w - 90), vw - 90),
            y: clamp(orig.y + dy, 0, vh - 48),
          };
        } else {
          nr = {
            ...orig,
            w: mode === "s" ? orig.w : clamp(orig.w + dx, MIN_W, vw - orig.x),
            h: mode === "e" ? orig.h : clamp(orig.h + dy, MIN_H, vh - orig.y),
          };
        }
        rectRef.current = nr;
        return nr;
      });
    };
    const onUp = () => {
      simpanRect(rectRef.current ?? orig);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
  };

  if (!open || !rect) return null;

  const tutup = () => setDialog("layer", false);

  const resetPosisi = () => {
    const r = rectDefault();
    rectRef.current = r;
    setRect(r);
    simpanRect(r);
    toast.success("Posisi & ukuran panel dikembalikan ke default");
  };

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
      toast.success(`Layer dihapus — isi dilepas ke "Tanpa Layer"`, { description: `${l.nama}: ${h.titik} titik + ${h.bentuk} tetap ada & tampak.` });
    }
  };

  return (
    <div
      role="dialog"
      aria-label="Panel Layer"
      className="fixed z-[1200] flex flex-col rounded-2xl border border-slate-200 bg-white shadow-2xl overflow-hidden"
      style={{ left: rect.x, top: rect.y, width: rect.w, height: rect.h }}
    >
      {/* ===== header = pegangan untuk menggeser posisi panel ===== */}
      <div
        onPointerDown={mulaiGeser("move")}
        className="flex items-center gap-2 pl-2 pr-1.5 h-12 shrink-0 border-b border-slate-200 bg-slate-50/90 select-none touch-none cursor-move"
      >
        <GripVertical className="h-4 w-4 text-slate-300 shrink-0" />
        <Layers className="h-5 w-5 text-blue-700 shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-slate-800 leading-none">Panel Layer</p>
          <p className="text-[10px] text-slate-400 leading-none mt-0.5">
            geser dari header • resize dari tepi/pojok kanan-bawah
          </p>
        </div>
        <button
          onClick={resetPosisi}
          title="Kembalikan posisi & ukuran panel ke default"
          className="shrink-0 h-8 w-8 rounded-lg flex items-center justify-center text-slate-400 hover:bg-slate-200 hover:text-slate-700"
        >
          <RotateCcw className="h-4 w-4" />
        </button>
        <button
          onClick={tutup}
          title="Tutup panel"
          className="shrink-0 h-8 w-8 rounded-lg flex items-center justify-center text-slate-400 hover:bg-slate-200 hover:text-slate-700"
        >
          <X className="h-4.5 w-4.5" />
        </button>
      </div>

      {/* ===== isi panel ===== */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
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
      </div>

      {/* ===== pegangan resize: tepi kanan, tepi bawah, pojok kanan-bawah ===== */}
      <div onPointerDown={mulaiGeser("e")} className="absolute top-12 right-0 h-[calc(100%-4.75rem)] w-1.5 cursor-ew-resize touch-none" />
      <div onPointerDown={mulaiGeser("s")} className="absolute bottom-0 left-0 w-[calc(100%-1.5rem)] h-1.5 cursor-ns-resize touch-none" />
      <div onPointerDown={mulaiGeser("se")} title="Tarik untuk mengubah ukuran" className="absolute bottom-0 right-0 h-4 w-4 cursor-nwse-resize touch-none flex items-end justify-end p-0.5">
        <svg width="10" height="10" viewBox="0 0 10 10" className="text-slate-300 hover:text-slate-500">
          <path d="M9 1 1 9 M9 5 5 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" fill="none" />
        </svg>
      </div>
    </div>
  );
}
