"use client";

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import L from "leaflet";
import { useGis } from "@/lib/gis/store";
import { FloatingWindow } from "./Chips";
import { warnaElevasi } from "@/lib/gis/contours";
import { gayaLabel, kelasLabel } from "@/lib/gis/labelTampil";
import { GAYA_UTARA, type GayaUtaraId } from "./NorthArrows";
import { Printer, Move, RotateCcw, ImagePlus, X, FileDown, ImageDown } from "lucide-react";
import { toast } from "sonner";

type Orientasi = "lanskap" | "potret";
const UKURAN = { lanskap: { w: 1123, h: 794 }, potret: { w: 794, h: 1123 } };

/** 1 px CSS = 0,264583 mm (96 DPI) — dasar perhitungan skala cetak A4. */
const MM_PER_PX = 25.4 / 96;
/** Meter per piksel pada zoom 0 Web Mercator (di ekuator). */
const MPP_Z0 = 156543.03392;
const ZOOM_MAKS = 25; // di atas ZOOM_TILE_ASLI citra di-upscale digital
const ZOOM_TILE_ASLI = 19;
/** Pusat & zoom awal peta layout (wilayah Indonesia) — dipakai saat belum ada data. */
const PUSAT_AWAL: [number, number] = [-6.9932, 110.4203]; // Semarang
const ZOOM_AWAL = 12;

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

/** Format koordinat derajat-menit-detik gaya peta topografi Indonesia:
 *  106°46'48.0"BT (bujur timur) / 6°35'24.0"LS (lintang selatan) — detik 1 desimal. */
function formatDMS(v: number, sumbu: "lat" | "lng"): string {
  const hemi = sumbu === "lat" ? (v < 0 ? "LS" : "LU") : (v < 0 ? "BB" : "BT");
  const a = Math.abs(v);
  let d = Math.floor(a);
  let m = Math.floor((a - d) * 60);
  let s = Math.round(((a - d) * 60 - m) * 10) / 10; // detik 1 desimal
  if (s >= 60) {
    s = 0;
    m += 1;
  }
  if (m >= 60) {
    m = 0;
    d += 1;
  }
  const sTeks = s.toFixed(1);
  return `${d}°${m}'${sTeks}"${hemi}`;
}

/** Foto yang ditempel ke sheet layout: posisi % pusat, lebar px, rasio aspek asli. */
type FotoLayout = { id: string; nama: string; src: string; x: number; y: number; w: number; rasio: number };

/** Satu baris item legenda — simbol digambar sesuai jenis data. */
type LegendaItem = {
  jenis: "titik" | "poligon" | "garis" | "kontur" | "label" | "bulat" | "kotak" | "strip" | "polos";
  warna: string;
  label: string;
};

/** Tulisan tambahan buatan user di dalam legenda. */
type ItemLegendaKustom = { id: string; teks: string; simbol: "garis" | "kotak" | "bulat" | "polos"; warna: string };

/** Simbol kecil legenda yang meniru penampilan data di peta. */
function SimbolLegenda({ jenis, warna }: { jenis: LegendaItem["jenis"]; warna: string }) {
  if (jenis === "titik" || jenis === "bulat")
    return (
      <span
        className="inline-block h-3 w-3 shrink-0 rounded-full border"
        style={{ backgroundColor: warna, borderColor: "rgba(15,23,42,.4)" }}
      />
    );
  if (jenis === "poligon" || jenis === "kotak")
    return (
      <span
        className="inline-block h-3 w-3 shrink-0 rounded-[3px] border-2"
        style={{ borderColor: warna, backgroundColor: `${warna}26` }}
      />
    );
  if (jenis === "garis" || jenis === "kontur" || jenis === "strip")
    return <span className="inline-block h-0.5 w-4 shrink-0 rounded-full" style={{ backgroundColor: warna }} />;
  if (jenis === "label")
    return (
      <span className="inline-block w-4 shrink-0 text-center text-[10px] font-black italic leading-none" style={{ color: warna }}>
        T
      </span>
    );
  return null; // polos — tulisan tanpa simbol
}

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
  const [basemapLayout, setBasemapLayout] = useState<"osm" | "sat" | "kosong">(basemap);
  const [mapDiv, setMapDiv] = useState<HTMLDivElement | null>(null);
  const [modeSkala, setModeSkala] = useState<"auto" | "manual">("auto");
  const [skalaInput, setSkalaInput] = useState("1:150");
  const [skalaKini, setSkalaKini] = useState<number | null>(null);
  const [citraUpscale, setCitraUpscale] = useState(false);
  const [subJudulOtomatis, setSubJudulOtomatis] = useState(true);
  const [gayaUtara, setGayaUtara] = useState<GayaUtaraId>("kompas");
  const [posUtara, setPosUtara] = useState({ x: 91, y: 12 });
  const [ukuranUtara, setUkuranUtara] = useState(56);
  const [legendaAktif, setLegendaAktif] = useState(true);
  const [legendaJudul, setLegendaJudul] = useState("Legenda");
  const [legendaKolom, setLegendaKolom] = useState<1 | 2>(2);
  const [posLegenda, setPosLegenda] = useState({ x: 16, y: 84 });
  const [fotoList, setFotoList] = useState<FotoLayout[]>([]);
  const [fotoAktifId, setFotoAktifId] = useState<string | null>(null);
  const [skalaLegenda, setSkalaLegenda] = useState(1);
  const [legendaKustom, setLegendaKustom] = useState<ItemLegendaKustom[]>([]);
  const [teksKustom, setTeksKustom] = useState("");
  const [simbolKustom, setSimbolKustom] = useState<ItemLegendaKustom["simbol"]>("garis");
  const [warnaKustom, setWarnaKustom] = useState("#e11d48");
  const [ekspor, setEkspor] = useState<"pdf" | "png" | null>(null);
  // ---------- grid koordinat (graticule) lintang & bujur DMS ----------
  const [gridAktif, setGridAktif] = useState(false);
  const [gridMode, setGridMode] = useState<"garis" | "tick">("garis");
  const [gridInt, setGridInt] = useState({ d: 0, m: 1, s: 0 });

  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);
  const modeSkalaRef = useRef<"auto" | "manual">("auto");
  const lastAppliedRef = useRef<number | null>(null);
  const pernahKetikRef = useRef(false);
  const terapkanRef = useRef<(s: number) => void>(() => {});
  const bingkaiRef = useRef<HTMLDivElement | null>(null);
  const seretUtaraRef = useRef(false);
  const sheetRef = useRef<HTMLDivElement | null>(null);
  const seretLegendaRef = useRef(false);
  const seretFotoRef = useRef<string | null>(null);
  const resizeFotoRef = useRef<{ id: string; kiriPx: number; atasPx: number } | null>(null);
  const fileFotoRef = useRef<HTMLInputElement | null>(null);
  const legendaBoxRef = useRef<HTMLDivElement | null>(null);
  const resizeLegendaRef = useRef<{ lebarDasar: number } | null>(null);
  // layer DOM grid koordinat: garis/tick di dalam bingkai, label di margin sheet
  const garisGridRef = useRef<HTMLDivElement | null>(null);
  const labelGridRef = useRef<HTMLDivElement | null>(null);
  const gridOptRef = useRef({ aktif: false, mode: "garis" as "garis" | "tick", interval: 1 / 60 });
  const perbaruiGridRef = useRef<() => void>(() => {});

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
    // WAJIB: set view sejak awal — tanpa ini getCenter() melempar
    // "Set map center and zoom first" saat layout dibuka tanpa data
    // (fitBounds hanya jalan bila ada titik/poligon).
    map.setView(PUSAT_AWAL, ZOOM_AWAL);
    L.control.scale({ imperial: false, position: "bottomright", maxWidth: 120 }).addTo(map);
    const perbaruiSkala = () => {
      try {
        const c = map.getCenter();
        setSkalaKini(skalaDariZoom(map.getZoom(), c.lat));
        setCitraUpscale(map.getZoom() > ZOOM_TILE_ASLI + 0.01);
      } catch {
        // view belum siap (peta baru dibuat) — abaikan, akan dipanggil ulang pada zoomend/moveend
      }
    };
    map.on("zoomend", perbaruiSkala);
    map.on("moveend", perbaruiSkala);
    const gridEv = () => perbaruiGridRef.current();
    map.on("move zoom viewreset resize", gridEv);
    mapRef.current = map;
    layerRef.current = L.layerGroup().addTo(map);
    (window as unknown as Record<string, unknown>).__layoutMap = map;
    setTimeout(() => {
      map.invalidateSize();
      perbaruiSkala();
    }, 100);

    return () => {
      map.off("move zoom viewreset resize", gridEv);
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
    if (basemapLayout !== "kosong") {
      const tile =
        basemapLayout === "sat"
          ? L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", { maxNativeZoom: ZOOM_TILE_ASLI, maxZoom: ZOOM_MAKS })
          : L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxNativeZoom: ZOOM_TILE_ASLI, maxZoom: ZOOM_MAKS });
      tile.addTo(map);
      tile.bringToBack();
    }
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
            html: `<div class="${kelasLabel(lb)}" style="${gayaLabel(lb)}">${lb.text.replace(/</g, "&lt;")}</div>`,
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

  // ganti orientasi / aktifkan grid (bingkai melebar utk kolam label) → peta sesuaikan ukuran baru
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
  }, [orientasi, view, gridAktif]);

  // sub-judul: saat otomatis diturunkan langsung dari skala & tanggal (tanpa efek)
  const subJudulTampil = subJudulOtomatis
    ? `Skala ${skalaKini ? "1/" + formatAngka(skalaKini) : "±"} • tanggal ${tanggalKini()}`
    : subJudul;

  // ---------- render grid koordinat DMS (imperatif — dipanggil tiap peta bergerak) ----------
  // CATATAN: didefinisikan & disinkronkan SEBELUM early-return view agar urutan hook selalu sama.
  const perbaruiGrid = () => {
    const map = mapRef.current;
    const gL = garisGridRef.current;
    const lL = labelGridRef.current;
    const sheet = sheetRef.current;
    if (!map || !gL || !lL || !sheet) return;
    gL.innerHTML = "";
    lL.innerHTML = "";
    const o = gridOptRef.current;
    if (!o.aktif) return;
    const W = sheet.offsetWidth;
    const H = sheet.offsetHeight;
    // kolam label — HARUS cocok dgn kelas CSS bingkai saat grid aktif
    const kiri = 54;
    const atas = 104;
    const bawah = 88;
    // chip label horizontal (atas/bawah) — teks biru ala peta topografi
    const chip = (teks: string, style: string) =>
      `<div style="position:absolute;background:#fff;border:1px solid #64748b;border-radius:3px;padding:0 3px;font:600 8px/13px ui-sans-serif,system-ui,sans-serif;color:#1d4ed8;white-space:nowrap;${style}">${teks}</div>`;
    // chip VERTIKAL (kiri/kanan): pembungkus titik-nol di titik jangkar, chip di dalamnya
    // dipusatkan ke jangkar lalu diputar -90° → teks terbaca dari bawah ke atas (ala referensi)
    const chipV = (teks: string, cx: number, cy: number) =>
      `<div style="position:absolute;left:${cx}px;top:${cy}px;width:0;height:0">` +
      `<div style="position:absolute;background:#fff;border:1px solid #64748b;border-radius:3px;padding:0 3px;font:600 8px/13px ui-sans-serif,system-ui,sans-serif;color:#1d4ed8;white-space:nowrap;transform:translate(-50%,-50%) rotate(-90deg)">${teks}</div></div>`;
    const peringatan = (teks: string) =>
      chip(teks, `left:${W / 2}px;top:${atas - 14}px;transform:translateX(-50%);background:#fff7ed;border-color:#fdba74;color:#9a3412`);
    try {
      const b = map.getBounds();
      const step = o.interval;
      if (!(step > 0)) {
        lL.innerHTML = peringatan("Interval grid tidak boleh 0");
        return;
      }
      const nB = Math.floor((b.getEast() - b.getWest()) / step + 1e-9);
      const nL = Math.floor((b.getNorth() - b.getSouth()) / step + 1e-9);
      if (nB > 60 || nL > 60) {
        lL.innerHTML = peringatan("Grid terlalu rapat — perbesar interval");
        return;
      }
      let garisHtml = "";
      let labelHtml = "";
      // ---- meridian (bujur tetap): garis vertikal + tick & label di sisi ATAS & BAWAH
      for (let lng = Math.ceil(b.getWest() / step) * step, i = 0; i <= nB && lng <= b.getEast() + 1e-9; lng += step, i++) {
        const x = Math.round(map.latLngToContainerPoint([b.getCenter().lat, lng]).x);
        if (o.mode === "garis")
          garisHtml += `<div style="position:absolute;top:0;bottom:0;left:${x}px;border-left:1px dashed #64748b;opacity:.8"></div>`;
        garisHtml += `<div style="position:absolute;top:0;left:${x - 1}px;width:2px;height:8px;background:#0f172a"></div>`;
        garisHtml += `<div style="position:absolute;bottom:0;left:${x - 1}px;width:2px;height:8px;background:#0f172a"></div>`;
        const lb = formatDMS(lng, "lng");
        labelHtml += chip(lb, `left:${kiri + x}px;top:${atas - 14}px;transform:translateX(-50%)`);
        labelHtml += chip(lb, `left:${kiri + x}px;top:${H - bawah + 2}px;transform:translateX(-50%)`);
      }
      // ---- paralel (lintang tetap): garis horizontal + tick & label di sisi KIRI & KANAN
      for (let lat = Math.ceil(b.getSouth() / step) * step, i = 0; i <= nL && lat <= b.getNorth() + 1e-9; lat += step, i++) {
        const y = Math.round(map.latLngToContainerPoint([lat, b.getCenter().lng]).y);
        if (o.mode === "garis")
          garisHtml += `<div style="position:absolute;left:0;right:0;top:${y}px;border-top:1px dashed #64748b;opacity:.8"></div>`;
        garisHtml += `<div style="position:absolute;left:0;top:${y - 1}px;width:8px;height:2px;background:#0f172a"></div>`;
        garisHtml += `<div style="position:absolute;right:0;top:${y - 1}px;width:8px;height:2px;background:#0f172a"></div>`;
        const lb = formatDMS(lat, "lat");
        // kiri & kanan: label VERTIKAL (rotasi -90°, terbaca dari bawah ke atas — gaya referensi)
        labelHtml += chipV(lb, kiri - 9, atas + y);
        labelHtml += chipV(lb, W - kiri + 9, atas + y);
      }
      gL.innerHTML = garisHtml;
      lL.innerHTML = labelHtml;
    } catch {
      // view peta belum siap — akan dipanggil ulang pada event berikutnya
    }
  };
  useEffect(() => {
    perbaruiGridRef.current = perbaruiGrid;
  });

  // opsi grid berubah → simpan ke ref + render ulang
  useEffect(() => {
    gridOptRef.current = {
      aktif: gridAktif,
      mode: gridMode,
      interval: gridInt.d + gridInt.m / 60 + gridInt.s / 3600,
    };
    const t = setTimeout(() => perbaruiGridRef.current(), 30);
    return () => clearTimeout(t);
  }, [gridAktif, gridMode, gridInt]);

  if (view !== "layout") return null;

  const ukuran = UKURAN[orientasi];
  const nPoligon = shapes.filter((s) => s.kind === "closed" && s.visible).length;
  const nGaris = shapes.filter((s) => s.kind === "open" && s.visible).length;
  const nKontur = contours.reduce((a, c) => a + (c.visible ? c.paths.length : 0), 0);
  const legendaItems = [
    lapisan.titik && points.length > 0
      ? { jenis: "titik", warna: "#3b82f6", label: `Titik (${points.length.toLocaleString("id-ID")})` }
      : null,
    lapisan.bentuk && nPoligon > 0
      ? { jenis: "poligon", warna: shapes.find((s) => s.kind === "closed" && s.visible)?.color ?? "#f59e0b", label: `Poligon (${nPoligon.toLocaleString("id-ID")})` }
      : null,
    lapisan.bentuk && nGaris > 0
      ? { jenis: "garis", warna: shapes.find((s) => s.kind === "open" && s.visible)?.color ?? "#10b981", label: `Garis (${nGaris.toLocaleString("id-ID")})` }
      : null,
    lapisan.kontur && nKontur > 0
      ? { jenis: "kontur", warna: warnaElevasi(0.5), label: `Kontur (${nKontur.toLocaleString("id-ID")} garis)` }
      : null,
    lapisan.label && labels.length > 0
      ? { jenis: "label", warna: "#334155", label: `Label (${labels.length.toLocaleString("id-ID")})` }
      : null,
  ].filter(Boolean) as LegendaItem[];
  // tulisan buatan user digabung di akhir daftar legenda
  const semuaLegenda: LegendaItem[] = [
    ...legendaItems,
    ...legendaKustom.map((k) => ({ jenis: k.simbol, warna: k.warna, label: k.teks }) as LegendaItem),
  ];

  const cetak = () => {
    toast.info("Dialog cetak dibuka", { description: "Pilih 'Save as PDF' untuk menyimpan layout." });
    setTimeout(() => window.print(), 250);
  };

  // ---------- ekspor sheet → gambar → PDF/PNG (tanpa dialog cetak, anti-kosong) ----------
  const namaFileBersih = () =>
    judul
      .trim()
      .replace(/[^\w\- ]+/g, "")
      .replace(/\s+/g, "-")
      .toLowerCase() || "layout";

  /** Render sheet layout menjadi canvas 2× (≈192 DPI). html2canvas-pro dipakai karena
   *  mendukung warna oklch/color-mix dari Tailwind 4 (html2canvas klasik error). */
  const tangkapSheet = async (): Promise<HTMLCanvasElement> => {
    const sheet = sheetRef.current;
    if (!sheet) throw new Error("Sheet layout tidak ditemukan");
    mapRef.current?.invalidateSize(); // pastikan ukuran peta terkini sebelum dirender
    const html2canvas = (await import("html2canvas-pro")).default;
    return html2canvas(sheet, {
      scale: 2,
      useCORS: true, // tile OSM/Esri diunduh ulang dengan CORS agar tidak kosong
      backgroundColor: "#ffffff",
      logging: false,
      onclone: (doc: Document) => {
        // html2canvas tidak bisa menggambar teks di dalam <input> — ganti dengan <div> setara
        doc.querySelectorAll(".layout-sheet input").forEach((el) => {
          const inp = el as HTMLInputElement;
          const div = doc.createElement("div");
          div.className = inp.className;
          div.textContent = inp.value;
          div.style.display = "flex";
          div.style.alignItems = "center";
          div.style.justifyContent = "center";
          inp.replaceWith(div);
        });
        const sh = doc.querySelector(".layout-sheet") as HTMLElement | null;
        if (sh) {
          sh.style.boxShadow = "none";
          sh.style.border = "0";
        }
      },
    });
  };

  const unduhBlob = (blob: Blob, nama: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = nama;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  };

  const simpanPdf = async () => {
    if (ekspor) return;
    setEkspor("pdf");
    try {
      const canvas = await tangkapSheet();
      const { jsPDF } = await import("jspdf");
      const pdf = new jsPDF({
        orientation: orientasi === "lanskap" ? "landscape" : "portrait",
        unit: "mm",
        format: "a4",
        compress: true,
      });
      pdf.addImage(canvas.toDataURL("image/png"), "PNG", 0, 0, 210, 297);
      pdf.save(`${namaFileBersih()}.pdf`);
      toast.success("PDF tersimpan", {
        description: `${namaFileBersih()}.pdf — A4 ${orientasi}, peta + legenda + utara ikut semua.`,
      });
    } catch (e) {
      console.error(e);
      toast.error("Gagal membuat PDF", { description: String((e as Error)?.message ?? e) });
    } finally {
      setEkspor(null);
    }
  };

  const simpanPng = async () => {
    if (ekspor) return;
    setEkspor("png");
    try {
      const canvas = await tangkapSheet();
      const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/png"));
      if (!blob) throw new Error("Gagal mengonversi canvas ke PNG");
      unduhBlob(blob, `${namaFileBersih()}.png`);
      toast.success("PNG tersimpan", {
        description: `${namaFileBersih()}.png — resolusi ${canvas.width}×${canvas.height} px (2× A4).`,
      });
    } catch (e) {
      console.error(e);
      toast.error("Gagal membuat PNG", { description: String((e as Error)?.message ?? e) });
    } finally {
      setEkspor(null);
    }
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

  // ---------- seret logo utara langsung di bingkai peta ----------
  const seretUtaraMulai = (e: ReactPointerEvent<HTMLDivElement>) => {
    e.stopPropagation(); // jangan geser peta Leaflet
    seretUtaraRef.current = true;
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const seretUtaraGerak = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!seretUtaraRef.current || !bingkaiRef.current) return;
    const r = bingkaiRef.current.getBoundingClientRect();
    setPosUtara({
      x: Math.min(Math.max(((e.clientX - r.left) / r.width) * 100, 4), 96),
      y: Math.min(Math.max(((e.clientY - r.top) / r.height) * 100, 5), 95),
    });
  };
  const seretUtaraSelesai = () => {
    seretUtaraRef.current = false;
  };

  // ---------- seret kotak legenda langsung di bingkai peta ----------
  const seretLegendaMulai = (e: ReactPointerEvent<HTMLDivElement>) => {
    e.stopPropagation(); // jangan geser peta Leaflet
    seretLegendaRef.current = true;
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const seretLegendaGerak = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!seretLegendaRef.current || !bingkaiRef.current) return;
    const r = bingkaiRef.current.getBoundingClientRect();
    setPosLegenda({
      x: Math.min(Math.max(((e.clientX - r.left) / r.width) * 100, 10), 90),
      y: Math.min(Math.max(((e.clientY - r.top) / r.height) * 100, 8), 92),
    });
  };
  const seretLegendaSelesai = () => {
    seretLegendaRef.current = false;
  };

  // ---------- ubah ukuran legenda: preset + seret titik biru di pojok ----------
  const resizeLegendaMulai = (e: ReactPointerEvent<HTMLDivElement>) => {
    e.stopPropagation(); // jangan ikut menyeret posisi kotak
    e.preventDefault();
    const kotak = legendaBoxRef.current;
    if (!kotak) return;
    resizeLegendaRef.current = { lebarDasar: kotak.offsetWidth || 1 }; // offsetWidth tak terpengaruh transform
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const resizeLegendaGerak = (e: ReactPointerEvent<HTMLDivElement>) => {
    const st = resizeLegendaRef.current;
    const bingkai = bingkaiRef.current;
    if (!st || !bingkai) return;
    const r = bingkai.getBoundingClientRect();
    const pusatX = r.left + (posLegenda.x / 100) * r.width; // pusat kotak tak berubah saat resize
    const k = Math.min(Math.max((Math.abs(e.clientX - pusatX) * 2) / st.lebarDasar, 0.5), 3);
    setSkalaLegenda(Math.round(k * 1000) / 1000);
  };
  const resizeLegendaSelesai = () => {
    resizeLegendaRef.current = null;
  };

  // ---------- tulisan tambahan buatan user di dalam legenda ----------
  const tambahLegendaKustom = () => {
    const teks = teksKustom.trim();
    if (!teks) {
      toast.error("Tulis dulu isi legendanya", { description: "Contoh: Jalan Utama, Batas Provinsi, Lokasi Sumur." });
      return;
    }
    setLegendaKustom((prev) => [
      ...prev,
      { id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, teks, simbol: simbolKustom, warna: warnaKustom },
    ]);
    setTeksKustom("");
    toast.success("Tulisan masuk ke legenda", { description: `“${teks}” kini tampil di kotak legenda.` });
  };
  const hapusLegendaKustom = (id: string) => {
    setLegendaKustom((prev) => prev.filter((x) => x.id !== id));
  };

  // ---------- foto di sheet layout: tambah / seret / ubah ukuran / hapus ----------
  const tambahFoto = (file: File) => {
    if (!file.type.startsWith("image/")) {
      toast.error("Bukan file gambar", { description: "Pilih file JPG, PNG, WebP, atau GIF." });
      return;
    }
    const pembaca = new FileReader();
    pembaca.onload = () => {
      const img = new Image();
      img.onload = () => {
        // kompres: sisi terpanjang maks 1400 px agar layout tetap ringan & rapi saat cetak
        const MAKS_PX = 1400;
        const skala = Math.min(1, MAKS_PX / Math.max(img.width, img.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(img.width * skala));
        canvas.height = Math.max(1, Math.round(img.height * skala));
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        const src = file.type === "image/png" ? canvas.toDataURL("image/png") : canvas.toDataURL("image/jpeg", 0.86);
        const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
        setFotoList((prev) => [
          ...prev,
          { id, nama: file.name, src, x: 50, y: 50, w: 240, rasio: canvas.width / canvas.height },
        ]);
        setFotoAktifId(id);
        toast.success("Foto masuk ke layout", {
          description: `${file.name} — seret untuk memindah, seret titik biru di pojok untuk mengubah ukuran.`,
        });
      };
      img.onerror = () => toast.error("Gambar gagal dibaca", { description: "File kemungkinan rusak atau bukan gambar." });
      img.src = String(pembaca.result);
    };
    pembaca.readAsDataURL(file);
  };

  const hapusFoto = (id: string) => {
    setFotoList((prev) => prev.filter((f) => f.id !== id));
    setFotoAktifId((cur) => (cur === id ? null : cur));
    toast.info("Foto dihapus dari layout");
  };

  const aturUkuranFoto = (w: number) => {
    if (!fotoAktifId) {
      toast.info("Pilih foto dulu", { description: "Klik salah satu foto di layout, lalu pilih ukuran." });
      return;
    }
    setFotoList((prev) => prev.map((f) => (f.id === fotoAktifId ? { ...f, w } : f)));
  };

  const seretFotoMulai = (id: string) => (e: ReactPointerEvent<HTMLDivElement>) => {
    e.stopPropagation();
    setFotoAktifId(id);
    seretFotoRef.current = id;
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const seretFotoGerak = (e: ReactPointerEvent<HTMLDivElement>) => {
    const id = seretFotoRef.current;
    if (!id || !sheetRef.current) return;
    const r = sheetRef.current.getBoundingClientRect();
    const x = Math.min(Math.max(((e.clientX - r.left) / r.width) * 100, 2), 98);
    const y = Math.min(Math.max(((e.clientY - r.top) / r.height) * 100, 2), 98);
    setFotoList((prev) => prev.map((f) => (f.id === id ? { ...f, x, y } : f)));
  };
  const seretFotoSelesai = () => {
    seretFotoRef.current = null;
  };

  const resizeFotoMulai = (id: string) => (e: ReactPointerEvent<HTMLDivElement>) => {
    e.stopPropagation();
    e.preventDefault();
    const wrap = e.currentTarget.parentElement?.getBoundingClientRect();
    if (!wrap) return;
    resizeFotoRef.current = { id, kiriPx: wrap.left, atasPx: wrap.top };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const resizeFotoGerak = (e: ReactPointerEvent<HTMLDivElement>) => {
    const st = resizeFotoRef.current;
    const sheet = sheetRef.current;
    if (!st || !sheet) return;
    const r = sheet.getBoundingClientRect();
    setFotoList((prev) =>
      prev.map((f) => {
        if (f.id !== st.id) return f;
        const hMaksPx = r.height * 0.96;
        let w = Math.min(Math.max(e.clientX - st.kiriPx, 48), r.width * 0.96);
        let h = w / f.rasio;
        if (h > hMaksPx) {
          h = hMaksPx;
          w = h * f.rasio;
        }
        return {
          ...f,
          w,
          x: Math.min(Math.max(((st.kiriPx + w / 2 - r.left) / r.width) * 100, 2), 98),
          y: Math.min(Math.max(((st.atasPx + h / 2 - r.top) / r.height) * 100, 2), 98),
        };
      })
    );
  };
  const resizeFotoSelesai = () => {
    resizeFotoRef.current = null;
  };

  return (
    <div className="relative flex-1 overflow-auto bg-slate-200 flex items-start justify-center p-6 print:bg-white print:p-0">
      <style>{`
        @media print {
          @page { size: A4 ${orientasi === "lanskap" ? "landscape" : "portrait"}; margin: 0; }
          html, body { height: auto !important; overflow: visible !important; }
          /* Sembunyikan SELURUH aplikasi, tampilkan hanya sheet layout di pojok kiri-atas halaman —
             position:fixed lolos dari kontainer overflow-hidden/overflow-auto yang bikin hasil cetak kosong */
          body * { visibility: hidden !important; }
          .layout-sheet, .layout-sheet * {
            visibility: visible !important;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          .layout-sheet {
            position: fixed !important;
            left: 0 !important;
            top: 0 !important;
            margin: 0 !important;
            border: 0 !important;
            box-shadow: none !important;
          }
        }
      `}</style>
      <div
        ref={sheetRef}
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
        <div
          ref={bingkaiRef}
          className={`absolute ${
            gridAktif
              ? "left-[54px] right-[54px] top-[104px] bottom-[88px]"
              : "left-8 right-8 top-[86px] bottom-[70px]"
          } border border-slate-400 overflow-hidden rounded-sm`}
        >
          <div ref={setMapDiv} className="h-full w-full" style={{ backgroundColor: "#ffffff" }} />
          {/* Grid koordinat DMS: garis putus-putus / tick — dirender imperatif, terpotong rapi oleh bingkai */}
          <div ref={garisGridRef} className="pointer-events-none absolute inset-0 z-[460]" />
          {/* Logo arah utara — gaya/posisi/ukuran dari Panel Layout, bisa diseret */}
          {(() => {
            const gayaAktif = GAYA_UTARA.find((g) => g.id === gayaUtara) ?? GAYA_UTARA[0];
            const CompUtara = gayaAktif.Comp;
            return (
              <div
                className="absolute z-[700] cursor-move select-none touch-none"
                style={{
                  left: `${posUtara.x}%`,
                  top: `${posUtara.y}%`,
                  transform: "translate(-50%, -50%)",
                  width: ukuranUtara,
                }}
                onPointerDown={seretUtaraMulai}
                onPointerMove={seretUtaraGerak}
                onPointerUp={seretUtaraSelesai}
                onPointerCancel={seretUtaraSelesai}
                title={`Logo utara (${gayaAktif.label}) — seret untuk memindahkan`}
              >
                <div className="pointer-events-none rounded-lg border border-slate-300 bg-white/90 p-0.5 shadow">
                  <CompUtara className="block h-auto w-full" />
                </div>
              </div>
            );
          })()}
          {/* Legenda peta — kotak sudut melengkung, ukuran/posisi/judul bisa diatur, isi bisa ditambah */}
          {legendaAktif && semuaLegenda.length > 0 && (
            <div
              ref={legendaBoxRef}
              className="absolute z-[650] cursor-move select-none touch-none rounded-2xl border border-slate-300 bg-white/95 px-3 pt-1.5 pb-2.5 shadow-lg"
              style={{
                left: `${posLegenda.x}%`,
                top: `${posLegenda.y}%`,
                transform: `translate(-50%, -50%) scale(${skalaLegenda})`,
              }}
              onPointerDown={seretLegendaMulai}
              onPointerMove={seretLegendaGerak}
              onPointerUp={seretLegendaSelesai}
              onPointerCancel={seretLegendaSelesai}
              title="Legenda — seret untuk memindahkan"
            >
              <input
                value={legendaJudul}
                onChange={(e) => setLegendaJudul(e.target.value)}
                onPointerDown={(e) => e.stopPropagation()}
                aria-label="Judul legenda"
                className="pointer-events-auto mb-1.5 w-full min-w-0 rounded border-b border-slate-300 bg-transparent pb-0.5 text-center text-[11px] font-bold uppercase tracking-wide text-slate-700 outline-none focus:bg-blue-50"
              />
              <div className={`grid gap-x-4 gap-y-1 ${legendaKolom === 2 ? "grid-cols-2" : "grid-cols-1"}`}>
                {semuaLegenda.map((li, i) => (
                  <div key={li.jenis + i} className="flex items-center gap-1.5 whitespace-nowrap text-[10px] text-slate-700">
                    <SimbolLegenda jenis={li.jenis} warna={li.warna} />
                    {li.label}
                  </div>
                ))}
              </div>
              {/* titik biru: seret untuk mengubah ukuran legenda secara bebas */}
              <div
                onPointerDown={resizeLegendaMulai}
                onPointerMove={resizeLegendaGerak}
                onPointerUp={resizeLegendaSelesai}
                onPointerCancel={resizeLegendaSelesai}
                title="Seret untuk mengubah ukuran legenda"
                className="absolute -bottom-1.5 -right-1.5 h-4 w-4 cursor-nwse-resize rounded-full border-2 border-white bg-blue-600 shadow"
              />
            </div>
          )}
          {basemapLayout !== "kosong" && (
            <p className="absolute top-1 left-2 z-10 text-[8px] text-slate-500 pointer-events-none">
              © OpenStreetMap / Esri
            </p>
          )}
        </div>

        {/* Label DMS grid koordinat — DI LUAR bingkai peta (kolam margin sheet, gaya peta topografi) */}
        <div ref={labelGridRef} className="pointer-events-none absolute inset-0 z-[640]" />

        {/* Foto-foto yang ditempel ke sheet — bisa diseret & diubah ukurannya */}
        {fotoList.map((f) => {
          const aktif = fotoAktifId === f.id;
          return (
            <div
              key={f.id}
              className={`absolute cursor-move select-none touch-none ${aktif ? "z-[800]" : "z-[600]"}`}
              style={{
                left: `${f.x}%`,
                top: `${f.y}%`,
                transform: "translate(-50%, -50%)",
                width: f.w,
              }}
              onPointerDown={seretFotoMulai(f.id)}
              onPointerMove={seretFotoGerak}
              onPointerUp={seretFotoSelesai}
              onPointerCancel={seretFotoSelesai}
              title={`${f.nama} — seret untuk memindahkan`}
            >
              <img
                src={f.src}
                alt={f.nama}
                draggable={false}
                className="pointer-events-none block h-auto w-full rounded-lg border border-white/80 shadow-lg"
              />
              {aktif && (
                <>
                  <div className="pointer-events-none absolute inset-0 rounded-lg ring-2 ring-blue-500" />
                  <button
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={() => hapusFoto(f.id)}
                    title="Hapus foto"
                    className="absolute -right-2 -top-2 z-10 flex h-5 w-5 items-center justify-center rounded-full bg-red-600 text-white shadow hover:bg-red-700"
                  >
                    <X className="h-3 w-3" />
                  </button>
                  <div
                    onPointerDown={resizeFotoMulai(f.id)}
                    onPointerMove={resizeFotoGerak}
                    onPointerUp={resizeFotoSelesai}
                    onPointerCancel={resizeFotoSelesai}
                    title="Seret untuk mengubah ukuran"
                    className="absolute -bottom-1.5 -right-1.5 h-4 w-4 cursor-nwse-resize rounded-full border-2 border-white bg-blue-600 shadow"
                  />
                </>
              )}
            </div>
          );
        })}

        {/* Kaki layout */}
        <div className="absolute bottom-4 left-0 right-0 px-10 flex justify-between text-[10px] text-slate-500">
          <span>Dibuat dengan SIMPLE CADGIS</span>
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
                  {(["osm", "sat", "kosong"] as const).map((b) => (
                    <button
                      key={b}
                      onClick={() => setBasemapLayout(b)}
                      aria-pressed={basemapLayout === b}
                      className={`flex-1 rounded-lg px-2 py-1.5 text-xs font-medium ${
                        basemapLayout === b ? "bg-blue-600 text-white" : "bg-slate-100 hover:bg-slate-200"
                      }`}
                    >
                      {b === "osm" ? "OSM" : b === "sat" ? "Satelit" : "Putih"}
                    </button>
                  ))}
                </div>
                {basemapLayout === "kosong" && (
                  <p className="text-[10px] text-slate-400 mt-1">
                    Tanpa peta dasar — latar putih polos, hanya data (titik/poligon/kontur/label) yang tampil.
                  </p>
                )}
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <p className="text-xs font-semibold text-slate-500">Grid koordinat (DMS)</p>
                  <label className="flex cursor-pointer items-center gap-1 text-[10px] text-slate-500">
                    <input
                      type="checkbox"
                      checked={gridAktif}
                      onChange={(e) => setGridAktif(e.target.checked)}
                    />
                    Tampil
                  </label>
                </div>
                {gridAktif && (
                  <>
                    <div className="flex gap-1.5">
                      {(
                        [
                          ["garis", "Garis putus-putus"],
                          ["tick", "Garis pendek (tick)"],
                        ] as const
                      ).map(([m, label]) => (
                        <button
                          key={m}
                          onClick={() => setGridMode(m)}
                          aria-pressed={gridMode === m}
                          className={`flex-1 rounded-lg px-2 py-1.5 text-[10px] font-medium ${
                            gridMode === m ? "bg-blue-600 text-white" : "bg-slate-100 hover:bg-slate-200"
                          }`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                    <p className="text-xs font-semibold text-slate-500 mt-2.5 mb-1">Interval garis</p>
                    <div className="flex items-center gap-1">
                      <input
                        type="number"
                        min={0}
                        max={179}
                        value={gridInt.d}
                        onChange={(e) =>
                          setGridInt((v) => ({ ...v, d: Math.min(179, Math.max(0, parseInt(e.target.value || "0", 10) || 0)) }))
                        }
                        aria-label="Interval derajat"
                        className="w-11 rounded-lg border border-slate-300 px-1.5 py-1 text-center text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                      <span className="text-xs text-slate-400">°</span>
                      <input
                        type="number"
                        min={0}
                        max={59}
                        value={gridInt.m}
                        onChange={(e) =>
                          setGridInt((v) => ({ ...v, m: Math.min(59, Math.max(0, parseInt(e.target.value || "0", 10) || 0)) }))
                        }
                        aria-label="Interval menit"
                        className="w-11 rounded-lg border border-slate-300 px-1.5 py-1 text-center text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                      <span className="text-xs text-slate-400">&apos;</span>
                      <input
                        type="number"
                        min={0}
                        max={59}
                        value={gridInt.s}
                        onChange={(e) =>
                          setGridInt((v) => ({ ...v, s: Math.min(59, Math.max(0, parseInt(e.target.value || "0", 10) || 0)) }))
                        }
                        aria-label="Interval detik"
                        className="w-11 rounded-lg border border-slate-300 px-1.5 py-1 text-center text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                      <span className="text-xs text-slate-400">&quot;</span>
                    </div>
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      {(
                        [
                          [0, 0, 30, '30"'],
                          [0, 1, 0, "1'"],
                          [0, 2, 0, "2'"],
                          [0, 5, 0, "5'"],
                          [0, 10, 0, "10'"],
                          [0, 30, 0, "30'"],
                          [1, 0, 0, "1°"],
                        ] as const
                      ).map(([d, m, s, lbl]) => (
                        <button
                          key={lbl}
                          onClick={() => setGridInt({ d, m, s })}
                          className={`rounded-md px-1.5 py-0.5 text-[10px] ${
                            gridInt.d === d && gridInt.m === m && gridInt.s === s
                              ? "bg-blue-600 text-white"
                              : "bg-slate-100 hover:bg-blue-100 text-slate-600"
                          }`}
                        >
                          {lbl}
                        </button>
                      ))}
                    </div>
                    <p className="text-[10px] text-slate-400 mt-1.5 flex items-start gap-1">
                      <Move className="h-3 w-3 shrink-0 mt-0.5" />
                      Label derajat-menit-detik tampil di 4 sisi bingkai (bujur atas-bawah, lintang kiri-kanan);
                      bingkai dilebarkan otomatis agar ada ruang label. Ikut tercetak di PDF/PNG.
                    </p>
                  </>
                )}
              </div>

              <div>
                <p className="text-xs font-semibold text-slate-500 mb-1.5">Logo arah utara</p>
                <div className="grid grid-cols-4 gap-1.5">
                  {GAYA_UTARA.map((g) => (
                    <button
                      key={g.id}
                      onClick={() => setGayaUtara(g.id)}
                      title={g.label}
                      aria-pressed={gayaUtara === g.id}
                      className={`flex h-12 items-center justify-center rounded-lg border px-1 ${
                        gayaUtara === g.id
                          ? "border-blue-600 bg-blue-50 ring-2 ring-blue-500"
                          : "border-slate-200 bg-white hover:bg-slate-100"
                      }`}
                    >
                      <g.Comp className="h-10 w-auto" />
                    </button>
                  ))}
                </div>

                <p className="text-xs font-semibold text-slate-500 mt-2.5 mb-1.5">Posisi logo</p>
                <div className="grid grid-cols-4 gap-1.5">
                  {(
                    [
                      ["Kiri atas", "↖", 12, 10],
                      ["Kanan atas", "↗", 88, 10],
                      ["Kiri bawah", "↙", 12, 90],
                      ["Kanan bawah", "↘", 88, 90],
                    ] as const
                  ).map(([label, ikon, x, y]) => (
                    <button
                      key={label}
                      onClick={() => setPosUtara({ x, y })}
                      title={label}
                      aria-pressed={Math.abs(posUtara.x - x) < 1 && Math.abs(posUtara.y - y) < 1}
                      className={`rounded-lg border py-1 text-xs ${
                        Math.abs(posUtara.x - x) < 1 && Math.abs(posUtara.y - y) < 1
                          ? "border-blue-600 bg-blue-50 font-semibold text-blue-700 ring-2 ring-blue-500"
                          : "border-slate-200 bg-white text-slate-600 hover:bg-slate-100"
                      }`}
                    >
                      {ikon}
                    </button>
                  ))}
                </div>

                <p className="text-xs font-semibold text-slate-500 mt-2.5 mb-1.5">Ukuran logo</p>
                <div className="flex gap-1.5">
                  {(
                    [
                      ["Kecil", 40],
                      ["Sedang", 56],
                      ["Besar", 76],
                    ] as const
                  ).map(([label, v]) => (
                    <button
                      key={label}
                      onClick={() => setUkuranUtara(v)}
                      aria-pressed={ukuranUtara === v}
                      className={`flex-1 rounded-lg px-2 py-1 text-xs font-medium ${
                        ukuranUtara === v ? "bg-blue-600 text-white" : "bg-slate-100 hover:bg-slate-200"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <p className="text-[10px] text-slate-400 mt-1.5 flex items-start gap-1">
                  <Move className="h-3 w-3 shrink-0 mt-0.5" />
                  Logo juga bisa diseret langsung di atas peta ke posisi mana pun.
                </p>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <p className="text-xs font-semibold text-slate-500">Legenda peta</p>
                  <label className="flex cursor-pointer items-center gap-1 text-[10px] text-slate-500">
                    <input
                      type="checkbox"
                      checked={legendaAktif}
                      onChange={(e) => setLegendaAktif(e.target.checked)}
                    />
                    Tampil
                  </label>
                </div>
                {legendaAktif && (
                  <>
                    <p className="text-[10px] text-slate-400 mb-1.5">
                      {legendaItems.length} item otomatis dari data + {legendaKustom.length} tulisanmu. Klik judul
                      legenda di peta untuk mengganti teksnya.
                    </p>
                    {legendaItems.length === 0 && legendaKustom.length === 0 && (
                      <p className="text-[10px] text-amber-600 mb-1.5">
                        Legenda masih kosong — tambahkan data di peta atau tulis item sendiri di bawah.
                      </p>
                    )}
                    <div className="flex gap-1.5">
                      {([1, 2] as const).map((k) => (
                        <button
                          key={k}
                          onClick={() => setLegendaKolom(k)}
                          aria-pressed={legendaKolom === k}
                          className={`flex-1 rounded-lg px-2 py-1 text-xs font-medium ${
                            legendaKolom === k ? "bg-blue-600 text-white" : "bg-slate-100 hover:bg-slate-200"
                          }`}
                        >
                          {k} kolom
                        </button>
                      ))}
                    </div>

                    <p className="text-xs font-semibold text-slate-500 mt-2.5 mb-1">Ukuran legenda</p>
                    <div className="flex gap-1.5">
                      {(
                        [
                          ["Kecil", 0.8],
                          ["Sedang", 1],
                          ["Besar", 1.3],
                        ] as const
                      ).map(([label, v]) => (
                        <button
                          key={label}
                          onClick={() => setSkalaLegenda(v)}
                          aria-pressed={Math.abs(skalaLegenda - v) < 0.01}
                          className={`flex-1 rounded-lg px-2 py-1 text-xs font-medium ${
                            Math.abs(skalaLegenda - v) < 0.01
                              ? "bg-blue-600 text-white"
                              : "bg-slate-100 hover:bg-slate-200"
                          }`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>

                    <p className="text-xs font-semibold text-slate-500 mt-2.5 mb-1">Tambah tulisan ke legenda</p>
                    <div className="flex gap-1">
                      <input
                        value={teksKustom}
                        onChange={(e) => setTeksKustom(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") tambahLegendaKustom();
                        }}
                        placeholder="Contoh: Jalan Utama"
                        aria-label="Isi tulisan legenda"
                        className="min-w-0 flex-1 rounded-lg border border-slate-300 px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                      <select
                        value={simbolKustom}
                        onChange={(e) => setSimbolKustom(e.target.value as ItemLegendaKustom["simbol"])}
                        aria-label="Bentuk simbol"
                        title="Bentuk simbol di samping tulisan"
                        className="rounded-lg border border-slate-300 bg-white px-1 py-1.5 text-[10px] focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="garis">Garis</option>
                        <option value="kotak">Kotak</option>
                        <option value="bulat">Bulat</option>
                        <option value="polos">Teks</option>
                      </select>
                      <input
                        type="color"
                        value={warnaKustom}
                        onChange={(e) => setWarnaKustom(e.target.value)}
                        aria-label="Warna simbol"
                        title="Warna simbol"
                        className="h-8 w-8 shrink-0 cursor-pointer rounded border border-slate-300 bg-white p-0.5"
                      />
                    </div>
                    <button
                      onClick={tambahLegendaKustom}
                      className="mt-1.5 w-full rounded-lg bg-blue-600 py-1.5 text-xs font-semibold text-white hover:bg-blue-700"
                    >
                      + Masukkan ke legenda
                    </button>
                    {legendaKustom.length > 0 && (
                      <div className="mt-1.5 space-y-1">
                        {legendaKustom.map((k) => (
                          <div
                            key={k.id}
                            className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-1.5 py-1"
                          >
                            <SimbolLegenda jenis={k.simbol} warna={k.warna} />
                            <span className="min-w-0 flex-1 truncate text-[10px] text-slate-600" title={k.teks}>
                              {k.teks}
                            </span>
                            <button
                              onClick={() => hapusLegendaKustom(k.id)}
                              title="Hapus tulisan ini"
                              className="text-slate-400 hover:text-red-600"
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}

                    <p className="text-xs font-semibold text-slate-500 mt-2.5 mb-1.5">Posisi legenda</p>
                    <div className="grid grid-cols-4 gap-1.5">
                      {(
                        [
                          ["Kiri atas", "↖", 16, 14],
                          ["Kanan atas", "↗", 84, 14],
                          ["Kiri bawah", "↙", 16, 86],
                          ["Kanan bawah", "↘", 84, 86],
                        ] as const
                      ).map(([label, ikon, x, y]) => (
                        <button
                          key={label}
                          onClick={() => setPosLegenda({ x, y })}
                          title={label}
                          aria-pressed={Math.abs(posLegenda.x - x) < 1 && Math.abs(posLegenda.y - y) < 1}
                          className={`rounded-lg border py-1 text-xs ${
                            Math.abs(posLegenda.x - x) < 1 && Math.abs(posLegenda.y - y) < 1
                              ? "border-blue-600 bg-blue-50 font-semibold text-blue-700 ring-2 ring-blue-500"
                              : "border-slate-200 bg-white text-slate-600 hover:bg-slate-100"
                          }`}
                        >
                          {ikon}
                        </button>
                      ))}
                    </div>
                    <p className="text-[10px] text-slate-400 mt-1.5 flex items-start gap-1">
                      <Move className="h-3 w-3 shrink-0 mt-0.5" />
                      Kotak legenda bisa diseret bebas di peta; titik biru di pojok kanan-bawah untuk ukuran bebas.
                    </p>
                  </>
                )}
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <p className="text-xs font-semibold text-slate-500">Foto di layout</p>
                  {fotoList.length > 0 && (
                    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-500">
                      {fotoList.length} foto
                    </span>
                  )}
                </div>
                <input
                  ref={fileFotoRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) tambahFoto(f);
                    e.target.value = "";
                  }}
                />
                <button
                  onClick={() => fileFotoRef.current?.click()}
                  className="w-full flex items-center justify-center gap-1.5 rounded-lg bg-blue-600 text-white py-1.5 text-xs font-semibold hover:bg-blue-700"
                >
                  <ImagePlus className="h-3.5 w-3.5" />
                  Tambah Foto
                </button>
                {fotoList.length > 0 && (
                  <div className="mt-2 space-y-1">
                    {fotoList.map((f, i) => (
                      <div
                        key={f.id}
                        className={`flex items-center gap-1.5 rounded-lg border px-1.5 py-1 ${
                          fotoAktifId === f.id ? "border-blue-500 bg-blue-50" : "border-slate-200 bg-white"
                        }`}
                      >
                        <button
                          onClick={() => setFotoAktifId(f.id)}
                          className="min-w-0 flex-1 truncate text-left text-[10px] text-slate-600"
                          title={f.nama}
                        >
                          Foto {i + 1} — {f.nama}
                        </button>
                        <button
                          onClick={() => hapusFoto(f.id)}
                          title="Hapus foto"
                          className="text-slate-400 hover:text-red-600"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                    <p className="text-xs font-semibold text-slate-500 mt-2 mb-1">Ukuran foto terpilih</p>
                    <div className="flex gap-1.5">
                      {(
                        [
                          ["Kecil", 140],
                          ["Sedang", 240],
                          ["Besar", 360],
                        ] as const
                      ).map(([label, v]) => (
                        <button
                          key={label}
                          onClick={() => aturUkuranFoto(v)}
                          className="flex-1 rounded-lg bg-slate-100 px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-200"
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                    <p className="text-[10px] text-slate-400 mt-1.5 flex items-start gap-1">
                      <Move className="h-3 w-3 shrink-0 mt-0.5" />
                      Seret foto untuk memindah; seret titik biru di pojok kanan-bawah untuk mengubah ukuran bebas.
                    </p>
                  </div>
                )}
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
                  onClick={simpanPdf}
                  disabled={!!ekspor}
                  className="w-full flex items-center justify-center gap-1.5 rounded-xl bg-blue-600 text-white py-2 text-xs font-semibold hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  <FileDown className="h-4 w-4" />
                  {ekspor === "pdf" ? "Merender PDF…" : "Simpan PDF"}
                </button>
                <button
                  onClick={simpanPng}
                  disabled={!!ekspor}
                  className="w-full flex items-center justify-center gap-1.5 rounded-xl bg-emerald-600 text-white py-2 text-xs font-semibold hover:bg-emerald-700 disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  <ImageDown className="h-4 w-4" />
                  {ekspor === "png" ? "Merender PNG…" : "Simpan PNG"}
                </button>
                <button
                  onClick={cetak}
                  disabled={!!ekspor}
                  className="w-full flex items-center justify-center gap-1.5 rounded-xl border border-slate-300 text-slate-700 py-2 text-xs font-semibold hover:bg-slate-100 disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  <Printer className="h-4 w-4" />
                  Cetak (dialog printer)
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
                  Via Cetak: pilih skala kertas 100% (Actual size) agar skala peta tepat.
                </p>
              </div>
            </div>
          </FloatingWindow>
        </div>
      )}
    </div>
  );
}
