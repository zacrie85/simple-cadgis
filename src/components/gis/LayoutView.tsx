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

/** 1 px CSS = 0,264583 mm (96 DPI) — dasar perhitungan skala cetak A4. */
const MM_PER_PX = 25.4 / 96;
/** Meter per piksel pada zoom 0 Web Mercator (di ekuator). */
const MPP_Z0 = 156543.03392;
const ZOOM_MAKS = 25; // di atas ZOOM_TILE_ASLI citra di-upscale digital
const ZOOM_TILE_ASLI = 19;

const derajatKeRadian = (d: number) => (d * Math.PI) / 180;

/** Zoom pecahan agar 1 px kertas = MM_PER_PX × S mm di lapangan (skala 1:S). */
function zoomUntukSkala(s: number, lat: number, lebarPx: number): number {
  const mpp = (MM_PER_PX * s) / 1000; // meter lapangan per piksel kertas
  return Math.log2((MPP_Z0 * Math.cos(derajatKeRadian(lat))) / mpp);
}

/** Skala 1:n aktual dari zoom saat ini pada latitude pusat peta. */
function skalaDariZoom(z: number, lat: number): number {
  const mpp = (MPP_Z0 * Math.cos(derajatKeRadian(lat))) / Math.pow(2, z);
  return Math.round((mpp * 1000) / MM_PER_PX);
}

/** Terima "1:50", "1/50", "50", "1 : 350" → angka pembagi skala. */
function parseSkala(teks: string): number | null {
  const b = teks.trim().replace(/,/g, ".").replace(/\s+/g, "");
  if (!b) return null;
  const m = b.match(/^1[:/x](\d+(?:\.\d+)?)$/i);
  if (m) return parseFloat(m[1]);
  const n = parseFloat(b);
  return Number.isFinite(n) && n >= 1 ? n : null;
}

const formatAngka = (n: number) => Math.round(n).toLocaleString("id-ID");

const tanggalKini = () => {
  const d = new Date();
  const p = (x: number) => String(x).padStart(2, "0");
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}`;
};

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
  const [modeSkala, setModeSkala] = useState<"auto" | "manual">("auto");
  const [skalaInput, setSkalaInput] = useState("1:150");
  const [skalaKini, setSkalaKini] = useState<number | null>(null);
  const [citraUpscale, setCitraUpscale] = useState(false);
  const [subJudulOtomatis, setSubJudulOtomatis] = useState(true);

  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);
  const modeSkalaRef = useRef<"auto" | "manual">("auto");
  const lastAppliedRef = useRef<number | null>(null);
  const pernahKetikRef = useRef(false);
  const terapkanRef = useRef<(s: number) => void>(() => {});

  // ---------- inisialisasi peta layout (menunggu div tersedia) ----------
  useEffect(() => {
    if (view !== "layout" || !mapDiv || mapRef.current) return;
    const map = L.map(mapDiv, {
      zoomControl: false,
      attributionControl: false,
      zoomSnap: 0, // zoom pecahan agar skala cetak tepat
      zoomDelta: 0.5,
      maxZoom: ZOOM_MAKS,
    });
    L.control.scale({ imperial: false, position: "bottomright", maxWidth: 120 }).addTo(map);
    const perbaruiSkala = () => {
      const c = map.getCenter();
      setSkalaKini(skalaDariZoom(map.getZoom(), c.lat));
      setCitraUpscale(map.getZoom() > ZOOM_TILE_ASLI + 0.01);
    };
    map.on("zoomend", perbaruiSkala);
    map.on("moveend", perbaruiSkala);
    mapRef.current = map;
    layerRef.current = L.layerGroup().addTo(map);
    (window as unknown as Record<string, unknown>).__layoutMap = map;
    setTimeout(() => {
      map.invalidateSize();
      perbaruiSkala();
    }, 100);

    return () => {
      map.remove();
      mapRef.current = null;
      layerRef.current = null;
      delete (window as unknown as Record<string, unknown>).__layoutMap;
    };
  }, [view, mapDiv]);

  // ---------- tile basemap layout ----------
  useEffect(() => {
    const map = mapRef.current;
    if (view !== "layout" || !mapDiv || !map) return;
    map.eachLayer((l) => {
      if (l instanceof L.TileLayer) map.removeLayer(l);
    });
    const tile =
      basemapLayout === "sat"
        ? L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", { maxNativeZoom: ZOOM_TILE_ASLI, maxZoom: ZOOM_MAKS })
        : L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxNativeZoom: ZOOM_TILE_ASLI, maxZoom: ZOOM_MAKS });
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
    if (semua.length > 0 && modeSkalaRef.current === "auto") map.fitBounds(L.latLngBounds(semua).pad(0.1));
    setTimeout(() => map.invalidateSize(), 80);
  }, [points, shapes, labels, contours, lapisan, view, mapDiv]);

  // ---------- terapkan skala cetak (1:n) ----------
  const terapkanSkala = (s: number) => {
    const map = mapRef.current;
    if (!map || !mapDiv || mapDiv.clientWidth <= 0) return;
    const c = map.getCenter();
    const zIdeal = zoomUntukSkala(s, c.lat, mapDiv.clientWidth);
    const z = Math.min(Math.max(zIdeal, 0), ZOOM_MAKS);
    setModeSkala("manual");
    modeSkalaRef.current = "manual";
    lastAppliedRef.current = s;
    map.setZoom(z);
    setSkalaKini(skalaDariZoom(z, c.lat));
    if (zIdeal - z > 0.01) {
      toast.warning(`Skala 1:${formatAngka(s)} di luar jangkauan`, {
        description: `Peta dibatasi ke skala ≈ 1:${formatAngka(skalaDariZoom(z, c.lat))} (zoom maksimum).`,
      });
    } else if (z > ZOOM_TILE_ASLI) {
      toast.info(`Skala 1:${formatAngka(s)} diterapkan`, {
        description: "Citra dasar diperbesar melebihi resolusi aslinya (agak buram), seperti resampling di ArcGIS.",
      });
    } else {
      toast.success(`Skala peta: 1:${formatAngka(s)}`);
    }
  };

  useEffect(() => {
    terapkanRef.current = terapkanSkala;
  });

  // selesai mengetik skala → otomatis diterapkan (debounce 700 ms)
  useEffect(() => {
    if (!pernahKetikRef.current) return;
    const t = setTimeout(() => {
      const s = parseSkala(skalaInput);
      if (s && s !== lastAppliedRef.current) terapkanRef.current(s);
    }, 700);
    return () => clearTimeout(t);
  }, [skalaInput]);

  // ganti orientasi → peta sesuaikan ukuran kertas baru (ulang skala/fit)
  useEffect(() => {
    if (view !== "layout" || !mapRef.current) return;
    const t = setTimeout(() => {
      const map = mapRef.current;
      if (!map) return;
      map.invalidateSize();
      if (modeSkalaRef.current === "manual" && lastAppliedRef.current) {
        terapkanRef.current(lastAppliedRef.current);
      } else {
        const st = useGis.getState();
        const semua: [number, number][] = [
          ...st.points.map((p) => [p.lat, p.lng] as [number, number]),
          ...st.shapes.flatMap((x) => x.vertices.map((v) => [v.lat, v.lng] as [number, number])),
        ];
        if (semua.length > 0) map.fitBounds(L.latLngBounds(semua).pad(0.1));
      }
    }, 200);
    return () => clearTimeout(t);
  }, [orientasi, view]);

  // sub-judul: saat otomatis diturunkan langsung dari skala & tanggal (tanpa efek)
  const subJudulTampil = subJudulOtomatis
    ? `Skala ${skalaKini ? "1/" + formatAngka(skalaKini) : "±"} • tanggal ${tanggalKini()}`
    : subJudul;

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

  const pilihPreset = (s: number) => {
    pernahKetikRef.current = true;
    setSkalaInput(`1:${s}`);
    terapkanSkala(s);
  };

  const pasOtomatis = () => {
    setModeSkala("auto");
    modeSkalaRef.current = "auto";
    lastAppliedRef.current = null;
    const map = mapRef.current;
    if (!map) return;
    const semua: [number, number][] = [
      ...points.map((p) => [p.lat, p.lng] as [number, number]),
      ...shapes.flatMap((x) => x.vertices.map((v) => [v.lat, v.lng] as [number, number])),
    ];
    if (semua.length > 0) map.fitBounds(L.latLngBounds(semua).pad(0.1));
    toast.info("Skala otomatis: peta mengikuti seluruh data");
  };

  return (
    <div className="relative flex-1 overflow-auto bg-slate-200 flex items-start justify-center p-6 print:bg-white print:p-0">
      <style>{`@media print { @page { size: A4 ${orientasi === "lanskap" ? "landscape" : "portrait"}; } }`}</style>
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
            value={subJudulTampil}
            onChange={(e) => {
              setSubJudul(e.target.value);
              setSubJudulOtomatis(false);
            }}
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
        <div className="absolute right-4 top-4 z-[1100] print:hidden">
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
                <div className="flex items-center justify-between mb-1.5">
                  <p className="text-xs font-semibold text-slate-500">Skala cetak (1 : n)</p>
                  <span
                    className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${
                      modeSkala === "manual" ? "bg-violet-100 text-violet-700" : "bg-slate-100 text-slate-500"
                    }`}
                  >
                    {modeSkala === "manual" ? "MANUAL" : "OTOMATIS"}
                  </span>
                </div>
                <div className="flex gap-1.5">
                  <input
                    value={skalaInput}
                    onChange={(e) => {
                      pernahKetikRef.current = true;
                      setSkalaInput(e.target.value);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        const s = parseSkala(skalaInput);
                        if (s) terapkanSkala(s);
                      }
                    }}
                    placeholder="1:50"
                    aria-label="Skala cetak, contoh 1:50"
                    inputMode="numeric"
                    className="flex-1 min-w-0 rounded-lg border border-slate-300 px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <button
                    onClick={() => {
                      const s = parseSkala(skalaInput);
                      if (s) terapkanSkala(s);
                      else toast.error("Skala tidak valid", { description: "Isi dengan angka, contoh: 1:50 atau 350" });
                    }}
                    className="rounded-lg bg-blue-600 text-white px-2.5 py-1.5 text-xs font-semibold hover:bg-blue-700"
                  >
                    Terapkan
                  </button>
                </div>
                <div className="flex flex-wrap gap-1 mt-1.5">
                  {[50, 100, 250, 500, 1000, 2500, 5000].map((s) => (
                    <button
                      key={s}
                      onClick={() => pilihPreset(s)}
                      className="rounded-md bg-slate-100 hover:bg-blue-100 text-[10px] px-1.5 py-0.5 text-slate-600"
                    >
                      1:{s}
                    </button>
                  ))}
                </div>
                <p className="text-[10px] text-slate-500 mt-1.5">
                  Skala saat ini: <b>1:{skalaKini ? formatAngka(skalaKini) : "—"}</b>
                  {citraUpscale && <span className="text-amber-600"> • citra diperbesar digital</span>}
                </p>
                {modeSkala === "manual" && (
                  <button
                    onClick={pasOtomatis}
                    className="mt-1.5 w-full rounded-lg bg-slate-100 hover:bg-slate-200 py-1 text-[10px] font-medium text-slate-600"
                  >
                    Pas otomatis ke seluruh data
                  </button>
                )}
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

              <label className="flex items-center gap-2 text-xs cursor-pointer">
                <input
                  type="checkbox"
                  checked={subJudulOtomatis}
                  onChange={(e) => setSubJudulOtomatis(e.target.checked)}
                />
                Sub-judul otomatis (skala &amp; tanggal)
              </label>

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
                  Mode Otomatis: peta mengikuti seluruh data. Isi skala (mis. 1:50) untuk mengunci zoom persis seperti ArcGIS.
                </p>
                <p className="text-[10px] text-slate-400 flex items-start gap-1">
                  <Printer className="h-3 w-3 shrink-0 mt-0.5" />
                  Saat mencetak, pilih skala kertas 100% (Actual size) agar skala peta tepat.
                </p>
              </div>
            </div>
          </FloatingWindow>
        </div>
      )}
    </div>
  );
}
