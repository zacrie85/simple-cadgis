"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useGis, simpanShapeDariPending } from "@/lib/gis/store";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Waypoints, Loader2, Search, Plus, X, ChevronUp, ChevronDown, Info, MousePointerClick, ListOrdered } from "lucide-react";

const WARNA = ["#2563eb", "#f59e0b", "#10b981", "#ef4444", "#8b5cf6", "#0ea5e9", "#f97316", "#64748b"];
const BATAS_TAMPIL = 150;

/** Dialog "Dari Titik": buat poligon tertutup / garis terbuka otomatis dari
 *  titik-titik yang SUDAH ada (impor Excel/KMZ atau manual). Titik dipilih
 *  satu per satu — urutan pemilihan = urutan sambungan. Pilihan bisa lewat:
 *  input cepat nomor/nama (mis. 3, 7, 49), daftar yang dicari, atau klik
 *  langsung titik di peta. */
export default function PoligonTitikDialog() {
  const open = useGis((s) => s.dialogs.poligonTitik);
  const setDialog = useGis((s) => s.setDialog);
  const points = useGis((s) => s.points);
  const urutanPoligon = useGis((s) => s.urutanPoligon);
  const jenis = useGis((s) => s.jenisPoligonTitik);

  const [cari, setCari] = useState("");
  const [inputCepat, setInputCepat] = useState("");
  const [warna, setWarna] = useState(WARNA[0]);
  const [batas, setBatas] = useState(BATAS_TAMPIL);
  const [memproses, setMemproses] = useState(false);

  // nomor baris tiap titik (1-based sesuai urutan store = urutan tabel)
  const indeksTitik = useMemo(() => {
    const m = new Map<string, number>();
    for (let i = 0; i < points.length; i++) m.set(points[i].id, i + 1);
    return m;
  }, [points]);

  // titik-titik dalam urutan sambungan (loop, aman utk 30rb+ titik)
  const urutanTitik = useMemo(() => {
    const kumpulan = new Map<string, { id: string; title: string; lat: number; lng: number }>();
    for (const p of points) kumpulan.set(p.id, p);
    const hasil: { id: string; title: string; lat: number; lng: number; no: number }[] = [];
    for (const id of urutanPoligon) {
      const p = kumpulan.get(id);
      if (p) hasil.push({ id: p.id, title: p.title, lat: p.lat, lng: p.lng, no: indeksTitik.get(p.id) ?? 0 });
    }
    return hasil;
  }, [urutanPoligon, points, indeksTitik]);

  // daftar titik sesuai pencarian (dibatasi batas agar 30rb+ titik tetap enteng)
  const hasilCari = useMemo(() => {
    const q = cari.trim().toLowerCase();
    const cocok = q
      ? points.filter((p) => (p.title || "").toLowerCase().includes(q) || String(indeksTitik.get(p.id) ?? "").includes(q))
      : points;
    return cocok.slice(0, batas);
  }, [points, cari, batas, indeksTitik]);
  const totalCocok = cari.trim()
    ? points.reduce((n, p) => ((p.title || "").toLowerCase().includes(cari.trim().toLowerCase()) ? n + 1 : n), 0)
    : points.length;

  // reset pencarian tiap kali dialog dibuka (jenis & warna dipertahankan)
  const terbuka = useRef(false);
  useEffect(() => {
    if (open && !terbuka.current) {
      setCari("");
      setInputCepat("");
      setBatas(BATAS_TAMPIL);
    }
    terbuka.current = open;
  }, [open]);

  if (!open) return null;

  const minimal = jenis === "closed" ? 3 : 2;
  const bisaBuat = urutanTitik.length >= minimal && !memproses;

  const tutup = () => {
    useGis.getState().kosongkanUrutanPoligon();
    setDialog("poligonTitik", false);
  };

  /** Tambah dari input cepat: "3, 7, 49" (nomor baris) atau nama titik. */
  const tambahCepat = () => {
    const token = inputCepat
      .split(/[,;\s]+/)
      .map((t) => t.trim())
      .filter(Boolean);
    if (token.length === 0) return;
    const st = useGis.getState();
    let ditambah = 0;
    const sudahAda: string[] = [];
    const takKetemu: string[] = [];
    for (const t of token) {
      let target: { id: string; title: string } | null = null;
      const angka = Number(t);
      if (Number.isInteger(angka) && angka >= 1 && angka <= points.length) {
        const p = points[angka - 1];
        target = { id: p.id, title: p.title };
      } else {
        const q = t.toLowerCase();
        const p =
          points.find((x) => (x.title || "").toLowerCase() === q) ||
          points.find((x) => (x.title || "").toLowerCase().startsWith(q));
        if (p) target = { id: p.id, title: p.title };
      }
      if (!target) {
        takKetemu.push(t);
        continue;
      }
      if (st.urutanPoligon.includes(target.id)) {
        sudahAda.push(target.title || `#${target.id}`);
        continue;
      }
      st.tambahUrutanPoligon(target.id);
      ditambah++;
    }
    let ket = `${ditambah} titik ditambahkan ke urutan`;
    if (sudahAda.length) ket += ` • ${sudahAda.length} sudah ada`;
    if (takKetemu.length) ket += ` • tak ditemukan: ${takKetemu.slice(0, 5).join(", ")}${takKetemu.length > 5 ? "…" : ""}`;
    if (ditambah > 0) toast.success(ket);
    else toast.info(ket);
    setInputCepat("");
  };

  const buat = () => {
    if (!bisaBuat) return;
    setMemproses(true);
    try {
      const verts = urutanTitik.map((t) => ({ lat: t.lat, lng: t.lng }));
      const shape = simpanShapeDariPending(jenis, verts, jenis === "closed" ? "Poligon dari Titik" : "Garis dari Titik", "", warna);
      toast.success(jenis === "closed" ? `Poligon dibuat: ${verts.length} titik` : `Garis dibuat: ${verts.length} titik`, {
        description: `${shape.title} — beri nama lewat dialog yang terbuka.`,
      });
      useGis.getState().kosongkanUrutanPoligon();
      setDialog("poligonTitik", false);
      setDialog("shapeInfo", { id: shape.id }); // dialog penamaan, konsisten dengan alur gambar manual
    } finally {
      setMemproses(false);
    }
  };

  return (
    // modal={false}: peta HARUS tetap bisa diklik/geser saat dialog terbuka
    // (klik titik di peta = cara menambah titik ke urutan sambungan)
    <Dialog modal={false} open onOpenChange={(v) => !v && tutup()}>
      <DialogContent
        className="rounded-2xl sm:max-w-lg max-h-[88vh] overflow-y-auto scrollbar-halus"
        // klik titik di peta (di luar dialog) TIDAK boleh menutup dialog —
        // itu justru cara menambah titik ke urutan
        onPointerDownOutside={(e) => e.preventDefault()}
        onFocusOutside={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Waypoints className="h-5 w-5 text-primary" />
            Poligon / Garis dari Titik
          </DialogTitle>
        </DialogHeader>

        {points.length === 0 ? (
          <p className="text-sm text-slate-500 py-6 text-center">
            Belum ada titik. Impor Excel / KMZ atau buat titik manual dulu, lalu buka menu ini lagi.
          </p>
        ) : (
          <div className="space-y-3.5 text-sm">
            {/* Pilih cepat */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Pilih cepat — nomor baris atau nama, pisahkan dengan koma
              </label>
              <div className="flex gap-2">
                <input
                  value={inputCepat}
                  onChange={(e) => setInputCepat(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && tambahCepat()}
                  placeholder="mis. 3, 7, 49"
                  className="flex-1 rounded-xl border border-slate-300 px-3 py-2 text-sm bg-white"
                  aria-label="Nomor baris atau nama titik, pisahkan dengan koma"
                />
                <Button variant="outline" className="rounded-xl" onClick={tambahCepat}>
                  <Plus className="h-4 w-4" /> Tambah
                </Button>
              </div>
            </div>

            {/* Urutan sambungan */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 flex items-center gap-1.5">
                  <ListOrdered className="h-3.5 w-3.5" />
                  Urutan sambungan ({urutanTitik.length})
                </p>
                {urutanTitik.length > 0 && (
                  <button
                    onClick={() => useGis.getState().kosongkanUrutanPoligon()}
                    className="text-xs text-slate-400 hover:text-red-600"
                  >
                    Kosongkan
                  </button>
                )}
              </div>
              {urutanTitik.length === 0 ? (
                <p className="rounded-xl border border-dashed border-slate-200 px-3 py-3 text-xs text-slate-400 flex items-center gap-2">
                  <MousePointerClick className="h-4 w-4 shrink-0" />
                  Belum ada titik dipilih — tambah lewat input di atas, daftar di bawah, atau klik titik langsung di peta.
                </p>
              ) : (
                <ul className="space-y-1 max-h-40 overflow-y-auto scrollbar-halus pr-1">
                  {urutanTitik.map((t, i) => (
                    <li key={t.id} className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50/60 px-2 py-1.5 text-xs">
                      <span className="h-5 w-5 shrink-0 rounded-full bg-emerald-600 text-white flex items-center justify-center font-bold">{i + 1}</span>
                      <span className="flex-1 truncate font-medium text-slate-700" title={t.title}>
                        {t.title || "(tanpa nama)"} <span className="text-slate-400">• baris {t.no}</span>
                      </span>
                      <button
                        onClick={() => useGis.getState().geserUrutanPoligon(t.id, -1)}
                        disabled={i === 0}
                        aria-label={`Naikkan ${t.title}`}
                        className="h-6 w-6 rounded-md hover:bg-emerald-100 disabled:opacity-25 text-slate-500 flex items-center justify-center"
                      >
                        <ChevronUp className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => useGis.getState().geserUrutanPoligon(t.id, 1)}
                        disabled={i === urutanTitik.length - 1}
                        aria-label={`Turunkan ${t.title}`}
                        className="h-6 w-6 rounded-md hover:bg-emerald-100 disabled:opacity-25 text-slate-500 flex items-center justify-center"
                      >
                        <ChevronDown className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => useGis.getState().hapusUrutanPoligon(t.id)}
                        aria-label={`Keluarkan ${t.title} dari urutan`}
                        className="h-6 w-6 rounded-md hover:bg-red-50 text-slate-400 hover:text-red-600 flex items-center justify-center"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Daftar titik + pencarian */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Cari & pilih dari daftar titik</label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                <input
                  value={cari}
                  onChange={(e) => {
                    setCari(e.target.value);
                    setBatas(BATAS_TAMPIL);
                  }}
                  placeholder="Cari nama titik atau nomor baris…"
                  className="w-full rounded-xl border border-slate-300 pl-8 pr-3 py-2 text-sm bg-white"
                  aria-label="Cari titik"
                />
              </div>
              <div className="rounded-xl border border-slate-200 max-h-52 overflow-y-auto scrollbar-halus divide-y divide-slate-100">
                {hasilCari.length === 0 && <p className="text-xs text-slate-400 px-3 py-4 text-center">Tidak ada titik yang cocok.</p>}
                {hasilCari.map((p) => {
                  const dalamUrutan = urutanPoligon.includes(p.id);
                  const no = indeksTitik.get(p.id) ?? 0;
                  return (
                    <div key={p.id} className={`flex items-center gap-2 px-2.5 py-1.5 text-xs ${dalamUrutan ? "bg-emerald-50/50" : "hover:bg-slate-50"}`}>
                      <span className="w-10 shrink-0 text-slate-400 tabular-nums">#{no}</span>
                      <span className="flex-1 truncate font-medium text-slate-700" title={p.title}>{p.title || "(tanpa nama)"}</span>
                      <span className="shrink-0 text-slate-400 tabular-nums">{p.lat.toFixed(4)}, {p.lng.toFixed(4)}</span>
                      <button
                        onClick={() =>
                          dalamUrutan ? useGis.getState().hapusUrutanPoligon(p.id) : useGis.getState().tambahUrutanPoligon(p.id)
                        }
                        aria-label={dalamUrutan ? `Keluarkan ${p.title} dari urutan` : `Tambah ${p.title} ke urutan`}
                        className={`h-6 w-6 shrink-0 rounded-md flex items-center justify-center ${
                          dalamUrutan ? "bg-emerald-600 text-white" : "hover:bg-blue-50 text-slate-400 hover:text-blue-600 border border-slate-200"
                        }`}
                      >
                        {dalamUrutan ? <span className="text-[10px] font-bold">✓</span> : <Plus className="h-3.5 w-3.5" />}
                      </button>
                    </div>
                  );
                })}
              </div>
              {hasilCari.length < totalCocok && (
                <button
                  onClick={() => setBatas((b) => b + BATAS_TAMPIL)}
                  className="text-xs text-blue-700 hover:underline"
                >
                  Tampilkan lebih banyak ({(totalCocok - hasilCari.length).toLocaleString("id-ID")} lagi)
                </button>
              )}
            </div>

            {/* Jenis hasil + warna */}
            <div className="grid grid-cols-1 gap-3">
              <div className="space-y-1.5">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Jenis hasil</p>
                <div className="flex flex-wrap gap-2">
                  <label className={`flex items-start gap-2 rounded-xl border px-3 py-2 cursor-pointer text-xs ${jenis === "closed" ? "border-blue-400 bg-blue-50" : "border-slate-200 hover:bg-slate-50"}`}>
                    <input type="radio" name="jenis-poligon-titik" className="mt-0.5 h-3.5 w-3.5 accent-blue-600" checked={jenis === "closed"} onChange={() => useGis.getState().setJenisPoligonTitik("closed")} />
                    <span><b>Tertutup — poligon</b><span className="block text-slate-500">titik terakhir otomatis tersambung ke titik pertama</span></span>
                  </label>
                  <label className={`flex items-start gap-2 rounded-xl border px-3 py-2 cursor-pointer text-xs ${jenis === "open" ? "border-blue-400 bg-blue-50" : "border-slate-200 hover:bg-slate-50"}`}>
                    <input type="radio" name="jenis-poligon-titik" className="mt-0.5 h-3.5 w-3.5 accent-blue-600" checked={jenis === "open"} onChange={() => useGis.getState().setJenisPoligonTitik("open")} />
                    <span><b>Terbuka — garis</b><span className="block text-slate-500">titik terakhir TIDAK tersambung ke titik pertama</span></span>
                  </label>
                </div>
              </div>
              <div className="space-y-1.5">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Warna</p>
                <div className="flex gap-2">
                  {WARNA.map((w) => (
                    <button
                      key={w}
                      aria-label={`Warna ${w}`}
                      aria-pressed={warna === w}
                      onClick={() => setWarna(w)}
                      className={`h-7 w-7 rounded-full transition-transform ${warna === w ? "ring-2 ring-offset-2 ring-slate-500 scale-110" : "opacity-80"}`}
                      style={{ backgroundColor: w }}
                    />
                  ))}
                </div>
              </div>
            </div>

            <p className="flex items-start gap-2 rounded-xl bg-blue-50 text-blue-900 text-xs px-3 py-2">
              <Info className="h-4 w-4 shrink-0 mt-0.5" />
              <span>
                Pratinjau garis putus-putus tampil di peta mengikuti urutan. Titik dalam urutan ditandai <b>hijau</b>.
                Minimal {minimal} titik untuk hasil {jenis === "closed" ? "poligon" : "garis"}.
              </span>
            </p>
          </div>
        )}

        <DialogFooter className="gap-2">
          <Button variant="outline" className="rounded-xl" onClick={tutup}>
            Batal
          </Button>
          <Button className="rounded-xl" onClick={buat} disabled={!bisaBuat}>
            {memproses ? <Loader2 className="h-4 w-4 animate-spin" /> : <Waypoints className="h-4 w-4" />}
            {jenis === "closed" ? `Buat Poligon (${urutanTitik.length} titik)` : `Buat Garis (${urutanTitik.length} titik)`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
