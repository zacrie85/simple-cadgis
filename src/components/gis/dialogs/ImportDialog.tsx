"use client";

import { useCallback, useRef, useState } from "react";
import { useGis, namaLayerDariFile } from "@/lib/gis/store";
import { FloatingWindow } from "../Chips";
import { ParseStream } from "@/lib/gis/parse-client";
import { isiElevasiKosong } from "@/lib/gis/elevasi";
import { bersihkanDeskripsiHtml } from "@/lib/gis/htmlDesc";
import { parseKolomKoordinat, uid } from "@/lib/gis/geo";
import {
  parseGpx,
  parseDxf,
  dxfSudahDerajat,
  dxfKeFitur,
  buatKonversiUtm,
  type FiturGpxDxf,
  type DxfEntitas,
} from "@/lib/gis/gpxdxf";
import type { GisPoint, GisShape } from "@/lib/gis/types";
import { toast } from "sonner";
import { Upload, Loader2, CheckCircle2, FileSpreadsheet, Info } from "lucide-react";

type Fase = "pilih" | "proses" | "peta-kolom" | "selesai" | "crs-dxf" | "dwg";

interface ProgresInfo {
  bytes: number;
  total: number;
  rows?: number;
  features?: number;
}

export default function ImportDialog() {
  const open = useGis((s) => s.dialogs.import);
  const setDialog = useGis((s) => s.setDialog);
  const fitData = useGis((s) => s.fitData);

  const [fase, setFase] = useState<Fase>("pilih");
  const [namaFile, setNamaFile] = useState("");
  const [jenis, setJenis] = useState<"tabel" | "kml" | "gpx" | "dxf" | "dwg">("tabel");
  const [progres, setProgres] = useState<ProgresInfo>({ bytes: 0, total: 0 });
  const [pesanProses, setPesanProses] = useState("");
  // CRS DXF: sebagian besar file CAD memakai meter UTM (bukan derajat) — pilih zona sebelum impor
  const [utaZona, setUtaZona] = useState(49);
  const [utaHemi, setUtaHemi] = useState<"N" | "S">("S");
  const [dxfSampel, setDxfSampel] = useState("");
  const dxfEntitasRef = useRef<DxfEntitas[]>([]);
  const dxfNamaFileRef = useRef("");

  const semuaRowsRef = useRef<string[][]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [gunakanHeader, setGunakanHeader] = useState(true);
  const fiturRef = useRef<{ points: GisPoint[]; shapes: GisShape[] }>({ points: [], shapes: [] });
  const workerRef = useRef<ParseStream | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // pemetaan kolom
  const [modeKoordinat, setModeKoordinat] = useState<"gabungan" | "pisah">("gabungan");
  const [kolomGabung, setKolomGabung] = useState(0);
  const [kolomLat, setKolomLat] = useState(0);
  const [kolomLng, setKolomLng] = useState(1);
  const [kolomElev, setKolomElev] = useState(-1);
  const [kolomJudul, setKolomJudul] = useState(-1);
  // kolom elevasi & kapan DEM diambil: "sekarang" (otomatis setelah impor) / "nanti" (manual lewat menu Analisis)
  const [isiElevMode, setIsiElevMode] = useState<"sekarang" | "nanti">("sekarang");

  // Tebak apakah baris pertama berupa header (nama kolom) atau sudah data.
  const tebakGunakanHeader = (rows: string[][]): boolean => {
    const barisPertama = (rows[0] ?? []).map((v) => String(v ?? "").trim()).filter((v) => v !== "");
    if (barisPertama.length === 0) return true;
    const angka = barisPertama.filter((v) => !isNaN(parseFloat(v.replace(",", ".")))).length;
    return angka / barisPertama.length < 0.5;
  };

  // Deteksi nama kolom + kolom koordinat/elevasi/judul dari nama header DAN isi kolom.
  const jalankanDeteksi = (gunakan: boolean, rows: string[][]) => {
    const barisData = gunakan ? rows.slice(1) : rows;
    const nKolom = rows.reduce((m, r) => Math.max(m, r.length), 0);
    const barisPertama = rows[0] ?? [];
    const headersBaru = Array.from({ length: nKolom }, (_, i) =>
      gunakan ? String(barisPertama[i] ?? "").trim() || `Kolom ${i + 1}` : `Kolom ${i + 1}`
    );
    setHeaders(headersBaru);

    const sampel = barisData.slice(0, 50);
    const nonKosong = (ci: number) => sampel.map((r) => String(r[ci] ?? "").trim()).filter((v) => v !== "");
    const angkaDari = (v: string) => parseFloat(v.replace(",", "."));
    const semuaAngka = (list: string[]) => list.length > 0 && list.every((v) => !isNaN(angkaDari(v)));

    // — kolom koordinat gabungan: dari nama header, lalu dari isi kolom
    let idxGab = headersBaru.findIndex((h) => /coord|koordinat|lat.*lng|titik|point/i.test(h));
    if (idxGab < 0) {
      let terbaik = -1;
      let skorTerbaik = 0;
      for (let ci = 0; ci < nKolom; ci++) {
        const ne = nonKosong(ci);
        if (ne.length < 2) continue;
        const skor = ne.filter((v) => parseKolomKoordinat(v) !== null).length / ne.length;
        if (skor >= 0.6 && skor > skorTerbaik) {
          terbaik = ci;
          skorTerbaik = skor;
        }
      }
      idxGab = terbaik;
    }
    setKolomGabung(idxGab >= 0 ? idxGab : 0);

    // — kolom lat & lng terpisah: dari nama header, lalu dari rentang angka
    let idxLat = headersBaru.findIndex((h) => /^(lat|latitude|lintang|y)\b/i.test(h.trim()));
    let idxLng = headersBaru.findIndex((h) => /^(lng|lon|long|longitude|bujur|x)\b/i.test(h.trim()));
    if (idxLat < 0 && idxLng < 0) {
      const kolomAngka: { ci: number; maxAbs: number }[] = [];
      for (let ci = 0; ci < nKolom; ci++) {
        if (ci === idxGab) continue;
        const ne = nonKosong(ci);
        if (!semuaAngka(ne)) continue;
        kolomAngka.push({ ci, maxAbs: Math.max(...ne.map((v) => Math.abs(angkaDari(v)))) });
      }
      const calLat = kolomAngka.filter((c) => c.maxAbs <= 90);
      const calLng = kolomAngka.filter((c) => c.maxAbs > 90 && c.maxAbs <= 180);
      // hanya pakai bila ada pasangan yang masuk akal (ada kandidat lng > 90)
      if (calLat.length && calLng.length) {
        idxLat = calLat[0].ci;
        idxLng = calLng[0].ci;
      }
    }
    setKolomLat(idxLat >= 0 ? idxLat : 0);
    setKolomLng(idxLng >= 0 ? idxLng : Math.min(1, headersBaru.length - 1));
    // tidak ada kolom gabungan tapi lat & lng ketemu → pakai mode terpisah otomatis
    if (idxGab < 0 && idxLat >= 0 && idxLng >= 0) setModeKoordinat("pisah");

    // — kolom elevasi & judul
    const idxElev = headersBaru.findIndex((h) => /elev|ketinggian|mdpl|\bz\b|\brl\b/i.test(h.trim()));
    setKolomElev(idxElev);
    let idxJudul = headersBaru.findIndex((h) => /nama|judul|title|\bid\b|\bno\b|deskripsi|keterangan/i.test(h.trim()));
    if (idxJudul < 0) {
      for (let ci = 0; ci < nKolom; ci++) {
        if (ci === idxGab || ci === idxLat || ci === idxLng || ci === idxElev) continue;
        const ne = nonKosong(ci);
        if (ne.length >= 2 && ne.filter((v) => isNaN(angkaDari(v))).length / ne.length >= 0.6) {
          idxJudul = ci;
          break;
        }
      }
    }
    setKolomJudul(idxJudul >= 0 ? idxJudul : 0);
  };

  const tutup = useCallback(() => {
    workerRef.current?.hentikan();
    setDialog("import", false);
    setTimeout(() => {
      setFase("pilih");
      setProgres({ bytes: 0, total: 0 });
      setNamaFile("");
      semuaRowsRef.current = [];
      setHeaders([]);
      setGunakanHeader(true);
      setModeKoordinat("gabungan");
      fiturRef.current = { points: [], shapes: [] };
      setIsiElevMode("sekarang");
      dxfEntitasRef.current = [];
      setDxfSampel("");
    }, 200);
  }, [setDialog]);

  // ==================== GPX / DXF / DWG (Task 31) ====================

  /** Tambahkan fitur hasil parse GPX/DXF ke peta (layer baru + batch bertahap). */
  const tandaiFiturCad = (fitur: FiturGpxDxf, sumber: "gpx" | "dxf", namaFormat: string, namaImpor: string) => {
    const st = useGis.getState();
    // pakai nama file dari PARAMETER (state React bisa stale di callback async)
    const namaLayer = namaLayerDariFile(namaImpor || namaFile);
    const layerId = st.tambahLayer(namaLayer);
    const pts: GisPoint[] = fitur.points.map((p, i) => ({
      id: uid("titik"),
      lat: p.lat,
      lng: p.lng,
      title: p.name || `Titik ${i + 1}`,
      description: p.desc,
      elevation: p.ele,
      attrs: p.attrs,
      source: sumber,
      visible: true,
      layerId,
    }));
    const shps: GisShape[] = fitur.shapes.map((sh, i) => ({
      id: uid("shape"),
      kind: sh.kind,
      vertices: sh.vertices,
      title: sh.name || `${sh.kind === "closed" ? "Poligon" : "Garis"} ${i + 1}`,
      description: sh.desc,
      color: sh.kind === "closed" ? "#f59e0b" : "#10b981",
      attrs: sh.attrs,
      source: sumber,
      visible: true,
      layerId,
    }));
    for (const lb of fitur.labels) {
      st.addLabel({ id: uid("label"), lat: lb.lat, lng: lb.lng, text: lb.text, layerId });
    }
    const total = pts.length + shps.length + fitur.labels.length;
    if (total === 0) {
      toast.error(`Tidak ada fitur terbaca dari file ${namaFormat}`, {
        description: "Periksa isi file — mungkin kosong atau format tidak dikenal.",
      });
      setFase("pilih");
      return;
    }
    // titik besar ditambah bertahap agar UI tetap responsif
    const ukuranBatch = 2000;
    let i = 0;
    const tambahBertahap = () => {
      st.addPoints(pts.slice(i, i + ukuranBatch));
      i += ukuranBatch;
      if (i < pts.length) {
        setTimeout(tambahBertahap, 0);
        return;
      }
      for (const sh of shps) st.addShape(sh);
      toast.success(`Impor ${namaFormat} berhasil`, {
        description: `${pts.length.toLocaleString("id-ID")} titik + ${shps.length.toLocaleString("id-ID")} poligon/garis${fitur.labels.length ? ` + ${fitur.labels.length.toLocaleString("id-ID")} teks` : ""} pada layer "${namaLayer}".`,
      });
      fitData();
      setFase("selesai");
      setTimeout(tutup, 600);
    };
    tambahBertahap();
  };

  const mulaiGpx = (file: File) => {
    setNamaFile(file.name);
    setJenis("gpx");
    setFase("proses");
    setProgres({ bytes: file.size * 0.5, total: file.size });
    file
      .text()
      .then((teks) => {
        setProgres({ bytes: file.size, total: file.size });
        const fitur = parseGpx(teks);
        tandaiFiturCad(fitur, "gpx", "GPX", file.name);
      })
      .catch((e) => {
        toast.error("Gagal membaca GPX", { description: e instanceof Error ? e.message : String(e) });
        setFase("pilih");
      });
  };

  const imporDxfDenganCrs = () => {
    const conv = buatKonversiUtm(utaZona, utaHemi);
    const fitur = dxfKeFitur(dxfEntitasRef.current, conv);
    tandaiFiturCad(fitur, "dxf", "DXF", dxfNamaFileRef.current);
  };

  const mulaiDxf = (file: File) => {
    setNamaFile(file.name);
    setJenis("dxf");
    setFase("proses");
    setProgres({ bytes: file.size * 0.5, total: file.size });
    file
      .text()
      .then((teks) => {
        setProgres({ bytes: file.size, total: file.size });
        const hasil = parseDxf(teks);
        if (hasil.biner) {
          toast.error("File DXF biner belum didukung", {
            description: "Simpan ulang dari AutoCAD/CAD: SAVEAS → pilih 'AutoCAD DXF' versi biasa (ASCII), bukan Binary DXF.",
          });
          setFase("pilih");
          return;
        }
        if (hasil.entitas.length === 0) {
          toast.error("Tidak ada entitas terbaca", {
            description: "File .dxf tidak berisi POINT/LINE/POLYLINE/CIRCLE/ARC/TEXT yang dikenali.",
          });
          setFase("pilih");
          return;
        }
        dxfEntitasRef.current = hasil.entitas;
        dxfNamaFileRef.current = file.name;
        if (dxfSudahDerajat(hasil.entitas)) {
          // koordinat sudah derajat (lat/lng) — langsung impor tanpa pilihan CRS
          const fitur = dxfKeFitur(hasil.entitas, (x, y) => ({ lat: y, lng: x }));
          toast.info("Koordinat DXF terbaca sebagai derajat WGS84", {
            description: "Angka koordinat berada dalam rentang lintang/bujur — langsung dipetakan. Jika posisi meleset, ulangi impor dan pilih zona UTM.",
          });
          tandaiFiturCad(fitur, "dxf", "DXF", file.name);
          return;
        }
        // koordinat meter (umumnya UTM) — minta zona dulu
        const sampelE = hasil.entitas.find((e) => e.jenis === "titik") ?? hasil.entitas[0];
        const koord = (x: number, y: number) => `X ${x.toLocaleString("id-ID", { maximumFractionDigits: 2 })}, Y ${y.toLocaleString("id-ID", { maximumFractionDigits: 2 })}`;
        let contoh = "";
        if (sampelE.jenis === "titik") contoh = koord(sampelE.x, sampelE.y);
        else if (sampelE.jenis === "garis") contoh = koord(sampelE.a[0], sampelE.a[1]);
        else if (sampelE.jenis === "poly") contoh = sampelE.pts[0] ? koord(sampelE.pts[0][0], sampelE.pts[0][1]) : "";
        else if (sampelE.jenis === "lingkaran" || sampelE.jenis === "busur") contoh = koord(sampelE.cx, sampelE.cy);
        else if (sampelE.jenis === "teks") contoh = koord(sampelE.x, sampelE.y);
        setDxfSampel(contoh);
        setFase("crs-dxf");
      })
      .catch((e) => {
        toast.error("Gagal membaca DXF", { description: e instanceof Error ? e.message : String(e) });
        setFase("pilih");
      });
  };

  const mulaiDwg = () => {
    setNamaFile(".dwg");
    setJenis("dwg");
    setFase("dwg");
  };

  const mulaiParse = (file: File) => {
    const nama = file.name.toLowerCase();
    if (nama.endsWith(".dwg")) {
      mulaiDwg();
      return;
    }
    if (nama.endsWith(".dxf")) {
      mulaiDxf(file);
      return;
    }
    if (nama.endsWith(".gpx")) {
      mulaiGpx(file);
      return;
    }
    const isKml = nama.endsWith(".kml") || nama.endsWith(".kmz");
    setNamaFile(file.name);
    setJenis(isKml ? "kml" : "tabel");
    setFase("proses");
    setProgres({ bytes: 0, total: file.size });
    semuaRowsRef.current = [];
    setHeaders([]);
    setGunakanHeader(true);
    setModeKoordinat("gabungan");
    fiturRef.current = { points: [], shapes: [] };

    const parser = new ParseStream();
    workerRef.current = parser;
    parser.mulai(file, {
      onProgress: (p) => setProgres({ bytes: p.bytes, total: p.total, rows: p.rows, features: p.features }),
      onRows: (rows) => {
        // loop (bukan spread) — aman untuk batch berapa pun besarnya
        for (const r of rows) semuaRowsRef.current.push(r);
      },
      onFeatures: (points, shapes) => {
        for (const p of points) {
          const bersih = bersihkanDeskripsiHtml(p.description, p.attrs, p.name);
          fiturRef.current.points.push({
            id: uid("titik"),
            lat: p.lat,
            lng: p.lng,
            title: p.name,
            description: bersih.description,
            attrs: bersih.attrs,
            source: "kml",
            visible: true,
          });
        }
        for (const sh of shapes) {
          const bersih = bersihkanDeskripsiHtml(sh.description, sh.attrs, sh.name);
          fiturRef.current.shapes.push({
            id: uid("shape"),
            kind: sh.kind,
            vertices: sh.vertices,
            title: sh.name,
            description: bersih.description,
            color: sh.kind === "closed" ? "#f59e0b" : "#10b981",
            attrs: bersih.attrs,
            source: "kml",
            visible: true,
          });
        }
      },
      onDone: (ringkas) => {
        setPesanProses(ringkas);
        if (semuaRowsRef.current.length > 0) {
          const gh = tebakGunakanHeader(semuaRowsRef.current);
          setGunakanHeader(gh);
          jalankanDeteksi(gh, semuaRowsRef.current);
          // default pintar: data besar → DEM diambil manual (nanti) agar impor tak menunggu
          setIsiElevMode(semuaRowsRef.current.length > 5000 ? "nanti" : "sekarang");
          setFase("peta-kolom");
        } else {
          terapkanFiturKml();
        }
      },
      onError: (msg) => {
        toast.error("Gagal membaca file", { description: msg });
        setFase("pilih");
      },
    });
  };

  const terapkanFiturKml = () => {
    const st = useGis.getState();
    // layer baru untuk hasil impor KML/KMZ ini
    const layerId = st.tambahLayer(namaLayerDariFile(namaFile));
    fiturRef.current.points = fiturRef.current.points.map((p) => ({ ...p, layerId }));
    fiturRef.current.shapes = fiturRef.current.shapes.map((sh) => ({ ...sh, layerId }));
    if (fiturRef.current.points.length) st.addPoints(fiturRef.current.points);
    for (const sh of fiturRef.current.shapes) st.addShape(sh);
    toast.success("Impor KML/KMZ berhasil", {
      description: `${fiturRef.current.points.length} titik + ${fiturRef.current.shapes.length} poligon/garis ditambahkan pada layer "${namaLayerDariFile(namaFile)}".`,
    });
    fitData();
    setFase("selesai");
    setTimeout(tutup, 600);
  };

  const prosentase = progres.total > 0 ? Math.min(100, Math.round((progres.bytes / progres.total) * 100)) : 0;

  const hitungDanTambah = () => {
    const st = useGis.getState();
    const semuaRows = gunakanHeader ? semuaRowsRef.current.slice(1) : semuaRowsRef.current;
    const baru: GisPoint[] = [];
    let gagal = 0;

    const ambil = (row: string[], i: number) => row[i] ?? "";

    // layer baru untuk hasil impor ini (dinamai sesuai nama file)
    const layerId = st.tambahLayer(namaLayerDariFile(namaFile));

    for (const row of semuaRows) {
      let ll: ReturnType<typeof parseKolomKoordinat> = null;
      if (modeKoordinat === "gabungan") {
        ll = parseKolomKoordinat(ambil(row, kolomGabung));
      } else {
        const la = parseFloat(String(ambil(row, kolomLat)).replace(",", "."));
        const lo = parseFloat(String(ambil(row, kolomLng)).replace(",", "."));
        if (!isNaN(la) && !isNaN(lo) && Math.abs(la) <= 90 && Math.abs(lo) <= 180) {
          ll = { lat: la, lng: lo };
        }
      }
      if (!ll) {
        gagal++;
        continue;
      }
      const elevRaw = kolomElev >= 0 ? parseFloat(String(ambil(row, kolomElev)).replace(",", ".")) : NaN;
      const attrs: Record<string, string> = {};
      headers.forEach((h, i) => {
        const v = ambil(row, i);
        if (v !== "") attrs[h] = v;
      });
      baru.push({
        id: uid("titik"),
        lat: ll.lat,
        lng: ll.lng,
        title: kolomJudul >= 0 ? ambil(row, kolomJudul) || `Titik ${baru.length + 1}` : `Titik ${baru.length + 1}`,
        description: "",
        elevation: !isNaN(elevRaw) ? elevRaw : null,
        attrs,
        source: namaFile.toLowerCase().endsWith(".csv") ? "csv" : "excel",
        visible: true,
        layerId,
      });
    }

    // tambahkan bertahap agar UI tetap responsif
    const ukuranBatch = 2000;
    let i = 0;
    const tambahBertahap = () => {
      const potongan = baru.slice(i, i + ukuranBatch);
      st.addPoints(potongan);
      i += ukuranBatch;
      if (i < baru.length) {
        setTimeout(tambahBertahap, 0);
      } else {
        toast.success(`${baru.length.toLocaleString("id-ID")} titik ditambahkan ke peta`, {
          description: gagal > 0 ? `${gagal.toLocaleString("id-ID")} baris dilewati (koordinat tidak valid).` : undefined,
        });
        // elevasi dari DEM bila dipilih "sekarang" (proses latar, dialog boleh ditutup)
        if (isiElevMode === "sekarang" && kolomElev < 0) {
          const idsKosong = baru.filter((p) => p.elevation == null).map((p) => p.id);
          if (idsKosong.length > 0) {
            const t = toast.loading(`Mengambil elevasi DEM untuk ${idsKosong.length.toLocaleString("id-ID")} titik…`);
            isiElevasiKosong(idsKosong)
              .then((h) => {
                toast.dismiss(t);
                if (h.dibatalkan) toast.warning("Pengambilan elevasi dihentikan", { description: `${h.diisi} titik sudah terisi.` });
                else if (h.gagal > 0) toast.warning(`Elevasi DEM: ${h.diisi.toLocaleString("id-ID")} titik terisi, ${h.gagal} gagal`, { description: "Ulangi lewat menu Analisis → Elevasi DEM untuk yang belum." });
                else toast.success(`Elevasi DEM terisi untuk ${h.diisi.toLocaleString("id-ID")} titik`, { description: "Sumber: Copernicus DEM (grid ±90 m)" });
              })
              .catch((e) => {
                console.warn("[impor] gagal isiElevasiKosong:", e);
                toast.dismiss(t);
                toast.error("Gagal mengambil elevasi DEM", { description: "Periksa koneksi internet. Ulangi lewat menu Analisis → Elevasi DEM." });
              });
          }
        } else if (isiElevMode === "nanti" && kolomElev < 0) {
          const jumlahKosong = baru.filter((p) => p.elevation == null).length;
          if (jumlahKosong > 0) {
            toast.info(`${jumlahKosong.toLocaleString("id-ID")} titik belum punya elevasi`, {
              description: "Ambil elevasi DEM kapan saja lewat menu Analisis → Elevasi DEM (bisa dijeda/dibatalkan).",
              action: { label: "Buka", onClick: () => useGis.getState().setDialog("elevasi", true) },
              duration: 12000,
            });
          }
        }
        fitData();
        setFase("selesai");
        setTimeout(tutup, 700);
      }
    };
    if (baru.length === 0) {
      toast.error("Tidak ada titik valid ditemukan", {
        description: "Periksa pilihan kolom koordinat. Format contoh: (-6.994292,110.429400)",
      });
      return;
    }
    tambahBertahap();
  };

  if (!open) return null;

  const semuaRows = semuaRowsRef.current;
  const barisData = gunakanHeader ? semuaRows.slice(1) : semuaRows;
  const pratinjau = barisData.slice(0, 6);
  const opsiKolom = headers.map((h, i) => (
    <option key={i} value={i}>
      {h}
    </option>
  ));
  const contohNilai = (i: number) => {
    const v = String(barisData[0]?.[i] ?? "").trim();
    return v.length > 42 ? v.slice(0, 42) + "…" : v || "—";
  };
  const sorotKolom = (i: number): { cls: string; label: string } => {
    const isKoor = modeKoordinat === "gabungan" ? i === kolomGabung : i === kolomLat || i === kolomLng;
    if (isKoor)
      return {
        cls: "bg-blue-100/80 text-blue-800",
        label: modeKoordinat === "gabungan" ? "koordinat" : i === kolomLat ? "lat" : "lng",
      };
    if (i === kolomElev) return { cls: "bg-emerald-50 text-emerald-700", label: "elevasi" };
    if (i === kolomJudul) return { cls: "bg-violet-50 text-violet-700", label: "judul" };
    return { cls: "", label: "" };
  };

  return (
    <FloatingWindow judul="Impor Data — Excel / CSV / KML / KMZ / GPX / DXF / DWG" onClose={tutup} lebar="max-w-3xl w-[min(94vw,56rem)]">
      {fase === "pilih" && (
        <div>
          <div
            onClick={() => inputRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              const f = e.dataTransfer.files?.[0];
              if (f) mulaiParse(f);
            }}
            className="cursor-pointer rounded-2xl border-2 border-dashed border-blue-300 bg-blue-50/40 hover:bg-blue-50 transition-colors flex flex-col items-center justify-center gap-3 py-12"
            role="button"
            aria-label="Pilih atau jatuhkan file"
            tabIndex={0}
            onKeyDown={(e) => e.key === "Enter" && inputRef.current?.click()}
          >
            <div className="h-14 w-14 rounded-2xl bg-blue-100 flex items-center justify-center">
              <Upload className="h-7 w-7 text-blue-600" />
            </div>
            <p className="font-semibold text-slate-800">Klik pilih file atau seret ke sini</p>
            <p className="text-sm text-slate-500">
              Mendukung <b>.xlsx</b> <b>.csv</b> <b>.kml</b> <b>.kmz</b> <b>.gpx</b> <b>.dxf</b> <b>.dwg</b> — hingga <b>250 MB</b>
            </p>
            <p className="text-xs text-slate-400">
              GPX & DXF dibaca langsung • DWG biner diberi panduan konversi ke DXF
            </p>
          </div>
          <input
            ref={inputRef}
            type="file"
            accept=".xlsx,.xlsm,.csv,.txt,.kml,.kmz,.gpx,.dxf,.dwg"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) mulaiParse(f);
              e.target.value = "";
            }}
          />
        </div>
      )}

      {fase === "dwg" && (
        <div className="space-y-4">
          <div className="flex items-start gap-2.5 rounded-xl bg-amber-50 border border-amber-200 p-3.5">
            <Info className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
            <div className="text-sm text-amber-900">
              <p className="font-semibold">DWG adalah format biner proprietary AutoCAD</p>
              <p className="mt-1 text-amber-800">
                Sama seperti ECW, browser tidak punya pembaca DWG (format tertutup, lisensi tertutup).
                Jalurnya: konversi dulu ke <b>DXF</b> — sekali konversi, semua fiturnya bisa diimpor di sini.
              </p>
            </div>
          </div>
          <ol className="list-decimal ml-5 space-y-2 text-sm text-slate-700">
            <li>
              <b>Dari AutoCAD / BricsCAD / ZwCAD:</b> buka file .dwg → <code className="rounded bg-slate-100 px-1">SAVEAS</code> →
              pilih tipe <b>"AutoCAD DXF (*.dxf)"</b> (versi R12/R2000+) → simpan.
            </li>
            <li>
              <b>Gratis tanpa AutoCAD:</b> unduh <b>ODA File Converter</b> (opendesign.com) — pilih input .dwg, output .dxf (ASCII).
              Alternatif lain: QGIS (layer → ekspor DXF) atau LibreCAD.
            </li>
            <li>Kembali ke sini → impor file .dxf hasil konversi (koordinat meter UTM akan ditanya zonanya).</li>
          </ol>
          <div className="flex gap-2 justify-end">
            <button onClick={() => setFase("pilih")} className="rounded-xl border border-slate-300 px-4 py-2 text-sm hover:bg-slate-50">
              Kembali
            </button>
            <button
              onClick={() => inputRef.current?.click()}
              className="rounded-xl bg-blue-600 text-white px-4 py-2 text-sm font-medium hover:bg-blue-700"
            >
              Sudah punya DXF — impor sekarang
            </button>
          </div>
        </div>
      )}

      {fase === "crs-dxf" && (
        <div className="space-y-4">
          <div className="flex items-start gap-2.5 rounded-xl bg-emerald-50 border border-emerald-200 p-3">
            <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0 mt-0.5" />
            <div className="text-sm">
              <p className="font-medium text-emerald-800">
                {dxfEntitasRef.current.length.toLocaleString("id-ID")} entitas DXF terbaca dari {namaFile}
              </p>
              <p className="text-emerald-600 text-xs mt-0.5">
                Koordinatnya dalam SATUAN METER (bukan derajat) — umumnya proyeksi UTM. Pilih zona UTM agar posisi tepat di peta.
              </p>
              {dxfSampel && <p className="text-xs text-slate-500 mt-1">Contoh koordinat: <code className="rounded bg-white px-1 py-0.5 border border-slate-200">{dxfSampel}</code></p>}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-slate-600">Zona UTM</label>
              <select
                value={utaZona}
                onChange={(e) => setUtaZona(parseInt(e.target.value, 10))}
                className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm outline-none focus:border-blue-400"
              >
                {Array.from({ length: 60 }, (_, i) => i + 1).map((z) => (
                  <option key={z} value={z}>Zone {z}</option>
                ))}
              </select>
              <p className="text-[10px] text-slate-400 mt-1">Indonesia: zona 46 (barat) s.d. 54 (Papua). Semarang/Jateng = 49S.</p>
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-600">Hemisfer</label>
              <div className="mt-1 flex gap-4 text-sm">
                <label className="flex items-center gap-1.5">
                  <input type="radio" checked={utaHemi === "S"} onChange={() => setUtaHemi("S")} />
                  Selatan (S)
                </label>
                <label className="flex items-center gap-1.5">
                  <input type="radio" checked={utaHemi === "N"} onChange={() => setUtaHemi("N")} />
                  Utara (N)
                </label>
              </div>
              <p className="text-[10px] text-slate-400 mt-1">Indonesia = hemisfer selatan (Y ± 9 juta m).</p>
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            <button onClick={() => setFase("pilih")} className="rounded-xl border border-slate-300 px-4 py-2 text-sm hover:bg-slate-50">
              Batal
            </button>
            <button
              onClick={imporDxfDenganCrs}
              className="rounded-xl bg-blue-600 text-white px-4 py-2 text-sm font-medium hover:bg-blue-700 flex items-center gap-1.5"
            >
              <FileSpreadsheet className="h-4 w-4" />
              Konversi & Tambahkan ke Peta
            </button>
          </div>
        </div>
      )}

      {fase === "proses" && (
        <div className="py-8 flex flex-col items-center gap-4">
          <Loader2 className="h-10 w-10 animate-spin text-blue-600" />
          <div className="text-center">
            <p className="font-semibold text-slate-800">Membaca {namaFile}…</p>
            <p className="text-sm text-slate-500 mt-1">
              {jenis === "kml"
                ? `${(fiturRef.current.points.length + fiturRef.current.shapes.length).toLocaleString("id-ID")} fitur ditemukan`
                : `${(progres.rows ?? 0).toLocaleString("id-ID")} baris terbaca`}
            </p>
          </div>
          <div className="w-full max-w-md">
            <div className="h-3 rounded-full bg-slate-100 overflow-hidden">
              <div
                className="h-full rounded-full bg-gradient-to-r from-blue-500 to-sky-400 transition-all"
                style={{ width: `${prosentase}%` }}
              />
            </div>
            <div className="flex justify-between text-xs text-slate-400 mt-1.5">
              <span>{prosentase}%</span>
              <span>
                {(progres.bytes / 1048576).toFixed(1)} / {(progres.total / 1048576).toFixed(1)} MB
              </span>
            </div>
          </div>
          <button
            onClick={() => {
              workerRef.current?.hentikan();
              setFase("pilih");
            }}
            className="text-xs text-red-600 hover:underline"
          >
            Batalkan proses
          </button>
        </div>
      )}

      {fase === "peta-kolom" && (
        <div className="space-y-5">
          <div className="flex items-start gap-2.5 rounded-xl bg-emerald-50 border border-emerald-200 p-3">
            <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0 mt-0.5" />
            <div className="text-sm">
              <p className="font-medium text-emerald-800">
                {barisData.length.toLocaleString("id-ID")} baris data berhasil dibaca
              </p>
              <p className="text-emerald-600 text-xs mt-0.5">
                Nama kolom dari file sudah terbaca — pilih kolom koordinat di bawah.
              </p>
            </div>
          </div>

          <div className="space-y-1">
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={gunakanHeader}
                onChange={(e) => {
                  setGunakanHeader(e.target.checked);
                  jalankanDeteksi(e.target.checked, semuaRowsRef.current);
                }}
                className="h-4 w-4"
              />
              Baris pertama berisi nama kolom (header)
            </label>
            {!gunakanHeader && (
              <p className="text-xs text-slate-400">
                Nama kolom otomatis (Kolom 1, Kolom 2, …) — baris pertama dihitung sebagai data.
              </p>
            )}
          </div>

          <div className="space-y-3">
            <p className="text-sm font-semibold text-slate-700">Kolom Koordinat</p>
            <div className="flex gap-4">
              <label className="flex items-center gap-1.5 text-sm">
                <input type="radio" checked={modeKoordinat === "gabungan"} onChange={() => setModeKoordinat("gabungan")} />
                1 kolom gabungan: <code className="text-xs bg-slate-100 px-1 rounded">(-6.994292,110.429400)</code>
              </label>
              <label className="flex items-center gap-1.5 text-sm">
                <input type="radio" checked={modeKoordinat === "pisah"} onChange={() => setModeKoordinat("pisah")} />
                2 kolom terpisah (lat &amp; lng)
              </label>
            </div>

            <div className="grid sm:grid-cols-2 gap-3">
              {modeKoordinat === "gabungan" ? (
                <label className="block">
                  <span className="text-xs font-medium text-slate-500">Kolom koordinat gabungan</span>
                  <select
                    value={kolomGabung}
                    onChange={(e) => setKolomGabung(Number(e.target.value))}
                    className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm bg-white"
                  >
                    {opsiKolom}
                  </select>
                  <span className="mt-1 block truncate text-[11px] text-slate-400">
                    Contoh isi: <code className="rounded bg-slate-100 px-1">{contohNilai(kolomGabung)}</code>
                  </span>
                </label>
              ) : (
                <>
                  <label className="block">
                    <span className="text-xs font-medium text-slate-500">Kolom Latitude</span>
                    <select value={kolomLat} onChange={(e) => setKolomLat(Number(e.target.value))} className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm bg-white">
                      {opsiKolom}
                    </select>
                    <span className="mt-1 block truncate text-[11px] text-slate-400">
                      Contoh isi: <code className="rounded bg-slate-100 px-1">{contohNilai(kolomLat)}</code>
                    </span>
                  </label>
                  <label className="block">
                    <span className="text-xs font-medium text-slate-500">Kolom Longitude</span>
                    <select value={kolomLng} onChange={(e) => setKolomLng(Number(e.target.value))} className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm bg-white">
                      {opsiKolom}
                    </select>
                    <span className="mt-1 block truncate text-[11px] text-slate-400">
                      Contoh isi: <code className="rounded bg-slate-100 px-1">{contohNilai(kolomLng)}</code>
                    </span>
                  </label>
                </>
              )}
              <label className="block">
                <span className="text-xs font-medium text-slate-500">Kolom ketinggian / elevasi (opsional — untuk kontur)</span>
                <select value={kolomElev} onChange={(e) => setKolomElev(Number(e.target.value))} className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm bg-white">
                  <option value={-1}>— Tidak ada —</option>
                  {opsiKolom}
                </select>
                {kolomElev >= 0 && (
                  <span className="mt-1 block truncate text-[11px] text-slate-400">
                    Contoh isi: <code className="rounded bg-slate-100 px-1">{contohNilai(kolomElev)}</code>
                  </span>
                )}
              </label>
              {kolomElev < 0 && (
                <div className="sm:col-span-2 rounded-xl bg-blue-50 border border-blue-100 px-3 py-2.5 text-xs text-blue-900 space-y-2">
                  <p className="font-medium">Kapan elevasi DEM satelit diambil untuk titik yang kosong?</p>
                  <div className="space-y-1.5">
                    <label className="flex items-start gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="elev-dem"
                        checked={isiElevMode === "sekarang"}
                        onChange={() => setIsiElevMode("sekarang")}
                        className="mt-0.5 h-4 w-4"
                      />
                      <span>
                        <b>Sekarang</b> — otomatis setelah impor (butuh internet; saran untuk ≤ 5.000 titik)
                      </span>
                    </label>
                    <label className="flex items-start gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="elev-dem"
                        checked={isiElevMode === "nanti"}
                        onChange={() => setIsiElevMode("nanti")}
                        className="mt-0.5 h-4 w-4"
                      />
                      <span>
                        <b>Nanti</b> — lewat menu <b>Analisis → Elevasi DEM</b> dengan progres &amp; tombol batal (saran untuk data besar)
                      </span>
                    </label>
                  </div>
                  {isiElevMode === "sekarang" && barisData.length > 5000 && (
                    <p className="text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2 py-1">
                      Data {barisData.length.toLocaleString("id-ID")} titik ≈ {Math.ceil(barisData.length / 100).toLocaleString("id-ID")} permintaan jaringan — dipilih “Sekarang”, impor akan menunggu di latar belakang.
                    </p>
                  )}
                </div>
              )}
              <label className="block">
                <span className="text-xs font-medium text-slate-500">Kolom judul titik (opsional)</span>
                <select value={kolomJudul} onChange={(e) => setKolomJudul(Number(e.target.value))} className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm bg-white">
                  <option value={-1}>— Otomatis —</option>
                  {opsiKolom}
                </select>
                {kolomJudul >= 0 && (
                  <span className="mt-1 block truncate text-[11px] text-slate-400">
                    Contoh isi: <code className="rounded bg-slate-100 px-1">{contohNilai(kolomJudul)}</code>
                  </span>
                )}
              </label>
            </div>
          </div>

          <div>
            <p className="text-sm font-semibold text-slate-700 mb-2">Pratinjau 6 baris pertama</p>
            <div className="overflow-x-auto rounded-xl border border-slate-200 scrollbar-halus">
              <table className="min-w-full text-xs">
                <thead>
                  <tr className="bg-slate-50">
                    {headers.map((h, i) => {
                      const s = sorotKolom(i);
                      return (
                        <th key={i} className={`px-2.5 py-2 text-left font-semibold border-b whitespace-nowrap ${s.cls}`}>
                          {h}
                          {s.label && (
                            <span className="ml-1.5 rounded-full bg-white/80 px-1.5 py-0.5 text-[10px] font-medium text-slate-600 align-middle">
                              {s.label}
                            </span>
                          )}
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {pratinjau.map((row, ri) => (
                    <tr key={ri} className="border-b last:border-0">
                      {headers.map((_, ci) => (
                        <td key={ci} className="px-2.5 py-1.5 text-slate-700 whitespace-nowrap max-w-[180px] truncate">
                          {row[ci] ?? ""}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="flex gap-2 justify-end">
            <button onClick={() => setFase("pilih")} className="rounded-xl border border-slate-300 px-4 py-2 text-sm hover:bg-slate-50">
              Ganti File
            </button>
            <button
              onClick={hitungDanTambah}
              className="rounded-xl bg-blue-600 text-white px-4 py-2 text-sm font-medium hover:bg-blue-700 flex items-center gap-1.5"
            >
              <FileSpreadsheet className="h-4 w-4" />
              Tambahkan Titik ke Peta
            </button>
          </div>
        </div>
      )}

      {fase === "selesai" && (
        <div className="py-8 flex flex-col items-center gap-3">
          <CheckCircle2 className="h-10 w-10 text-emerald-500" />
          <p className="font-medium text-slate-700">{pesanProses || "Impor selesai"}</p>
        </div>
      )}

    </FloatingWindow>
  );
}
