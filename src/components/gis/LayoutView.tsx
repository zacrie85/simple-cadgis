"use client";

import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import { useGis } from "@/lib/gis/store";
import { FloatingWindow } from "./Chips";
import { warnaElevasi } from "@/lib/gis/contours";
import { Printer, Move, RotateCcw } from "lucide-react";
import { toast } from "sonner";

type Orientasi = "lanskap" | "potret";
const UKURAN = { lanskap: { w: 1123, h: 794 }, potret: { w: 794, h: 1123 } };

/** Editor layout cetak (seperti layout ArcGIS/AutoCAD) + simpan PDF via cetak. */
export default function LayoutView() {
  const showPanel = useGis((s) => s.dialogs.layoutPanel);
  const setDialog = useGis((s) => s.setDialog);
  const points = useGis((s) => s.points);
  const shapes = useGis((s) => s.shapes);
  const labels = useGis((s) => s.labels);
  const contours = useGis((s) => s.contours);
  const basemap = useGis((s) => s.basemap);
  const view = useGis((s) => s.view);

  const [judul, setJudul] = useState("PETA KERJA GEOKITA");
  const [subJudul, setSubJudul] = useState("Skala • Tanggal: " + new Date().toLocaleDateString("id-ID"));
  const [orientasi, setOrientasi] = useState<Orientasi>("lanskap");
  const [lapisan, setLapisan] = useState({ titik: true, bentuk: true, label: true, kontur: true });
  const [basemapLayout, setBasemapLayout] = useState<"osm" | "sat">(basemap);
  const [mapDiv, setMapDiv] = useState<HTMLDivElement | null>(null);

  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);

  // ---------- inisialisasi peta layout (menunggu div tersedia) ----------
  useEffect(() => {
    if (view !== "layout" || !mapDiv || mapRef.current) return;
    const map = L.map(mapDiv, {
      zoomControl: false,
      attributionControl: false,
      zoomSnap: 0.25,
    });
    L.control.scale({ imperial: false, position: "bottomright", maxWidth: 120 }).addTo(map);
    mapRef.current = map;
    layerRef.current = L.layerGroup().addTo(map);
    setTimeout(() => map.invalidateSize(), 100);

    return () => {
      map.remove();
      mapRef.current = null;
      layerRef.current = null;
    };
  }, [view, mapDiv]);

  // ---------- tile basemap layout ----------
  useEffect(() => {
    const map = mapRef.current;
    if (view !== "layout" || !mapDiv || !map) return;
    map.eachLayer((l) => {
      if (l instanceof L.TileLayer || l instanceof L.Control) return;
      if (l instanceof L.LayerGroup) return;
      map.removeLayer(l);
    });
    // hapus tile lama (identifikasi via tipe TileLayer di atas sudah; tambahan aman):
    const tile =
      basemapLayout === "sat"
        ? L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", { maxZoom: 19 })
        : L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19 });
    tile.addTo(map);
    tile.bringToBack();
  }, [basemapLayout, view, mapDiv]);

  // ---------- render lapisan data ----------
  useEffect(() => {
    const map = mapRef.current;
    const layer = layerRef.current;
    if (view !== "layout" || !mapDiv || !map || !layer) return;
    layer.clearLayers();

    if (lapisan.kontur) {
      let eMin = Infinity;
      let eMax = -Infinity;
      for (const c of contours)
        for (const p of c.paths) {
          if (p.elev < eMin) eMin = p.elev;
          if (p.elev > eMax) eMax = p.elev;
        }
      const rentang = Math.max(eMax - eMin, 1e-6);
      for (const c of contours) {
        if (!c.visible) continue;
        for (const path of c.paths) {
          L.polyline(
            path.coords.map((x) => [x.lat, x.lng] as [number, number]),
            { color: warnaElevasi((path.elev - eMin) / rentang), weight: 1.5, opacity: 0.9 }
          ).addTo(layer);
        }
      }
    }
    if (lapisan.bentuk) {
      for (const sh of shapes) {
        if (!sh.visible) continue;
        const latlngs = sh.vertices.map((v) => [v.lat, v.lng] as [number, number]);
        if (sh.kind === "closed" && latlngs.length >= 3) {
          L.polygon(latlngs, { color: sh.color, weight: 2, fillOpacity: 0.15 }).addTo(layer);
        } else if (latlngs.length >= 2) {
          L.polyline(latlngs, { color: sh.color, weight: 2.5 }).addTo(layer);
        }
      }
    }
    if (lapisan.titik) {
      const renderer = L.canvas({ padding: 0.3 });
      for (const p of points) {
        L.circleMarker([p.lat, p.lng], {
          renderer,
          radius: 4,
          color: "#1d4ed8",
          fillColor: "#3b82f6",
          fillOpacity: 0.9,
          weight: 1,
        })
          .bindTooltip(p.title, {
            permanent: points.length <= 60,
            direction: "top",
            className: "geokita-contour-label",
          })
          .addTo(layer);
      }
    }
    if (lapisan.label) {
      for (const lb of labels) {
        L.marker([lb.lat, lb.lng], {
          icon: L.divIcon({
            className: "",
            html: `<div class="geokita-label">${lb.text.replace(/</g, "&lt;")}</div>`,
          }),
        }).addTo(layer);
      }
    }

    const semua: [number, number][] = [
      ...points.map((p) => [p.lat, p.lng] as [number, number]),
      ...shapes.flatMap((s) => s.vertices.map((v) => [v.lat, v.lng] as [number, number])),
    ];
    if (semua.length > 0) map.fitBounds(L.latLngBounds(semua).pad(0.1));
    setTimeout(() => map.invalidateSize(), 80);
  }, [points, shapes, labels, contours, lapisan, view, mapDiv]);

  if (view !== "layout") return null;

  const ukuran = UKURAN[orientasi];
  const legendaItems = [
    lapisan.titik && points.length > 0
      ? { warna: "#3b82f6", label: `Titik (${points.length.toLocaleString("id-ID")})` }
      : null,
    lapisan.bentuk && shapes.some((s) => s.kind === "closed")
      ? { warna: shapes.find((s) => s.kind === "closed")?.color ?? "#f59e0b", label: "Poligon" }
      : null,
    lapisan.bentuk && shapes.some((s) => s.kind === "open")
      ? { warna: shapes.find((s) => s.kind === "open")?.color ?? "#10b981", label: "Garis" }
      : null,
    lapisan.kontur && contours.length > 0 ? { warna: warnaElevasi(0.5), label: "Kontur" } : null,
  ].filter(Boolean) as { warna: string; label: string }[];

  const cetak = () => {
    toast.info("Dialog cetak dibuka", { description: "Pilih 'Save as PDF' untuk menyimpan layout." });
    setTimeout(() => window.print(), 250);
  };

  return (
    <div className="relative flex-1 overflow-auto bg-slate-200 flex items-start justify-center p-6 print:bg-white print:p-0">
      <div
        className="layout-sheet relative bg-white shadow-2xl border border-slate-300 print:border-0 print:shadow-none"
        style={{ width: ukuran.w, height: ukuran.h, transformOrigin: "top center" }}
      >
        {/* Bingkai */}
        <div className="absolute inset-3 border-2 border-slate-800 pointer-events-none" />

        {/* Judul */}
        <div className="absolute top-5 left-0 right-0 text-center px-10 z-10">
          <input
            value={judul}
            onChange={(e) => setJudul(e.target.value)}
            aria-label="Judul peta"
            className="w-full text-center text-xl font-extrabold tracking-wide bg-transparent outline-none focus:bg-blue-50 rounded pointer-events-auto"
          />
          <input
            value={subJudul}
            onChange={(e) => setSubJudul(e.target.value)}
            aria-label="Sub-judul peta"
            className="w-full text-center text-xs text-slate-500 bg-transparent outline-none focus:bg-blue-50 rounded mt-0.5 pointer-events-auto"
          />
        </div>

        {/* Bingkai peta */}
        <div className="absolute left-8 right-8 top-[86px] bottom-[70px] border border-slate-400 overflow-hidden rounded-sm">
          <div ref={setMapDiv} className="w-full h-full" />
          {/* Panah utara */}
          <div className="absolute top-2 right-3 text-center pointer-events-none select-none z-10">
            <div className="text-2xl leading-none">↑</div>
            <div className="text-[10px] font-bold -mt-1">U</div>
          </div>
          {/* Legenda */}
          {legendaItems.length > 0 && (
            <div className="absolute bottom-2 left-2 bg-white/90 border border-slate-300 rounded-lg px-2.5 py-1.5 space-y-1 pointer-events-none z-10">
              <p className="text-[9px] font-bold uppercase tracking-wide text-slate-500">Legenda</p>
              {legendaItems.map((li) => (
                <div key={li.label} className="flex items-center gap-1.5 text-[10px] text-slate-700">
                  <span className="h-2.5 w-2.5 rounded-full border border-slate-300" style={{ backgroundColor: li.warna }} />
                  {li.label}
                </div>
              ))}
            </div>
          )}
          <p className="absolute top-1 left-2 text-[8px] text-slate-500 pointer-events-none z-10">
            © OpenStreetMap / Esri
          </p>
        </div>

        {/* Kaki layout */}
        <div className="absolute bottom-4 left-0 right-0 px-10 flex justify-between text-[10px] text-slate-500">
          <span>Dibuat dengan GeoKita</span>
          <span>Proyeksi: WGS 84 (EPSG:4326)</span>
        </div>
      </div>

      {/* Panel pengaturan layout (jendela mengambang) */}
      {showPanel && (
        <div className="absolute right-4 top-4 z-20 print:hidden">
          <FloatingWindow judul="Panel Layout" onClose={() => setDialog("layoutPanel", false)} lebar="!w-64 !max-w-none">
            <div className="space-y-3.5 text-sm">
              <div>
                <p className="text-xs font-semibold text-slate-500 mb-1.5">Orientasi kertas (A4)</p>
                <div className="flex gap-1.5">
                  {(["lanskap", "potret"] as Orientasi[]).map((o) => (
                    <button
                      key={o}
                      onClick={() => setOrientasi(o)}
                      aria-pressed={orientasi === o}
                      className={`flex-1 rounded-lg px-2 py-1.5 text-xs font-medium capitalize ${
                        orientasi === o ? "bg-blue-600 text-white" : "bg-slate-100 hover:bg-slate-200"
                      }`}
                    >
                      {o}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <p className="text-xs font-semibold text-slate-500 mb-1.5">Basemap layout</p>
                <div className="flex gap-1.5">
                  {(["osm", "sat"] as const).map((b) => (
                    <button
                      key={b}
                      onClick={() => setBasemapLayout(b)}
                      aria-pressed={basemapLayout === b}
                      className={`flex-1 rounded-lg px-2 py-1.5 text-xs font-medium uppercase ${
                        basemapLayout === b ? "bg-blue-600 text-white" : "bg-slate-100 hover:bg-slate-200"
                      }`}
                    >
                      {b === "osm" ? "OSM" : "Satelit"}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <p className="text-xs font-semibold text-slate-500 mb-1.5">Data yang ditampilkan</p>
                <div className="space-y-1.5">
                  {(
                    [
                      ["titik", `Titik (${points.length.toLocaleString("id-ID")})`],
                      ["bentuk", `Poligon & Garis (${shapes.length.toLocaleString("id-ID")})`],
                      ["label", `Label teks (${labels.length.toLocaleString("id-ID")})`],
                      ["kontur", `Kontur (${contours.length.toLocaleString("id-ID")})`],
                    ] as const
                  ).map(([k, label]) => (
                    <label key={k} className="flex items-center gap-2 text-xs cursor-pointer">
                      <input
                        type="checkbox"
                        checked={lapisan[k]}
                        onChange={(e) => setLapisan((prev) => ({ ...prev, [k]: e.target.checked }))}
                      />
                      {label}
                    </label>
                  ))}
                </div>
              </div>

              <div className="pt-1 space-y-1.5">
                <button
                  onClick={cetak}
                  className="w-full flex items-center justify-center gap-1.5 rounded-xl bg-blue-600 text-white py-2 text-xs font-semibold hover:bg-blue-700"
                >
                  <Printer className="h-4 w-4" />
                  Cetak / Simpan PDF
                </button>
                <p className="text-[10px] text-slate-400 flex items-start gap-1">
                  <Move className="h-3 w-3 shrink-0 mt-0.5" />
                  Geser &amp; zoom peta layout langsung untuk memilih area. Klik judul untuk mengedit.
                </p>
                <p className="text-[10px] text-slate-400 flex items-start gap-1">
                  <RotateCcw className="h-3 w-3 shrink-0 mt-0.5" />
                  Peta layout mengikuti seluruh rentang data secara otomatis.
                </p>
              </div>
            </div>
          </FloatingWindow>
        </div>
      )}
    </div>
  );
}
