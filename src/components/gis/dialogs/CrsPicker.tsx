"use client";

/**
 * Pemilih sistem koordinat (CRS) bersama — dipakai menu Konversi, Impor, dan Ekspor.
 * Kategori: WGS84 derajat / DMS teks / MGRS / UTM (zona+hemisfer) / Web Mercator / EPSG (online+cache).
 */

import { useMemo, useState } from "react";
import {
  CRS_DMS,
  CRS_MERCATOR,
  CRS_MGRS,
  CRS_WGS84,
  ambilCrsEpsg,
  crsUtm,
  daftarEpsgTersimpan,
  type CrsPilihan,
} from "@/lib/gis/crs";

type Kategori = "wgs84" | "dms" | "mgrs" | "utm" | "mercator" | "epsg";

function kategoriDari(crs: CrsPilihan | null): Kategori {
  if (!crs) return "wgs84";
  if (crs.id === "wgs84") return "wgs84";
  if (crs.id === "dms") return "dms";
  if (crs.id === "mgrs") return "mgrs";
  if (crs.id === "epsg:3857") return "mercator";
  if (crs.id.startsWith("utm:")) return "utm";
  return "epsg";
}

interface Props {
  label: string;
  nilai: CrsPilihan | null; // null = WGS84 derajat (default)
  onChange: (crs: CrsPilihan | null) => void;
  /** sembunyikan pilihan teks (DMS/MGRS) — utk konteks angka murni seperti ekspor SHP */
  tanpaTeks?: boolean;
  /** default zona & hemisfer UTM (mis. hasil deteksi impor) */
  utmAwal?: { zona: number; hemi: "N" | "S" };
}

export default function CrsPicker({ label, nilai, onChange, tanpaTeks = false, utmAwal }: Props) {
  const [kategori, setKategori] = useState<Kategori>(kategoriDari(nilai));
  const [zona, setZona] = useState(utmAwal?.zona ?? 49);
  const [hemi, setHemi] = useState<"N" | "S">(utmAwal?.hemi ?? "S");
  const [kodeEpsg, setKodeEpsg] = useState("");
  const [statusEpsg, setStatusEpsg] = useState("");
  const [muatEpsg, setMuatEpsg] = useState(false);
  const [versiTersimpan, setVersiTersimpan] = useState(0);

  const tersimpan = useMemo(() => daftarEpsgTersimpan(), [versiTersimpan]);

  const kategoriSaatIni = kategoriDari(nilai);
  const kategoriAktif = kategoriSaatIni === kategori ? kategoriSaatIni : kategori;

  const pilih = (k: Kategori) => {
    setKategori(k);
    setStatusEpsg("");
    if (k === "wgs84") onChange(CRS_WGS84);
    else if (k === "dms") onChange(CRS_DMS);
    else if (k === "mgrs") onChange(CRS_MGRS);
    else if (k === "mercator") onChange(CRS_MERCATOR);
    else if (k === "utm") onChange(crsUtm(zona, hemi));
    // epsg: tunggu user isi kode / pilih tersimpan
  };

  const gantiUtm = (z: number, h: "N" | "S") => {
    setZona(z);
    setHemi(h);
    if (kategoriAktif === "utm") onChange(crsUtm(z, h));
  };

  const cariEpsg = async () => {
    const kode = parseInt(kodeEpsg.replace(/\D/g, ""), 10);
    if (!isFinite(kode) || kode <= 0) {
      setStatusEpsg("Isi kode EPSG angka, mis. 23830");
      return;
    }
    setMuatEpsg(true);
    setStatusEpsg("Mengambil definisi dari epsg.io…");
    try {
      const crs = await ambilCrsEpsg(kode);
      setVersiTersimpan((v) => v + 1);
      onChange(crs);
      setStatusEpsg(`Berhasil: ${crs.label} — tersimpan di perangkat (bisa offline).`);
    } catch (e) {
      setStatusEpsg(e instanceof Error ? e.message : "Gagal mengambil — cek internet.");
    } finally {
      setMuatEpsg(false);
    }
  };

  const clsSelect =
    "w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm outline-none focus:border-blue-400";
  const clsInput =
    "rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm outline-none focus:border-blue-400";

  return (
    <div className="space-y-1.5">
      <label className="text-xs font-semibold text-slate-600">{label}</label>
      <select
        value={kategoriAktif}
        onChange={(e) => pilih(e.target.value as Kategori)}
        className={clsSelect}
        aria-label={`${label} — kategori sistem koordinat`}
      >
        <option value="wgs84">Geografis WGS84 — derajat (lat, lng)</option>
        {!tanpaTeks && <option value="dms">Derajat-Menit-Detik — teks (6°59&apos;30&quot;LS)</option>}
        {!tanpaTeks && <option value="mgrs">MGRS — Military Grid (48MUP…)</option>}
        <option value="utm">UTM WGS84 — pilih zona (meter)</option>
        <option value="mercator">Web Mercator EPSG:3857 — meter</option>
        <option value="epsg">EPSG lain — isi kode (online: TM-3, RSO, dll)</option>
      </select>

      {kategoriAktif === "utm" && (
        <div className="flex gap-2 items-center">
          <select
            value={zona}
            onChange={(e) => gantiUtm(parseInt(e.target.value, 10), hemi)}
            className={`${clsSelect} max-w-[130px]`}
            aria-label="Zona UTM"
          >
            {Array.from({ length: 60 }, (_, i) => i + 1).map((z) => (
              <option key={z} value={z}>
                Zona {z}
              </option>
            ))}
          </select>
          <div className="flex gap-2 text-sm">
            {(["N", "S"] as const).map((h) => (
              <label key={h} className="flex items-center gap-1">
                <input type="radio" checked={hemi === h} onChange={() => gantiUtm(zona, h)} />
                {h}
              </label>
            ))}
          </div>
          <span className="text-[10px] text-slate-400">Indonesia = zona 46–54, hemisfer S</span>
        </div>
      )}

      {kategoriAktif === "epsg" && (
        <div className="space-y-1.5 rounded-lg bg-sky-50 border border-sky-200 p-2">
          <div className="flex gap-2">
            <input
              value={kodeEpsg}
              onChange={(e) => setKodeEpsg(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && cariEpsg()}
              placeholder="Kode EPSG, mis. 23830 (TM-3 DGN95)"
              aria-label="Kode EPSG"
              inputMode="numeric"
              className={`${clsInput} flex-1 min-w-0`}
            />
            <button
              onClick={cariEpsg}
              disabled={muatEpsg}
              className="rounded-lg bg-sky-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-sky-700 disabled:opacity-50 whitespace-nowrap"
            >
              {muatEpsg ? "Mengambil…" : "Ambil"}
            </button>
          </div>
          {statusEpsg && <p className="text-[11px] text-sky-800">{statusEpsg}</p>}
          {tersimpan.length > 0 && (
            <div className="flex gap-2 items-center">
              <span className="text-[10px] text-slate-500 shrink-0">Tersimpan:</span>
              <select
                className={`${clsSelect} text-xs`}
                aria-label="CRS EPSG tersimpan di perangkat"
                onChange={(e) => {
                  const c = tersimpan.find((x) => x.id === e.target.value);
                  if (c) onChange(c);
                }}
                value=""
              >
                <option value="">— pilih CRS tersimpan ({tersimpan.length}) —</option>
                {tersimpan.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>
          )}
          <p className="text-[10px] text-sky-700/80">
            Pendefinisian diambil dari epsg.io lalu di-cache — sekali ambil, bisa dipakai offline.
          </p>
        </div>
      )}

      {nilai && (
        <p className="text-[11px] text-emerald-700">
          Aktif: <b>{nilai.label}</b> {nilai.def ? "• proyeksi proj4 aktif" : ""}
        </p>
      )}
    </div>
  );
}
