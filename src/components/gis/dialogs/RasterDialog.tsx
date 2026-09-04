"use client";

/**
 * Dialog Impor Raster Georeferensi (GeoTIFF / ECW / gambar+world file).
 * - GeoTIFF (.tif/.tiff) hingga 1 TB: dibaca bertahap di Web Worker
 *   → pratinjau overlay di peta pada koordinat yang benar, UI tidak pernah beku.
 * - Gambar biasa (PNG/JPG — termasuk yang di-rename .tif) + world file
 *   (.tfw/.jgw/.pgw): zona UTM/TM-3 dipilih pemakai (world file tidak menyimpan
 *   CRS); koordinat derajat terdeteksi otomatis.
 * - DEM 1 band otomatis terdeteksi → bisa dipakai sumber elevasi LOKAL di menu Elevasi DEM.
 * - ECW: tidak ada dekoder browser (lisensi proprietary) → tampilkan panduan konversi via QGIS/GDAL.
 * - Layer raster hanya tersimpan selama aplikasi terbuka (gambar terlalu besar untuk localStorage).
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { useGis } from "@/lib/gis/store";
import { batalPiramidaRaster, bukaRaster, padaPiramida } from "@/lib/gis/raster";
import { idPiramidaDariTanda } from "@/lib/gis/piramida-db";
import { uid } from "@/lib/gis/geo";
import type { RasterLayer } from "@/lib/gis/types";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  Image as ImageIcon,
  LoaderCircle,
  Info,
  XCircle,
  Upload,
  Trash2,
  Eye,
  EyeOff,
  TriangleAlert,
  Download,
  Layers,
  LocateFixed,
  MapPin,
} from "lucide-react";
import proj4 from "proj4";
import {
  ZONA_TM3,
  ZONA_UTM_INDONESIA,
  defZona,
  parseWorldFile,
  tebakZonaAwal,
  simpanZonaTerakhir,
} from "@/lib/gis/worldfile";

const UKURAN_MAKS = 1024 * 1024 * 1024 * 1024; // 1 TB

/** Pilihan anggaran ukuran piramida (konverter otomatis). */
const KUALITAS_PIRAMIDA = [
  { v: 0, label: "Nonaktif — pratinjau saja" },
  { v: 50, label: "Ringan — ±50 MB" },
  { v: 100, label: "Seimbang — ±100 MB (disarankan)" },
  { v: 200, label: "Maksimal — ±200 MB" },
] as const;

export default function RasterDialog() {
  const open = useGis((s) => s.dialogs.raster);
  const setDialog = useGis((s) => s.setDialog);
  const view = useGis((s) => s.view);
  const setView = useGis((s) => s.setView);
  const rasters = useGis((s) => s.rasters);
  const tambahRaster = useGis((s) => s.tambahRaster);
  const hapusRaster = useGis((s) => s.hapusRaster);
  const setRasterTerlihat = useGis((s) => s.setRasterTerlihat);
  const setRasterOpasitas = useGis((s) => s.setRasterOpasitas);

  const inputRef = useRef<HTMLInputElement>(null);
  const sinyalBatal = useRef({ dibatalkan: false });
  const [jalan, setJalan] = useState(false);
  const [progres, setProgres] = useState({ persen: 0, tahap: "" });
  const [drag, setDrag] = useState(false);
  const [piramidaMb, setPiramidaMb] = useState(100);
  // gambar + world file menunggu pilihan zona (world file tidak menyimpan CRS)
  const [tunda, setTunda] = useState<{ file: File; namaWorld: string; teks: string; lebarPx: number; tinggiPx: number } | null>(null);
  const [zonaDipilih, setZonaDipilih] = useState("utm-48s");
  // pasangan boleh dipilih satu per satu: gambar sudah ada menunggu world file,
  // atau world file sudah ada menunggu gambar
  const [tundaGambar, setTundaGambar] = useState<File | null>(null);
  const [tundaWorld, setTundaWorld] = useState<{ file: File; teks: string } | null>(null);

  // langganan progres piramida (dikirim worker SETELAH impor sukses)
  const setPiramidaRaster = useGis((s) => s.setPiramidaRaster);
  useEffect(() => {
    const berhenti = padaPiramida((m) => {
      setPiramidaRaster(m.id, {
        piramidaProgres: m.persen,
        piramidaTahap: m.tahap,
        ...(m.selesai === true
          ? { piramidaSiap: !m.gagal, piramidaGagal: !!m.gagal, piramidaUkuranMb: m.ukuranMb, piramidaLevelPx: m.levelMaksPx }
          : {}),
      });
    });
    return berhenti;
  }, [setPiramidaRaster]);

  /** Pratinjau lokasi (lat/lng WGS84) untuk zona yang sedang dipilih — bantu
   *  pemakai memastikan zona UTM/TM-3 benar sebelum impor (zona salah = posisi
   *  raster di peta salah). */
  const pratinjauLokasi = useMemo(() => {
    if (!tunda) return "";
    try {
      const data = parseWorldFile(tunda.teks);
      if (!data) return "";
      const cx = data.c + data.a * (tunda.lebarPx / 2) + data.d * (tunda.tinggiPx / 2);
      const cy = data.f + data.b * (tunda.lebarPx / 2) + data.e * (tunda.tinggiPx / 2);
      const { def } = defZona(zonaDipilih);
      const hasil = def ? proj4(def, "EPSG:4326", [cx, cy]) : [cx, cy];
      const lng = hasil[0];
      const lat = hasil[1];
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return "";
      const fmt = (v: number, pos: string, neg: string) =>
        `${Math.abs(v).toFixed(5).replace(".", ",")}°${v >= 0 ? pos : neg}`;
      return `${fmt(lat, "LU", "LS")} • ${fmt(lng, "BT", "BB")}`;
    } catch {
      return "";
    }
  }, [tunda, zonaDipilih]);

  const terbuka = useRef(false);
  useEffect(() => {
    if (open && !terbuka.current) {
      sinyalBatal.current = { dibatalkan: false };
      setJalan(false);
      setProgres({ persen: 0, tahap: "" });
      setTunda(null);
      setTundaGambar(null);
      setTundaWorld(null);
    }
    terbuka.current = open;
  }, [open]);

  if (!open) return null;

  const tutup = () => {
    if (jalan) sinyalBatal.current.dibatalkan = true;
    setDialog("raster", false);
  };

  const proses = async (file: File, world?: { teks: string; zona: string }) => {
    const nama = file.name.toLowerCase();
    if (nama.endsWith(".ecw")) {
      toast.error("Format ECW tidak didukung browser", {
        description:
          "Tidak ada dekoder ECW untuk aplikasi web (lisensi proprietary). Gunakan tombol “Skrip ECW Bridge” di dialog ini untuk konversi otomatis via QGIS.",
        duration: 12000,
      });
      return;
    }
    if (!world && !nama.endsWith(".tif") && !nama.endsWith(".tiff")) {
      toast.error("Format tidak dikenali", {
        description: "Gunakan GeoTIFF (.tif / .tiff) atau gambar (PNG/JPG) + world file (.tfw/.jgw). File ECW dikonversi dulu ke GeoTIFF via QGIS/GDAL.",
      });
      return;
    }
    if (file.size > UKURAN_MAKS) {
      const mb = file.size / 1048576;
      const ukuran = mb >= 1024 ? `${(mb / 1024).toFixed(1)} GB` : `${mb.toFixed(0)} MB`;
      toast.error("File terlalu besar", {
        description: `Ukuran ${ukuran} melebihi batas 1 TB. Kompres/potong dulu via QGIS (kompresi JPEG atau Deflate).`,
      });
      return;
    }
    setJalan(true);
    setProgres({ persen: 0, tahap: "Memulai…" });
    sinyalBatal.current = { dibatalkan: false };
    // id layer DIBUAT DI AWAL & dipakai sebagai kunci worker — agar fitur
    // "Elevasi dari DEM lokal" menemukan raster yang sudah dibuka worker
    const idLayer = uid("raster");
    try {
      const { info, blob } = await bukaRaster(file, {
        kunci: idLayer,
        onProgres: setProgres,
        sinyalBatal: sinyalBatal.current,
        piramidaMb: world ? 0 : piramidaMb, // gambar+world file tidak lewat konverter piramida (bukan GeoTIFF)
        world,
      });
      const layer: RasterLayer = {
        id: idLayer,
        nama: file.name,
        terlihat: true,
        opasitas: 1,
        gambarUrl: URL.createObjectURL(blob),
        barat: info.barat,
        timur: info.timur,
        selatan: info.selatan,
        utara: info.utara,
        lebarPx: info.lebarPx,
        tinggiPx: info.tinggiPx,
        sumberCrs: info.sumberCrs,
        dem: info.dem,
        resolusiLabel: info.resolusiLabel,
        ukuranFileMb: info.ukuranFileMb,
        dibuat: Date.now(),
        piramidaId:
          !world && piramidaMb > 0 && !info.dem && info.lebarPx > 4096
            ? idPiramidaDariTanda(`${file.name}|${file.size}|${file.lastModified}`)
            : undefined,
      };
      tambahRaster(layer);
      // zoom ke cakupan raster supaya hasil impor langsung terlihat —
      // tanpa ini raster "hilang" di lokasi yang jauh dari pandangan peta
      zoomKeRaster(layer, true);
      toast.success(
        `Raster diimpor: ${file.name} (${info.lebarPx.toLocaleString("id-ID")}×${info.tinggiPx.toLocaleString("id-ID")} px)`,
        {
          description: info.dem
            ? `${info.sumberCrs} • ${info.resolusiLabel} • DEM 1 band — bisa dipakai menu Elevasi DEM → "Dari File Lokal"`
            : layer.piramidaId
              ? `${info.sumberCrs} • ${info.resolusiLabel} • konversi otomatis berjalan — detail tajam menyusul`
              : `${info.sumberCrs} • ${info.resolusiLabel}`,
        }
      );
    } catch (err) {
      const pesan = err instanceof Error ? err.message : "Gagal membaca raster.";
      if (sinyalBatal.current.dibatalkan || pesan.includes("Dibatalkan") || pesan.includes("dibatalkan")) {
        toast.warning("Impor raster dibatalkan");
      } else {
        toast.error("Gagal mengimpor raster", { description: pesan, duration: 12000 });
      }
    } finally {
      setJalan(false);
    }
  };

  /** Pasangkan gambar + world file: sniff isi gambar (PNG/JPG/TIFF), validasi
   *  world file, lalu impor langsung (derajat) atau tampilkan pilihan zona. */
  const pasangkan = async (gambar: File, world: File) => {
    // sniff isi file — .tif bisa saja PNG/JPG yang di-rename
    let tanda: Uint8Array;
    try {
      tanda = new Uint8Array(await gambar.slice(0, 8).arrayBuffer());
    } catch {
      tanda = new Uint8Array(0);
    }
    const png = tanda[0] === 0x89 && tanda[1] === 0x50;
    const jpg = tanda[0] === 0xff && tanda[1] === 0xd8;
    const nama = gambar.name.toLowerCase();
    if (!png && !jpg) {
      // GeoTIFF asli — georeferensi tertanam lebih utama, world file diabaikan
      setTundaGambar(null);
      setTundaWorld(null);
      if (!nama.endsWith(".tif") && !nama.endsWith(".tiff")) {
        toast.error("Format tidak dikenali", {
          description: "Gunakan GeoTIFF (.tif / .tiff) atau gambar (PNG/JPG) + world file (.tfw/.jgw). File ECW dikonversi dulu ke GeoTIFF via QGIS/GDAL.",
        });
        return;
      }
      void proses(gambar);
      return;
    }
    const teks = await world.text();
    const data = parseWorldFile(teks);
    if (!data) {
      toast.error("World file tidak valid", {
        description: "Isi world file harus 6 angka (A D B E C F, dipisah baris baru).",
      });
      return;
    }
    let lebarPx = 0;
    let tinggiPx = 0;
    try {
      const bmp = await createImageBitmap(gambar);
      lebarPx = bmp.width;
      tinggiPx = bmp.height;
      bmp.close();
    } catch {
      toast.error("Gambar tidak dapat dibaca browser", {
        description: "Format PNG/JPEG-nya mungkin tidak standar (mis. CMYK). Konversi dulu via QGIS ke GeoTIFF.",
      });
      return;
    }
    setTundaGambar(null);
    setTundaWorld(null);
    const zona = tebakZonaAwal(data);
    if (zona === "geo") {
      // koordinat derajat — tak perlu zona, langsung impor
      void proses(gambar, { teks, zona });
      return;
    }
    setZonaDipilih(zona);
    setTunda({ file: gambar, namaWorld: world.name, teks, lebarPx, tinggiPx });
  };

  /** Pilih file: dukung (1) GeoTIFF, (2) gambar PNG/JPG + world file — boleh
   *  dipilih SEKALIGUS atau BERGANTIAN (gambar dulu baru world file, atau
   *  sebaliknya), termasuk gambar yang di-rename .tif (terdeteksi dari isi). */
  const pilihFile = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const daftar = Array.from(files);
    const world = daftar.find((f) => /\.(tfw|tifw|jgw|pgw|gfw|jpw|wld)$/i.test(f.name)) ?? tundaWorld?.file;
    const gambar = daftar.find((f) => /\.(tif|tiff|png|jpe?g)$/i.test(f.name)) ?? tundaGambar ?? undefined;
    if (gambar && world) {
      await pasangkan(gambar, world);
      return;
    }
    if (world && !gambar) {
      // hanya world file — simpan, tunggu gambar pendampingnya
      const teks = await world.text();
      if (!parseWorldFile(teks)) {
        toast.error("World file tidak valid", {
          description: "Isi world file harus 6 angka (A D B E C F, dipisah baris baru).",
        });
        return;
      }
      setTundaWorld({ file: world, teks });
      return;
    }
    if (gambar && !world) {
      // hanya gambar — GeoTIFF asli langsung jalan; PNG/JPG ditahan menunggu
      // world file (panel di dialog memandu memilihnya, tak perlu ulang dari awal)
      let tanda: Uint8Array;
      try {
        tanda = new Uint8Array(await gambar.slice(0, 4).arrayBuffer());
      } catch {
        tanda = new Uint8Array(0);
      }
      const tiff = (tanda[0] === 0x49 && tanda[1] === 0x49) || (tanda[0] === 0x4d && tanda[1] === 0x4d);
      const pngJpg = (tanda[0] === 0x89 && tanda[1] === 0x50) || (tanda[0] === 0xff && tanda[1] === 0xd8);
      if (tiff) {
        setTundaWorld(null);
        void proses(gambar);
        return;
      }
      if (pngJpg) {
        setTundaGambar(gambar);
        return;
      }
      const nama = gambar.name.toLowerCase();
      if (nama.endsWith(".tif") || nama.endsWith(".tiff")) {
        // .tif dgn isi aneh → serahkan ke worker: pesannya kaya (JP2/ZIP/PDF/teks, dll.)
        void proses(gambar);
        return;
      }
      toast.error("Format tidak dikenali", {
        description: "Gunakan GeoTIFF (.tif / .tiff) atau gambar (PNG/JPG) + world file (.tfw/.jgw). File ECW dikonversi dulu ke GeoTIFF via QGIS/GDAL.",
      });
      return;
    }
    toast.error("Format tidak dikenali", {
      description: "Gunakan GeoTIFF (.tif/.tiff) atau gambar (PNG/JPG) + world file (.tfw/.jgw). File ECW dikonversi dulu ke GeoTIFF via QGIS/GDAL.",
    });
  };

  /** Lanjutkan impor gambar+world file setelah zona dipilih. */
  const imporTunda = () => {
    if (!tunda) return;
    const { file, teks } = tunda;
    const zona = zonaDipilih;
    simpanZonaTerakhir(zona);
    setTunda(null);
    void proses(file, { teks, zona });
  };

  /** Zoom peta ke cakupan raster + kotak kedip — supaya lokasi raster langsung ketemu. */
  const zoomKeRaster = (r: RasterLayer, otomatis = false) => {
    if (view !== "map") setView("map"); // pastikan peta yang tampil (bukan layout)
    window.dispatchEvent(
      new CustomEvent("geokita-zoom-raster", {
        detail: { batas: [[r.selatan, r.barat], [r.utara, r.timur]] as [number, number][] },
      })
    );
    if (!otomatis) toast.success(`Zoom ke raster: ${r.nama}`);
  };

  return (
    <Dialog open onOpenChange={(v) => !v && tutup()}>
      <DialogContent className="rounded-2xl sm:max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ImageIcon className="h-5 w-5 text-primary" />
            Impor Raster Georeferensi
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3 text-sm">
          {/* area pilih/drop file */}
          {!jalan && (
            <div
              className={`rounded-xl border-2 border-dashed px-4 py-6 text-center transition-colors ${
                drag ? "border-blue-500 bg-blue-50" : "border-slate-300 hover:bg-slate-50"
              }`}
              onDragOver={(e) => {
                e.preventDefault();
                setDrag(true);
              }}
              onDragLeave={() => setDrag(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDrag(false);
                pilihFile(e.dataTransfer.files);
              }}
            >
              <Upload className="mx-auto h-7 w-7 text-slate-400" />
              <p className="mt-2 text-slate-600">
                Tarik-lepas file ke sini, atau
                <button className="ml-1 font-semibold text-blue-700 underline" onClick={() => inputRef.current?.click()}>
                  pilih file
                </button>
              </p>
              <p className="mt-1 text-xs text-slate-400">
                GeoTIFF (.tif/.tiff) — maksimal 1 TB • orthophoto/citra &amp; DEM
                <br />
                atau gambar (PNG/JPG) + world file (.tfw/.jgw/.pgw) — pilih keduanya sekaligus, atau satu per satu
                <br />
                CRS: WGS84, UTM WGS84, <b>SRGI2013 (9470 &amp; UTM)</b>, Web Mercator, <b>Indonesia TM-3 DGN95</b>, 9377
              </p>
              {/* kualitas konversi otomatis (piramida) */}
              <div className="mt-3 flex items-center gap-2 rounded-lg bg-slate-50 border border-slate-200 px-2.5 py-2 text-left">
                <Layers className="h-4 w-4 shrink-0 text-slate-400" />
                <div className="min-w-0 flex-1">
                  <label className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 block">
                    Konverter otomatis (piramida detail)
                  </label>
                  <select
                    value={piramidaMb}
                    onChange={(e) => setPiramidaMb(Number(e.target.value))}
                    className="mt-0.5 w-full rounded-md border border-slate-200 bg-white px-2 py-1 text-xs"
                  >
                    {KUALITAS_PIRAMIDA.map((k) => (
                      <option key={k.v} value={k.v}>
                        {k.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <input
                ref={inputRef}
                type="file"
                accept=".tif,.tiff,.ecw,.png,.jpg,.jpeg,.tfw,.tifw,.jgw,.pgw,.gfw,.jpw,.wld"
                multiple
                className="hidden"
                onChange={(e) => {
                  pilihFile(e.target.files);
                  e.target.value = "";
                }}
              />
            </div>
          )}

          {/* gambar sudah dipilih — menunggu world file (boleh dipilih terpisah) */}
          {tundaGambar && !tunda && !jalan && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 space-y-2">
              <p className="flex items-center gap-1.5 text-xs font-semibold text-amber-900">
                <MapPin className="h-4 w-4" /> Gambar siap — world file belum ada
              </p>
              <p className="text-[11px] text-amber-800">
                <b>{tundaGambar.name}</b> berisi gambar (PNG/JPG), bukan GeoTIFF berkoordinat. Pilih world file
                pendampingnya (.tfw/.jgw/.pgw — biasanya namanya sama dengan gambarnya) supaya bisa diletakkan di peta.
              </p>
              <div className="flex gap-2 justify-end">
                <Button variant="outline" className="rounded-xl h-8" onClick={() => setTundaGambar(null)}>
                  Batal
                </Button>
                <Button className="rounded-xl h-8" onClick={() => inputRef.current?.click()}>
                  Pilih world file…
                </Button>
              </div>
            </div>
          )}

          {/* world file sudah dipilih — menunggu gambar pendampingnya */}
          {tundaWorld && !tunda && !jalan && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 space-y-2">
              <p className="flex items-center gap-1.5 text-xs font-semibold text-amber-900">
                <MapPin className="h-4 w-4" /> World file siap — gambarnya belum ada
              </p>
              <p className="text-[11px] text-amber-800">
                <b>{tundaWorld.file.name}</b> hanya berisi koordinat. Sekarang pilih gambar pendampingnya
                (.tif/.png/.jpg — biasanya namanya sama), keduanya otomatis dipasangkan.
              </p>
              <div className="flex gap-2 justify-end">
                <Button variant="outline" className="rounded-xl h-8" onClick={() => setTundaWorld(null)}>
                  Batal
                </Button>
                <Button className="rounded-xl h-8" onClick={() => inputRef.current?.click()}>
                  Pilih gambar…
                </Button>
              </div>
            </div>
          )}

          {/* pilihan zona utk gambar + world file (world file tidak menyimpan CRS) */}
          {tunda && !jalan && (
            <div className="rounded-xl border border-sky-200 bg-sky-50 px-3 py-2.5 space-y-2">
              <p className="flex items-center gap-1.5 text-xs font-semibold text-sky-900">
                <MapPin className="h-4 w-4" /> Gambar + world file terdeteksi
              </p>
              <p className="text-[11px] text-sky-800">
                {tunda.file.name} • {tunda.lebarPx.toLocaleString("id-ID")}×{tunda.tinggiPx.toLocaleString("id-ID")} px •
                bersama {tunda.namaWorld}
              </p>
              <label className="block text-[11px] font-semibold uppercase tracking-wide text-sky-700">
                Pilih zona koordinatnya (world file tidak menyimpan zona)
              </label>
              <select
                value={zonaDipilih}
                onChange={(e) => setZonaDipilih(e.target.value)}
                className="w-full rounded-md border border-sky-200 bg-white px-2 py-1.5 text-xs"
              >
                <optgroup label="UTM Zona Selatan (WGS84)">
                  {ZONA_UTM_INDONESIA.map((z) => (
                    <option key={`s${z}`} value={`utm-${z}s`}>
                      UTM Zona {z}S
                    </option>
                  ))}
                </optgroup>
                <optgroup label="UTM Zona Utara (WGS84)">
                  {ZONA_UTM_INDONESIA.map((z) => (
                    <option key={`n${z}`} value={`utm-${z}n`}>
                      UTM Zona {z}N
                    </option>
                  ))}
                </optgroup>
                <optgroup label="Indonesia TM-3 (DGN95)">
                  {ZONA_TM3.map((z) => (
                    <option key={z} value={`tm3-${z}`}>
                      TM-3 zona {z}
                    </option>
                  ))}
                </optgroup>
              </select>
              {pratinjauLokasi && (
                <p className="text-[11px] text-sky-800">
                  Lokasi kira-kira: <b className="tabular-nums">{pratinjauLokasi}</b> — pastikan sesuai wilayah
                  proyekmu (zona salah = posisi di peta salah).
                </p>
              )}
              <div className="flex gap-2 justify-end">
                <Button variant="outline" className="rounded-xl h-8" onClick={() => setTunda(null)}>
                  Batal
                </Button>
                <Button className="rounded-xl h-8" onClick={imporTunda}>
                  Impor gambar
                </Button>
              </div>
            </div>
          )}

          {/* progres */}
          {jalan && (
            <div className="space-y-1.5">
              <div className="h-2.5 w-full rounded-full bg-slate-100 overflow-hidden">
                <div className="h-full rounded-full bg-blue-600 transition-all" style={{ width: `${progres.persen}%` }} />
              </div>
              <p className="text-xs text-slate-500 flex items-center gap-1.5">
                <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
                {progres.tahap || "Memproses…"} ({progres.persen}%)
              </p>
              <p className="text-[11px] text-slate-400">
                Berjalan di latar belakang (Web Worker) — aplikasi tetap bisa dipakai.
              </p>
            </div>
          )}

          {/* peringatan ECW + jembatan konversi */}
          <div className="rounded-xl bg-amber-50 text-amber-900 text-xs px-3 py-2.5 space-y-2">
            <p className="flex items-start gap-2">
              <TriangleAlert className="h-4 w-4 shrink-0 mt-0.5" />
              <span>
                <b>ECW:</b> format proprietary — tidak ada dekoder untuk browser, jadi file .ecw tidak bisa
                dibuka langsung. Jalan resmi &amp; legal: konversi sekali lewat <b>QGIS (gratis)</b> memakai
                skrip otomatis di bawah ini — hasilnya .tif yang langsung terbaca di sini.
              </span>
            </p>
            <a
              href="ecw-bridge-qgis.py"
              download="ECW-Bridge-SIMPLE-CADGIS.py"
              className="inline-flex items-center gap-1.5 rounded-lg bg-amber-600 px-3 py-1.5 font-semibold text-white hover:bg-amber-700"
            >
              <Download className="h-3.5 w-3.5" />
              Skrip ECW Bridge (.py)
            </a>
            <ol className="list-decimal ml-4 space-y-0.5 text-amber-800">
              <li>Buka QGIS → menu <b>Plugins → Python Console</b></li>
              <li>Klik <b>Show Editor</b> → <b>Open Script</b> → pilih file ini → <b>Run</b></li>
              <li>Pilih file .ecw (bisa banyak sekaligus) → pilih folder hasil → selesai</li>
              <li>Impor hasil .tif ke dialog ini</li>
            </ol>
          </div>

          {/* daftar raster terimpor */}
          {rasters.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Raster terimpor ({rasters.length})
              </p>
              {rasters.map((r) => (
                <div key={r.id} className="rounded-xl border border-slate-200 px-3 py-2.5 space-y-2">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setRasterTerlihat(r.id, !r.terlihat)}
                      title={r.terlihat ? "Sembunyikan" : "Tampilkan"}
                      className="h-8 w-8 shrink-0 rounded-lg flex items-center justify-center text-slate-500 hover:bg-slate-100"
                    >
                      {r.terlihat ? <Eye className="h-4 w-4 text-blue-700" /> : <EyeOff className="h-4 w-4" />}
                    </button>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-slate-800">{r.nama}</p>
                      <p className="text-[11px] text-slate-500">
                        {r.lebarPx.toLocaleString("id-ID")}×{r.tinggiPx.toLocaleString("id-ID")} px • {r.sumberCrs} •{" "}
                        {r.resolusiLabel}
                        {r.dem && " • DEM 1 band"}
                      </p>
                    </div>
                    <button
                      onClick={() => zoomKeRaster(r)}
                      title="Zoom ke raster — tampilkan lokasinya di peta"
                      className="h-8 w-8 shrink-0 rounded-lg flex items-center justify-center text-sky-600 hover:bg-sky-50"
                    >
                      <LocateFixed className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => {
                        hapusRaster(r.id);
                        toast.success("Raster dihapus dari peta");
                      }}
                      title="Hapus raster"
                      className="h-8 w-8 shrink-0 rounded-lg flex items-center justify-center text-red-500 hover:bg-red-50"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] text-slate-500 shrink-0">Opasitas</span>
                    <input
                      type="range"
                      min={0.1}
                      max={1}
                      step={0.05}
                      value={r.opasitas}
                      onChange={(e) => setRasterOpasitas(r.id, parseFloat(e.target.value))}
                      className="flex-1 accent-blue-600"
                    />
                    <span className="text-[11px] text-slate-500 tabular-nums w-9 text-right">
                      {Math.round(r.opasitas * 100)}%
                    </span>
                  </div>
                  {/* status konversi otomatis (piramida detail) */}
                  {r.piramidaId && !r.dem && (
                    r.piramidaSiap ? (
                      <p className="text-[11px] text-emerald-700 bg-emerald-50 rounded-lg px-2 py-1 flex items-start gap-1.5">
                        <Layers className="h-3 w-3 shrink-0 mt-0.5" />
                        <span>
                          Piramida detail siap
                          {r.piramidaUkuranMb
                            ? ` — ±${r.piramidaUkuranMb < 10 ? r.piramidaUkuranMb.toFixed(1) : Math.round(r.piramidaUkuranMb)} MB`
                            : ""}
                          {r.piramidaLevelPx
                            ? ` • tajam s/d ${r.piramidaLevelPx.toLocaleString("id-ID")} px`
                            : ""}
                          {" • "}import ulang file yang sama = instan (cache)
                        </span>
                      </p>
                    ) : r.piramidaGagal ? (
                      <p className="text-[11px] text-slate-500 bg-slate-50 rounded-lg px-2 py-1">
                        Konversi otomatis gagal — pratinjau tetap dipakai
                      </p>
                    ) : (
                      <div className="space-y-1">
                        <div className="h-1.5 w-full rounded-full bg-slate-100 overflow-hidden">
                          <div
                            className="h-full rounded-full bg-emerald-500 transition-all"
                            style={{ width: `${r.piramidaProgres ?? 0}%` }}
                          />
                        </div>
                        <p className="text-[11px] text-slate-500 flex items-center gap-1.5">
                          <LoaderCircle className="h-3 w-3 animate-spin shrink-0" />
                          <span className="min-w-0 truncate">
                            Konversi otomatis {r.piramidaProgres ?? 0}% — {r.piramidaTahap || "menyiapkan…"}
                          </span>
                          <button
                            onClick={() => batalPiramidaRaster(r.id)}
                            className="ml-auto shrink-0 text-red-500 hover:underline"
                          >
                            batalkan
                          </button>
                        </p>
                      </div>
                    )
                  )}
                </div>
              ))}
            </div>
          )}

          <p className="flex items-start gap-2 rounded-xl bg-blue-50 text-blue-900 text-xs px-3 py-2">
            <Info className="h-4 w-4 shrink-0 mt-0.5" />
            <span>
              Raster <b>DEM</b> (1 band) otomatis dikenali — buka menu <b>Elevasi DEM</b> lalu pilih sumber{" "}
              <b>&quot;Dari File Lokal&quot;</b> untuk mengisi elevasi tanpa internet. Setelah impor, peta otomatis
              mengarah ke lokasi raster; untuk mencarinya lagi kapan pun, klik tombol <b>&quot;Zoom ke raster&quot;</b> (ikon
              bidik) pada daftar di atas. <b>Konverter otomatis</b> membuat
              piramida detail (±50–200 MB) tersimpan lokal di browser: peta zoom tajam tanpa membaca ulang file asli,
              dan tahan tutup aplikasi — file sama diimpor ulang = langsung pakai cache. Gambar biasa
              (PNG/JPG, termasuk yang di-rename .tif) bisa diimpor bersama world file (.tfw/.jgw) — pilih
              keduanya sekaligus atau satu per satu — lalu pilih zona UTM/TM-3 saat diminta. Layer raster sendiri tersimpan
              selama aplikasi terbuka; Simpan/Muat proyek tidak menyertakan raster.
            </span>
          </p>
        </div>

        <div className="flex gap-2 justify-end">
          {jalan ? (
            <Button variant="outline" className="rounded-xl" onClick={() => (sinyalBatal.current.dibatalkan = true)}>
              <XCircle className="h-4 w-4" /> Batal
            </Button>
          ) : (
            <Button variant="outline" className="rounded-xl" onClick={tutup}>
              Tutup
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
