"use client";

import { useMemo, useState } from "react";
import { LocateFixed, Navigation, Crosshair, CheckCheck, Search } from "lucide-react";
import { toast } from "sonner";
import { useGis } from "@/lib/gis/store";
import { FloatingWindow } from "../Chips";
import { fmtMeter, jarakHaversine, parseKolomKoordinat } from "@/lib/gis/geo";

/** Hasil pencarian titik terdekat. */
interface Hasil {
  id: string;
  jarak: number;
}

/** Menu ANALISIS › Titik Terdekat:
 *  isi 1 koordinat + radius (meter) → daftar semua titik proyek di dalam radius,
 *  terurut dari yang terdekat. Klik hasil = zoom + pilih di peta. */
export default function TitikTerdekatDialog() {
  const buka = useGis((s) => s.dialogs.titikTerdekat);
  const setDialog = useGis((s) => s.setDialog);
  const points = useGis((s) => s.points);
  const layers = useGis((s) => s.layers);

  const [koordinat, setKoordinat] = useState("");
  const [radius, setRadius] = useState("500");
  const [cariNonce, setCariNonce] = useState(0); // tekan Cari → hitung ulang
  const [pakaiRadius, setPakaiRadius] = useState<number | null>(null);

  // nama layer lookup
  const namaLayer = useMemo(() => {
    const m = new Map<string, string>();
    layers.forEach((l) => m.set(l.id, l.nama));
    return m;
  }, [layers]);

  const pusat = parseKolomKoordinat(koordinat);
  const radiusN = parseFloat(radius.replace(",", "."));

  const hasil: Hasil[] = useMemo(() => {
    if (cariNonce === 0 || !pusat || !(pakaiRadius && pakaiRadius > 0)) return [];
    const daftar: Hasil[] = [];
    for (const p of points) {
      const d = jarakHaversine(pusat, { lat: p.lat, lng: p.lng });
      if (d <= pakaiRadius) daftar.push({ id: p.id, jarak: d });
    }
    daftar.sort((a, b) => a.jarak - b.jarak);
    return daftar;
  }, [cariNonce, pusat, pakaiRadius, points]);

  // titik terdekat global (di luar radius) — petunjuk bila hasil kosong
  const terdekatGlobal = useMemo(() => {
    if (!pusat || points.length === 0) return null;
    let terbaik: { id: string; jarak: number } | null = null;
    for (const p of points) {
      const d = jarakHaversine(pusat, { lat: p.lat, lng: p.lng });
      if (!terbaik || d < terbaik.jarak) terbaik = { id: p.id, jarak: d };
    }
    return terbaik;
  }, [pusat, points, cariNonce]);

  if (!buka) return null;

  const infoTitik = (id: string) => points.find((p) => p.id === id);

  const jalankanCari = () => {
    if (!pusat) {
      toast.error("Koordinat belum benar", {
        description: "Format: lat, lng — contoh: -6.994292, 110.429400 (boleh juga 6°51'39\"LS, 107°36' di Konversi dulu).",
      });
      return;
    }
    const r = parseFloat(radius.replace(",", "."));
    if (!(r > 0)) {
      toast.error("Radius belum benar", { description: "Isi radius pencarian dalam meter, contoh: 500" });
      return;
    }
    if (points.length === 0) {
      toast.info("Belum ada titik di proyek", { description: "Impor Excel/KMZ/GPX atau buat titik dulu di peta." });
      return;
    }
    setPakaiRadius(r);
    setCariNonce((n) => n + 1);
  };

  const ambilDariPeta = () => {
    const v = useGis.getState().mapView;
    setKoordinat(`${v.lat.toFixed(6)}, ${v.lng.toFixed(6)}`);
    toast.info("Koordinat pusat tampilan dipakai", { description: `${v.lat.toFixed(6)}, ${v.lng.toFixed(6)}` });
  };

  const pilihSemua = () => {
    if (hasil.length === 0) return;
    useGis.getState().setSelection(hasil.map((h) => h.id));
    toast.success(`${hasil.length} titik hasil pencarian terpilih`, {
      description: "Bisa langsung dihapus, diberi ikon, ditandai label, atau disalin.",
    });
  };

  const zoomKe = (id: string) => {
    const p = infoTitik(id);
    if (!p) return;
    const st = useGis.getState();
    st.flyTo(p.lat, p.lng, 17);
    st.setSelection([id]);
  };

  return (
    <FloatingWindow judul="Titik Terdekat" onClose={() => setDialog("titikTerdekat", false)} lebar="!w-[34rem] !max-w-none">
      <div className="space-y-3 text-sm">
        <p className="text-xs text-slate-500">
          Cari titik-titik yang berada di sekitar sebuah koordinat — dalam radius meter yang kamu tentukan.
          Hasil diurutkan dari yang terdekat.
        </p>

        {/* Baris 1: koordinat */}
        <div>
          <label className="text-xs font-semibold text-slate-600" htmlFor="tt-koordinat">
            1. Koordinat pusat pencarian (lat, lng)
          </label>
          <div className="mt-1 flex gap-1.5">
            <input
              id="tt-koordinat"
              value={koordinat}
              onChange={(e) => setKoordinat(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && jalankanCari()}
              placeholder="contoh: -6.994292, 110.429400"
              className={`min-w-0 flex-1 rounded-lg border px-2.5 py-2 font-mono text-xs outline-none focus:ring-2 focus:ring-blue-500 ${
                koordinat.trim() && !pusat ? "border-red-400 bg-red-50" : "border-slate-300 focus:border-blue-400"
              }`}
            />
            <button
              onClick={ambilDariPeta}
              title="Isi dengan koordinat pusat tampilan peta saat ini"
              className="flex shrink-0 items-center gap-1 rounded-lg bg-slate-100 px-2.5 py-2 text-xs font-medium text-slate-600 hover:bg-slate-200"
            >
              <Crosshair className="h-3.5 w-3.5" />
              Peta
            </button>
          </div>
          {points.length > 0 && (
            <select
              value=""
              aria-label="Salin koordinat dari titik yang ada"
              onChange={(e) => {
                const p = points.find((x) => x.id === e.target.value);
                if (p) setKoordinat(`${p.lat.toFixed(6)}, ${p.lng.toFixed(6)}`);
              }}
              className="mt-1.5 w-full rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5 text-[11px] text-slate-600 outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">…atau salin koordinat dari titik yang sudah ada ({points.length.toLocaleString("id-ID")} titik)</option>
              {points.slice(0, 500).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.title || "Tanpa nama"} — {p.lat.toFixed(6)}, {p.lng.toFixed(6)}
                </option>
              ))}
            </select>
          )}
          {koordinat.trim() && !pusat && (
            <p className="mt-1 text-[11px] text-red-600">
              Format belum dikenali — pakai &quot;lat, lng&quot; desimal, mis. <b>-6.994292, 110.429400</b>
            </p>
          )}
        </div>

        {/* Baris 2: radius */}
        <div>
          <label className="text-xs font-semibold text-slate-600" htmlFor="tt-radius">
            2. Radius pencarian (meter)
          </label>
          <div className="mt-1 flex items-center gap-2">
            <input
              id="tt-radius"
              value={radius}
              onChange={(e) => setRadius(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && jalankanCari()}
              inputMode="decimal"
              placeholder="contoh: 500"
              className="w-40 rounded-lg border border-slate-300 px-2.5 py-2 text-xs outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-500"
            />
            <span className="text-xs text-slate-400">meter</span>
            <div className="ml-auto flex flex-wrap gap-1">
              {[100, 250, 500, 1000, 2000].map((r) => (
                <button
                  key={r}
                  onClick={() => setRadius(String(r))}
                  className={`rounded-md px-1.5 py-0.5 text-[10px] ${
                    radius === String(r) ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-blue-100"
                  }`}
                >
                  {r >= 1000 ? `${r / 1000} km` : `${r} m`}
                </button>
              ))}
            </div>
          </div>
        </div>

        <button
          onClick={jalankanCari}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 py-2 text-sm font-semibold text-white hover:bg-blue-700"
        >
          <Search className="h-4 w-4" />
          Cari Titik Terdekat
        </button>

        {/* Hasil */}
        {cariNonce > 0 && (
          <div className="rounded-xl border border-slate-200">
            <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50 px-3 py-2">
              <span className="text-xs font-semibold text-slate-700">
                {hasil.length > 0
                  ? `${hasil.length.toLocaleString("id-ID")} titik dalam radius ${pakaiRadius?.toLocaleString("id-ID")} m`
                  : "Tidak ada titik dalam radius"}
              </span>
              {hasil.length > 0 && (
                <button
                  onClick={pilihSemua}
                  className="flex items-center gap-1 rounded-lg bg-emerald-600 px-2 py-1 text-[10px] font-semibold text-white hover:bg-emerald-700"
                >
                  <CheckCheck className="h-3 w-3" />
                  Pilih Semua
                </button>
              )}
            </div>
            {hasil.length > 0 ? (
              <div className="max-h-72 overflow-y-auto scrollbar-halus divide-y divide-slate-100">
                {hasil.slice(0, 300).map((h, i) => {
                  const p = infoTitik(h.id);
                  if (!p) return null;
                  return (
                    <button
                      key={h.id}
                      onClick={() => zoomKe(h.id)}
                      className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-blue-50"
                      title="Klik untuk zoom & pilih titik ini di peta"
                    >
                      <span
                        className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${
                          i === 0 ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-500"
                        }`}
                      >
                        {i + 1}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-1.5">
                          <b className="truncate text-xs text-slate-800">{p.title || "Tanpa nama"}</b>
                          {i === 0 && (
                            <span className="shrink-0 rounded-full bg-blue-100 px-1.5 text-[9px] font-bold text-blue-700">
                              TERDEKAT
                            </span>
                          )}
                        </span>
                        <span className="block truncate text-[10px] text-slate-400">
                          {p.lat.toFixed(6)}, {p.lng.toFixed(6)}
                          {p.elevation != null ? ` • ${p.elevation} m` : ""}
                          {p.layerId && namaLayer.get(p.layerId) ? ` • ${namaLayer.get(p.layerId)}` : ""}
                        </span>
                      </span>
                      <span className="flex shrink-0 items-center gap-1 text-xs font-semibold text-blue-700">
                        <Navigation className="h-3 w-3" />
                        {fmtMeter(h.jarak)}
                      </span>
                    </button>
                  );
                })}
                {hasil.length > 300 && (
                  <p className="px-3 py-1.5 text-[10px] text-slate-400">
                    Menampilkan 300 terdekat dari {hasil.length.toLocaleString("id-ID")} titik.
                  </p>
                )}
              </div>
            ) : (
              <div className="px-3 py-3 text-xs text-slate-500">
                Tidak ada titik dalam radius {pakaiRadius?.toLocaleString("id-ID")} m.
                {terdekatGlobal && (
                  <>
                    {" "}
                    Titik terdekat ada di{" "}
                    <b className="text-slate-700">{fmtMeter(terdekatGlobal.jarak)}</b> — coba perbesar radius minimal
                    ke {" "}
                    <button
                      onClick={() => setRadius(String(Math.ceil(terdekatGlobal.jarak)))}
                      className="font-semibold text-blue-600 underline"
                    >
                      {Math.ceil(terdekatGlobal.jarak).toLocaleString("id-ID")} m
                    </button>
                    .
                  </>
                )}
              </div>
            )}
          </div>
        )}

        <p className="text-[10px] text-slate-400">
          Jarak dihitung garis lurus permukaan bumi (haversine, WGS84) dari koordinat yang diisi ke setiap titik
          proyek — termasuk titik hasil impor Excel/GPX/KMZ/DXF. Klik hasil untuk terbang ke titiknya; klik
          &quot;Pilih Semua&quot; untuk memblok semua hasil sekaligus.
        </p>
      </div>
    </FloatingWindow>
  );
}
