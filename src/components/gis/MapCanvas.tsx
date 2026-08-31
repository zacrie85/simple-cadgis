"use client";

import { useEffect, useRef } from "react";
import L from "leaflet";
import { useGis } from "@/lib/gis/store";
import { warnaElevasi } from "@/lib/gis/contours";
import { fmtMeter, jarakHaversine } from "@/lib/gis/geo";
import type { GisPoint, GisShape } from "@/lib/gis/types";

const RENDER_CAP = 20000; // batas titik dirender (data lengkap tetap di memori/tabel)

export default function MapCanvas() {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<{
    osm?: L.TileLayer;
    sat?: L.TileLayer;
    points: L.LayerGroup;
    shapes: L.LayerGroup;
    labels: L.LayerGroup;
    contours: L.LayerGroup;
    temp: L.LayerGroup;
  } | null>(null);

  const points = useGis((s) => s.points);
  const shapes = useGis((s) => s.shapes);
  const labels = useGis((s) => s.labels);
  const contours = useGis((s) => s.contours);
  const selection = useGis((s) => s.selection);
  const basemap = useGis((s) => s.basemap);
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

    const onZoom = (e: Event) => {
      const detail = (e as CustomEvent<number>).detail;
      map.zoomIn(detail);
    };
    window.addEventListener("geokita-zoom", onZoom);

    // ekspos untuk pengujian otomatis (tidak berpengaruh ke UI)
    (window as unknown as { __geoMap?: L.Map }).__geoMap = map;

    return () => {
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

  // ---------- Render titik ----------
  useEffect(() => {
    const l = layerRef.current;
    if (!l) return;
    l.points.clearLayers();
    const renderer = L.canvas({ padding: 0.3 });
    const cap = Math.min(points.length, RENDER_CAP);
    for (let i = 0; i < cap; i++) {
      const p = points[i];
      const terpilih = selection.includes(p.id);
      const marker = L.circleMarker([p.lat, p.lng], {
        renderer,
        radius: terpilih ? 7 : 5,
        color: terpilih ? "#f59e0b" : "#1d4ed8",
        weight: terpilih ? 2.5 : 1.5,
        fillColor: terpilih ? "#fbbf24" : "#3b82f6",
        fillOpacity: 0.9,
      });
      marker.on("click", () => bukaPopupTitik(mapRef.current!, p, l));
      marker.addTo(l.points);
    }
  }, [points, selection]);

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
        poly.on("click", () => bukaPopupBentuk(mapRef.current!, sh));
        poly.addTo(l.shapes);
      } else if (latlngs.length >= 2) {
        const line = L.polyline(latlngs, {
          color: terpilih ? "#f59e0b" : sh.color,
          weight: terpilih ? 4 : 2.5,
          dashArray: sh.kind === "open" ? "8 6" : undefined,
        });
        line.on("click", () => bukaPopupBentuk(mapRef.current!, sh));
        line.addTo(l.shapes);
      }
    }
  }, [shapes, selection]);

  // ---------- Render label teks ----------
  useEffect(() => {
    const l = layerRef.current;
    if (!l) return;
    l.labels.clearLayers();
    for (const lb of labels) {
      const icon = L.divIcon({
        className: "",
        html: `<div class="geokita-label">${escapeHtml(lb.text)}</div>`,
        iconSize: undefined,
      });
      const m = L.marker([lb.lat, lb.lng], { icon, keyboard: false });
      m.on("click", () => {
        useGis.getState().setDialog("text", { lat: lb.lat, lng: lb.lng, editId: lb.id });
      });
      m.addTo(l.labels);
    }
  }, [labels]);

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

function bukaPopupTitik(map: L.Map, p: GisPoint, l: NonNullable<typeof layerRef.current>) {
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
      <button data-act="zoom" class="rounded-lg bg-slate-100 text-slate-700 text-xs py-1.5 px-2 hover:bg-slate-200">🔍</button>
      <button data-act="hapus" class="rounded-lg bg-red-50 text-red-600 text-xs py-1.5 px-2 hover:bg-red-100">🗑</button>
    </div>`;
  el.querySelector('[data-act="edit"]')?.addEventListener("click", () => {
    useGis.getState().setDialog("point", { mode: "edit", id: p.id });
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
      ${sh.kind === "closed" ? `<button data-act="dalam" class="rounded-lg bg-emerald-50 text-emerald-700 text-xs py-1.5 px-2 hover:bg-emerald-100">Titik di dalam</button>` : ""}
      <button data-act="hapus" class="rounded-lg bg-red-50 text-red-600 text-xs py-1.5 px-2 hover:bg-red-100">🗑</button>
    </div>`;
  el.querySelector('[data-act="edit"]')?.addEventListener("click", () => {
    useGis.getState().setDialog("shapeInfo", { id: sh.id });
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
