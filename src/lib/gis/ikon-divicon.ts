/**
 * Pembungkus Leaflet untuk ikon titik — file TERPISAH & client-only:
 * mengimpor leaflet di level modul, sehingga hanya boleh di-load dari
 * komponen dynamic ssr:false (MapCanvas). Jangan diimpor dari dialog
 * yang ikut prerender (leaflet butuh `window`).
 */

import L from "leaflet";
import { ikonHtml, htmlPolos } from "./ikon-titik";

/** L.DivIcon siap pakai untuk marker Leaflet — ujung pin tepat di koordinat. */
export function ikonDivIcon(id: string | undefined, terpilih: boolean): L.DivIcon {
  return L.divIcon({
    className: "",
    html: ikonHtml(id, terpilih) ?? htmlPolos,
    iconSize: [24, 30],
    iconAnchor: [12, 29],
    popupAnchor: [0, -27],
  });
}
