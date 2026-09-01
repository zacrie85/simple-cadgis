"use client";

import { useEffect, useRef } from "react";
import L from "leaflet";
import { toast } from "sonner";
import { useGis } from "@/lib/gis/store";
import { warnaElevasi } from "@/lib/gis/contours";
import { fmtMeter, jarakHaversine } from "@/lib/gis/geo";
import type { GisPoint, GisShape, LatLng } from "@/lib/gis/types";

const RENDER_CAP = 20000; // batas titik dirender (data lengkap tetap di memori/tabel)

// Penanda sementara: true bila fitur baru saja diklik pada mode blok
// (mencegah klik kosong pada peta menghapus seleksi yang baru dibuat)
let klikFiturBarusan = false;
// Mode drag terakhir: Shift/Ctrl ditekan saat mulai drag = tambah ke pilihan
let dragTambah = false;

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

  const points = useGis((s) => s.points);
  const shapes = useGis((s) => s.shapes);
  const labels = useGis((s) => s.labels);
  const contours = useGis((s) => s.contours);
  const layers = useGis((s) => s.layers);
  const selection = useGis((s) => s.selection);
  const basemap = useGis((s) => s.basemap);
  const labelMode = useGis((s) => s.labelMode);
  const pendingVertices = useGis((s) => s.pendingVertices);
  const tool = useGis((s) => s.tool);
  const measurePoints = useGis((s) => s.measurePoints);
  const flyNonce = useGis((s) => s.flyNonce);
  const flyTarget = useGis((s) => s.flyTarget);
  const fitNonce = useGis((s) => s.fitNonce);
  const view = useGis((s) => s.view);

  // ---------- Inisialisasi peta ----------
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current, {
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

    // ekspos untuk pengujian otomatis (tidak berpengaruh ke UI)
    (window as unknown as { __geoMap?: L.Map }).__geoMap = map;

    return () => {
      map.off("moveend zoomend", kirimView);
      window.removeEventListener("geokita-fit-bounds", onFitBounds);
      window.removeEventListener("geokita-zoom", onZoom);
      map.remove();
      mapRef.current = null;
      layerRef.current = null;
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
    el.style.cursor = tool ? "crosshair" : "";
  }, [tool]);

  // ---------- Alat blok seleksi & zoom kotak (drag persegi) ----------
  useEffect(() => {
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
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") useGis.getState().setTool(null);
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
    window.addEventListener("keydown", onKey);

    return () => {
      map.off("mousedown", onDownShift);
      map.off("mousemove", onMouseMove);
      map.off("mouseup", onMouseUp);
      window.removeEventListener("mouseup", onWindowUp);
      window.removeEventListener("keydown", onKey);
      if (kotak && l.temp.hasLayer(kotak)) l.temp.removeLayer(kotak);
      map.dragging.enable();
      map.doubleClickZoom.enable();
      dragTambah = false;
    };
  }, [tool]);

  // ---------- Alat bentuk: bulatan / elips / lengkung kiri-kanan ----------
  useEffect(() => {
    if (tool !== "bulatan" && tool !== "elips" && tool !== "lengkung-kiri" && tool !== "lengkung-kanan") return;
    const map = mapRef.current;
    const l = layerRef.current;
    if (!map || !l) return;

    const pv = L.layerGroup().addTo(l.temp); // pratinjau khusus alat ini
    let awal: L.LatLng | null = null;

    const onMove = (e: L.LeafletMouseEvent) => {
      if (!awal) return;
      pv.clearLayers();
      const gaya = { color: "#2563eb", weight: 2, dashArray: "6 5", fillColor: "#3b82f6", fillOpacity: 0.08, interactive: false };
      if (tool === "bulatan") {
        const r = jarakHaversine(awal, e.latlng);
        L.circle(awal, { ...gaya, radius: r }).addTo(pv);
        L.tooltip({ permanent: true, direction: "top", className: "geokita-measure-label" })
          .setLatLng(e.latlng).setContent(`R ${fmtMeter(r)}`).addTo(pv);
      } else if (tool === "elips") {
        const P = buatProyeksi(awal).xy(e.latlng);
        L.polygon(
          titikElips(awal, Math.abs(P.x), Math.abs(P.y), 48).map((v) => [v.lat, v.lng] as [number, number]),
          gaya
        ).addTo(pv);
        L.tooltip({ permanent: true, direction: "top", className: "geokita-measure-label" })
          .setLatLng(e.latlng).setContent(`${fmtMeter(Math.abs(P.x))} × ${fmtMeter(Math.abs(P.y))}`).addTo(pv);
      } else {
        const arah = tool === "lengkung-kiri" ? "kiri" : "kanan";
        L.polyline(
          titikBusurSetengah(awal, e.latlng, arah).map((v) => [v.lat, v.lng] as [number, number]),
          { color: "#2563eb", weight: 2.5, dashArray: "6 5", interactive: false }
        ).addTo(pv);
        const chord = jarakHaversine(awal, e.latlng);
        L.tooltip({ permanent: true, direction: "top", className: "geokita-measure-label" })
          .setLatLng(e.latlng).setContent(`R ${fmtMeter(chord / 2)}`).addTo(pv);
      }
    };

    const simpanBentuk = (kind: "closed" | "open", vertices: LatLng[]) => {
      // buka dialog penamaan (alur sama dengan poligon/garis)
      useGis.setState({
        tool: null,
        pendingVertices: [],
        pendingShapeSave: { kind, vertices },
        dialogs: { ...useGis.getState().dialogs, shapeInfo: { id: "pending:baru" } },
      });
    };

    const onKlik = (e: L.LeafletMouseEvent) => {
      if (!awal) {
        awal = e.latlng;
        return;
      }
      const akhir = e.latlng;
      if (tool === "bulatan") {
        const r = jarakHaversine(awal, akhir);
        if (r < 1) {
          toast.error("Radius terlalu kecil — klik lebih jauh dari pusat.");
          return;
        }
        simpanBentuk("closed", titikLingkaran(awal, r));
      } else if (tool === "elips") {
        const P = buatProyeksi(awal).xy(akhir);
        if (Math.abs(P.x) < 1 && Math.abs(P.y) < 1) {
          toast.error("Elips terlalu kecil — klik lebih jauh dari pusat.");
          return;
        }
        simpanBentuk("closed", titikElips(awal, Math.abs(P.x), Math.abs(P.y)));
      } else {
        const chord = jarakHaversine(awal, akhir);
        if (chord < 1) {
          toast.error("Busur terlalu kecil — klik awal dan akhir lebih berjauhan.");
          return;
        }
        simpanBentuk("open", titikBusurSetengah(awal, akhir, tool === "lengkung-kiri" ? "kiri" : "kanan"));
      }
    };

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") useGis.getState().setTool(null);
    };
    map.on("click", onKlik);
    map.on("mousemove", onMove);
    window.addEventListener("keydown", onKey);
    return () => {
      map.off("click", onKlik);
      map.off("mousemove", onMove);
      window.removeEventListener("keydown", onKey);
      l.temp.removeLayer(pv);
    };
  }, [tool]);

  // ---------- Alat edit bentuk: pindah titik + lengkungkan ruas lurus (ala AutoCAD) ----------
  useEffect(() => {
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

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") useGis.getState().setTool(null);
    };
    map.on("click", onKlik);
    window.addEventListener("keydown", onKey);

    return () => {
      map.off("click", onKlik);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("geokita-edit-bentuk", onEditEv);
      akhiriSesi();
    };
  }, [tool]);

  // ---------- Render titik ----------
  useEffect(() => {
    const l = layerRef.current;
    if (!l) return;
    l.points.clearLayers();
    const renderer = L.canvas({ padding: 0.3 });
    const cap = Math.min(points.length, RENDER_CAP);
    for (let i = 0; i < cap; i++) {
      const p = points[i];
      if (!p.visible) continue; // disembunyikan per fitur / per layer
      const terpilih = selection.includes(p.id);
      const marker = L.circleMarker([p.lat, p.lng], {
        renderer,
        radius: terpilih ? 7 : 5,
        color: terpilih ? "#f59e0b" : "#1d4ed8",
        weight: terpilih ? 2.5 : 1.5,
        fillColor: terpilih ? "#fbbf24" : "#3b82f6",
        fillOpacity: 0.9,
      });
      marker.on("click", () => {
        const st = useGis.getState();
        // mode blok: klik titik = pilih/hilangkan satu titik (tanpa popup)
        if (st.tool === "select") {
          klikFiturBarusan = true;
          st.toggleSelect(p.id);
          return;
        }
        if (st.tool === "edit-bentuk") return; // alat edit bentuk: titik diabaikan
        bukaPopupTitik(mapRef.current!, p, l);
      });
      // Label nama sesuai mode: semua / terpilih (bertanda) / sembunyi
      const labelNyala =
        labelMode === "semua"
          ? !!p.title
          : labelMode === "terpilih"
            ? !!p.labelTampil && !!p.title
            : false;
      if (labelNyala) {
        marker.bindTooltip(p.title, {
          permanent: true,
          direction: "right",
          offset: [9, 0],
          className: "geokita-name-label",
        });
      }
      marker.addTo(l.points);
    }
  }, [points, selection, labelMode]);

  // ---------- Render poligon & garis ----------
  useEffect(() => {
    const l = layerRef.current;
    if (!l) return;
    l.shapes.clearLayers();
    for (const sh of shapes) {
      if (!sh.visible) continue;
      const terpilih = selection.includes(sh.id);
      const latlngs = sh.vertices.map((v) => [v.lat, v.lng] as [number, number]);
      if (sh.kind === "closed" && latlngs.length >= 3) {
        const poly = L.polygon(latlngs, {
          color: terpilih ? "#f59e0b" : sh.color,
          weight: terpilih ? 3.5 : 2,
          fillColor: sh.color,
          fillOpacity: 0.15,
        });
        poly.on("click", () => {
          const st = useGis.getState();
          if (st.tool === "select") {
            klikFiturBarusan = true;
            st.toggleSelect(sh.id);
            return;
          }
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
        line.on("click", () => {
          const st = useGis.getState();
          if (st.tool === "select") {
            klikFiturBarusan = true;
            st.toggleSelect(sh.id);
            return;
          }
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
        html: `<div class="geokita-label">${escapeHtml(lb.text)}</div>`,
        iconSize: undefined,
      });
      const m = L.marker([lb.lat, lb.lng], { icon });
      m.on("click", () => {
        useGis.getState().setDialog("text", { lat: lb.lat, lng: lb.lng, editId: lb.id });
      });
      m.addTo(l.labels);
    }
  }, [labels, layers]);

  // ---------- Render kontur ----------
  useEffect(() => {
    const l = layerRef.current;
    if (!l) return;
    l.contours.clearLayers();
    let eMin = Infinity;
    let eMax = -Infinity;
    for (const layer of contours) {
      for (const p of layer.paths) {
        if (p.elev < eMin) eMin = p.elev;
        if (p.elev > eMax) eMax = p.elev;
      }
    }
    const rentang = Math.max(eMax - eMin, 1e-6);
    for (const layer of contours) {
      if (!layer.visible) continue;
      layer.paths.forEach((path, idx) => {
        const line = L.polyline(
          path.coords.map((c) => [c.lat, c.lng] as [number, number]),
          {
            color: warnaElevasi((path.elev - eMin) / rentang),
            weight: 1.8,
            opacity: 0.85,
          }
        );
        line.bindTooltip(`${path.elev} m`, {
          permanent: idx % 2 === 0,
          direction: "center",
          className: "geokita-contour-label",
        });
        line.addTo(l.contours);
      });
    }
  }, [contours]);

  // ---------- Gambar sementara (pending & ukur) ----------
  useEffect(() => {
    const l = layerRef.current;
    if (!l) return;
    l.temp.clearLayers();

    if (pendingVertices.length > 0) {
      const latlngs = pendingVertices.map((v) => [v.lat, v.lng] as [number, number]);
      if (tool === "poly-open" && latlngs.length >= 2) {
        L.polyline(latlngs, { color: "#2563eb", weight: 2.5, dashArray: "6 6" }).addTo(l.temp);
      }
      if (tool === "poly-closed" && latlngs.length >= 2) {
        L.polyline([...latlngs, latlngs[0]], { color: "#2563eb", weight: 1.5, dashArray: "4 8", opacity: 0.6 }).addTo(l.temp);
        L.polyline(latlngs, { color: "#2563eb", weight: 2.5, dashArray: "6 6" }).addTo(l.temp);
      }
      latlngs.forEach((ll) => L.circleMarker(ll, { radius: 4, color: "#1d4ed8", fillColor: "#60a5fa", fillOpacity: 1, weight: 1.5 }).addTo(l.temp));
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

  return <div ref={containerRef} className="absolute inset-0 z-0" aria-label="Peta utama" role="application" />;
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
