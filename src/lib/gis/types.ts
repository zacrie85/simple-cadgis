/** Tipe data inti SIMPLE CADGIS */

export interface LatLng {
  lat: number;
  lng: number;
}

/** Layer/group data: satu hasil impor atau kumpulan gambar manual. */
export interface GisLayer {
  id: string;
  nama: string;
  terlihat: boolean;
  dibuat: number; // epoch ms
}

/** Layer raster georeferensi (GeoTIFF): overlay orthophoto/citra atau DEM.
 *  Gambar pratinjau berada di memori (objectURL) — TIDAK ikut simpan proyek. */
export interface RasterLayer {
  id: string;
  nama: string;
  terlihat: boolean;
  opasitas: number; // 0..1
  gambarUrl: string; // objectURL PNG/JPEG pratinjau dari worker
  barat: number;
  timur: number;
  selatan: number;
  utara: number;
  lebarPx: number;
  tinggiPx: number;
  sumberCrs: string; // label CRS sumber, mis. "EPSG:4326 (WGS84)"
  dem: boolean; // raster 1 band → dapat dipakai sumber elevasi lokal
  resolusiLabel: string; // mis. "±0,70 m/piksel"
  ukuranFileMb: number;
  dibuat: number; // epoch ms
}

export interface GisPoint {
  id: string;
  lat: number;
  lng: number;
  title: string;
  description: string;
  photo?: string; // dataURL foto
  elevation?: number | null; // ketinggian (meter) — dipakai kontur & volume
  attrs: Record<string, string>; // atribut tambahan dari impor
  source: "manual" | "excel" | "csv" | "kml" | "gpx" | "dxf";
  visible: boolean;
  labelTampil?: boolean; // tanda: label nama titik ini tampil pada mode "terpilih"
  layerId?: string; // layer pemilik (kosong = Tanpa Layer, selalu tampak)
  ikon?: string; // id ikon penanda (lihat lib/gis/ikon-titik.ts) — kosong = titik polos
}

export interface GisShape {
  id: string;
  kind: "closed" | "open"; // poligon tertutup / garis-poligon terbuka
  vertices: LatLng[];
  title: string;
  description: string;
  color: string;
  attrs: Record<string, string>;
  source: "manual" | "kml" | "gpx" | "dxf";
  visible: boolean;
  labelTampil?: boolean; // tanda: label nama bentuk ini tampil pada mode "terpilih"
  layerId?: string; // layer pemilik (kosong = Tanpa Layer, selalu tampak)
  /** Garis anak panah — mata panah digambar di ujung AKHIR garis (bentuk "open"). */
  panah?: boolean;
  /** Transparansi ISI (0..1) poligon/kotak/bulatan/elips — 0 = garis tepi saja, 1 = warna solid penuh.
   *  Kosong = bawaan 0.15. Tidak berlaku utk garis/panah (tak berisi). */
  isiOpasitas?: number;
}

export interface GisLabel {
  id: string;
  lat: number;
  lng: number;
  text: string;
  /** Arah tulisan — "horizontal" (bawaan) atau "vertikal" (berdiri atas→bawah). */
  arah?: "horizontal" | "vertikal";
  /** Ukuran huruf px (bawaan 12) — hasil resize manual. */
  ukuran?: number;
  layerId?: string; // layer pemilik (kosong = Tanpa Layer, selalu tampak)
}

export interface ContourPath {
  elev: number;
  coords: LatLng[];
}

export interface ContourLayer {
  id: string;
  interval: number;
  levels: number[];
  paths: ContourPath[];
  createdAt: number;
  visible: boolean;
}

export type ToolMode =
  | null
  | "point"
  | "poly-closed"
  | "poly-open"
  | "text"
  | "measure"
  | "select" // blok data dengan drag kotak
  | "select-poligon" // blok data dengan menggambar poligon — semua fitur di dalamnya terpilih
  | "zoombox" // zoom ke area dengan drag kotak
  | "bulatan" // lingkaran: klik pusat + klik radius
  | "elips" // elips: klik pusat + klik jangkauan
  | "kotak" // kotak: klik sudut awal + klik sudut berlawanan (pratinjau + ukuran L×T tampil)
  | "lengkung-kiri" // busur setengah lingkaran belok kiri: klik awal + klik akhir
  | "lengkung-kanan" // busur setengah lingkaran belok kanan: klik awal + klik akhir
  | "panah" // garis anak panah: klik jalur (min. 2) → mata panah di ujung akhir
  | "edit-bentuk"; // edit titik bentuk + lengkungkan ruas lurus (ala Arc/Fillet AutoCAD)

/** Mode tampil label nama fitur di peta (dan ikut ke KMZ/KML). */
export type LabelMode = "semua" | "terpilih" | "sembunyi";

export type FeatureType = "point" | "shape";

/** Isi file proyek (.cadgis.json) — seluruh pekerjaan dalam satu file. */
export interface ProyekData {
  app: "SIMPLE CADGIS";
  versi: number;
  disimpanPada: string; // ISO
  nama?: string;
  layers: GisLayer[];
  points: GisPoint[];
  shapes: GisShape[];
  labels: GisLabel[];
  contours: ContourLayer[];
  tampilan?: { basemap?: "osm" | "sat"; lat?: number; lng?: number; zoom?: number };
  fotoLepas?: boolean; // true bila foto dilepas saat menyimpan (kuota/ukuran)
}

/** Item baris tabel data (titik & poligon/garis digabung, seperti atribut tabel ArcGIS). */
export interface TableRow {
  id: string;
  type: FeatureType;
  kindLabel: string;
  title: string;
  description: string;
  coord: string;
  elevation?: number | null;
  attrs: Record<string, string>;
  color: string;
  visible: boolean;
}
