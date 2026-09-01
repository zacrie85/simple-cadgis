"use client";

import { useMemo, useState } from "react";
import { useGis } from "@/lib/gis/store";
import { FloatingWindow } from "../Chips";
import { titikDalamPoligon, fmtLuas, panjangGaris } from "@/lib/gis/geo";
import type { TableRow } from "@/lib/gis/types";
import { toast } from "sonner";
import { Search, Pencil, Trash2, Crosshair, X, Columns3, ChevronLeft, ChevronRight, Check } from "lucide-react";

/** Tabel atribut mengambang seperti ArcGIS: lihat, cari, pilih, edit, hapus data.
 *  Semua kolom atribut hasil impor (Excel/KML, 70-100+ kolom) tampil penuh,
 *  dengan paginasi baris + scroll horizontal + kolom identitas menempel kiri. */
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
  const [halaman, setHalaman] = useState(1);
  const [perHalaman, setPerHalaman] = useState(100);
  const [kolomSembunyi, setKolomSembunyi] = useState<Set<string>>(new Set());
  const [panelKolom, setPanelKolom] = useState(false);
  const [cariKolom, setCariKolom] = useState("");

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

  // SEMUA kolom atribut dari SEMUA baris (urut kemunculan pertama) — tanpa batas jumlah kolom
  const semuaKolom = useMemo(() => {
    const daftar: string[] = [];
    const terlihat = new Set<string>();
    for (const r of rows) {
      for (const k of Object.keys(r.attrs)) {
        if (!terlihat.has(k)) {
          terlihat.add(k);
          daftar.push(k);
        }
      }
    }
    return daftar;
  }, [rows]);

  const kolomAttr = useMemo(() => semuaKolom.filter((k) => !kolomSembunyi.has(k)), [semuaKolom, kolomSembunyi]);

  // kembali ke halaman 1 saat filter/pencarian/tab berubah (pola resmi React: adjust state saat render)
  const kunciFilter = `${cari}\u0001${tabJenis}\u0001${perHalaman}\u0001${tableFilter ?? ""}`;
  const [kunciLama, setKunciLama] = useState(kunciFilter);
  if (kunciLama !== kunciFilter) {
    setKunciLama(kunciFilter);
    setHalaman(1);
  }

  const totalHalaman = Math.max(1, Math.ceil(rows.length / perHalaman));
  const hal = Math.min(halaman, totalHalaman);
  const barisHalaman = useMemo(() => rows.slice((hal - 1) * perHalaman, hal * perHalaman), [rows, hal, perHalaman]);

  const toggleKolom = (k: string) => {
    setKolomSembunyi((prev) => {
      const n = new Set(prev);
      if (n.has(k)) n.delete(k);
      else n.add(k);
      return n;
    });
  };

  const daftarKolomPanel = useMemo(() => {
    const q = cariKolom.trim().toLowerCase();
    return q ? semuaKolom.filter((k) => k.toLowerCase().includes(q)) : semuaKolom;
  }, [semuaKolom, cariKolom]);

  if (!open) return null;

  // kelas td kolom identitas menempel (bg opaque agar baris di bawahnya tak tembus saat scroll)
  const kelasTempel = (terpilih: boolean) =>
    `sticky z-10 border-r border-slate-200 ${terpilih ? "bg-blue-50" : "bg-white group-hover:bg-slate-50"}`;

  return (
    <FloatingWindow judul="Tabel Data" onClose={() => setDialog("table", false)} lebar="w-[min(96vw,80rem)]">
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
        <button
          onClick={() => setPanelKolom((v) => !v)}
          aria-pressed={panelKolom}
          title="Pilih kolom atribut yang ditampilkan"
          className={`rounded-lg px-3 py-1.5 text-xs font-medium flex items-center gap-1.5 ${
            panelKolom ? "bg-blue-600 text-white" : kolomSembunyi.size > 0 ? "bg-amber-100 text-amber-800 hover:bg-amber-200" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
          }`}
        >
          <Columns3 className="h-3.5 w-3.5" />
          Kolom ({kolomAttr.length}/{semuaKolom.length})
        </button>
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

      {/* Panel pilih kolom */}
      {panelKolom && (
        <div className="mb-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
          <div className="flex flex-wrap items-center gap-2 mb-2">
            <div className="relative flex-1 min-w-[160px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
              <input
                value={cariKolom}
                onChange={(e) => setCariKolom(e.target.value)}
                placeholder="Cari nama kolom…"
                aria-label="Cari kolom"
                className="w-full rounded-lg border border-slate-300 pl-8 pr-3 py-1.5 text-xs"
              />
            </div>
            <button
              onClick={() => setKolomSembunyi(new Set())}
              className="rounded-lg bg-emerald-100 text-emerald-800 px-2.5 py-1.5 text-xs hover:bg-emerald-200"
            >
              Tampilkan semua
            </button>
            <button
              onClick={() => setKolomSembunyi(new Set(semuaKolom))}
              className="rounded-lg bg-slate-100 text-slate-600 px-2.5 py-1.5 text-xs hover:bg-slate-200"
            >
              Sembunyikan atribut
            </button>
            <button onClick={() => setPanelKolom(false)} className="h-7 w-7 rounded-lg hover:bg-slate-200 text-slate-500 flex items-center justify-center" aria-label="Tutup panel kolom">
              <X className="h-4 w-4" />
            </button>
          </div>
          {semuaKolom.length === 0 ? (
            <p className="text-xs text-slate-400">Belum ada kolom atribut pada data.</p>
          ) : (
            <div className="flex flex-wrap gap-1 max-h-32 overflow-auto scrollbar-halus">
              {daftarKolomPanel.map((k) => {
                const tampil = !kolomSembunyi.has(k);
                return (
                  <button
                    key={k}
                    onClick={() => toggleKolom(k)}
                    title={tampil ? "Klik untuk sembunyikan kolom" : "Klik untuk tampilkan kolom"}
                    className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] max-w-[200px] ${
                      tampil ? "bg-blue-50 border-blue-300 text-blue-800" : "bg-white border-slate-300 text-slate-400"
                    }`}
                  >
                    {tampil ? <Check className="h-3 w-3 shrink-0" /> : <X className="h-3 w-3 shrink-0" />}
                    <span className="truncate">{k}</span>
                  </button>
                );
              })}
              {daftarKolomPanel.length === 0 && <p className="text-xs text-slate-400">Tidak ada kolom yang cocok dengan pencarian.</p>}
            </div>
          )}
        </div>
      )}

      {/* Tabel */}
      <div className="rounded-xl border border-slate-200 overflow-auto max-h-[calc(100vh-360px)] scrollbar-halus">
        <table className="min-w-full text-xs">
          <thead>
            <tr>
              <th className="sticky top-0 left-0 z-30 w-8 min-w-8 px-2 py-2 border-b border-r border-slate-200 bg-slate-50"></th>
              <th className="sticky top-0 left-8 z-30 w-[92px] min-w-[92px] px-2 py-2 border-b border-r border-slate-200 bg-slate-50 text-left font-semibold text-slate-500 whitespace-nowrap">Jenis</th>
              <th className="sticky top-0 left-[124px] z-30 w-[150px] min-w-[150px] px-2 py-2 border-b border-r border-slate-200 bg-slate-50 text-left font-semibold text-slate-500">Judul</th>
              <th className="sticky top-0 z-20 px-2 py-2 border-b bg-slate-50 text-left font-semibold text-slate-500 whitespace-nowrap">Koordinat / Info</th>
              <th className="sticky top-0 z-20 px-2 py-2 border-b bg-slate-50 text-left font-semibold text-slate-500">Elevasi</th>
              <th className="sticky top-0 z-20 px-2 py-2 border-b bg-slate-50 text-left font-semibold text-slate-500">Keterangan</th>
              {kolomAttr.map((k) => (
                <th key={k} className="sticky top-0 z-20 px-2 py-2 border-b bg-slate-50 text-left font-semibold text-slate-500 whitespace-nowrap" title={k}>{k}</th>
              ))}
              <th className="sticky top-0 z-20 px-2 py-2 border-b bg-slate-50 text-center font-semibold text-slate-500 w-24">Aksi</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={7 + kolomAttr.length} className="text-center py-10 text-slate-400">
                  Belum ada data. Tambahkan titik/poligon atau impor file terlebih dahulu.
                </td>
              </tr>
            )}
            {barisHalaman.map((r) => {
              const terpilih = selection.includes(r.id);
              return (
                <tr key={r.id} className={`group border-b last:border-0 ${terpilih ? "bg-blue-50/60" : "hover:bg-slate-50"}`}>
                  <td className={`${kelasTempel(terpilih)} px-2 py-1.5 left-0`}>
                    <input
                      type="checkbox"
                      checked={terpilih}
                      onChange={() => useGis.getState().toggleSelect(r.id)}
                      aria-label={`Pilih ${r.title}`}
                    />
                  </td>
                  <td className={`${kelasTempel(terpilih)} px-2 py-1.5 left-8 w-[92px]`}>
                    <span className="inline-flex items-center gap-1 whitespace-nowrap">
                      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: r.color }} />
                      {r.kindLabel}
                    </span>
                  </td>
                  <td className={`${kelasTempel(terpilih)} px-2 py-1.5 left-[124px] w-[150px] max-w-[150px] truncate font-medium text-slate-800`} title={r.title}>{r.title}</td>
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

      {/* Info & paginasi */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 mt-2 text-xs text-slate-400">
        <span>
          {rows.length.toLocaleString("id-ID")} baris • {semuaKolom.length.toLocaleString("id-ID")} kolom atribut • {selection.length.toLocaleString("id-ID")} dipilih • centang baris lalu buka menu Ekspor untuk keluarkan sebagian data
        </span>
        <div className="ml-auto flex items-center gap-2">
          <label className="flex items-center gap-1">
            Baris/hal:
            <select
              value={perHalaman}
              onChange={(e) => setPerHalaman(Number(e.target.value))}
              className="rounded-lg border border-slate-200 px-1.5 py-1 text-xs bg-white"
              aria-label="Baris per halaman"
            >
              {[50, 100, 200, 500].map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </label>
          <button
            onClick={() => setHalaman((h) => Math.max(1, h - 1))}
            disabled={hal <= 1}
            aria-label="Halaman sebelumnya"
            className="h-7 w-7 rounded-lg border border-slate-200 bg-white flex items-center justify-center hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </button>
          <span className="tabular-nums">
            Hal {hal.toLocaleString("id-ID")} / {totalHalaman.toLocaleString("id-ID")}
          </span>
          <button
            onClick={() => setHalaman((h) => Math.min(totalHalaman, h + 1))}
            disabled={hal >= totalHalaman}
            aria-label="Halaman berikutnya"
            className="h-7 w-7 rounded-lg border border-slate-200 bg-white flex items-center justify-center hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
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
