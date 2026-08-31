"use client";

import type { GisPoint, GisShape } from "./types";
import { uid } from "./geo";

/**
 * Data contoh: 25 titik berketinggian di lereng bukit sekitar Semarang
 * (sesuai format koordinat pengguna: -6.99, 110.42) + 1 poligon area tambang.
 */
export function dataContoh(): { points: GisPoint[]; shapes: GisShape[] } {
  const points: GisPoint[] = [];
  const lat0 = -6.994292;
  const lng0 = 110.4294;

  // bukit artifisial: elevasi meningkat ke tengah
  for (let i = 0; i < 5; i++) {
    for (let j = 0; j < 5; j++) {
      const dx = i - 2;
      const dy = j - 2;
      const elev = 320 + 60 * Math.exp(-(dx * dx + dy * dy) / 2.6) + (i % 2) * 3 + j * 1.5;
      points.push({
        id: uid("titik"),
        lat: lat0 + i * 0.0018,
        lng: lng0 + j * 0.0019,
        title: `ST-${i * 5 + j + 1}`,
        description: `Stak elevasi contoh ${i * 5 + j + 1}`,
        elevation: Math.round(elev * 10) / 10,
        attrs: { Sumber: "Contoh SIMPLE CADGIS" },
        source: "manual",
        visible: true,
      });
    }
  }

  const shapes: GisShape[] = [
    {
      id: uid("shape"),
      kind: "closed",
      title: "Area Tambang Contoh",
      description: "Poligon contoh untuk analisis cut & fill",
      color: "#f59e0b",
      vertices: [
        { lat: lat0 - 0.0008, lng: lng0 - 0.0009 },
        { lat: lat0 - 0.0008, lng: lng0 + 0.0095 },
        { lat: lat0 + 0.0085, lng: lng0 + 0.0095 },
        { lat: lat0 + 0.0085, lng: lng0 - 0.0009 },
      ],
      attrs: { Status: "Contoh" },
      source: "manual",
      visible: true,
    },
    {
      id: uid("shape"),
      kind: "open",
      title: "Jalan Hauling Contoh",
      description: "Garis terbuka contoh",
      color: "#10b981",
      vertices: [
        { lat: lat0 + 0.0010, lng: lng0 + 0.0030 },
        { lat: lat0 + 0.0022, lng: lng0 + 0.0048 },
        { lat: lat0 + 0.0034, lng: lng0 + 0.0052 },
        { lat: lat0 + 0.0046, lng: lng0 + 0.0068 },
      ],
      attrs: { Status: "Contoh" },
      source: "manual",
      visible: true,
    },
  ];

  return { points, shapes };
}
