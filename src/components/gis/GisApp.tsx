"use client";

import dynamic from "next/dynamic";
import Toolbar from "./Toolbar";
import { DrawChip, MeasureChip } from "./Chips";
import ImportDialog from "./dialogs/ImportDialog";
import ExportDialog from "./dialogs/ExportDialog";
import DataTableWindow from "./dialogs/DataTableWindow";
import { PointDialog, TextDialog, ShapeInfoDialog } from "./dialogs/FeatureDialogs";
import { ContourDialog, VolumeDialog } from "./dialogs/AnalysisDialogs";
import View3D from "./dialogs/View3D";

// Leaflet & three.js hanya jalan di browser — matikan SSR untuk kedua tampilan ini
const MapCanvas = dynamic(() => import("./MapCanvas"), { ssr: false });
const LayoutView = dynamic(() => import("./LayoutView"), { ssr: false });

/**
 * GeoKita — aplikasi GIS web satu-panel-atas.
 * Semua tombol berada di toolbar atas; area di bawahnya sepenuhnya peta/layout.
 */
export default function GisApp() {
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
        <View3D />
      </div>
    </div>
  );
}
