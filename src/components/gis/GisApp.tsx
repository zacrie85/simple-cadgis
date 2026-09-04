"use client";

import { useEffect } from "react";
import dynamic from "next/dynamic";
import Toolbar from "./Toolbar";
import { DrawChip, MeasureChip } from "./Chips";
import ImportDialog from "./dialogs/ImportDialog";
import ExportDialog from "./dialogs/ExportDialog";
import DataTableWindow from "./dialogs/DataTableWindow";
import { PointDialog, TextDialog, ShapeInfoDialog, IkonTitikDialog } from "./dialogs/FeatureDialogs";
import { ContourDialog, VolumeDialog } from "./dialogs/AnalysisDialogs";
import ElevasiDialog from "./dialogs/ElevasiDialog";
import PoligonTitikDialog from "./dialogs/PoligonTitikDialog";
import OptimasiDialog from "./dialogs/OptimasiDialog";
import RasterDialog from "./dialogs/RasterDialog";
import KonversiDialog from "./dialogs/KonversiDialog";
import View3D from "./dialogs/View3D";
import LayerPanel from "./dialogs/LayerPanel";
import PasswordDialog from "./dialogs/PasswordDialog";
import PasswordGate from "./PasswordGate";
import {
  SimpanProyekDialog,
  MuatProyekDialog,
  SesiPulihkanDialog,
  BersihkanDialog,
  useSesiOtomatis,
} from "./dialogs/ProyekDialogs";
import { useGis } from "@/lib/gis/store";
import { bacaPerf } from "@/lib/gis/proyek";
import { toast } from "sonner";

// Leaflet & three.js hanya jalan di browser — matikan SSR untuk kedua tampilan ini
const MapCanvas = dynamic(() => import("./MapCanvas"), { ssr: false });
const LayoutView = dynamic(() => import("./LayoutView"), { ssr: false });

/**
 * SIMPLE CADGIS — aplikasi GIS web satu-panel-atas.
 * Semua tombol berada di toolbar atas; area di bawahnya sepenuhnya peta/layout.
 */
export default function GisApp() {
  useSesiOtomatis(); // autosave pekerjaan ke localStorage

  // preferensi performa (menu Optimasi) tersimpan di browser — muat sekali saat mulai
  useEffect(() => {
    const perf = bacaPerf();
    if (perf) useGis.getState().setPerf(perf);
  }, []);

  // ---------- Salin & tempel fitur: Ctrl+C / Ctrl+V (ala CAD) ----------
  // Abaikan bila fokus ada di input/textarea/dropdown atau di dalam dialog.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      const k = e.key.toLowerCase();
      if (k !== "c" && k !== "v") return;
      const t = e.target as HTMLElement | null;
      if (
        t &&
        (t.tagName === "INPUT" ||
          t.tagName === "TEXTAREA" ||
          t.tagName === "SELECT" ||
          t.isContentEditable ||
          t.closest?.('[role="dialog"],[role="alertdialog"]'))
      )
        return;
      e.preventDefault();
      if (k === "c") {
        const n = useGis.getState().salinTerpilih();
        if (n.titik + n.bentuk === 0) {
          toast.info("Tidak ada fitur terpilih", { description: "Pilih dulu: klik fitur, pakai Blok, atau centang di Tabel Data." });
          return;
        }
        toast.success(`${n.titik + n.bentuk} fitur disalin`, {
          description: `${n.titik} titik + ${n.bentuk} poligon/garis. Tekan Ctrl+V atau tombol Tempel untuk menduplikasi.`,
        });
      } else {
        const n = useGis.getState().tempelClipboard();
        if (!n) {
          toast.info("Papan klip masih kosong", { description: "Salin dulu fitur yang terpilih dengan Ctrl+C atau tombol Salin." });
          return;
        }
        toast.success(`${n.titik + n.bentuk} fitur ditempel`, {
          description: `${n.titik} titik + ${n.bentuk} poligon/garis diletakkan di tengah tampilan peta — semuanya langsung terpilih.`,
        });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <PasswordGate>
      <div className="h-screen flex flex-col bg-slate-50 overflow-hidden">
        <Toolbar />
        <div className="relative flex-1 min-h-0">
        <MapCanvas />
        <LayoutView />
        <DrawChip />
        <MeasureChip />
        <ImportDialog />
        <ExportDialog />
        <DataTableWindow />
        <PointDialog />
        <TextDialog />
        <ShapeInfoDialog />
        <IkonTitikDialog />
        <ContourDialog />
        <VolumeDialog />
        <ElevasiDialog />
        <PoligonTitikDialog />
        <OptimasiDialog />
        <RasterDialog />
        <KonversiDialog />
        <View3D />
        <LayerPanel />
        <PasswordDialog />
        <SimpanProyekDialog />
        <MuatProyekDialog />
        <BersihkanDialog />
        <SesiPulihkanDialog />
      </div>
    </div>
    </PasswordGate>
  );
}
