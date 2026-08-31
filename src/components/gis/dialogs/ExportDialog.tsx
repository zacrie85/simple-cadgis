"use client";

import { useState } from "react";
import { useGis } from "@/lib/gis/store";
import { bangunKML, kmlKeKmz, kmlString } from "@/lib/gis/kml";
import { shapefileZip } from "@/lib/gis/shapefile";
import { excelZip, excelTabel } from "@/lib/gis/excelExport";
import { unduhBlob, stempelWaktu } from "@/lib/gis/download";
import { titikDalamPoligon } from "@/lib/gis/geo";
import type { GisPoint, GisShape } from "@/lib/gis/types";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Download, FileArchive, FileSpreadsheet, Map } from "lucide-react";

type Target = "titik" | "bentuk" | "tabel";
type Format = "kmz" | "xlsx" | "shp";

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

      if (target === "titik") {
        if (pilih.length === 0) {
          toast.error("Tidak ada titik untuk diekspor");
          return;
        }
        if (format === "kmz") {
          const kml = bangunKML({ points: pilih, namaDokumen: "Ekspor Titik GeoKita" });
          unduhBlob(kmlKeKmz(kml, "titik"), `GeoKita-Titik-${ts}.kmz`, "application/vnd.google-earth.kmz");
        } else if (format === "xlsx") {
          await excelZip({ points: pilih }, `GeoKita-Titik-${ts}.xlsx`);
        } else {
          unduhBlob(
            shapefileZip({ nama: `GeoKita-Titik-${ts}`, points: pilih.map((p) => ({ p, attrs: p.attrs })) }),
            `GeoKita-Titik-${ts}.zip`
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
          const kml = bangunKML({ shapes: bentuk, namaDokumen: "Ekspor Poligon GeoKita" });
          unduhBlob(kmlKeKmz(kml, "bentuk"), `GeoKita-Poligon-${ts}.kmz`, "application/vnd.google-earth.kmz");
        } else if (format === "xlsx") {
          await excelZip({ shapes: bentuk }, `GeoKita-Poligon-${ts}.xlsx`);
        } else {
          unduhBlob(
            shapefileZip({ nama: `GeoKita-Poligon-${ts}`, shapes: bentuk.map((s) => ({ s, attrs: s.attrs })) }),
            `GeoKita-Poligon-${ts}.zip`
          );
        }
        toast.success(`${bentuk.length.toLocaleString("id-ID")} poligon/garis diekspor ke ${format.toUpperCase()}`);
        return;
      }

      // target tabel: seluruh data sesuai filter aktif (seperti export atribut tabel ArcGIS)
      if (format === "xlsx") {
        const header = ["Jenis", "Judul", "Keterangan", "Koordinat", "Ketinggian", ...Object.keys(pilih[0]?.attrs ?? bentuk[0]?.attrs ?? {})];
        const baris: (string | number)[][] = [
          ...pilih.map((p) => ["Titik", p.title, p.description, `${p.lat}, ${p.lng}`, p.elevation ?? "", ...Object.keys(header.slice(5)).map((k) => p.attrs[k] ?? "")] as (string | number)[]),
          ...bentuk.map((s) => ["Garis/Poligon", s.title, s.description, `${s.vertices.length} titik`, "", ...Object.keys(header.slice(5)).map((k) => s.attrs[k] ?? "")] as (string | number)[]),
        ];
        await excelTabel(header, baris, `GeoKita-Tabel-${ts}.xlsx`, "Atribut");
        toast.success("Tabel diekspor ke Excel");
      } else if (format === "kmz") {
        const kml = bangunKML({ points: pilih, shapes: bentuk, contours, namaDokumen: "Ekspor Tabel GeoKita" });
        if (format === "kmz" && kmlString(kml).length === 0) throw new Error("Kosong");
        unduhBlob(kmlKeKmz(kml, "tabel"), `GeoKita-Tabel-${ts}.kmz`, "application/vnd.google-earth.kmz");
        toast.success("Tabel diekspor ke KMZ");
      } else {
        if (pilih.length > 0) {
          unduhBlob(
            shapefileZip({ nama: `GeoKita-Tabel-Titik-${ts}`, points: pilih.map((p) => ({ p, attrs: p.attrs })) }),
            `GeoKita-Tabel-Titik-${ts}.zip`
          );
          toast.success("Tabel (titik) diekspor ke SHP");
        } else if (bentuk.length > 0) {
          unduhBlob(
            shapefileZip({ nama: `GeoKita-Tabel-Bentuk-${ts}`, shapes: bentuk.map((s) => ({ s, attrs: s.attrs })) }),
            `GeoKita-Tabel-Bentuk-${ts}.zip`
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
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
