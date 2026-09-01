/** File proyek uji untuk menu Muat Proyek SIMPLE CADGIS. */
import { writeFileSync } from "node:fs";

const proyekJakarta = {
  app: "SIMPLE CADGIS",
  versi: 1,
  disimpanPada: "2026-09-01T03:10:00.000Z",
  nama: "Proyek Jakarta Uji",
  layers: [{ id: "layer-uji-jkt", nama: "Titik Jakarta", terlihat: true, dibuat: 1756690000000 }],
  points: [
    { id: "titik-jkt-1", lat: -6.2, lng: 106.816, title: "Monas", description: "", attrs: { Kota: "Jakarta" }, source: "manual", visible: true, layerId: "layer-uji-jkt" },
    { id: "titik-jkt-2", lat: -6.22, lng: 106.816, title: "Bundaran HI", description: "", attrs: {}, source: "manual", visible: true, layerId: "layer-uji-jkt" },
  ],
  shapes: [
    {
      id: "shape-uji-1",
      kind: "closed",
      vertices: [
        { lat: -6.21, lng: 106.81 },
        { lat: -6.21, lng: 106.83 },
        { lat: -6.23, lng: 106.82 },
      ],
      title: "Area Uji",
      description: "",
      color: "#f59e0b",
      attrs: {},
      source: "manual",
      visible: true,
      layerId: "layer-uji-jkt",
    },
  ],
  labels: [{ id: "label-uji-1", lat: -6.205, lng: 106.82, text: "Catatan Uji", layerId: "layer-uji-jkt" }],
  contours: [],
  tampilan: { basemap: "osm", lat: -6.21, lng: 106.82, zoom: 13 },
};

const proyekBandung = {
  app: "SIMPLE CADGIS",
  versi: 1,
  disimpanPada: "2026-09-01T03:12:00.000Z",
  nama: "Proyek Bandung",
  layers: [{ id: "layer-uji-bdg", nama: "Titik Bandung", terlihat: true, dibuat: 1756690100000 }],
  points: [
    { id: "titik-bdg-1", lat: -6.9147, lng: 107.6098, title: "Gedung Sate", description: "", attrs: {}, source: "manual", visible: true, layerId: "layer-uji-bdg" },
  ],
  shapes: [],
  labels: [],
  contours: [],
};

writeFileSync("/home/z/my-project/download/uji-proyek-jakarta.cadgis.json", JSON.stringify(proyekJakarta, null, 2));
writeFileSync("/home/z/my-project/download/uji-proyek-bandung.cadgis.json", JSON.stringify(proyekBandung, null, 2));
console.log("OK: 2 file proyek uji dibuat di download/");
