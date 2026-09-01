"use client";

import { create } from "zustand";
import type {
  ContourLayer,
  GisLabel,
  GisLayer,
  GisPoint,
  GisShape,
  LabelMode,
  LatLng,
  ProyekData,
  ToolMode,
} from "./types";
import { uid } from "./geo";

export type ViewMode = "map" | "layout";
export type Basemap = "osm" | "sat";

/** Nama layer bawaan untuk hasil gambar manual (titik/teks/bentuk di peta). */
export const NAMA_LAYER_MANUAL = "Gambar Manual";

/** Buat nama layer dari nama file impor (tanpa ekstensi). */
export function namaLayerDariFile(namaFile: string): string {
  const dasar = namaFile.replace(/\.[^.]+$/, "").trim();
  return dasar || "Data Impor";
}

export interface DialogState {
  import: boolean;
  export: boolean;
  contour: boolean;
  volume: boolean;
  view3d: boolean;
  table: boolean;
  layoutPanel: boolean;
  elevasi: boolean;
  layer: boolean;
  simpan: boolean;
  muat: boolean;
  point: null | { mode: "create"; lat: number; lng: number } | { mode: "edit"; id: string };
  text: null | { lat: number; lng: number; editId?: string };
  shapeInfo: null | { id: string };
}

interface GisStore {
  view: ViewMode;
  basemap: Basemap;
  tool: ToolMode;
  labelMode: LabelMode;
  pendingVertices: LatLng[];
  pendingShapeSave: { kind: "closed" | "open"; vertices: LatLng[] } | null;
  measurePoints: LatLng[];
  measureTotal: number;
  points: GisPoint[];
  shapes: GisShape[];
  labels: GisLabel[];
  contours: ContourLayer[];
  layers: GisLayer[];
  selection: string[];
  tableShapeFilter: string | null;
  editBentukId: string | null; // bentuk yang langsung diedit saat alat edit-bentuk aktif
  dialogs: DialogState;
  flyNonce: number;
  flyTarget: LatLng & { zoom?: number };
  fitNonce: number;
  mapView: { lat: number; lng: number; zoom: number }; // posisi peta terkini (diperbarui MapCanvas)

  setView: (v: ViewMode) => void;
  setBasemap: (b: Basemap) => void;
  setTool: (t: ToolMode) => void;
  setLabelMode: (m: LabelMode) => void;
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

  // ---------- Layer ----------
  tambahLayer: (nama: string) => string;
  pastikanLayerManual: () => string;
  setLayerNama: (id: string, nama: string) => void;
  setLayerTerlihat: (id: string, terlihat: boolean) => void;
  setSemuaLayerTerlihat: (terlihat: boolean) => void;
  hapusLayerIsi: (id: string) => { titik: number; bentuk: number };
  lepasLayer: (id: string) => { titik: number; bentuk: number };
  muatProyekData: (data: ProyekData, mode: "ganti" | "gabung") => {
    titik: number;
    bentuk: number;
    label: number;
    kontur: number;
    layer: number;
  };

  setMapView: (v: { lat: number; lng: number; zoom: number }) => void;

  setSelection: (ids: string[]) => void;
  toggleSelect: (id: string) => void;
  clearSelection: () => void;
  setEditBentukId: (id: string | null) => void;
  deleteSelected: () => { titik: number; bentuk: number };

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
  elevasi: false,
  layer: false,
  simpan: false,
  muat: false,
  point: null,
  text: null,
  shapeInfo: null,
};

export const useGis = create<GisStore>((set, get) => ({
  view: "map",
  basemap: "osm",
  tool: null,
  labelMode: "terpilih",
  pendingVertices: [],
  pendingShapeSave: null,
  measurePoints: [],
  measureTotal: 0,
  points: [],
  shapes: [],
  labels: [],
  contours: [],
  layers: [],
  selection: [],
  tableShapeFilter: null,
  editBentukId: null,
  dialogs: { ...DIALOG_AWAL },
  flyNonce: 0,
  flyTarget: { lat: -6.994292, lng: 110.4294, zoom: 13 },
  fitNonce: 0,
  mapView: { lat: -6.994292, lng: 110.4294, zoom: 15 },

  setView: (v) => set({ view: v }),
  setBasemap: (b) => set({ basemap: b }),
  setLabelMode: (m) => set({ labelMode: m }),

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
    // alat blok & zoom kotak ditangani interaksi drag di MapCanvas, bukan klik
    if (tool === "select" || tool === "zoombox") return;
    // alat bentuk khusus (bulatan/elips/lengkung/edit) ditangani listener MapCanvas
    if (tool === "bulatan" || tool === "elips" || tool === "lengkung-kiri" || tool === "lengkung-kanan" || tool === "edit-bentuk") return;
    // tanpa alat: klik area kosong → bersihkan seleksi
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

  // ---------- Layer ----------
  tambahLayer: (nama) => {
    const id = uid("layer");
    set((st) => ({
      layers: [...st.layers, { id, nama, terlihat: true, dibuat: Date.now() }],
    }));
    return id;
  },

  pastikanLayerManual: () => {
    const st = get();
    const ada = st.layers.find((l) => l.nama === NAMA_LAYER_MANUAL);
    if (ada) return ada.id;
    return get().tambahLayer(NAMA_LAYER_MANUAL);
  },

  setLayerNama: (id, nama) =>
    set((st) => ({
      layers: st.layers.map((l) => (l.id === id ? { ...l, nama: nama.trim() || l.nama } : l)),
    })),

  setLayerTerlihat: (id, terlihat) =>
    set((st) => ({
      layers: st.layers.map((l) => (l.id === id ? { ...l, terlihat } : l)),
      // sinkronkan bendera visible anggota agar peta/tabel/ekspor langsung mengikuti
      points: st.points.map((p) => (p.layerId === id ? { ...p, visible: terlihat } : p)),
      shapes: st.shapes.map((sh) => (sh.layerId === id ? { ...sh, visible: terlihat } : sh)),
    })),

  setSemuaLayerTerlihat: (terlihat) =>
    set((st) => ({
      layers: st.layers.map((l) => ({ ...l, terlihat })),
      points: st.points.map((p) => (p.layerId ? { ...p, visible: terlihat } : p)),
      shapes: st.shapes.map((sh) => (sh.layerId ? { ...sh, visible: terlihat } : sh)),
    })),

  hapusLayerIsi: (id) => {
    const st = get();
    const idTitik = new Set(st.points.filter((p) => p.layerId === id).map((p) => p.id));
    const titik = idTitik.size;
    const bentuk = st.shapes.filter((sh) => sh.layerId === id).length;
    set({
      points: st.points.filter((p) => p.layerId !== id),
      shapes: st.shapes.filter((sh) => sh.layerId !== id),
      // label yang menempel pada titik terhapus ATAU label teks milik layer ini
      labels: st.labels.filter((l) => !idTitik.has(l.id) && l.layerId !== id),
      layers: st.layers.filter((l) => l.id !== id),
      selection: st.selection.filter((x) => !idTitik.has(x)),
    });
    return { titik, bentuk };
  },

  lepasLayer: (id) => {
    const st = get();
    const titik = st.points.filter((p) => p.layerId === id).length;
    const bentuk = st.shapes.filter((sh) => sh.layerId === id).length;
    set({
      layers: st.layers.filter((l) => l.id !== id),
      points: st.points.map((p) => (p.layerId === id ? { ...p, layerId: undefined, visible: true } : p)),
      shapes: st.shapes.map((sh) => (sh.layerId === id ? { ...sh, layerId: undefined, visible: true } : sh)),
      labels: st.labels.map((l) => (l.layerId === id ? { ...l, layerId: undefined } : l)),
    });
    return { titik, bentuk };
  },

  muatProyekData: (data, mode) => {
    const st = get();
    const pts = Array.isArray(data.points) ? data.points : [];
    const shps = Array.isArray(data.shapes) ? data.shapes : [];
    const lbls = Array.isArray(data.labels) ? data.labels : [];
    const ctrs = Array.isArray(data.contours) ? data.contours : [];
    const lyrs = Array.isArray(data.layers) ? data.layers : [];

    if (mode === "ganti") {
      const layersBersih = lyrs.map((l) => ({
        ...l,
        terlihat: l.terlihat !== false,
      }));
      set({
        points: pts,
        shapes: shps,
        labels: lbls,
        contours: ctrs,
        layers: layersBersih,
        selection: [],
        tableShapeFilter: null,
      });
    } else {
      // gabung: layer bernama sama dipetakan ke layer yang sudah ada (hindari duplikat)
      const petaLama = new Map(st.layers.map((l) => [l.nama, l.id]));
      const idLama = new Set(st.layers.map((l) => l.id));
      const layersBaru: GisLayer[] = [];
      const petaGabung = new Map<string, string>();
      for (const l of lyrs) {
        const eksisting = petaLama.get(l.nama);
        if (eksisting) {
          petaGabung.set(l.id, eksisting);
        } else if (!idLama.has(l.id)) {
          layersBaru.push({ ...l, terlihat: l.terlihat !== false });
          idLama.add(l.id);
        }
      }
      const petakan = (layerId?: string) =>
        layerId ? petaGabung.get(layerId) ?? layerId : layerId;
      set({
        points: [...st.points, ...pts.map((p) => ({ ...p, layerId: petakan(p.layerId) }))],
        shapes: [...st.shapes, ...shps.map((sh) => ({ ...sh, layerId: petakan(sh.layerId) }))],
        labels: [...st.labels, ...lbls.map((l) => ({ ...l, layerId: petakan(l.layerId) }))],
        contours: [...st.contours, ...ctrs],
        layers: [...st.layers, ...layersBaru],
      });
    }

    // terapkan tampilan tersimpan (basemap + posisi peta)
    if (data.tampilan?.basemap === "sat" || data.tampilan?.basemap === "osm") {
      set({ basemap: data.tampilan.basemap });
    }
    if (data.tampilan && typeof data.tampilan.lat === "number" && typeof data.tampilan.lng === "number") {
      get().flyTo(data.tampilan.lat, data.tampilan.lng, data.tampilan.zoom);
    }

    return { titik: pts.length, bentuk: shps.length, label: lbls.length, kontur: ctrs.length, layer: lyrs.length };
  },

  setMapView: (v) => set({ mapView: v }),

  setSelection: (ids) => set({ selection: ids }),
  toggleSelect: (id) =>
    set((st) => ({
      selection: st.selection.includes(id)
        ? st.selection.filter((x) => x !== id)
        : [...st.selection, id],
    })),
  clearSelection: () => set({ selection: [] }),
  setEditBentukId: (id) => set({ editBentukId: id }),

  deleteSelected: () => {
    const s = get();
    const terpilih = new Set(s.selection);
    if (terpilih.size === 0) return { titik: 0, bentuk: 0 };
    const titik = s.points.filter((p) => terpilih.has(p.id)).length;
    const bentuk = s.shapes.filter((sh) => terpilih.has(sh.id)).length;
    set({
      points: s.points.filter((p) => !terpilih.has(p.id)),
      shapes: s.shapes.filter((sh) => !terpilih.has(sh.id)),
      labels: s.labels.filter((l) => !terpilih.has(l.id)),
      selection: [],
    });
    return { titik, bentuk };
  },

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

/** Pastikan layer "Gambar Manual" ada dan kembalikan id-nya (dipakai luar komponen React). */
export function pastikanLayerManualSekarang(): string {
  return useGis.getState().pastikanLayerManual();
}

/** Simpan hasil gambar menjadi shape sungguhan (dipanggil setelah dialog judul). */
export function simpanShapeDariPending(
  kind: "closed" | "open",
  vertices: LatLng[],
  title: string,
  description: string,
  color: string,
  labelTampil = false
) {
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
    labelTampil,
    layerId: useGis.getState().pastikanLayerManual(),
  };
  useGis.getState().addShape(shape);
  return shape;
}
