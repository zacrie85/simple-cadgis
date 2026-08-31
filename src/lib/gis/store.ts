"use client";

import { create } from "zustand";
import type {
  ContourLayer,
  GisLabel,
  GisPoint,
  GisShape,
  LatLng,
  ToolMode,
} from "./types";
import { uid } from "./geo";

export type ViewMode = "map" | "layout";
export type Basemap = "osm" | "sat";

export interface DialogState {
  import: boolean;
  export: boolean;
  contour: boolean;
  volume: boolean;
  view3d: boolean;
  table: boolean;
  layoutPanel: boolean;
  point: null | { mode: "create"; lat: number; lng: number } | { mode: "edit"; id: string };
  text: null | { lat: number; lng: number; editId?: string };
  shapeInfo: null | { id: string };
}

interface GisStore {
  view: ViewMode;
  basemap: Basemap;
  tool: ToolMode;
  pendingVertices: LatLng[];
  pendingShapeSave: { kind: "closed" | "open"; vertices: LatLng[] } | null;
  measurePoints: LatLng[];
  measureTotal: number;
  points: GisPoint[];
  shapes: GisShape[];
  labels: GisLabel[];
  contours: ContourLayer[];
  selection: string[];
  tableShapeFilter: string | null;
  dialogs: DialogState;
  flyNonce: number;
  flyTarget: LatLng & { zoom?: number };
  fitNonce: number;

  setView: (v: ViewMode) => void;
  setBasemap: (b: Basemap) => void;
  setTool: (t: ToolMode) => void;
  mapClick: (lat: number, lng: number) => void;
  finishDraw: () => void;
  cancelDraw: () => void;
  clearMeasure: () => void;
  consumePendingShape: () => { kind: "closed" | "open"; vertices: LatLng[] } | null;

  addPoint: (p: GisPoint) => void;
  addPoints: (ps: GisPoint[]) => void;
  updatePoint: (id: string, patch: Partial<GisPoint>) => void;
  deletePoint: (id: string) => void;

  addShape: (s: GisShape) => void;
  updateShape: (id: string, patch: Partial<GisShape>) => void;
  deleteShape: (id: string) => void;

  addLabel: (l: GisLabel) => void;
  updateLabel: (id: string, patch: Partial<GisLabel>) => void;
  deleteLabel: (id: string) => void;

  addContours: (c: ContourLayer) => void;
  removeContours: (id: string) => void;
  toggleContourVisible: (id: string) => void;

  setSelection: (ids: string[]) => void;
  toggleSelect: (id: string) => void;
  clearSelection: () => void;

  setDialog: <K extends keyof DialogState>(key: K, value: DialogState[K]) => void;
  setTableFilter: (shapeId: string | null) => void;
  flyTo: (lat: number, lng: number, zoom?: number) => void;
  fitData: () => void;
}

const DIALOG_AWAL: DialogState = {
  import: false,
  export: false,
  contour: false,
  volume: false,
  view3d: false,
  table: false,
  layoutPanel: false,
  point: null,
  text: null,
  shapeInfo: null,
};

export const useGis = create<GisStore>((set, get) => ({
  view: "map",
  basemap: "osm",
  tool: null,
  pendingVertices: [],
  pendingShapeSave: null,
  measurePoints: [],
  measureTotal: 0,
  points: [],
  shapes: [],
  labels: [],
  contours: [],
  selection: [],
  tableShapeFilter: null,
  dialogs: { ...DIALOG_AWAL },
  flyNonce: 0,
  flyTarget: { lat: -6.994292, lng: 110.4294, zoom: 13 },
  fitNonce: 0,

  setView: (v) => set({ view: v }),
  setBasemap: (b) => set({ basemap: b }),

  setTool: (t) =>
    set({ tool: t, pendingVertices: [], measurePoints: [], measureTotal: 0 }),

  mapClick: (lat, lng) => {
    const s = get();
    const tool = s.tool;
    if (tool === "point") {
      s.setDialog("point", { mode: "create", lat, lng });
      s.setTool(null);
      return;
    }
    if (tool === "text") {
      s.setDialog("text", { lat, lng });
      s.setTool(null);
      return;
    }
    if (tool === "poly-closed" || tool === "poly-open") {
      set({ pendingVertices: [...s.pendingVertices, { lat, lng }] });
      return;
    }
    if (tool === "measure") {
      const pts = [...s.measurePoints, { lat, lng }];
      let total = 0;
      for (let i = 1; i < pts.length; i++) {
        const d = jarak(pts[i - 1], pts[i]);
        total += d;
      }
      set({ measurePoints: pts, measureTotal: total });
      return;
    }
    // mode select: klik area kosong → bersihkan seleksi
    set({ selection: [] });
  },

  finishDraw: () => {
    const s = get();
    if (s.tool === "measure") {
      // ukuran dibiarkan tampil di peta; tombol "Hapus" di chip untuk membersihkan
      set({ tool: null });
      return;
    }
    const v = s.pendingVertices;
    const minimal = s.tool === "poly-closed" ? 3 : 2;
    if (v.length < minimal) return;
    const kind = s.tool === "poly-closed" ? "closed" : "open";
    // simpan sementara lalu buka dialog penamaan bentuk
    set({
      tool: null,
      pendingVertices: [],
      pendingShapeSave: { kind, vertices: v },
      dialogs: { ...s.dialogs, shapeInfo: { id: "pending:baru" } },
    });
  },

  consumePendingShape: () => {
    const p = get().pendingShapeSave;
    set({ pendingShapeSave: null });
    return p;
  },

  cancelDraw: () =>
    set({
      tool: null,
      pendingVertices: [],
      measurePoints: [],
      measureTotal: 0,
    }),
  clearMeasure: () => set({ measurePoints: [], measureTotal: 0 }),

  addPoint: (p) => set((st) => ({ points: [...st.points, p] })),
  addPoints: (ps) => set((st) => ({ points: [...st.points, ...ps] })),
  updatePoint: (id, patch) =>
    set((st) => ({
      points: st.points.map((p) => (p.id === id ? { ...p, ...patch } : p)),
    })),
  deletePoint: (id) =>
    set((st) => ({
      points: st.points.filter((p) => p.id !== id),
      labels: st.labels.filter((l) => l.id !== id),
      selection: st.selection.filter((x) => x !== id),
    })),

  addShape: (sh) => set((st) => ({ shapes: [...st.shapes, sh] })),
  updateShape: (id, patch) =>
    set((st) => ({
      shapes: st.shapes.map((sh) => (sh.id === id ? { ...sh, ...patch } : sh)),
    })),
  deleteShape: (id) =>
    set((st) => ({
      shapes: st.shapes.filter((sh) => sh.id !== id),
      selection: st.selection.filter((x) => x !== id),
    })),

  addLabel: (l) => set((st) => ({ labels: [...st.labels, l] })),
  updateLabel: (id, patch) =>
    set((st) => ({
      labels: st.labels.map((l) => (l.id === id ? { ...l, ...patch } : l)),
    })),
  deleteLabel: (id) => set((st) => ({ labels: st.labels.filter((l) => l.id !== id) })),

  addContours: (c) => set((st) => ({ contours: [...st.contours, c] })),
  removeContours: (id) => set((st) => ({ contours: st.contours.filter((c) => c.id !== id) })),
  toggleContourVisible: (id) =>
    set((st) => ({
      contours: st.contours.map((c) =>
        c.id === id ? { ...c, visible: !c.visible } : c
      ),
    })),

  setSelection: (ids) => set({ selection: ids }),
  toggleSelect: (id) =>
    set((st) => ({
      selection: st.selection.includes(id)
        ? st.selection.filter((x) => x !== id)
        : [...st.selection, id],
    })),
  clearSelection: () => set({ selection: [] }),

  setDialog: (key, value) =>
    set((st) => ({ dialogs: { ...st.dialogs, [key]: value } })),
  setTableFilter: (shapeId) => set({ tableShapeFilter: shapeId }),

  flyTo: (lat, lng, zoom) =>
    set((st) => ({
      flyTarget: { lat, lng, zoom },
      flyNonce: st.flyNonce + 1,
    })),
  fitData: () => set((st) => ({ fitNonce: st.fitNonce + 1 })),
}));

function jarak(a: LatLng, b: LatLng): number {
  const R = 6378137;
  const φ1 = (a.lat * Math.PI) / 180;
  const φ2 = (b.lat * Math.PI) / 180;
  const dφ = φ2 - φ1;
  const dλ = ((b.lng - a.lng) * Math.PI) / 180;
  const h = Math.sin(dφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(dλ / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Poligon sementara yang sedang digambar (dipakai chip & peta). */
export function ambilPendingShape(): { kind: "closed" | "open"; vertices: LatLng[] } | null {
  const { tool, pendingVertices } = useGis.getState();
  if (tool === "poly-closed") return { kind: "closed", vertices: pendingVertices };
  if (tool === "poly-open") return { kind: "open", vertices: pendingVertices };
  return null;
}

/** Simpan hasil gambar menjadi shape sungguhan (dipanggil setelah dialog judul). */
export function simpanShapeDariPending(kind: "closed" | "open", vertices: LatLng[], title: string, description: string, color: string) {
  const shape: GisShape = {
    id: uid("shape"),
    kind,
    vertices,
    title: title || (kind === "closed" ? "Poligon" : "Garis"),
    description,
    color,
    attrs: {},
    source: "manual",
    visible: true,
  };
  useGis.getState().addShape(shape);
  return shape;
}
