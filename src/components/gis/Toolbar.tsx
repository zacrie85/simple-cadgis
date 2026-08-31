"use client";

import { useGis } from "@/lib/gis/store";
import {
  Upload,
  Table2,
  Download,
  MapPin,
  Hexagon,
  Minus,
  Type,
  Ruler,
  Mountain,
  Calculator,
  Box,
  LayoutTemplate,
  Globe,
  Satellite,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Sparkles,
  FileSpreadsheet,
  BoxSelect,
  Trash2,
  Crop,
} from "lucide-react";
import { toast } from "sonner";
import { dataContoh } from "@/lib/gis/demo";

interface ItemGrup {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  onClick: () => void;
  active?: boolean;
  title?: string;
  disabled?: boolean;
  bahaya?: boolean; // gaya merah untuk aksi destruktif
}

interface Grup {
  nama: string;
  items: ItemGrup[];
}

export default function Toolbar() {
  const s = useGis();

  const setTool = (t: Parameters<typeof s.setTool>[0]) => {
    if (s.tool === t) s.setTool(null);
    else s.setTool(t);
  };

  const muatContoh = () => {
    const { points, shapes } = dataContoh();
    s.addPoints(points);
    shapes.forEach((sh) => s.addShape(sh));
    s.fitData();
    toast.success("Data contoh dimuat", {
      description: `${points.length} titik elevasi + ${shapes.length} poligon/garis. Coba menu Kontur & Volume!`,
    });
  };

  const jumlahTerpilih = s.selection.length;

  const hapusTerpilih = () => {
    if (jumlahTerpilih === 0) return;
    const { titik, bentuk } = s.deleteSelected();
    toast.success(`${titik} titik + ${bentuk} poligon/garis dihapus`, {
      description: "Semua data yang diblok/terpilih telah dihapus dari peta & tabel.",
    });
  };

  const grups: Grup[] = [
    {
      nama: "Berkas",
      items: [
        { label: "Impor", icon: Upload, title: "Impor Excel / CSV / KML / KMZ", onClick: () => s.setDialog("import", true) },
        { label: "Tabel", icon: Table2, title: "Buka tabel data", onClick: () => s.setDialog("table", true), active: s.dialogs.table },
        { label: "Ekspor", icon: Download, title: "Ekspor ke KMZ / Excel / SHP", onClick: () => s.setDialog("export", true) },
      ],
    },
    {
      nama: "Gambar",
      items: [
        { label: "Titik", icon: MapPin, title: "Tambah titik koordinat (klik peta)", onClick: () => setTool("point"), active: s.tool === "point" },
        { label: "Poligon", icon: Hexagon, title: "Poligon tertutup (klik titik-titik, lalu Selesai)", onClick: () => setTool("poly-closed"), active: s.tool === "poly-closed" },
        { label: "Garis", icon: Minus, title: "Poligon/garis terbuka (klik titik-titik, lalu Selesai)", onClick: () => setTool("poly-open"), active: s.tool === "poly-open" },
        { label: "Teks", icon: Type, title: "Tambah label teks (klik peta)", onClick: () => setTool("text"), active: s.tool === "text" },
      ],
    },
    {
      nama: "Pilih",
      items: [
        {
          label: "Blok",
          icon: BoxSelect,
          title: "Blok data — drag kotak di peta untuk memilih titik/poligon (Shift = tambah)",
          onClick: () => setTool("select"),
          active: s.tool === "select",
        },
        {
          label: jumlahTerpilih > 0 ? `Hapus (${jumlahTerpilih})` : "Hapus",
          icon: Trash2,
          title:
            jumlahTerpilih > 0
              ? `Hapus ${jumlahTerpilih} data terpilih (hasil blok)`
              : "Hapus data terpilih — blok dulu dengan tombol Blok",
          onClick: hapusTerpilih,
          disabled: jumlahTerpilih === 0,
          bahaya: true,
        },
      ],
    },
    {
      nama: "Analisis",
      items: [
        { label: "Ukur", icon: Ruler, title: "Ukur jarak antar titik", onClick: () => setTool("measure"), active: s.tool === "measure" },
        { label: "Kontur", icon: Mountain, title: "Buat kontur dari titik elevasi", onClick: () => s.setDialog("contour", true), active: s.dialogs.contour },
        { label: "Volume", icon: Calculator, title: "Hitung cut & fill / overburden", onClick: () => s.setDialog("volume", true), active: s.dialogs.volume },
        { label: "3D", icon: Box, title: "Tampilan 3D kontur", onClick: () => s.setDialog("view3d", true), active: s.dialogs.view3d },
      ],
    },
    {
      nama: "Keluaran",
      items: [
        { label: "Layout", icon: LayoutTemplate, title: "Editor layout cetak (seperti ArcGIS)", onClick: () => { s.setView("layout"); s.setDialog("layoutPanel", true); }, active: s.view === "layout" },
        { label: "Peta", icon: Globe, title: "Kembali ke tampilan peta", onClick: () => s.setView("map"), active: s.view === "map" },
      ],
    },
    {
      nama: "Peta",
      items: [
        { label: "OSM", icon: Globe, title: "Basemap OpenStreetMap", onClick: () => s.setBasemap("osm"), active: s.basemap === "osm" },
        { label: "Satelit", icon: Satellite, title: "Basemap citra satelit", onClick: () => s.setBasemap("sat"), active: s.basemap === "sat" },
      ],
    },
    {
      nama: "Navigasi",
      items: [
        {
          label: "Zoom Kotak",
          icon: Crop,
          title: "Zoom ke area — drag kotak di peta (seperti Zoom Window AutoCAD)",
          onClick: () => setTool("zoombox"),
          active: s.tool === "zoombox",
        },
        { label: "Perbesar", icon: ZoomIn, title: "Perbesar", onClick: () => window.dispatchEvent(new CustomEvent("geokita-zoom", { detail: 1 })) },
        { label: "Perkecil", icon: ZoomOut, title: "Perkecil", onClick: () => window.dispatchEvent(new CustomEvent("geokita-zoom", { detail: -1 })) },
        { label: "Fit Data", icon: Maximize2, title: "Tampilkan semua data", onClick: () => s.fitData() },
      ],
    },
    {
      nama: "Contoh",
      items: [
        { label: "Demo", icon: Sparkles, title: "Muat data contoh (titik elevasi + poligon)", onClick: muatContoh },
        { label: "Excel", icon: FileSpreadsheet, title: "Contoh alur impor Excel", onClick: () => s.setDialog("import", true) },
      ],
    },
  ];

  return (
    <header className="relative z-[1000] bg-white border-b border-slate-200 shadow-sm print:hidden">
      <div className="flex items-stretch gap-0 overflow-x-auto scrollbar-halus px-2">
        {/* Logo */}
        <div className="flex flex-col items-center justify-center px-3 border-r border-slate-200 mr-1 shrink-0">
          <span className="text-base font-extrabold tracking-tight text-blue-700 leading-none">GeoKita</span>
          <span className="text-[9px] text-slate-400 leading-none mt-0.5">GIS Web</span>
        </div>

        {grups.map((g) => (
          <div key={g.nama} className="flex flex-col shrink-0 border-r border-slate-200 px-1.5 py-1">
            <span className="text-[9px] font-semibold uppercase tracking-wider text-slate-400 text-center leading-none mb-0.5">
              {g.nama}
            </span>
            <div className="flex gap-0.5">
              {g.items.map((item) => (
                <button
                  key={item.label}
                  onClick={item.onClick}
                  disabled={item.disabled}
                  title={item.title ?? item.label}
                  aria-label={item.title ?? item.label}
                  aria-pressed={item.active}
                  className={`flex flex-col items-center justify-center w-[58px] h-[50px] rounded-lg transition-colors ${
                    item.disabled
                      ? "text-slate-300 cursor-not-allowed"
                      : item.active
                        ? "bg-blue-100 text-blue-700 ring-1 ring-blue-300"
                        : item.bahaya && jumlahTerpilih > 0
                          ? "text-red-600 hover:bg-red-50"
                          : "text-slate-600 hover:bg-slate-100 hover:text-blue-700"
                  }`}
                >
                  <item.icon className="h-[18px] w-[18px]" />
                  <span className="text-[9px] font-medium leading-none mt-1 text-center">{item.label}</span>
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </header>
  );
}
