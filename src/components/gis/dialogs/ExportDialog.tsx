"use client";

import { useState } from "react";
import { useGis } from "@/lib/gis/store";
import { bangunKML, kmlKeKmz, kmlString } from "@/lib/gis/kml";
import { shapefileZip } from "@/lib/gis/shapefile";
import { excelZip, excelTabel } from "@/lib/gis/excelExport";
import { bangunGpx, bangunDxf } from "@/lib/gis/gpxdxf";
import { unduhBlob, stempelWaktu } from "@/lib/gis/download";
import { titikDalamPoligon } from "@/lib/gis/geo";
import type { GisPoint, GisShape } from "@/lib/gis/types";
// labelMode dibaca imperatif saat ekspor (bukan selector) agar nilai selalu terkini
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Download, FileArchive, FileSpreadsheet, Map, FileDigit, Box } from "lucide-react";

type Target = "titik" | "bentuk" | "tabel";
type Format = "kmz" | "xlsx" | "shp" | "gpx" | "dxf";

export default function ExportDialog() {
  const open = useGis((s) => s.dialogs.export);
  const setDialog = useGis((s) => s.setDialog);
  const points = useGis((s) => s.points);
  const shapes = useGis((s) => s.shapes);
  const contours = useGis((s) => s.contours);
  const selection = useGis((s) => s.selection);
  const tableFilter = useGis((s) => s.tableShapeFilter);

  const [target, setTarget] = useState<Target>("titik");
  const [scope, setScope] = useState<"semua" | "pilihan">("semua");

  if (!open) return null;

  const tutup = () => setDialog("export", false);

  const filterPoints = (): GisPoint[] => {
    let hasil = points;
    if (tableFilter) {
      const sh = shapes.find((s) => s.id === tableFilter);
      if (sh) hasil = hasil.filter((p) => titikDalamPoligon(p, sh.vertices));
    }
    if (scope === "pilihan") hasil = hasil.filter((p) => selection.includes(p.id));
    return hasil;
  };

  const filterShapes = (): GisShape[] => {
    let hasil = shapes;
    if (scope === "pilihan") hasil = hasil.filter((s) => selection.includes(s.id));
    return hasil;
  };

  const ekspor = async (format: Format) => {
    try {
      const ts = stempelWaktu();
      const pilih = filterPoints();
      const bentuk = filterShapes();

      // ---------- GPX & DXF: semua target diekspor gabungan (titik + bentuk + label) ----------
      if (format === "gpx" || format === "dxf") {
        if (pilih.length + bentuk.length === 0) {
          toast.error("Tidak ada data untuk diekspor");
          return;
        }
        const labels = useGis.getState().labels;
        const namaDok = `SIMPLE-CADGIS-${target === "titik" ? "Titik" : target === "bentuk" ? "Bentuk" : "Tabel"}-${ts}`;
        if (format === "gpx") {
          const gpx = bangunGpx({ points: pilih, shapes: bentuk, labels, namaDok });
          unduhBlob(gpx, `${namaDok}.gpx`, "application/gpx+xml");
          toast.success(`${pilih.length + bentuk.length} fitur diekspor ke GPX`, {
            description: `${pilih.length} titik (wpt) + ${bentuk.length} poligon/garis (track). Koordinat WGS84 siap dipakai GPS/Garmin/QGIS.`,
          });
        } else {
          const dxf = bangunDxf({ points: pilih, shapes: bentuk, labels });
          unduhBlob(dxf, `${namaDok}.dxf`, "application/dxf");
          toast.success(`${pilih.length + bentuk.length} fitur diekspor ke DXF`, {
            description: "Koordinat derajat WGS84 (x=bujur, y=lintang) — ter-georeferensi & bisa diimpor balik di sini. Titik + polyline terbaca di AutoCAD/QGIS.",
          });
        }
        return;
      }

      if (target === "titik") {
        if (pilih.length === 0) {
          toast.error("Tidak ada titik untuk diekspor");
          return;
        }
        if (format === "kmz") {
          const kml = bangunKML({ points: pilih, namaDokumen: "Ekspor Titik SIMPLE CADGIS", labelMode: useGis.getState().labelMode });
          unduhBlob(kmlKeKmz(kml, "titik"), `SIMPLE-CADGIS-Titik-${ts}.kmz`, "application/vnd.google-earth.kmz");
        } else if (format === "xlsx") {
          await excelZip({ points: pilih }, `SIMPLE-CADGIS-Titik-${ts}.xlsx`);
        } else {
          unduhBlob(
            shapefileZip({ nama: `SIMPLE-CADGIS-Titik-${ts}`, points: pilih.map((p) => ({ p, attrs: p.attrs })) }),
            `SIMPLE-CADGIS-Titik-${ts}.zip`
          );
        }
        toast.success(`${pilih.length.toLocaleString("id-ID")} titik diekspor ke ${format.toUpperCase()}`);
        return;
      }

      if (target === "bentuk") {
        if (bentuk.length === 0) {
          toast.error("Tidak ada poligon/garis untuk diekspor");
          return;
        }
        if (format === "kmz") {
          const kml = bangunKML({ shapes: bentuk, namaDokumen: "Ekspor Poligon SIMPLE CADGIS", labelMode: useGis.getState().labelMode });
          unduhBlob(kmlKeKmz(kml, "bentuk"), `SIMPLE-CADGIS-Poligon-${ts}.kmz`, "application/vnd.google-earth.kmz");
        } else if (format === "xlsx") {
          await excelZip({ shapes: bentuk }, `SIMPLE-CADGIS-Poligon-${ts}.xlsx`);
        } else {
          unduhBlob(
            shapefileZip({ nama: `SIMPLE-CADGIS-Poligon-${ts}`, shapes: bentuk.map((s) => ({ s, attrs: s.attrs })) }),
            `SIMPLE-CADGIS-Poligon-${ts}.zip`
          );
        }
        toast.success(`${bentuk.length.toLocaleString("id-ID")} poligon/garis diekspor ke ${format.toUpperCase()}`);
        return;
      }

      // target tabel: seluruh data sesuai filter aktif (seperti export atribut tabel ArcGIS)
      if (format === "xlsx") {
        // gabungkan SEMUA kolom atribut dari SEMUA baris (urut kemunculan pertama) — sama seperti tampilan tabel
        const kolom: string[] = [];
        const terlihat = new Set<string>();
        for (const p of pilih) for (const k of Object.keys(p.attrs)) if (!terlihat.has(k)) { terlihat.add(k); kolom.push(k); }
        for (const s of bentuk) for (const k of Object.keys(s.attrs)) if (!terlihat.has(k)) { terlihat.add(k); kolom.push(k); }
        const header = ["Jenis", "Judul", "Keterangan", "Koordinat", "Ketinggian", ...kolom];
        const baris: (string | number)[][] = [
          ...pilih.map((p) => ["Titik", p.title, p.description, `${p.lat}, ${p.lng}`, p.elevation ?? "", ...kolom.map((k) => p.attrs[k] ?? "")] as (string | number)[]),
          ...bentuk.map((s) => ["Garis/Poligon", s.title, s.description, `${s.vertices.length} titik`, "", ...kolom.map((k) => s.attrs[k] ?? "")] as (string | number)[]),
        ];
        await excelTabel(header, baris, `SIMPLE-CADGIS-Tabel-${ts}.xlsx`, "Atribut");
        toast.success("Tabel diekspor ke Excel");
      } else if (format === "kmz") {
        const kml = bangunKML({ points: pilih, shapes: bentuk, contours, namaDokumen: "Ekspor Tabel SIMPLE CADGIS", labelMode: useGis.getState().labelMode });
        if (format === "kmz" && kmlString(kml).length === 0) throw new Error("Kosong");
        unduhBlob(kmlKeKmz(kml, "tabel"), `SIMPLE-CADGIS-Tabel-${ts}.kmz`, "application/vnd.google-earth.kmz");
        toast.success("Tabel diekspor ke KMZ");
      } else {
        if (pilih.length > 0) {
          unduhBlob(
            shapefileZip({ nama: `SIMPLE-CADGIS-Tabel-Titik-${ts}`, points: pilih.map((p) => ({ p, attrs: p.attrs })) }),
            `SIMPLE-CADGIS-Tabel-Titik-${ts}.zip`
          );
          toast.success("Tabel (titik) diekspor ke SHP");
        } else if (bentuk.length > 0) {
          unduhBlob(
            shapefileZip({ nama: `SIMPLE-CADGIS-Tabel-Bentuk-${ts}`, shapes: bentuk.map((s) => ({ s, attrs: s.attrs })) }),
            `SIMPLE-CADGIS-Tabel-Bentuk-${ts}.zip`
          );
          toast.success("Tabel (poligon/garis) diekspor ke SHP");
        } else {
          toast.error("Tidak ada data untuk diekspor");
          return;
        }
      }
    } catch (e) {
      toast.error("Ekspor gagal", { description: e instanceof Error ? e.message : String(e) });
    }
  };

  const nPilih = selection.length;

  return (
    <Dialog open onOpenChange={(v) => !v && tutup()}>
      <DialogContent className="rounded-2xl sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Download className="h-5 w-5 text-primary" />
            Ekspor Data
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Ekspor apa</Label>
            <div className="grid grid-cols-3 gap-2">
              {(
                [
                  { k: "titik", label: "Titik", n: points.length },
                  { k: "bentuk", label: "Polygon/Garis", n: shapes.length },
                  { k: "tabel", label: "Tabel Atribut", n: points.length + shapes.length },
                ] as { k: Target; label: string; n: number }[]
              ).map((t) => (
                <button
                  key={t.k}
                  onClick={() => setTarget(t.k)}
                  aria-pressed={target === t.k}
                  className={`rounded-xl border px-2 py-2.5 text-xs font-medium text-center transition-colors ${
                    target === t.k ? "bg-blue-600 text-white border-blue-600" : "bg-white border-slate-200 hover:bg-slate-50"
                  }`}
                >
                  {t.label}
                  <span className={`block text-[10px] mt-0.5 ${target === t.k ? "text-blue-100" : "text-slate-400"}`}>
                    {t.n.toLocaleString("id-ID")} item
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Cakupan</Label>
            <div className="flex gap-4 text-sm">
              <label className="flex items-center gap-1.5">
                <input type="radio" checked={scope === "semua"} onChange={() => setScope("semua")} />
                Semua
              </label>
              <label className="flex items-center gap-1.5">
                <input type="radio" checked={scope === "pilihan"} onChange={() => setScope("pilihan")} disabled={nPilih === 0} />
                Terpilih ({nPilih})
              </label>
            </div>
            {tableFilter && (
              <p className="text-xs text-emerald-700 bg-emerald-50 rounded-lg px-2 py-1 inline-block">
                Filter poligon aktif — hanya titik di dalam poligon yang diekspor
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label>Format keluaran</Label>
            <div className="grid grid-cols-3 gap-2">
              <Button variant="outline" className="rounded-xl h-auto py-3 flex-col gap-1" onClick={() => ekspor("kmz")}>
                <FileArchive className="h-5 w-5 text-amber-600" />
                <span className="text-xs font-medium">KMZ</span>
              </Button>
              <Button variant="outline" className="rounded-xl h-auto py-3 flex-col gap-1" onClick={() => ekspor("xlsx")}>
                <FileSpreadsheet className="h-5 w-5 text-emerald-600" />
                <span className="text-xs font-medium">Excel</span>
              </Button>
              <Button variant="outline" className="rounded-xl h-auto py-3 flex-col gap-1" onClick={() => ekspor("shp")}>
                <Map className="h-5 w-5 text-blue-600" />
                <span className="text-xs font-medium">SHP (zip)</span>
              </Button>
              <Button variant="outline" className="rounded-xl h-auto py-3 flex-col gap-1" onClick={() => ekspor("gpx")} title="GPS Exchange Format — untuk GPS handheld, Garmin, Basecamp, QGIS">
                <FileDigit className="h-5 w-5 text-violet-600" />
                <span className="text-xs font-medium">GPX</span>
              </Button>
              <Button variant="outline" className="rounded-xl h-auto py-3 flex-col gap-1" onClick={() => ekspor("dxf")} title="Drawing Exchange Format — untuk AutoCAD/BricsCAD/QGIS (derajat WGS84)">
                <Box className="h-5 w-5 text-sky-600" />
                <span className="text-xs font-medium">DXF</span>
              </Button>
            </div>
            <p className="text-[10px] text-slate-400">
              GPX & DXF menggabungkan titik + poligon/garis + teks sesuai cakupan. DWG tidak tersedia untuk ekspor — pakai DXF (AutoCAD bisa membukanya langsung).
            </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
