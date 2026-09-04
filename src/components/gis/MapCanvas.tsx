"use client";

import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import { toast } from "sonner";
import { Circle } from "lucide-react";
import { adaDialogTerbuka, useGis } from "@/lib/gis/store";
import { warnaElevasi } from "@/lib/gis/contours";
import { fmtMeter, jarakHaversine } from "@/lib/gis/geo";
import { ikonDivIcon } from "@/lib/gis/ikon-divicon";
import { ikonHtml } from "@/lib/gis/ikon-titik";
import { gayaLabel, kelasLabel } from "@/lib/gis/labelTampil";
import { htmlPanah, sudutPeta } from "@/lib/gis/panah";
import type { GisPoint, GisShape, LatLng } from "@/lib/gis/types";

const RENDER_CAP = 20000; // batas keras titik dirender (data lengkap tetap di memori/tabel)

/** Gaya visual titik sesuai status pilihan/urutan (dipakai efek bangun & pembaruan inkremental). */
function gayaTitik(sel: boolean, urut: boolean) {
  return {
    color: sel ? "#f59e0b" : urut ? "#059669" : "#1d4ed8",
    weight: sel || urut ? 2.5 : 1.5,
    fillColor: sel ? "#fbbf24" : urut ? "#10b981" : "#3b82f6",
    fillOpacity: 0.9,
  };
}

// Penanda sementara: true bila fitur baru saja diklik pada mode blok
// (mencegah klik kosong pada peta menghapus seleksi yang baru dibuat)
let klikFiturBarusan = false;
// Mode drag terakhir: Shift/Ctrl ditekan saat mulai drag = tambah ke pilihan
let dragTambah = false;

// Alat gambar: saat aktif, klik pada fitur TIDAK membuka popup — klik diteruskan
// ke peta sebagai vertiks/tarikan (mis. bulatan di sekitar titik ODP)
const ALAT_GAMBAR = ["point", "text", "poly-closed", "poly-open", "panah", "measure", "bulatan", "elips", "lengkung-kiri", "lengkung-kanan"] as const;

/** Kumpulan layer Leaflet milik peta utama (diisi sekali saat init). */
type LayerMap = {
  osm: L.TileLayer;
  sat: L.TileLayer;
  points: L.LayerGroup;
  shapes: L.LayerGroup;
  labels: L.LayerGroup;
  contours: L.LayerGroup;
  temp: L.LayerGroup;
};

// ============ Geometri bantu: lingkaran / elips / busur (Task 15) ============

const N_LINGKARAN = 64;
const N_BUSUR = 48;

/** Proyeksi lokal derajat ↔ meter di sekitar titik asal (cukup akurat untuk gambar lokal). */
function buatProyeksi(o: LatLng) {
  const mx = 111320 * Math.cos((o.lat * Math.PI) / 180);
  const my = 110540;
  return {
    xy: (p: LatLng) => ({ x: (p.lng - o.lng) * mx, y: (p.lat - o.lat) * my }),
    latlng: (x: number, y: number): LatLng => ({ lat: o.lat + y / my, lng: o.lng + x / mx }),
  };
}

/** Vertiks lingkaran (poligon tertutup halus). */
function titikLingkaran(c: LatLng, rMeter: number, n = N_LINGKARAN): LatLng[] {
  const proy = buatProyeksi(c);
  return Array.from({ length: n }, (_, i) => {
    const a = (i / n) * 2 * Math.PI;
    return proy.latlng(rMeter * Math.cos(a), rMeter * Math.sin(a));
  });
}

/** Vertiks elips dari pusat + jari-jari horizontal & vertikal (meter). */
function titikElips(c: LatLng, rx: number, ry: number, n = N_LINGKARAN): LatLng[] {
  const proy = buatProyeksi(c);
  return Array.from({ length: n }, (_, i) => {
    const a = (i / n) * 2 * Math.PI;
    return proy.latlng(rx * Math.cos(a), ry * Math.sin(a));
  });
}

/**
 * Busur SETENGAH lingkaran dari a ke b, menggelembung ke kiri/kanan arah jalan a→b
 * (seperti belokan U di AutoCAD). Kiri = sisi kiri arah jalan.
 */
function titikBusurSetengah(a: LatLng, b: LatLng, arah: "kiri" | "kanan", n = N_BUSUR): LatLng[] {
  const o: LatLng = { lat: (a.lat + b.lat) / 2, lng: (a.lng + b.lng) / 2 };
  const proy = buatProyeksi(o);
  const A = proy.xy(a);
  const B = proy.xy(b);
  const cx = (A.x + B.x) / 2;
  const cy = (A.y + B.y) / 2;
  const r = Math.hypot(B.x - A.x, B.y - A.y) / 2;
  const t0 = Math.atan2(A.y - cy, A.x - cx);
  // normal kiri arah jalan = sudut chord − 90° → geser sudut -1 (kiri) / +1 (kanan)
  const sgn = arah === "kiri" ? -1 : 1;
  const pts: LatLng[] = [];
  for (let i = 0; i <= n; i++) {
    const ang = t0 + sgn * (i / n) * Math.PI;
    pts.push(proy.latlng(cx + r * Math.cos(ang), cy + r * Math.sin(ang)));
  }
  return pts;
}

/** Kurva Bezier kuadratik a→b lewat m (tanpa titik ujung — sudah ada di vertices). */
function titikBezier2(a: LatLng, m: LatLng, b: LatLng, n = 24): LatLng[] {
  const pts: LatLng[] = [];
  for (let i = 1; i <= n; i++) {
    const t = i / n;
    const u = 1 - t;
    pts.push({
      lat: u * u * a.lat + 2 * u * t * m.lat + t * t * b.lat,
      lng: u * u * a.lng + 2 * u * t * m.lng + t * t * b.lng,
    });
  }
  return pts;
}

/** Jarak px titik ke ruas layar a-b (hit-test klik pada garis). */
function jarakKeRuasPx(p: L.Point, a: L.Point, b: L.Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy || 1;
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

/** Titik dalam poligon layar (ray casting) — hit-test klik pada poligon. */
function dalamPoligonPx(p: L.Point, pts: L.Point[]): boolean {
  let dalam = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const xi = pts[i].x;
    const yi = pts[i].y;
    const xj = pts[j].x;
    const yj = pts[j].y;
    const potong = yi > p.y !== yj > p.y && p.x < ((xj - xi) * (p.y - yi)) / (yj - yi) + xi;
    if (potong) dalam = !dalam;
  }
  return dalam;
}

/** Ikon kecil untuk handle edit bentuk. */
function ikonHandle(jenis: "titik" | "tengah"): L.DivIcon {
  const html =
    jenis === "titik"
      ? `<div style="width:12px;height:12px;background:#f59e0b;border:2px solid #fff;border-radius:3px;box-shadow:0 1px 3px rgba(0,0,0,.4)"></div>`
      : `<div style="width:11px;height:11px;background:#2563eb;border:2px solid #fff;border-radius:9999px;box-shadow:0 1px 3px rgba(0,0,0,.4)"></div>`;
  return L.divIcon({ className: "", html, iconSize: [12, 12], iconAnchor: [6, 6] });
}

export default function MapCanvas() {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<LayerMap | null>(null);

  // Renderer kanvas BERSAMA — dipakai ulang antar bangun ulang. Dulu tiap rebuild membuat
  // L.canvas() baru yang elemen <canvas>-nya menumpuk di DOM (makin banyak canvas = geser makin berat).
  const rendererTitikRef = useRef<L.Canvas | null>(null);
  const rendererKonturRef = useRef<L.Canvas | null>(null);
  // Referensi marker titik (id → marker) + gaya terakhirnya → pembaruan gaya INKREMENTAL
  // tanpa membangun ulang puluhan ribu marker setiap seleksi/urutan berubah.
  // Marker bisa L.CircleMarker (titik polos, kanvas) atau L.Marker (titik berikon divIcon).
  const markerTitikRef = useRef<Map<string, L.CircleMarker | L.Marker>>(new Map());
  const gayaTitikRef = useRef<Map<string, { sel: boolean; urut: boolean; ikon?: string }>>(new Map());
  const rasterRef = useRef<Map<string, L.ImageOverlay>>(new Map());

  const points = useGis((s) => s.points);
  const shapes = useGis((s) => s.shapes);
  // radius manual lingkaran (alat Bulatan): teks input + cermin angka di ref agar
  // listener peta (efek [tool]) selalu membaca nilai terbaru tanpa registrasi ulang
  const [radiusManual, setRadiusManual] = useState("");
  const radiusManualRef = useRef(0);
  const labels = useGis((s) => s.labels);
  const contours = useGis((s) => s.contours);
  const layers = useGis((s) => s.layers);
  const selection = useGis((s) => s.selection);
  const urutanPoligon = useGis((s) => s.urutanPoligon);
  const jenisPoligonTitik = useGis((s) => s.jenisPoligonTitik);
  const dialogPoligonTitik = useGis((s) => s.dialogs.poligonTitik);
  const basemap = useGis((s) => s.basemap);
  const labelMode = useGis((s) => s.labelMode);
  const pendingVertices = useGis((s) => s.pendingVertices);
  const tool = useGis((s) => s.tool);
  const measurePoints = useGis((s) => s.measurePoints);
  const flyNonce = useGis((s) => s.flyNonce);
  const flyTarget = useGis((s) => s.flyTarget);
  const fitNonce = useGis((s) => s.fitNonce);
  const view = useGis((s) => s.view);
  const perf = useGis((s) => s.perf);

  // ---------- Inisialisasi peta ----------
  useEffect(() => {
    const el = containerRef.current;
    if (!el || mapRef.current) return;

    const map = L.map(el, {
      zoomControl: false,
      attributionControl: true,
      center: [-6.994292, 110.4294],
      zoom: 15,
    });
    mapRef.current = map;

    const osm = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(map);

    const sat = L.tileLayer(
      "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
      {
        maxZoom: 19,
        attribution: "Tiles &copy; Esri — Source: Esri, Maxar, Earthstar Geographics",
      }
    );

    layerRef.current = {
      osm,
      sat,
      points: L.layerGroup().addTo(map),
      shapes: L.layerGroup().addTo(map),
      labels: L.layerGroup().addTo(map),
      contours: L.layerGroup().addTo(map),
      temp: L.layerGroup().addTo(map),
    };

    // pane khusus raster georeferensi: DI BAWAH fitur titik/garis (overlayPane 400),
    // DI ATAS basemap tile (tilePane 200) — dan tak menghalangi klik
    map.createPane("raster-pane");
    const pane = map.getPane("raster-pane")!;
    pane.style.zIndex = "350";
    pane.style.pointerEvents = "none";

    map.on("click", (e: L.LeafletMouseEvent) => {
      useGis.getState().mapClick(e.latlng.lat, e.latlng.lng);
    });

    // posisi peta terkini → store (dipakai Simpan Proyek & sesi otomatis)
    const kirimView = () => {
      const c = map.getCenter();
      useGis.getState().setMapView({ lat: c.lat, lng: c.lng, zoom: map.getZoom() });
    };
    map.on("moveend zoomend", kirimView);

    // perintah zoom ke batas layer (dari Panel Layer)
    const onFitBounds = (ev: Event) => {
      const b = (ev as CustomEvent<[number, number][]>).detail;
      if (Array.isArray(b) && b.length > 0) map.fitBounds(L.latLngBounds(b).pad(0.2));
    };
    window.addEventListener("geokita-fit-bounds", onFitBounds);

    const onZoom = (e: Event) => {
      const detail = (e as CustomEvent<number>).detail;
      map.zoomIn(detail);
    };
    window.addEventListener("geokita-zoom", onZoom);

    // menu Optimasi → bersihkan cache tile peta (lepaskan tile di luar layar dari memori)
    const onBersihkanCache = () => {
      map.closePopup();
      map.eachLayer((ly) => {
        if (ly instanceof L.TileLayer) (ly as unknown as { pruneTiles?: () => void }).pruneTiles?.();
      });
    };
    window.addEventListener("geokita-bersihkan-cache", onBersihkanCache);

    // ekspos untuk pengujian otomatis (tidak berpengaruh ke UI)
    (window as unknown as { __geoMap?: L.Map }).__geoMap = map;

    // Tinggi toolbar bisa berubah (ribbon turun 2 baris saat layar sempit, resize jendela,
    // zoom browser) — ukuran kanvas peta wajib ikut menyesuaikan agar tidak terpotong.
    const ro = new ResizeObserver(() => map.invalidateSize());
    ro.observe(el);

    return () => {
      ro.disconnect();
      map.off("moveend zoomend", kirimView);
      window.removeEventListener("geokita-fit-bounds", onFitBounds);
      window.removeEventListener("geokita-zoom", onZoom);
      window.removeEventListener("geokita-bersihkan-cache", onBersihkanCache);
      map.remove();
      mapRef.current = null;
      layerRef.current = null;
      rendererTitikRef.current = null;
      rendererKonturRef.current = null;
      markerTitikRef.current.clear();
      gayaTitikRef.current.clear();
    };
  }, []);

  // ---------- Basemap ----------
  useEffect(() => {
    const l = layerRef.current;
    const map = mapRef.current;
    if (!l || !map) return;
    if (basemap === "sat") {
      if (map.hasLayer(l.osm)) map.removeLayer(l.osm);
      if (!map.hasLayer(l.sat)) l.sat.addTo(map);
    } else {
      if (map.hasLayer(l.sat)) map.removeLayer(l.sat);
      if (!map.hasLayer(l.osm)) l.osm.addTo(map);
    }
  }, [basemap]);

  // ---------- Kursor sesuai alat ----------
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    // mode layout: peta utama berada di balik sheet layout — biarkan kursor normal
    el.style.cursor = view === "layout" ? "" : tool || dialogPoligonTitik ? "crosshair" : "";
  }, [tool, dialogPoligonTitik, view]);

  // ---------- Esc global: matikan alat aktif (alat gambar bersifat sticky) ----------
  // Satu handler untuk SEMUA alat — sebelumnya tiap alat punya listener sendiri.
  // Saat dialog/modal terbuka, Esc diabaikan (dipakai dialog untuk menutup diri;
  // alat tetap menyala sehingga user bisa langsung menggambar lagi setelah dialog tertutup).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      // Esc di dalam kolom isian (input/textarea/select) → biarkan kolom yang menangani
      // (mis. batal menulis keterangan layout tanpa mematikan alat)
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT")) return;
      const st = useGis.getState();
      if (adaDialogTerbuka(st.dialogs)) return;
      if (st.tool) st.cancelDraw();
    };
    // fase CAPTURE: harus jalan SEBELUM handler Radix dialog (fase bubble) —
    // kalau tidak, dialog sudah tutup dulu (state shapeInfo=null) dan guard
    // tidak sempat melihat bahwa dialog tadi terbuka saat Esc ditekan
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, []);

  // ---------- Preferensi performa: animasi peta ----------
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    map.options.zoomAnimation = perf.animasi;
    map.options.fadeAnimation = perf.animasi;
    map.options.markerZoomAnimation = perf.animasi;
    map.options.inertia = perf.animasi;
    map.eachLayer((ly) => {
      if (ly instanceof L.TileLayer) L.Util.setOptions(ly, { updateWhenZooming: perf.animasi });
    });
  }, [perf.animasi]);

  // ---------- Alat blok seleksi & zoom kotak (drag persegi) ----------
  useEffect(() => {
    if (view === "layout") return; // alat GAMBAR/analisis peta nonaktif saat mode layout
    if (tool !== "select" && tool !== "zoombox") return;
    const map = mapRef.current;
    const l = layerRef.current;
    if (!map || !l) return;

    // matikan geser peta agar drag digunakan untuk kotak
    map.dragging.disable();
    map.doubleClickZoom.disable();

    let awal: L.LatLng | null = null;
    let posisiTerakhir: L.LatLng | null = null;
    let kotak: L.Rectangle | null = null;
    let cukupJauh = false;

    const gaya =
      tool === "select"
        ? { color: "#2563eb", weight: 1.5, dashArray: "6 4", fillColor: "#3b82f6", fillOpacity: 0.12 }
        : { color: "#7c3aed", weight: 1.5, dashArray: "6 4", fillColor: "#7c3aed", fillOpacity: 0.12 };

    const selesaikan = (akhir: L.LatLng | null) => {
      const mula = awal;
      awal = null;
      posisiTerakhir = null;
      if (kotak) {
        l.temp.removeLayer(kotak);
        kotak = null;
      }
      if (!mula || !akhir) return;

      if (!cukupJauh) {
        // hanya klik (tanpa drag)
        if (tool === "select") {
          // klik area kosong mengosongkan seleksi — kecuali yang diklik adalah fitur
          setTimeout(() => {
            if (!klikFiturBarusan) useGis.getState().clearSelection();
            klikFiturBarusan = false;
          }, 0);
        }
        return;
      }

      const bounds = L.latLngBounds(mula, akhir);

      if (tool === "zoombox") {
        map.fitBounds(bounds, { padding: [8, 8] });
        useGis.getState().setTool(null); // selesai otomatis seperti Zoom Window AutoCAD
        return;
      }

      // ---- blok seleksi: semua titik di dalam kotak + bentuk yang beririsan ----
      const st = useGis.getState();
      const tambah = dragTambah;
      const dasar = tambah ? [...st.selection] : [];
      const ids = new Set(dasar);
      let nTitik = 0;
      let nBentuk = 0;
      const dasarSet = new Set(dasar);
      for (const p of st.points) {
        if (bounds.contains([p.lat, p.lng])) {
          if (!dasarSet.has(p.id)) nTitik++;
          ids.add(p.id);
        }
      }
      for (const sh of st.shapes) {
        const bbox = L.latLngBounds(sh.vertices.map((v) => [v.lat, v.lng] as [number, number]));
        const kena =
          sh.vertices.some((v) => bounds.contains([v.lat, v.lng])) || bbox.intersects(bounds);
        if (kena) {
          if (!dasarSet.has(sh.id)) nBentuk++;
          ids.add(sh.id);
        }
      }
      useGis.getState().setSelection(Array.from(ids));
      const totalBaru = ids.size - dasarSet.size;
      toast.success(`${totalBaru} fitur terblok`, {
        description: `${nTitik} titik + ${nBentuk} poligon/garis masuk kotak${tambah ? " (ditambah ke pilihan)" : ""}. Total terpilih: ${ids.size}. Klik Hapus untuk menghapus.`,
      });
    };

    const onMouseDown = (e: L.LeafletMouseEvent) => {
      awal = e.latlng;
      posisiTerakhir = e.latlng;
      cukupJauh = false;
    };
    const onMouseMove = (e: L.LeafletMouseEvent) => {
      posisiTerakhir = e.latlng;
      if (!awal) return;
      const p1 = map.latLngToContainerPoint(awal);
      const p2 = map.latLngToContainerPoint(e.latlng);
      if (Math.abs(p1.x - p2.x) < 6 || Math.abs(p1.y - p2.y) < 6) return;
      cukupJauh = true;
      const bounds = L.latLngBounds(awal, e.latlng);
      if (!kotak) {
        kotak = L.rectangle(bounds, { ...gaya, interactive: false });
        kotak.addTo(l.temp);
      } else {
        kotak.setBounds(bounds);
      }
    };
    const onMouseUp = () => selesaikan(posisiTerakhir);
    const onWindowUp = () => {
      if (awal) selesaikan(posisiTerakhir);
    };

    // Shift/Ctrl saat mulai drag = tambahkan ke pilihan yang sudah ada
    const onDownShift = (e: L.LeafletMouseEvent) => {
      dragTambah = e.originalEvent.shiftKey || e.originalEvent.ctrlKey || e.originalEvent.metaKey;
      onMouseDown(e);
    };

    map.on("mousedown", onDownShift);
    map.on("mousemove", onMouseMove);
    map.on("mouseup", onMouseUp);
    window.addEventListener("mouseup", onWindowUp);

    return () => {
      map.off("mousedown", onDownShift);
      map.off("mousemove", onMouseMove);
      map.off("mouseup", onMouseUp);
      window.removeEventListener("mouseup", onWindowUp);
      if (kotak && l.temp.hasLayer(kotak)) l.temp.removeLayer(kotak);
      map.dragging.enable();
      map.doubleClickZoom.enable();
      dragTambah = false;
    };
  }, [tool, view]);

  // ---------- Alat blok poligon: gambar poligon → semua fitur di dalamnya terpilih ----------
  useEffect(() => {
    if (view === "layout") return; // nonaktif saat mode layout (anotasi ditangani LayoutView)
    if (tool !== "select-poligon") return;
    const map = mapRef.current;
    if (!map) return;

    // dobel-klik jangan men-zoom — dipakai untuk menutup poligon blok
    map.doubleClickZoom.disable();
    // dragging tetap HIDUP: user bisa menggeser peta di tengah menarik poligon

    let terakhirSelesai = 0;

    const tutupDengan = (tambah: boolean) => {
      const st = useGis.getState();
      const hasil = st.selesaikanBlokPoligon(tambah);
      terakhirSelesai = Date.now();
      if (!hasil) {
        toast.info("Minimal 3 titik poligon", { description: "Klik minimal 3 titik sudut di peta sebelum menutup poligon blok." });
        return;
      }
      toast.success(`${hasil.total} fitur terblok poligon`, {
        description: `${hasil.titik} titik + ${hasil.bentuk} poligon/garis ada di dalam poligon${tambah ? " (ditambah ke pilihan)" : ""}. Total terpilih: ${hasil.total}. Alat masih aktif — gambar poligon lain atau Esc untuk berhenti.`,
      });
    };

    const onKlik = (e: L.LeafletMouseEvent) => {
      const st = useGis.getState();
      const pv = st.pendingVertices;
      // klik dekat titik PERTAMA (≥3 vertiks) = tutup poligon & blok
      if (pv.length >= 3) {
        const p1 = map.latLngToContainerPoint(pv[0]);
        const p2 = map.latLngToContainerPoint(e.latlng);
        if (Math.hypot(p1.x - p2.x, p1.y - p2.y) < 12) {
          tutupDengan(e.originalEvent.shiftKey || e.originalEvent.ctrlKey || e.originalEvent.metaKey);
          return;
        }
      }
      useGis.setState((s2) => ({
        pendingVertices: [...s2.pendingVertices, { lat: e.latlng.lat, lng: e.latlng.lng }],
      }));
    };

    const onDbl = (e: L.LeafletMouseEvent) => {
      // buang 2 vertiks yang baru saja ditambahkan oleh 2 klik dobel tadi
      useGis.setState((s2) => ({
        pendingVertices: s2.pendingVertices.slice(0, Math.max(0, s2.pendingVertices.length - 2)),
      }));
      if (Date.now() - terakhirSelesai < 400) return; // sudah selesai via klik-titik-pertama
      const st = useGis.getState();
      if (st.pendingVertices.length >= 3) {
        tutupDengan(e.originalEvent.shiftKey || e.originalEvent.ctrlKey || e.originalEvent.metaKey);
      }
    };

    map.on("click", onKlik);
    map.on("dblclick", onDbl);
    return () => {
      map.off("click", onKlik);
      map.off("dblclick", onDbl);
      map.doubleClickZoom.enable();
    };
  }, [tool, view]);

  // ---------- Alat bentuk: bulatan / elips / lengkung kiri-kanan ----------
  useEffect(() => {
    if (view === "layout") return; // nonaktif saat mode layout (anotasi ditangani LayoutView)
    if (tool !== "bulatan" && tool !== "elips" && tool !== "lengkung-kiri" && tool !== "lengkung-kanan") return;
    const map = mapRef.current;
    const l = layerRef.current;
    if (!map || !l) return;

    const pv = L.layerGroup().addTo(l.temp); // pratinjau bentuk (dibersihkan tiap gerak kursor)
    const pvJangkar = L.layerGroup().addTo(l.temp); // jangkar titik awal (tahan sampai selesai)
    let awal: L.LatLng | null = null;
    let petunjukLayer: L.Layer | null = null;

    // Ikon jangkar: pin "Titik Awal Tarikan" + cincin pulse animasi di ujung pin (titik koordinat)
    const ikonJangkar = () =>
      L.divIcon({
        className: "",
        html: `<div class="cadgis-jangkar"><span class="cadgis-jangkar-pulse"></span>${ikonHtml("titik-awal", false) ?? ""}</div>`,
        iconSize: [24, 30],
        iconAnchor: [12, 29],
      });

    const petunjukAwal = () => {
      if (tool === "bulatan") {
        const rm = radiusManualRef.current;
        return rm > 0
          ? `Klik = pusat lingkaran R ${fmtMeter(rm)}`
          : "Titik awal terpasang — gerakkan mouse lalu klik untuk menentukan radius";
      }
      if (tool === "elips") return "Titik awal terpasang — gerakkan mouse lalu klik untuk menentukan jangkauan elips";
      return "Titik awal terpasang — gerakkan mouse lalu klik di ujung busur";
    };

    /** Pasang jangkar + petunjuk pada titik pertama (panggil sekali setelah klik pertama). */
    const pasangJangkar = () => {
      if (!awal) return;
      L.marker([awal.lat, awal.lng], { icon: ikonJangkar(), interactive: false, zIndexOffset: 900 }).addTo(pvJangkar);
      petunjukLayer = L.tooltip({ permanent: true, direction: "right", offset: [12, 0], className: "geokita-measure-label" })
        .setLatLng(awal).setContent(petunjukAwal()).addTo(pvJangkar);
    };

    const onMove = (e: L.LeafletMouseEvent) => {
      if (!awal) return;
      pv.clearLayers();
      // begitu mulai menarik, petunjuk teks tidak perlu lagi — jangkar tetap berdenyut
      if (petunjukLayer) {
        pvJangkar.removeLayer(petunjukLayer);
        petunjukLayer = null;
      }
      const gaya = { color: "#2563eb", weight: 2, dashArray: "6 5", fillColor: "#3b82f6", fillOpacity: 0.08, interactive: false };
      // garis bantu lurus titik awal → kursor + label ukuran di tengah garis (gaya dimensi CAD)
      const garisTarik = (label: string) => {
        L.polyline(
          [[awal!.lat, awal!.lng], [e.latlng.lat, e.latlng.lng]],
          { color: "#f59e0b", weight: 2, dashArray: "2 7", interactive: false }
        ).addTo(pv);
        const mid: [number, number] = [(awal!.lat + e.latlng.lat) / 2, (awal!.lng + e.latlng.lng) / 2];
        L.tooltip({ permanent: true, direction: "center", className: "geokita-measure-label" })
          .setLatLng(mid).setContent(label).addTo(pv);
      };
      if (tool === "bulatan") {
        const rm = radiusManualRef.current;
        if (rm > 0) {
          // radius manual: pratinjau lingkaran berukuran TETAP mengikuti kursor —
          // 1 klik cukup untuk menetapkan pusat
          L.circle(e.latlng, { ...gaya, radius: rm }).addTo(pv);
          L.tooltip({ permanent: true, direction: "top", className: "geokita-measure-label" })
            .setLatLng(e.latlng).setContent(`R ${fmtMeter(rm)} • klik = pusat`).addTo(pv);
          return;
        }
        const r = jarakHaversine(awal, e.latlng);
        L.circle(awal, { ...gaya, radius: r }).addTo(pv);
        garisTarik(`R ${fmtMeter(r)}`);
      } else if (tool === "elips") {
        const P = buatProyeksi(awal).xy(e.latlng);
        L.polygon(
          titikElips(awal, Math.abs(P.x), Math.abs(P.y), 48).map((v) => [v.lat, v.lng] as [number, number]),
          gaya
        ).addTo(pv);
        garisTarik(`${fmtMeter(Math.abs(P.x))} × ${fmtMeter(Math.abs(P.y))}`);
      } else {
        const arah = tool === "lengkung-kiri" ? "kiri" : "kanan";
        L.polyline(
          titikBusurSetengah(awal, e.latlng, arah).map((v) => [v.lat, v.lng] as [number, number]),
          { color: "#2563eb", weight: 2.5, dashArray: "6 5", interactive: false }
        ).addTo(pv);
        const chord = jarakHaversine(awal, e.latlng);
        garisTarik(`R ${fmtMeter(chord / 2)}`);
      }
    };

    const simpanBentuk = (
      kind: "closed" | "open",
      vertices: LatLng[],
      titikAwal?: { lat: number; lng: number; jenis: "bulatan" | "elips"; radius?: number; rx?: number; ry?: number }
    ) => {
      // buka dialog penamaan (alur sama dengan poligon/garis) — alat TIDAK dimatikan (sticky):
      // setelah dialog ditutup, user bisa langsung membuat bulatan/elips/lengkung berikutnya
      // (Esc / klik tombol alat sekali lagi = berhenti)
      useGis.setState({
        pendingVertices: [],
        pendingShapeSave: { kind, vertices, titikAwal },
        dialogs: { ...useGis.getState().dialogs, shapeInfo: { id: "pending:baru" } },
      });
      // reset sesi tarik: jangkar & pratinjau dibersihkan, tarikan berikutnya mulai dari nol
      awal = null;
      pv.clearLayers();
      pvJangkar.clearLayers();
      petunjukLayer = null;
    };

    const onKlik = (e: L.LeafletMouseEvent) => {
      // radius manual aktif → SATU klik langsung menjadi lingkaran jadi
      if (tool === "bulatan" && radiusManualRef.current > 0) {
        const rm = radiusManualRef.current;
        if (rm < 0.1) {
          toast.error("Radius manual terlalu kecil — isi minimal 0,1 meter.");
          return;
        }
        simpanBentuk("closed", titikLingkaran(e.latlng, rm), {
          lat: e.latlng.lat,
          lng: e.latlng.lng,
          jenis: "bulatan",
          radius: rm,
        });
        return;
      }
      if (!awal) {
        awal = e.latlng;
        // panduan instan setelah klik pertama: jangkar berdenyut + petunjuk langkah berikutnya
        pasangJangkar();
        return;
      }
      const akhir = e.latlng;
      if (tool === "bulatan") {
        const r = jarakHaversine(awal, akhir);
        if (r < 1) {
          toast.error("Radius terlalu kecil — klik lebih jauh dari pusat.");
          return;
        }
        simpanBentuk("closed", titikLingkaran(awal, r), { lat: awal.lat, lng: awal.lng, jenis: "bulatan", radius: r });
      } else if (tool === "elips") {
        const P = buatProyeksi(awal).xy(akhir);
        if (Math.abs(P.x) < 1 && Math.abs(P.y) < 1) {
          toast.error("Elips terlalu kecil — klik lebih jauh dari pusat.");
          return;
        }
        simpanBentuk("closed", titikElips(awal, Math.abs(P.x), Math.abs(P.y)), {
          lat: awal.lat,
          lng: awal.lng,
          jenis: "elips",
          rx: Math.abs(P.x),
          ry: Math.abs(P.y),
        });
      } else {
        const chord = jarakHaversine(awal, akhir);
        if (chord < 1) {
          toast.error("Busur terlalu kecil — klik awal dan akhir lebih berjauhan.");
          return;
        }
        simpanBentuk("open", titikBusurSetengah(awal, akhir, tool === "lengkung-kiri" ? "kiri" : "kanan"));
      }
    };

    map.on("click", onKlik);
    map.on("mousemove", onMove);
    return () => {
      map.off("click", onKlik);
      map.off("mousemove", onMove);
      l.temp.removeLayer(pv);
      l.temp.removeLayer(pvJangkar);
    };
  }, [tool, view]);

  // ---------- Alat edit bentuk: pindah titik + lengkungkan ruas lurus (ala AutoCAD) ----------
  useEffect(() => {
    if (view === "layout") return; // nonaktif saat mode layout (anotasi ditangani LayoutView)
    if (tool !== "edit-bentuk") return;
    const map = mapRef.current;
    const l = layerRef.current;
    if (!map || !l) return;

    let shapeId: string | null = null;
    let verts: LatLng[] = [];
    let kind: "closed" | "open" = "open";
    let bengkok: { seg: number; mid: LatLng } | null = null;
    let handles: L.Marker[] = [];
    let garis: L.Polyline | null = null;

    const bersihkanHandle = () => {
      handles.forEach((h) => l.temp.removeLayer(h));
      handles = [];
    };

    /** Vertiks saat ini: ruas yang dibengkokkan diganti kurva Bezier. */
    const verticesKini = (): LatLng[] => {
      if (!bengkok) return verts;
      const a = verts[bengkok.seg];
      const b = verts[(bengkok.seg + 1) % verts.length];
      if (!a || !b) return verts;
      return [
        ...verts.slice(0, bengkok.seg + 1),
        ...titikBezier2(a, bengkok.mid, b),
        ...verts.slice(bengkok.seg + 1),
      ];
    };

    const gambarPratinjau = () => {
      const vv = verticesKini().map((v) => [v.lat, v.lng] as [number, number]);
      if (kind === "closed" && vv.length >= 3) vv.push(vv[0]);
      if (!garis) {
        garis = L.polyline(vv, { color: "#f59e0b", weight: 3, opacity: 0.95, interactive: false }).addTo(l.temp);
      } else {
        garis.setLatLngs(vv);
      }
    };

    const bangunHandle = () => {
      bersihkanHandle();
      const min = kind === "closed" ? 3 : 2;
      const n = verts.length;

      // handle titik (kotak oranye): seret = pindah • Alt+klik = hapus
      verts.forEach((v, i) => {
        const m = L.marker([v.lat, v.lng], { icon: ikonHandle("titik"), draggable: true, zIndexOffset: 800 });
        m.on("drag", () => {
          verts[i] = m.getLatLng();
          gambarPratinjau();
        });
        m.on("dragend", () => {
          verts = verticesKini();
          bengkok = null;
          useGis.getState().updateShape(shapeId!, { vertices: verts });
          bangunHandle();
          gambarPratinjau();
        });
        m.on("click", (e) => {
          const ev = (e as unknown as L.LeafletMouseEvent).originalEvent;
          if (ev?.altKey && verts.length > min) {
            verts.splice(i, 1);
            useGis.getState().updateShape(shapeId!, { vertices: verts });
            bangunHandle();
            gambarPratinjau();
          }
        });
        m.addTo(l.temp);
        handles.push(m);
      });

      // handle tengah ruas (bulat biru): seret = lengkungkan ruas jadi busur
      const jumlahRuas = kind === "closed" ? n : n - 1;
      for (let i = 0; i < jumlahRuas; i++) {
        const a = verts[i];
        const b = verts[(i + 1) % n];
        const mid: LatLng = { lat: (a.lat + b.lat) / 2, lng: (a.lng + b.lng) / 2 };
        const m = L.marker([mid.lat, mid.lng], { icon: ikonHandle("tengah"), draggable: true, zIndexOffset: 900 });
        m.on("dragstart", () => {
          bengkok = { seg: i, mid: m.getLatLng() };
          gambarPratinjau();
        });
        m.on("drag", () => {
          if (bengkok) bengkok.mid = m.getLatLng();
          gambarPratinjau();
        });
        m.on("dragend", () => {
          if (bengkok) {
            verts = verticesKini();
            bengkok = null;
            useGis.getState().updateShape(shapeId!, { vertices: verts });
          }
          bangunHandle();
          gambarPratinjau();
        });
        m.addTo(l.temp);
        handles.push(m);
      }
    };

    const akhiriSesi = () => {
      bersihkanHandle();
      if (garis) {
        l.temp.removeLayer(garis);
        garis = null;
      }
      shapeId = null;
      bengkok = null;
    };

    const mulai = (sh: GisShape) => {
      if (shapeId === sh.id) return; // sudah diedit — hindari inisialisasi ulang
      shapeId = sh.id;
      verts = sh.vertices.map((v) => ({ ...v }));
      kind = sh.kind;
      bengkok = null;
      bangunHandle();
      gambarPratinjau();
      toast.info(`Mengedit: ${sh.title || "bentuk"}`, {
        description:
          "Seret kotak oranye = pindah titik • seret bulat biru di tengah ruas = lengkungkan • Alt+klik kotak = hapus titik • klik area kosong = pilih bentuk lain • Esc = selesai",
      });
    };

    // bentuk yang diminta langsung dari popup "Edit Titik"
    const preset = useGis.getState().editBentukId;
    useGis.getState().setEditBentukId(null);
    if (preset) {
      const sh = useGis.getState().shapes.find((x) => x.id === preset);
      if (sh) mulai(sh);
    }

    const onEditEv = (ev: Event) => {
      const id = (ev as CustomEvent<string>).detail;
      const sh = useGis.getState().shapes.find((x) => x.id === id);
      if (sh) mulai(sh);
    };
    window.addEventListener("geokita-edit-bentuk", onEditEv);

    // klik peta: pilih bentuk yang kena (hit-test layar); klik area kosong = akhiri sesi
    const onKlik = (e: L.LeafletMouseEvent) => {
      const st = useGis.getState();
      const cp = map.latLngToContainerPoint(e.latlng);
      for (let si = st.shapes.length - 1; si >= 0; si--) {
        const sh = st.shapes[si];
        if (!sh.visible) continue;
        const pts = sh.vertices.map((v) => map.latLngToContainerPoint([v.lat, v.lng]));
        let minD = Infinity;
        for (let i = 0; i < pts.length - 1; i++) minD = Math.min(minD, jarakKeRuasPx(cp, pts[i], pts[i + 1]));
        if (sh.kind === "closed" && pts.length >= 3) {
          if (dalamPoligonPx(cp, pts) || minD < 8) {
            mulai(sh);
            return;
          }
        } else if (minD < 8) {
          mulai(sh);
          return;
        }
      }
      if (shapeId) akhiriSesi();
    };

    map.on("click", onKlik);

    return () => {
      map.off("click", onKlik);
      window.removeEventListener("geokita-edit-bentuk", onEditEv);
      akhiriSesi();
    };
  }, [tool, view]);

  // ---------- Render titik (bangun ulang HANYA saat data/mode label/batas render berubah) ----------
  useEffect(() => {
    const l = layerRef.current;
    if (!l) return;
    l.points.clearLayers();

    const mm = markerTitikRef.current;
    const gm = gayaTitikRef.current;
    mm.clear();
    gm.clear();

    const renderer = (rendererTitikRef.current ??= L.canvas({ padding: 0.3 }));

    // snapshot gaya SAAT pembuatan; perubahan seleksi/urutan berikutnya
    // ditangani efek inkremental di bawah (tanpa bangun ulang)
    const st = useGis.getState();
    const selSet = new Set(st.selection);
    const urutSet = new Set(st.urutanPoligon);

    const cap = Math.min(points.length, RENDER_CAP, perf.batasRender);
    let labelDipakai = 0;
    for (let i = 0; i < cap; i++) {
      const p = points[i];
      if (!p.visible) continue; // disembunyikan per fitur / per layer
      const terpilih = selSet.has(p.id);
      const dalamUrutan = urutSet.has(p.id);
      // Titik berikon (as-built FO) → L.Marker divIcon SVG; polos → circleMarker kanvas (ringan)
      let marker: L.CircleMarker | L.Marker;
      if (p.ikon && p.ikon !== "polos") {
        marker = L.marker([p.lat, p.lng], { icon: ikonDivIcon(p.ikon, terpilih || dalamUrutan) });
      } else {
        marker = L.circleMarker([p.lat, p.lng], {
          renderer,
          radius: terpilih || dalamUrutan ? 7 : 5,
          ...gayaTitik(terpilih, dalamUrutan),
        });
      }
      marker.on("click", () => {
        const st = useGis.getState();
        // dialog "Dari Titik" terbuka: klik titik = tambah ke urutan sambungan
        if (st.dialogs.poligonTitik) {
          st.tambahUrutanPoligon(p.id);
          return;
        }
        // mode blok: klik titik = pilih/hilangkan satu titik (tanpa popup)
        if (st.tool === "select") {
          klikFiturBarusan = true;
          st.toggleSelect(p.id);
          return;
        }
        // blok poligon: tanpa popup — tarik poligon melewati titik ini
        if (st.tool === "select-poligon") return;
        if (st.tool === "edit-bentuk") return; // alat edit bentuk: titik diabaikan
        // alat gambar aktif: teruskan klik ke peta sebagai vertiks/radius/jangkar —
        // klik marker kanvas tidak menggelembung sendiri, jadi disalurkan manual
        if (ALAT_GAMBAR.includes(st.tool as (typeof ALAT_GAMBAR)[number])) {
          const mapM = mapRef.current;
          if (mapM) {
            const rect = mapM.getContainer().getBoundingClientRect();
            const cp = mapM.latLngToContainerPoint([p.lat, p.lng]);
            mapM.getContainer().dispatchEvent(
              new MouseEvent("click", { clientX: rect.left + cp.x, clientY: rect.top + cp.y, bubbles: true })
            );
          }
          return;
        }
        bukaPopupTitik(mapRef.current!, p, l);
      });
      // Label nama sesuai mode: semua / terpilih (bertanda) / sembunyi
      const labelNyala =
        labelMode === "semua"
          ? !!p.title
          : labelMode === "terpilih"
            ? !!p.labelTampil && !!p.title
            : false;
      // batas label: ribuan tooltip permanen (DOM) membuat geser & zoom berat
      if (labelNyala && labelDipakai < perf.batasLabel) {
        marker.bindTooltip(p.title, {
          permanent: true,
          direction: "right",
          offset: [9, 0],
          className: "geokita-name-label",
        });
        labelDipakai++;
      }
      marker.addTo(l.points);
      mm.set(p.id, marker);
      gm.set(p.id, { sel: terpilih, urut: dalamUrutan, ikon: p.ikon });
    }
  }, [points, labelMode, perf.batasRender, perf.batasLabel]);

  // ---------- Pembaruan gaya titik INKREMENTAL (seleksi & urutan "Dari Titik") ----------
  // Dulu: efek bangun-ulang penuh (±20 ribu marker) berjalan SETIAP kali seleksi atau urutan
  // berubah — inilah jeda yang terasa saat memilih titik satu per satu di dialog.
  useEffect(() => {
    const mm = markerTitikRef.current;
    if (mm.size === 0) return;
    const selSet = new Set(selection);
    const urutSet = new Set(urutanPoligon);
    mm.forEach((marker, id) => {
      const terpilih = selSet.has(id);
      const dalamUrutan = urutSet.has(id);
      const lama = gayaTitikRef.current.get(id);
      if (lama && lama.sel === terpilih && lama.urut === dalamUrutan) return;
      if (marker instanceof L.Marker) {
        // titik berikon: ganti ikon dgn versi ber-halo biru saat terpilih/diurutan
        if (lama?.ikon) marker.setIcon(ikonDivIcon(lama.ikon, terpilih || dalamUrutan));
      } else {
        marker.setStyle(gayaTitik(terpilih, dalamUrutan));
        marker.setRadius(terpilih || dalamUrutan ? 7 : 5);
      }
      gayaTitikRef.current.set(id, { sel: terpilih, urut: dalamUrutan, ikon: lama?.ikon });
    });
  }, [selection, urutanPoligon]);

  // ---------- Pratinjau sambungan "Dari Titik" (garis putus-putus) ----------
  const pratinjauRef = useRef<L.LayerGroup | null>(null);
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (!pratinjauRef.current) pratinjauRef.current = L.layerGroup().addTo(map);
    const g = pratinjauRef.current;
    g.clearLayers();
    if (!dialogPoligonTitik || urutanPoligon.length < 2) return;
    // koordinat sesuai urutan (loop pencarian, aman utk 30rb+ titik)
    const pts: [number, number][] = [];
    for (const id of urutanPoligon) {
      const p = points.find((x) => x.id === id);
      if (p) pts.push([p.lat, p.lng]);
    }
    if (pts.length < 2) return;
    L.polyline(pts, { color: "#059669", weight: 2.5, dashArray: "8 6", opacity: 0.95, interactive: false }).addTo(g);
    // tertutup: segmen penutup terakhir → pertama (lebih samar)
    if (jenisPoligonTitik === "closed" && pts.length >= 3) {
      L.polyline([pts[pts.length - 1], pts[0]], { color: "#059669", weight: 2, dashArray: "2 7", opacity: 0.55, interactive: false }).addTo(g);
    }
  }, [urutanPoligon, dialogPoligonTitik, jenisPoligonTitik, points]);

  // ---------- Render poligon & garis ----------
  useEffect(() => {
    const l = layerRef.current;
    if (!l) return;
    l.shapes.clearLayers();
    const selSet = new Set(selection);
    for (const sh of shapes) {
      if (!sh.visible) continue;
      const terpilih = selSet.has(sh.id);
      const latlngs = sh.vertices.map((v) => [v.lat, v.lng] as [number, number]);
      if (sh.kind === "closed" && latlngs.length >= 3) {
        const poly = L.polygon(latlngs, {
          color: terpilih ? "#f59e0b" : sh.color,
          weight: terpilih ? 3.5 : 2,
          fillColor: sh.color,
          fillOpacity: 0.15,
        });
        poly.on("click", (e: L.LeafletMouseEvent) => {
          const st = useGis.getState();
          if (st.tool === "select") {
            klikFiturBarusan = true;
            st.toggleSelect(sh.id);
            return;
          }
          // blok poligon: klik pada poligon = vertiks poligon blok (jangan buka popup)
          if (st.tool === "select-poligon") {
            L.DomEvent.stopPropagation(e);
            useGis.setState((s2) => ({
              pendingVertices: [...s2.pendingVertices, { lat: e.latlng.lat, lng: e.latlng.lng }],
            }));
            return;
          }
          // alat gambar aktif: jangan buka popup — klik menggelembung sendiri ke peta
          if (ALAT_GAMBAR.includes(st.tool as (typeof ALAT_GAMBAR)[number])) return;
          if (st.tool === "edit-bentuk") {
            // langsung buka sesi edit titik & lengkung untuk bentuk ini
            window.dispatchEvent(new CustomEvent("geokita-edit-bentuk", { detail: sh.id }));
            return;
          }
          bukaPopupBentuk(mapRef.current!, sh);
        });
        const labelNyala =
          labelMode === "semua"
            ? !!sh.title
            : labelMode === "terpilih"
              ? !!sh.labelTampil && !!sh.title
              : false;
        if (labelNyala) {
          poly.bindTooltip(sh.title, {
            permanent: true,
            direction: "center",
            className: "geokita-name-label",
          });
        }
        poly.addTo(l.shapes);
      } else if (latlngs.length >= 2) {
        const line = L.polyline(latlngs, {
          color: terpilih ? "#f59e0b" : sh.color,
          weight: terpilih ? 4 : 2.5,
          dashArray: sh.kind === "open" ? "8 6" : undefined,
        });
        line.on("click", (e: L.LeafletMouseEvent) => {
          const st = useGis.getState();
          if (st.tool === "select") {
            klikFiturBarusan = true;
            st.toggleSelect(sh.id);
            return;
          }
          // blok poligon: klik pada garis = vertiks poligon blok (jangan buka popup)
          if (st.tool === "select-poligon") {
            L.DomEvent.stopPropagation(e);
            useGis.setState((s2) => ({
              pendingVertices: [...s2.pendingVertices, { lat: e.latlng.lat, lng: e.latlng.lng }],
            }));
            return;
          }
          // alat gambar aktif: jangan buka popup — klik menggelembung sendiri ke peta
          if (ALAT_GAMBAR.includes(st.tool as (typeof ALAT_GAMBAR)[number])) return;
          if (st.tool === "edit-bentuk") {
            window.dispatchEvent(new CustomEvent("geokita-edit-bentuk", { detail: sh.id }));
            return;
          }
          bukaPopupBentuk(mapRef.current!, sh);
        });
        const labelNyala =
          labelMode === "semua"
            ? !!sh.title
            : labelMode === "terpilih"
              ? !!sh.labelTampil && !!sh.title
              : false;
        if (labelNyala) {
          line.bindTooltip(sh.title, {
            permanent: true,
            direction: "center",
            className: "geokita-name-label",
          });
        }
        line.addTo(l.shapes);
        // mata panah di ujung akhir garis (bentuk hasil alat Panah)
        if (sh.panah && latlngs.length >= 2 && mapRef.current) {
          const a = sh.vertices[sh.vertices.length - 2];
          const b = sh.vertices[sh.vertices.length - 1];
          const sudut = sudutPeta(mapRef.current, a, b);
          L.marker([b.lat, b.lng], {
            icon: L.divIcon({
              className: "",
              html: htmlPanah(sudut, terpilih ? "#f59e0b" : sh.color),
              iconSize: [20, 20],
              iconAnchor: [19, 10],
            }),
            interactive: false,
          }).addTo(l.shapes);
        }
      }
    }
  }, [shapes, selection, labelMode]);

  // ---------- Render label teks ----------
  useEffect(() => {
    const l = layerRef.current;
    if (!l) return;
    l.labels.clearLayers();
    const layerSembunyi = new Set(layers.filter((x) => !x.terlihat).map((x) => x.id));
    for (const lb of labels) {
      if (lb.layerId && layerSembunyi.has(lb.layerId)) continue; // label ikut layer
      const icon = L.divIcon({
        className: "",
        html: `<div class="${kelasLabel(lb)}" style="${gayaLabel(lb)}">${escapeHtml(lb.text)}<span class="geokita-label-resize" title="Tarik untuk mengubah ukuran huruf"></span></div>`,
        iconSize: undefined,
      });
      const m = L.marker([lb.lat, lb.lng], { icon });
      m.on("click", () => {
        useGis.getState().setDialog("text", { lat: lb.lat, lng: lb.lng, editId: lb.id });
      });
      m.addTo(l.labels);

      // pegangan resize manual: tarik titik biru di pojok kanan-bawah label
      const akar = m.getElement();
      const kotak = akar?.querySelector<HTMLElement>(".geokita-label");
      const pegangan = akar?.querySelector<HTMLElement>(".geokita-label-resize");
      if (kotak && pegangan) {
        let tarikAktif = false; // pengaman agar pointerdown + mousedown tidak memulai 2 gestur
        const mulaiTarik = (ev: PointerEvent | MouseEvent) => {
          ev.stopPropagation();
          ev.preventDefault();
          if (tarikAktif) return; // gestur sudah berjalan (pointerdown vs mousedown ganda)
          tarikAktif = true;
          const awalUk = lb.ukuran ?? 12;
          const sx = ev.clientX;
          const sy = ev.clientY;
          let hasil = awalUk;
          const onMove = (e2: PointerEvent | MouseEvent) => {
            const d = e2.clientX - sx + (e2.clientY - sy); // diagonal = membesar
            hasil = Math.min(144, Math.max(8, Math.round(awalUk + d / 2)));
            kotak.style.fontSize = `${hasil}px`; // pratinjau langsung di peta (tanpa rebuild)
          };
          const onUp = () => {
            window.removeEventListener("pointermove", onMove);
            window.removeEventListener("mousemove", onMove);
            window.removeEventListener("pointerup", onUp);
            window.removeEventListener("mouseup", onUp);
            window.removeEventListener("pointercancel", onUp);
            tarikAktif = false;
            if (hasil !== awalUk) useGis.getState().updateLabel(lb.id, { ukuran: hasil });
          };
          window.addEventListener("pointermove", onMove);
          window.addEventListener("mousemove", onMove); // fallback browser tanpa pointer event
          window.addEventListener("pointerup", onUp);
          window.addEventListener("mouseup", onUp);
          window.addEventListener("pointercancel", onUp);
        };
        pegangan.addEventListener("pointerdown", mulaiTarik);
        pegangan.addEventListener("mousedown", mulaiTarik);
        // jangan biarkan pegangan memicu klik edit label / drag peta
        const cegah = (e: Event) => e.stopPropagation();
        pegangan.addEventListener("click", cegah);
        pegangan.addEventListener("dblclick", cegah);
      }
    }
  }, [labels, layers]);

  // ---------- Render kontur ----------
  useEffect(() => {
    const l = layerRef.current;
    if (!l) return;
    l.contours.clearLayers();
    // renderer canvas BERSAMA (dipakai ulang — dulu kanvas baru tiap rebuild menumpuk di DOM)
    const renderer = (rendererKonturRef.current ??= L.canvas({ padding: 0.3 }));
    let eMin = Infinity;
    let eMax = -Infinity;
    let totalPath = 0;
    for (const layer of contours) {
      if (!layer.visible) continue;
      for (const p of layer.paths) {
        if (p.elev < eMin) eMin = p.elev;
        if (p.elev > eMax) eMax = p.elev;
      }
      totalPath += layer.paths.length;
    }
    const rentang = Math.max(eMax - eMin, 1e-6);
    // label permanen dibatasi agar DOM tidak kebanjiran tooltip saat data besar
    const langkahLabel = totalPath > 160 ? Math.ceil(totalPath / 80) : 2;
    let hitung = 0;
    for (const layer of contours) {
      if (!layer.visible) continue;
      layer.paths.forEach((path) => {
        const i = hitung++;
        const line = L.polyline(
          path.coords.map((c) => [c.lat, c.lng] as [number, number]),
          {
            renderer,
            color: warnaElevasi((path.elev - eMin) / rentang),
            weight: 1.8,
            opacity: 0.85,
          }
        );
        line.bindTooltip(`${path.elev} m`, {
          permanent: i % langkahLabel === 0,
          direction: "center",
          className: "geokita-contour-label",
        });
        line.addTo(l.contours);
      });
    }
  }, [contours]);

  // ---------- Raster georeferensi (GeoTIFF overlay / DEM lokal) ----------
  const rasters = useGis((s) => s.rasters);
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const daftar = rasterRef.current;
    const idAktif = new Set(rasters.map((r) => r.id));
    // hapus yang sudah tidak ada
    for (const [id, ov] of daftar) {
      if (!idAktif.has(id)) {
        map.removeLayer(ov);
        daftar.delete(id);
      }
    }
    for (const r of rasters) {
      let ov = daftar.get(r.id);
      if (ov) {
        ov.setOpacity(r.terlihat ? r.opasitas : 0);
      } else {
        ov = L.imageOverlay(r.gambarUrl, L.latLngBounds([r.selatan, r.barat], [r.utara, r.timur]), {
          opacity: r.terlihat ? r.opasitas : 0,
          pane: "raster-pane",
          interactive: false,
          className: "geokita-raster",
        });
        ov.addTo(map);
        daftar.set(r.id, ov);
      }
    }
  }, [rasters]);

  // ---------- Gambar sementara (pending & ukur) ----------
  useEffect(() => {
    const l = layerRef.current;
    if (!l) return;
    // alat bentuk (bulatan/elips/lengkung) memegang l.temp lewat efek khususnya sendiri
    // (grup pratinjau + jangkar titik awal) — clearLayers di sini akan ikut MENGHAPUS
    // grup tersebut dari peta sehingga pratinjau/garis bantu tak pernah tampak.
    if (tool === "bulatan" || tool === "elips" || tool === "lengkung-kiri" || tool === "lengkung-kanan") return;
    l.temp.clearLayers();

    if (pendingVertices.length > 0) {
      const latlngs = pendingVertices.map((v) => [v.lat, v.lng] as [number, number]);
      if (tool === "select-poligon") {
        // pratinjau poligon blok: garis violet + segmen penutup ke titik pertama + titik sudut
        if (latlngs.length >= 2) {
          L.polyline(latlngs, { color: "#7c3aed", weight: 2.5, dashArray: "6 5" }).addTo(l.temp);
          L.polyline([latlngs[latlngs.length - 1], latlngs[0]], {
            color: "#7c3aed",
            weight: 1.5,
            dashArray: "2 8",
            opacity: 0.55,
          }).addTo(l.temp);
        }
        latlngs.forEach((ll) =>
          L.circleMarker(ll, { radius: 4.5, color: "#6d28d9", fillColor: "#a78bfa", fillOpacity: 1, weight: 1.5 }).addTo(l.temp)
        );
      } else {
        if ((tool === "poly-open" || tool === "panah") && latlngs.length >= 2) {
          L.polyline(latlngs, { color: "#2563eb", weight: 2.5, dashArray: "6 6" }).addTo(l.temp);
        }
        // pratinjau mata panah mengikuti ujung jalur saat alat Panah aktif
        if (tool === "panah" && latlngs.length >= 2 && mapRef.current) {
          const m = mapRef.current;
          const a = latlngs[latlngs.length - 2];
          const b = latlngs[latlngs.length - 1];
          const sudut = sudutPeta(m, { lat: a[0], lng: a[1] }, { lat: b[0], lng: b[1] });
          L.marker(b, {
            icon: L.divIcon({ className: "", html: htmlPanah(sudut, "#2563eb"), iconSize: [20, 20], iconAnchor: [19, 10] }),
            interactive: false,
          }).addTo(l.temp);
        }
        if (tool === "poly-closed" && latlngs.length >= 2) {
          L.polyline([...latlngs, latlngs[0]], { color: "#2563eb", weight: 1.5, dashArray: "4 8", opacity: 0.6 }).addTo(l.temp);
          L.polyline(latlngs, { color: "#2563eb", weight: 2.5, dashArray: "6 6" }).addTo(l.temp);
        }
        latlngs.forEach((ll) => L.circleMarker(ll, { radius: 4, color: "#1d4ed8", fillColor: "#60a5fa", fillOpacity: 1, weight: 1.5 }).addTo(l.temp));
      }
    }

    if (measurePoints.length > 0) {
      const latlngs = measurePoints.map((v) => [v.lat, v.lng] as [number, number]);
      if (latlngs.length >= 2) {
        L.polyline(latlngs, { color: "#dc2626", weight: 2.5 }).addTo(l.temp);
      }
      measurePoints.forEach((p, i) => {
        L.circleMarker([p.lat, p.lng], { radius: 4.5, color: "#dc2626", fillColor: "#fca5a5", fillOpacity: 1, weight: 1.5 })
          .addTo(l.temp);
        if (i > 0) {
          const d = jarakHaversine(measurePoints[i - 1], p);
          L.tooltip({ permanent: true, direction: "top", className: "geokita-measure-label" })
            .setLatLng([p.lat, p.lng])
            .setContent(fmtMeter(d))
            .addTo(l.temp);
        }
      });
    }
  }, [pendingVertices, measurePoints, tool]);

  // ---------- Perintah fly & fit ----------
  useEffect(() => {
    if (flyNonce === 0) return;
    mapRef.current?.flyTo([flyTarget.lat, flyTarget.lng], flyTarget.zoom ?? 16, { duration: 0.6 });
  }, [flyNonce, flyTarget]);

  useEffect(() => {
    if (fitNonce === 0) return;
    const map = mapRef.current;
    if (!map) return;
    const semua: [number, number][] = [
      ...points.map((p) => [p.lat, p.lng] as [number, number]),
      ...shapes.flatMap((s) => s.vertices.map((v) => [v.lat, v.lng] as [number, number])),
    ];
    if (semua.length === 0) return;
    map.fitBounds(L.latLngBounds(semua).pad(0.15));
  }, [fitNonce, points, shapes]);

  // Muat ulang ukuran peta saat kembali dari layout
  useEffect(() => {
    if (view === "map") {
      setTimeout(() => mapRef.current?.invalidateSize(), 60);
    }
  }, [view]);

  return (
    <>
      <div ref={containerRef} className="absolute inset-0 z-0" aria-label="Peta utama" role="application" />
      {/* Panel radius manual alat Bulatan — di bawah chip draw/ukur (top-3) agar tak bertumpuk */}
      {tool === "bulatan" && (
        <div className="absolute top-14 left-1/2 -translate-x-1/2 z-[650] print:hidden flex items-center gap-2 rounded-2xl border border-slate-200 bg-white/95 px-3 py-2 shadow-lg">
          <Circle className="h-4 w-4 shrink-0 text-blue-600" />
          <label className="text-xs font-semibold text-slate-700 whitespace-nowrap" htmlFor="radius-manual-bulatan">
            Radius manual (m):
          </label>
          <input
            id="radius-manual-bulatan"
            type="text"
            inputMode="decimal"
            value={radiusManual}
            placeholder="kosong = klik 2×"
            aria-label="Radius lingkaran manual dalam meter"
            onChange={(e) => {
              setRadiusManual(e.target.value);
              const n = parseFloat(e.target.value.replace(",", "."));
              radiusManualRef.current = isFinite(n) && n > 0 ? n : 0;
            }}
            className="w-28 rounded-lg border border-slate-300 px-2 py-1 text-xs outline-none focus:border-blue-400 focus:bg-blue-50"
          />
          {radiusManualRef.current > 0 ? (
            <span className="text-[10px] font-medium text-blue-600 whitespace-nowrap">1 klik langsung jadi</span>
          ) : (
            <span className="text-[10px] text-slate-400 whitespace-nowrap">klik pusat → klik radius</span>
          )}
        </div>
      )}
    </>
  );
}

// ---------- Popup fitur ----------

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function bukaPopupTitik(map: L.Map, p: GisPoint, l: LayerMap) {
  const mapRef0 = map;
  const el = document.createElement("div");
  el.className = "space-y-1.5 min-w-[200px]";
  const attrsHtml = Object.entries(p.attrs)
    .slice(0, 14)
    .map(([k, v]) => `<div class="flex gap-2 text-[11px] py-0.5"><span class="text-slate-400 min-w-[80px] max-w-[130px] shrink-0 break-words">${escapeHtml(k)}</span><span class="text-slate-700 break-all">${escapeHtml(v)}</span></div>`)
    .join("");
  el.innerHTML = `
    <div class="font-semibold text-slate-900 text-sm">${escapeHtml(p.title || "Titik")}</div>
    ${p.description ? `<div class="text-xs text-slate-600 whitespace-pre-line break-words max-h-32 overflow-y-auto scrollbar-halus">${escapeHtml(p.description)}</div>` : ""}
    ${p.elevation != null ? `<div class="text-xs"><span class="text-slate-400">Elevasi:</span> <b>${p.elevation} m</b></div>` : ""}
    <div class="text-xs text-slate-500">${p.lat.toFixed(6)}, ${p.lng.toFixed(6)}</div>
    ${p.photo ? `<img src="${p.photo}" alt="Foto titik" class="rounded-lg max-h-32 w-auto border"/>` : ""}
    ${attrsHtml ? `<div class="border-t pt-1.5 mt-1 max-h-40 overflow-y-auto scrollbar-halus">${attrsHtml}</div>` : ""}
    <div class="flex gap-1.5 pt-1">
      <button data-act="edit" class="flex-1 rounded-lg bg-blue-600 text-white text-xs py-1.5 px-2 hover:bg-blue-700">✏ Edit</button>
      <button data-act="label" title="Tampil/sembunyikan label nama titik (mode Terpilih)" class="rounded-lg ${p.labelTampil ? "bg-amber-500 text-white" : "bg-amber-50 text-amber-700"} text-xs py-1.5 px-2 hover:brightness-95">🏷</button>
      <button data-act="zoom" class="rounded-lg bg-slate-100 text-slate-700 text-xs py-1.5 px-2 hover:bg-slate-200">🔍</button>
      <button data-act="hapus" class="rounded-lg bg-red-50 text-red-600 text-xs py-1.5 px-2 hover:bg-red-100">🗑</button>
    </div>`;
  el.querySelector('[data-act="edit"]')?.addEventListener("click", () => {
    useGis.getState().setDialog("point", { mode: "edit", id: p.id });
  });
  el.querySelector('[data-act="label"]')?.addEventListener("click", () => {
    mapRef0.closePopup();
    const st = useGis.getState();
    st.updatePoint(p.id, { labelTampil: !p.labelTampil });
    toast.success(!p.labelTampil ? "Label titik DITAMPILKAN" : "Label titik DISEMBUNYIKAN", {
      description: !p.labelTampil
        ? 'Aktif di mode label "Terpilih". Mode label ada di grup Label pada panel atas.'
        : "Titik ini tak lagi bertanda tampil pada mode Terpilih.",
    });
  });
  el.querySelector('[data-act="zoom"]')?.addEventListener("click", () => {
    useGis.getState().flyTo(p.lat, p.lng, 17);
  });
  el.querySelector('[data-act="hapus"]')?.addEventListener("click", () => {
    useGis.getState().deletePoint(p.id);
  });
  L.popup({ maxWidth: 360, minWidth: 260 }).setLatLng([p.lat, p.lng]).setContent(el).openOn(map);
  void l;
}

function bukaPopupBentuk(map: L.Map | null, sh: GisShape) {
  if (!map) return;
  const tengah = sh.vertices.reduce((a, v) => ({ lat: a.lat + v.lat / sh.vertices.length, lng: a.lng + v.lng / sh.vertices.length }), { lat: 0, lng: 0 });
  const el = document.createElement("div");
  el.className = "space-y-1.5 min-w-[200px]";
  const attrsHtml = Object.entries(sh.attrs)
    .slice(0, 14)
    .map(([k, v]) => `<div class="flex gap-2 text-[11px] py-0.5"><span class="text-slate-400 min-w-[80px] max-w-[130px] shrink-0 break-words">${escapeHtml(k)}</span><span class="text-slate-700 break-all">${escapeHtml(v)}</span></div>`)
    .join("");
  el.innerHTML = `
    <div class="font-semibold text-slate-900 text-sm">${escapeHtml(sh.title)}</div>
    <div class="text-xs text-slate-500">${sh.kind === "closed" ? "Poligon tertutup" : "Garis terbuka"} • ${sh.vertices.length} titik</div>
    ${sh.description ? `<div class="text-xs text-slate-600 whitespace-pre-line break-words max-h-32 overflow-y-auto scrollbar-halus">${escapeHtml(sh.description)}</div>` : ""}
    ${attrsHtml ? `<div class="border-t pt-1.5 mt-1 max-h-40 overflow-y-auto scrollbar-halus">${attrsHtml}</div>` : ""}
    <div class="flex flex-wrap gap-1.5 pt-1">
      <button data-act="edit" class="flex-1 rounded-lg bg-blue-600 text-white text-xs py-1.5 px-2 hover:bg-blue-700">✏ Edit</button>
      <button data-act="titik" title="Edit titik & lengkungkan ruas (ala AutoCAD)" class="rounded-lg bg-orange-50 text-orange-700 text-xs py-1.5 px-2 hover:bg-orange-100">⬡ Titik</button>
      <button data-act="label" title="Tampil/sembunyikan label nama bentuk (mode Terpilih)" class="rounded-lg ${sh.labelTampil ? "bg-amber-500 text-white" : "bg-amber-50 text-amber-700"} text-xs py-1.5 px-2 hover:brightness-95">🏷</button>
      ${sh.kind === "closed" ? `<button data-act="dalam" class="rounded-lg bg-emerald-50 text-emerald-700 text-xs py-1.5 px-2 hover:bg-emerald-100">Titik di dalam</button>` : ""}
      <button data-act="hapus" class="rounded-lg bg-red-50 text-red-600 text-xs py-1.5 px-2 hover:bg-red-100">🗑</button>
    </div>`;
  el.querySelector('[data-act="edit"]')?.addEventListener("click", () => {
    useGis.getState().setDialog("shapeInfo", { id: sh.id });
  });
  el.querySelector('[data-act="titik"]')?.addEventListener("click", () => {
    map.closePopup();
    const st = useGis.getState();
    st.setTool("edit-bentuk");
    st.setEditBentukId(sh.id);
  });
  el.querySelector('[data-act="label"]')?.addEventListener("click", () => {
    map.closePopup();
    const st = useGis.getState();
    st.updateShape(sh.id, { labelTampil: !sh.labelTampil });
    toast.success(!sh.labelTampil ? "Label bentuk DITAMPILKAN" : "Label bentuk DISEMBUNYIKAN", {
      description: !sh.labelTampil
        ? 'Aktif di mode label "Terpilih". Mode label ada di grup Label pada panel atas.'
        : "Bentuk ini tak lagi bertanda tampil pada mode Terpilih.",
    });
  });
  el.querySelector('[data-act="dalam"]')?.addEventListener("click", () => {
    const st = useGis.getState();
    st.setTableFilter(sh.id);
    st.setDialog("table", true);
  });
  el.querySelector('[data-act="hapus"]')?.addEventListener("click", () => {
    useGis.getState().deleteShape(sh.id);
  });
  L.popup({ maxWidth: 360, minWidth: 260 }).setLatLng([tengah.lat, tengah.lng]).setContent(el).openOn(map);
}
