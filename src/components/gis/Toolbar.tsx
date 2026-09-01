"use client";

import { useGis } from "@/lib/gis/store";
import {
  Upload,
  Table2,
  Download,
  Save,
  FolderOpen,
  Layers,
  MapPin,
  Hexagon,
  Minus,
  Type,
  Ruler,
  Mountain,
  MountainSnow,
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
  Circle,
  Egg,
  CornerUpLeft,
  CornerUpRight,
  PenTool,
  Tags,
  Tag,
  EyeOff,
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
    const layerId = s.tambahLayer("Data Contoh");
    s.addPoints(points.map((p) => ({ ...p, layerId })));
    shapes.forEach((sh) => s.addShape({ ...sh, layerId }));
    s.fitData();
    toast.success("Data contoh dimuat", {
      description: `${points.length} titik elevasi + ${shapes.length} poligon/garis pada layer "Data Contoh". Coba menu Kontur & Volume!`,
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

  /** Tandai semua fitur terpilih agar labelnya tampil pada mode "Terpilih". */
  const tandaiLabelTerpilih = () => {
    const ids = new Set(s.selection);
    let n = 0;
    s.points.forEach((p) => {
      if (ids.has(p.id) && !p.labelTampil) {
        s.updatePoint(p.id, { labelTampil: true });
        n++;
      }
    });
    s.shapes.forEach((sh) => {
      if (ids.has(sh.id) && !sh.labelTampil) {
        s.updateShape(sh.id, { labelTampil: true });
        n++;
      }
    });
    if (n === 0) {
      toast.info("Tidak ada fitur baru yang ditandai", { description: "Semua fitur terpilih sudah bertanda label." });
      return;
    }
    toast.success(`${n} fitur ditandai 🏷`, {
      description: 'Aktifkan mode label "Terpilih" (grup Label) agar hanya yang bertanda yang tampil.',
    });
  };

  const grups: Grup[] = [
    {
      nama: "Berkas",
      items: [
        { label: "Impor", icon: Upload, title: "Impor Excel / CSV / KML / KMZ", onClick: () => s.setDialog("import", true) },
        { label: "Tabel", icon: Table2, title: "Buka tabel data", onClick: () => s.setDialog("table", true), active: s.dialogs.table },
        { label: "Ekspor", icon: Download, title: "Ekspor ke KMZ / Excel / SHP", onClick: () => s.setDialog("export", true) },
        { label: "Simpan", icon: Save, title: "Simpan proyek ke file .cadgis.json (semua data + layer)", onClick: () => s.setDialog("simpan", true), active: s.dialogs.simpan },
        { label: "Muat", icon: FolderOpen, title: "Muat proyek dari file .cadgis.json (ganti semua / gabungkan)", onClick: () => s.setDialog("muat", true), active: s.dialogs.muat },
        { label: "Layer", icon: Layers, title: "Panel layer — tampil/sembunyikan per layer, ganti nama, zoom, hapus", onClick: () => s.setDialog("layer", true), active: s.dialogs.layer },
        {
          label: "Bersihkan",
          icon: Trash2,
          title: "Kosongkan semua data (titik, poligon/garis, label, kontur, layer) — konfirmasi dulu sebelum hapus",
          onClick: () => s.setDialog("bersih", true),
          active: s.dialogs.bersih,
          bahaya: true,
          disabled: s.points.length + s.shapes.length + s.labels.length + s.contours.length === 0,
        },
      ],
    },
    {
      nama: "Gambar",
      items: [
        { label: "Titik", icon: MapPin, title: "Tambah titik koordinat (klik peta)", onClick: () => setTool("point"), active: s.tool === "point" },
        { label: "Poligon", icon: Hexagon, title: "Poligon tertutup (klik titik-titik, lalu Selesai)", onClick: () => setTool("poly-closed"), active: s.tool === "poly-closed" },
        { label: "Garis", icon: Minus, title: "Poligon/garis terbuka (klik titik-titik, lalu Selesai)", onClick: () => setTool("poly-open"), active: s.tool === "poly-open" },
        { label: "Teks", icon: Type, title: "Tambah label teks (klik peta)", onClick: () => setTool("text"), active: s.tool === "text" },
        { label: "Bulatan", icon: Circle, title: "Buat lingkaran — klik pusat, lalu klik radius", onClick: () => setTool("bulatan"), active: s.tool === "bulatan" },
        { label: "Elips", icon: Egg, title: "Buat elips — klik pusat, lalu klik jangkauan (kanan-atas)", onClick: () => setTool("elips"), active: s.tool === "elips" },
        { label: "Lengkung ←", icon: CornerUpLeft, title: "Busur belok KIRI (setengah lingkaran) — klik awal, lalu klik akhir", onClick: () => setTool("lengkung-kiri"), active: s.tool === "lengkung-kiri" },
        { label: "Lengkung →", icon: CornerUpRight, title: "Busur belok KANAN (setengah lingkaran) — klik awal, lalu klik akhir", onClick: () => setTool("lengkung-kanan"), active: s.tool === "lengkung-kanan" },
        { label: "Edit Bentuk", icon: PenTool, title: "Edit bentuk ala AutoCAD — klik garis/poligon: seret titik, lengkungkan ruas lurus", onClick: () => setTool("edit-bentuk"), active: s.tool === "edit-bentuk" },
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
        { label: "Elevasi DEM", icon: MountainSnow, title: "Isi elevasi otomatis dari DEM satelit — semua titik kosong, atau HANYA titik yang di-blok/terpilih (grid ±90 m)", onClick: () => s.setDialog("elevasi", true), active: s.dialogs.elevasi },
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
      nama: "Label",
      items: [
        { label: "Semua", icon: Tags, title: "Label nama DITAMPILKAN untuk semua titik & poligon/garis", onClick: () => s.setLabelMode("semua"), active: s.labelMode === "semua" },
        { label: "Terpilih", icon: Tag, title: 'Label hanya untuk fitur yang DITANDAI (tombol 🏷 di popup / "Tandai" di bawah / centang di dialog edit)', onClick: () => s.setLabelMode("terpilih"), active: s.labelMode === "terpilih" },
        { label: "Sembunyi", icon: EyeOff, title: "Semua label nama DISEMBUNYIKAN", onClick: () => s.setLabelMode("sembunyi"), active: s.labelMode === "sembunyi" },
        {
          label: jumlahTerpilih > 0 ? `Tandai (${jumlahTerpilih})` : "Tandai",
          icon: Tag,
          title: "Tandai semua fitur terpilih (hasil Blok) agar labelnya tampil pada mode Terpilih",
          onClick: tandaiLabelTerpilih,
          disabled: jumlahTerpilih === 0,
        },
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
      {/* Ribbon: grup yang tak muat lebar layar OTOMATIS turun ke baris berikutnya (seperti ArcGIS),
          sehingga tidak ada menu yang terpotong di pojok. Di layar HP (<640px) tetap gulir horizontal. */}
      <div className="flex items-stretch flex-nowrap overflow-x-auto scrollbar-halus px-2 gap-y-1 py-0.5 sm:flex-wrap sm:overflow-x-visible">
        {/* Logo */}
        <div className="flex flex-col items-center justify-center px-3 border-r border-slate-200 mr-1 shrink-0">
          <span className="text-base font-extrabold tracking-tight text-blue-700 leading-none">SIMPLE CADGIS</span>
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
                  className={`flex flex-col items-center justify-center w-[54px] h-[50px] rounded-lg transition-colors ${
                    item.disabled
                      ? "text-slate-300 cursor-not-allowed"
                      : item.active
                        ? "bg-blue-100 text-blue-700 ring-1 ring-blue-300"
                        : item.bahaya
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
