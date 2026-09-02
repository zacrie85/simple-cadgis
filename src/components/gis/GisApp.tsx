"use client";

import { useEffect } from "react";
import dynamic from "next/dynamic";
import Toolbar from "./Toolbar";
import { DrawChip, MeasureChip } from "./Chips";
import ImportDialog from "./dialogs/ImportDialog";
import ExportDialog from "./dialogs/ExportDialog";
import DataTableWindow from "./dialogs/DataTableWindow";
import { PointDialog, TextDialog, ShapeInfoDialog } from "./dialogs/FeatureDialogs";
import { ContourDialog, VolumeDialog } from "./dialogs/AnalysisDialogs";
import ElevasiDialog from "./dialogs/ElevasiDialog";
import PoligonTitikDialog from "./dialogs/PoligonTitikDialog";
import OptimasiDialog from "./dialogs/OptimasiDialog";
import View3D from "./dialogs/View3D";
import LayerPanel from "./dialogs/LayerPanel";
import {
  SimpanProyekDialog,
  MuatProyekDialog,
  SesiPulihkanDialog,
  BersihkanDialog,
  useSesiOtomatis,
} from "./dialogs/ProyekDialogs";
import { useGis } from "@/lib/gis/store";
import { bacaPerf } from "@/lib/gis/proyek";

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

  return (
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
        <ContourDialog />
        <VolumeDialog />
        <ElevasiDialog />
        <PoligonTitikDialog />
        <OptimasiDialog />
        <View3D />
        <LayerPanel />
        <SimpanProyekDialog />
        <MuatProyekDialog />
        <BersihkanDialog />
        <SesiPulihkanDialog />
      </div>
    </div>
  );
}
