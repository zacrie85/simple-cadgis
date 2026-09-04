"use client";

import { useGis } from "@/lib/gis/store";
import { Check, X, Trash2, Loader2, MousePointerClick, Crop, MapPin, Hexagon, Minus, Type, Circle, Egg, CornerUpLeft, CornerUpRight, PenTool, Ruler, Lasso, MoveUpRight } from "lucide-react";
import { toast } from "sonner";
import { useRef, useState, useEffect, useCallback } from "react";

/** Chip mengambang di tengah-atas: panduan gambar + tombol Selesai/Batal. */
export function DrawChip() {
  const view = useGis((s) => s.view);
  const tool = useGis((s) => s.tool);
  const pendingCount = useGis((s) => s.pendingVertices.length);
  const finishDraw = useGis((s) => s.finishDraw);
  const cancelDraw = useGis((s) => s.cancelDraw);
  const selesaikanBlokPoligon = useGis((s) => s.selesaikanBlokPoligon);

  // mode layout: alat GAMBAR jadi anotasi layout — chip sendiri disediakan LayoutView
  if (view === "layout") return null;
  if (!tool) return null;

  const info: Record<string, string> = {
    point: "Klik lokasi di peta untuk menambah titik — bisa terus-menerus. Esc / klik tombol Titik lagi untuk berhenti.",
    text: "Klik lokasi di peta untuk menambah label teks — bisa terus-menerus. Esc / klik tombol Teks lagi untuk berhenti.",
    "poly-closed":
      "Poligon tertutup — klik titik sudut (min. 3), lalu Selesai. Sudut terakhir otomatis tersambung ke titik pertama. Alat tetap aktif untuk menggambar poligon berikutnya — Esc untuk berhenti.",
    "poly-open":
      "Garis terbuka — klik titik jalur (min. 2), lalu Selesai. Titik terakhir TIDAK tersambung ke titik pertama. Alat tetap aktif — Esc untuk berhenti.",
    panah:
      "Garis anak panah — klik titik jalur (min. 2), lalu Selesai. Mata panah otomatis di ujung AKHIR garis (arah terakhir = arah panah). Alat tetap aktif — Esc untuk berhenti.",
    measure: "Ukur jarak — klik titik 1, titik 2, dan seterusnya",
    select: "Blok data — drag kotak di peta untuk memblok titik/poligon. Tahan Shift saat drag untuk menambah pilihan. Klik satu titik = pilih/hilangkan.",
    "select-poligon":
      "Blok poligon — klik titik sudut area (min. 3), lalu klik titik pertama lagi / dobel-klik untuk menutup. Semua titik & poligon/garis DI DALAM poligon otomatis terpilih. Shift saat menutup = tambah ke pilihan. Alat tetap aktif — Esc untuk berhenti.",
    zoombox: "Zoom kotak — drag area di peta untuk memperbesar ke area tersebut",
    bulatan:
      "Bulatan — klik titik awal, gerakkan mouse (pratinjau + garis radius tampil), klik untuk jadi. Atau isi radius manual di panel bawah → 1 klik langsung jadi. Alat tetap aktif — Esc untuk berhenti.",
    elips: "Elips — klik titik awal (pusat), gerakkan mouse (pratinjau elips tampil), klik untuk jadi. Alat tetap aktif — Esc untuk berhenti.",
    "lengkung-kiri": "Lengkung kiri — klik titik awal, gerakkan mouse (busur pratinjau tampil), klik di ujung busur. Alat tetap aktif — Esc untuk berhenti.",
    "lengkung-kanan": "Lengkung kanan — klik titik awal, gerakkan mouse (busur pratinjau tampil), klik di ujung busur. Alat tetap aktif — Esc untuk berhenti.",
    "edit-bentuk":
      "Edit bentuk — klik poligon/garis di peta: seret kotak oranye = pindah titik • seret bulat biru = lengkungkan ruas • Alt+klik kotak = hapus titik. Esc untuk berhenti.",
  };

  const IkonChip =
    tool === "select" ? MousePointerClick : tool === "select-poligon" ? Lasso : tool === "zoombox" ? Crop : tool === "point" ? MapPin : tool === "poly-closed" ? Hexagon : tool === "poly-open" ? Minus : tool === "panah" ? MoveUpRight : tool === "text" ? Type : tool === "bulatan" ? Circle : tool === "elips" ? Egg : tool === "lengkung-kiri" ? CornerUpLeft : tool === "lengkung-kanan" ? CornerUpRight : tool === "edit-bentuk" ? PenTool : tool === "measure" ? Ruler : null;

  const alatDragKotak = tool === "select" || tool === "zoombox";

  const minimal = tool === "poly-closed" || tool === "select-poligon" ? 3 : tool === "poly-open" || tool === "panah" ? 2 : 0;
  const bisaSelesai =
    (tool === "poly-closed" && pendingCount >= 3) ||
    ((tool === "poly-open" || tool === "panah") && pendingCount >= 2) ||
    (tool === "select-poligon" && pendingCount >= 3);

  const klikSelesai = () => {
    if (tool !== "select-poligon") {
      finishDraw();
      return;
    }
    const hasil = selesaikanBlokPoligon(false);
    if (!hasil) {
      toast.info("Minimal 3 titik poligon", { description: "Klik minimal 3 titik sudut di peta sebelum menutup poligon blok." });
      return;
    }
    toast.success(`${hasil.total} fitur terblok poligon`, {
      description: `${hasil.titik} titik + ${hasil.bentuk} poligon/garis ada di dalam poligon. Total terpilih: ${hasil.total}. Alat masih aktif — Esc untuk berhenti.`,
    });
  };

  return (
    <div className="absolute top-3 left-1/2 -translate-x-1/2 z-[900] print:hidden" role="status">
      <div className="flex items-center gap-2 rounded-full bg-white/95 backdrop-blur border border-blue-200 shadow-lg pl-4 pr-1.5 py-1.5">
        <span className="text-xs text-slate-700 flex items-center gap-1.5 max-w-[min(80vw,560px)]">
          {IkonChip ? (
            <IkonChip className={`h-3.5 w-3.5 shrink-0 ${alatDragKotak ? (tool === "select" ? "text-blue-600" : "text-violet-600") : "text-blue-600"}`} />
          ) : (
            <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-blue-600" />
          )}
          <span className="line-clamp-2">{info[tool]}</span>
          {pendingCount > 0 && <b className={tool === "select-poligon" ? "text-violet-700" : "text-blue-700"}>• {pendingCount} titik</b>}
        </span>
        {(tool === "poly-closed" || tool === "poly-open" || tool === "panah" || tool === "measure" || tool === "select-poligon") && (
          <button
            onClick={klikSelesai}
            disabled={minimal > 0 && !bisaSelesai}
            className="flex items-center gap-1 rounded-full bg-emerald-600 text-white text-xs font-medium px-3 py-1.5 hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Check className="h-3.5 w-3.5" />
            Selesai
          </button>
        )}
        <button
          onClick={cancelDraw}
          className="flex items-center gap-1 rounded-full bg-slate-100 text-slate-600 text-xs font-medium px-3 py-1.5 hover:bg-slate-200"
        >
          <X className="h-3.5 w-3.5" />
          Batal
        </button>
      </div>
    </div>
  );
}

/** Chip hasil pengukuran jarak. */
export function MeasureChip() {
  const view = useGis((s) => s.view);
  const tool = useGis((s) => s.tool);
  const total = useGis((s) => s.measureTotal);
  const jumlah = useGis((s) => s.measurePoints.length);
  const clearMeasure = useGis((s) => s.clearMeasure);

  if (view === "layout") return null;
  if (tool === "measure" || jumlah === 0) return null;
  if (jumlah < 2) return null;

  const km = total >= 1000;

  return (
    <div className="absolute top-3 left-1/2 -translate-x-1/2 z-[900] print:hidden" role="status">
      <div className="flex items-center gap-2 rounded-full bg-white/95 backdrop-blur border border-red-200 shadow-lg pl-4 pr-1.5 py-1.5">
        <span className="text-xs text-slate-700">
          Hasil ukur: <b className="text-red-600">{km ? `${(total / 1000).toFixed(3)} km` : `${total.toFixed(2)} m`}</b>
          <span className="text-slate-400"> • {jumlah} titik • {jumlah - 1} segmen</span>
        </span>
        <button
          onClick={clearMeasure}
          className="flex items-center gap-1 rounded-full bg-slate-100 text-slate-600 text-xs font-medium px-3 py-1.5 hover:bg-slate-200"
        >
          <Trash2 className="h-3.5 w-3.5" />
          Hapus
        </button>
      </div>
    </div>
  );
}

/** Jendela mengambang sederhana yang bisa digeser. */
export function FloatingWindow({
  judul,
  onClose,
  children,
  lebar = "max-w-2xl",
}: {
  judul: string;
  onClose: () => void;
  children: React.ReactNode;
  lebar?: string;
}) {
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const dragRef = useRef<{ dx: number; dy: number } | null>(null);

  const onPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    // jangan mulai drag jika yang diklik adalah tombol (agar klik tetap bekerja)
    if ((e.target as HTMLElement).closest("button")) return;
    const target = e.currentTarget.parentElement?.parentElement;
    if (!target) return;
    const rect = target.getBoundingClientRect();
    dragRef.current = { dx: e.clientX - rect.left, dy: e.clientY - rect.top };
    if (!pos) setPos({ x: rect.left, y: rect.top });
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }, [pos]);

  const onPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) return;
    setPos({ x: e.clientX - dragRef.current.dx, y: e.clientY - dragRef.current.dy });
  }, []);

  const onPointerUp = useCallback(() => {
    dragRef.current = null;
  }, []);

  useEffect(() => {
    const esc = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [onClose]);

  return (
    <div
      className={`fixed z-[1100] ${lebar} w-[min(92vw,48rem)]`}
      style={
        pos
          ? { left: pos.x, top: pos.y, transform: "none" }
          : { left: "50%", top: "76px", transform: "translateX(-50%)" }
      }
      role="dialog"
      aria-label={judul}
    >
      <div className="rounded-2xl bg-white shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[calc(100vh-120px)]">
        <div
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          className="flex items-center justify-between gap-2 px-4 py-2.5 bg-slate-50 border-b border-slate-200 cursor-move select-none touch-none"
        >
          <h2 className="text-sm font-bold text-slate-800">{judul}</h2>
          <button
            onClick={onClose}
            aria-label={`Tutup ${judul}`}
            className="h-7 w-7 rounded-lg hover:bg-slate-200 text-slate-500 flex items-center justify-center"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="overflow-auto scrollbar-halus p-4">{children}</div>
      </div>
    </div>
  );
}
