/** Tipe data inti GeoKita */

export interface LatLng {
  lat: number;
  lng: number;
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
  source: "manual" | "excel" | "csv" | "kml";
  visible: boolean;
}

export interface GisShape {
  id: string;
  kind: "closed" | "open"; // poligon tertutup / garis-poligon terbuka
  vertices: LatLng[];
  title: string;
  description: string;
  color: string;
  attrs: Record<string, string>;
  source: "manual" | "kml";
  visible: boolean;
}

export interface GisLabel {
  id: string;
  lat: number;
  lng: number;
  text: string;
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
  | "zoombox"; // zoom ke area dengan drag kotak

export type FeatureType = "point" | "shape";

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
