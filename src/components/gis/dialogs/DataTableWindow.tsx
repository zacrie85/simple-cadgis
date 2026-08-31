"use client";

import { useMemo, useState } from "react";
import { useGis } from "@/lib/gis/store";
import { FloatingWindow } from "../Chips";
import { titikDalamPoligon, fmtLuas, panjangGaris } from "@/lib/gis/geo";
import type { TableRow } from "@/lib/gis/types";
import { toast } from "sonner";
import { Search, Pencil, Trash2, Crosshair, X } from "lucide-react";

/** Tabel atribut mengambang seperti ArcGIS: lihat, cari, pilih, edit, hapus data. */
export default function DataTableWindow() {
  const open = useGis((s) => s.dialogs.table);
  const setDialog = useGis((s) => s.setDialog);
  const points = useGis((s) => s.points);
  const shapes = useGis((s) => s.shapes);
  const selection = useGis((s) => s.selection);
  const tableFilter = useGis((s) => s.tableShapeFilter);
  const setTableFilter = useGis((s) => s.setTableFilter);

  const [cari, setCari] = useState("");
  const [tabJenis, setTabJenis] = useState<"semua" | "titik" | "bentuk">("semua");

  const poligonFilter = shapes.find((s) => s.id === tableFilter) ?? null;

  const rows: TableRow[] = useMemo(() => {
    let pts = points;
    if (poligonFilter) pts = pts.filter((p) => titikDalamPoligon(p, poligonFilter.vertices));
    let shs = shapes;
    if (cari.trim()) {
      const q = cari.toLowerCase();
      pts = pts.filter((p) => p.title.toLowerCase().includes(q) || p.description.toLowerCase().includes(q) || JSON.stringify(p.attrs).toLowerCase().includes(q));
      shs = shs.filter((s) => s.title.toLowerCase().includes(q) || s.description.toLowerCase().includes(q));
    }
    const hasil: TableRow[] = [];
    if (tabJenis === "semua" || tabJenis === "titik") {
      for (const p of pts) {
        hasil.push({
          id: p.id,
          type: "point",
          kindLabel: "Titik",
          title: p.title,
          description: p.description,
          coord: `${p.lat.toFixed(6)}, ${p.lng.toFixed(6)}`,
          elevation: p.elevation,
          attrs: p.attrs,
          color: "#3b82f6",
          visible: true,
        });
      }
    }
    if (tabJenis === "semua" || tabJenis === "bentuk") {
      for (const s of shs) {
        hasil.push({
          id: s.id,
          type: "shape",
          kindLabel: s.kind === "closed" ? "Poligon" : "Garis",
          title: s.title,
          description: s.description,
          coord:
            s.kind === "closed"
              ? `${s.vertices.length} titik • ${fmtLuas(require_luas(s.vertices))}`
              : `${s.vertices.length} titik • ${panjangGaris(s.vertices) >= 1000 ? (panjangGaris(s.vertices) / 1000).toFixed(2) + " km" : panjangGaris(s.vertices).toFixed(1) + " m"}`,
          elevation: null,
          attrs: s.attrs,
          color: s.color,
          visible: s.visible,
        });
      }
    }
    return hasil;
  }, [points, shapes, poligonFilter, cari, tabJenis]);

  const kolomAttr = useMemo(() => {
    const k = new Set<string>();
    for (const r of rows.slice(0, 500)) Object.keys(r.attrs).forEach((x) => k.add(x));
    return Array.from(k).slice(0, 5);
  }, [rows]);

  if (!open) return null;

  return (
    <FloatingWindow judul="Tabel Data" onClose={() => setDialog("table", false)} lebar="w-[min(96vw,64rem)]">
      {/* Filter poligon aktif */}
      {poligonFilter && (
        <div className="mb-3 flex items-center gap-2 text-xs bg-emerald-50 text-emerald-800 border border-emerald-200 rounded-xl px-3 py-2">
          Menampilkan titik di dalam poligon: <b>{poligonFilter.title}</b>
          <button onClick={() => setTableFilter(null)} className="ml-auto hover:text-emerald-600 flex items-center gap-1" aria-label="Hapus filter poligon">
            <X className="h-3.5 w-3.5" /> Hapus filter
          </button>
        </div>
      )}

      {/* Kontrol */}
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            value={cari}
            onChange={(e) => setCari(e.target.value)}
            placeholder="Cari judul / atribut…"
            aria-label="Cari data"
            className="w-full rounded-xl border border-slate-300 pl-9 pr-3 py-2 text-sm"
          />
        </div>
        <div className="flex gap-1">
          {(
            [
              { k: "semua", label: "Semua" },
              { k: "titik", label: "Titik" },
              { k: "bentuk", label: "Poligon/Garis" },
            ] as const
          ).map((t) => (
            <button
              key={t.k}
              onClick={() => setTabJenis(t.k)}
              aria-pressed={tabJenis === t.k}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium ${
                tabJenis === t.k ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="flex gap-1 ml-auto">
          <button
            onClick={() => useGis.getState().setSelection(rows.map((r) => r.id))}
            className="rounded-lg bg-slate-100 px-3 py-1.5 text-xs hover:bg-slate-200"
          >
            Pilih semua
          </button>
          <button onClick={() => useGis.getState().clearSelection()} className="rounded-lg bg-slate-100 px-3 py-1.5 text-xs hover:bg-slate-200">
            Kosongkan
          </button>
          <button
            onClick={() => useGis.getState().setDialog("export", true)}
            className="rounded-lg bg-blue-600 text-white px-3 py-1.5 text-xs font-medium hover:bg-blue-700"
          >
            Ekspor…
          </button>
        </div>
      </div>

      {/* Tabel */}
      <div className="rounded-xl border border-slate-200 overflow-auto max-h-[calc(100vh-330px)] scrollbar-halus">
        <table className="min-w-full text-xs">
          <thead className="sticky top-0 bg-slate-50 z-10">
            <tr>
              <th className="px-2 py-2 border-b w-8"></th>
              <th className="px-2 py-2 border-b text-left font-semibold text-slate-500 whitespace-nowrap">Jenis</th>
              <th className="px-2 py-2 border-b text-left font-semibold text-slate-500">Judul</th>
              <th className="px-2 py-2 border-b text-left font-semibold text-slate-500 whitespace-nowrap">Koordinat / Info</th>
              <th className="px-2 py-2 border-b text-left font-semibold text-slate-500">Elevasi</th>
              <th className="px-2 py-2 border-b text-left font-semibold text-slate-500">Keterangan</th>
              {kolomAttr.map((k) => (
                <th key={k} className="px-2 py-2 border-b text-left font-semibold text-slate-500 whitespace-nowrap">{k}</th>
              ))}
              <th className="px-2 py-2 border-b text-center font-semibold text-slate-500 w-24">Aksi</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={8 + kolomAttr.length} className="text-center py-10 text-slate-400">
                  Belum ada data. Tambahkan titik/poligon atau impor file terlebih dahulu.
                </td>
              </tr>
            )}
            {rows.map((r) => {
              const terpilih = selection.includes(r.id);
              return (
                <tr key={r.id} className={`border-b last:border-0 ${terpilih ? "bg-blue-50/60" : "hover:bg-slate-50"}`}>
                  <td className="px-2 py-1.5">
                    <input
                      type="checkbox"
                      checked={terpilih}
                      onChange={() => useGis.getState().toggleSelect(r.id)}
                      aria-label={`Pilih ${r.title}`}
                    />
                  </td>
                  <td className="px-2 py-1.5">
                    <span className="inline-flex items-center gap-1 whitespace-nowrap">
                      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: r.color }} />
                      {r.kindLabel}
                    </span>
                  </td>
                  <td className="px-2 py-1.5 font-medium text-slate-800 max-w-[160px] truncate" title={r.title}>{r.title}</td>
                  <td className="px-2 py-1.5 text-slate-500 whitespace-nowrap">{r.coord}</td>
                  <td className="px-2 py-1.5 text-slate-600">{r.elevation != null ? `${r.elevation} m` : "—"}</td>
                  <td className="px-2 py-1.5 text-slate-500 max-w-[140px] truncate" title={r.description}>{r.description || "—"}</td>
                  {kolomAttr.map((k) => (
                    <td key={k} className="px-2 py-1.5 text-slate-600 max-w-[110px] truncate" title={r.attrs[k]}>
                      {r.attrs[k] ?? "—"}
                    </td>
                  ))}
                  <td className="px-2 py-1.5">
                    <div className="flex items-center justify-center gap-1">
                      <button
                        onClick={() => {
                          const p = points.find((x) => x.id === r.id);
                          const sh = shapes.find((x) => x.id === r.id);
                          if (p) {
                            useGis.getState().setDialog("point", { mode: "edit", id: p.id });
                          } else if (sh) {
                            useGis.getState().setDialog("shapeInfo", { id: sh.id });
                          }
                        }}
                        aria-label={`Edit ${r.title}`}
                        className="h-6 w-6 rounded-md hover:bg-blue-50 text-slate-400 hover:text-blue-600 flex items-center justify-center"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => {
                          const p = points.find((x) => x.id === r.id);
                          if (p) useGis.getState().flyTo(p.lat, p.lng, 17);
                          else {
                            const sh = shapes.find((x) => x.id === r.id);
                            if (sh?.vertices[0]) useGis.getState().flyTo(sh.vertices[0].lat, sh.vertices[0].lng, 16);
                          }
                        }}
                        aria-label={`Menuju ${r.title}`}
                        className="h-6 w-6 rounded-md hover:bg-emerald-50 text-slate-400 hover:text-emerald-600 flex items-center justify-center"
                      >
                        <Crosshair className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => {
                          if (r.type === "point") useGis.getState().deletePoint(r.id);
                          else useGis.getState().deleteShape(r.id);
                          toast.success("Data dihapus");
                        }}
                        aria-label={`Hapus ${r.title}`}
                        className="h-6 w-6 rounded-md hover:bg-red-50 text-slate-400 hover:text-red-600 flex items-center justify-center"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-slate-400 mt-2">
        {rows.length.toLocaleString("id-ID")} baris • {selection.length.toLocaleString("id-ID")} dipilih • centang baris lalu buka menu Ekspor untuk keluarkan sebagian data
      </p>
    </FloatingWindow>
  );
}

/** helper lokal agar tidak import lingkar deps */
function require_luas(vertices: { lat: number; lng: number }[]): number {
  // luas poligon geodesik sederhana (Chamberlain–Duquette)
  const R = 6378137;
  let area = 0;
  const len = vertices.length;
  for (let i = 0; i < len; i++) {
    const p1 = vertices[i];
    const p2 = vertices[(i + 1) % len];
    area +=
      ((p2.lng - p1.lng) * Math.PI) / 180 *
      (2 + Math.sin((p1.lat * Math.PI) / 180) + Math.sin((p2.lat * Math.PI) / 180));
  }
  return Math.abs((area * R * R) / 2);
}
