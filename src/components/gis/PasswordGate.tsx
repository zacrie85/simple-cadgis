"use client";

import { useRef, useState, useSyncExternalStore } from "react";
import { Eye, EyeOff, Lock, ShieldCheck } from "lucide-react";
import { apakahTerbuka, bukaGerbang, verifyPassword } from "@/lib/gis/gate";

/** Snapshot: "awal" = server / pass hidrasi pertama; boolean = hasil baca sessionStorage. */
type Snapshot = boolean | "awal";

function subscribe(onChange: () => void) {
  // sinkron lintas tab (jarang dipakai, tapi murah)
  window.addEventListener("storage", onChange);
  return () => window.removeEventListener("storage", onChange);
}

/**
 * Password Gate — layar kunci yang menutupi seluruh aplikasi sampai
 * password benar dimasukkan. Password default: A$rama33 (lihat lib/gis/gate.ts),
 * dapat diganti setelah masuk lewat menu Setelan › Password.
 */
export default function PasswordGate({ children }: { children: React.ReactNode }) {
  const terbuka = useSyncExternalStore(subscribe, apakahTerbuka, (): Snapshot => "awal");

  const [pwd, setPwd] = useState("");
  const [lihat, setLihat] = useState(false);
  const [salah, setSalah] = useState(false);
  const [goyang, setGoyang] = useState(false);
  const [, setTick] = useState(0); // paksa baca ulang sessionStorage setelah buka/kunci
  const inputRef = useRef<HTMLInputElement>(null);

  const masuk = () => {
    if (verifyPassword(pwd)) {
      bukaGerbang();
      setPwd("");
      setTick((t) => t + 1); // re-render → terbuka terbaca true
    } else {
      setSalah(true);
      setGoyang(true);
      setPwd("");
      setTimeout(() => setGoyang(false), 550);
      setTimeout(() => setSalah(false), 3500);
      inputRef.current?.focus();
    }
  };

  if (terbuka === "awal") return <div className="h-screen w-full bg-slate-50" />;

  if (!terbuka) {
    return (
      <div className="h-screen w-full flex flex-col items-center justify-center bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 px-4 relative overflow-hidden">
        <style>{`@keyframes gateGoyang{0%,100%{transform:translateX(0)}20%{transform:translateX(-9px)}40%{transform:translateX(9px)}60%{transform:translateX(-6px)}80%{transform:translateX(6px)}}`}</style>

        {/* aksen dekoratif halus */}
        <div className="pointer-events-none absolute -top-24 -left-24 h-72 w-72 rounded-full bg-blue-600/10 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-24 -right-16 h-72 w-72 rounded-full bg-cyan-500/10 blur-3xl" />

        <div
          className="w-full max-w-sm rounded-2xl bg-white shadow-2xl p-8 relative"
          style={goyang ? { animation: "gateGoyang .5s ease" } : undefined}
        >
          <div className="flex flex-col items-center text-center">
            <div className="h-16 w-16 rounded-2xl bg-blue-700 flex items-center justify-center shadow-lg shadow-blue-900/30">
              <Lock className="h-8 w-8 text-white" />
            </div>
            <h1 className="mt-4 text-xl font-extrabold tracking-tight text-slate-800">SIMPLE CADGIS</h1>
            <p className="text-xs text-slate-400 mt-1">Aplikasi terkunci — masukkan password untuk melanjutkan</p>
          </div>

          <div className="mt-6">
            <label htmlFor="gate-pwd" className="text-xs font-semibold text-slate-500">
              Password
            </label>
            <div className="relative mt-1">
              <input
                id="gate-pwd"
                ref={inputRef}
                type={lihat ? "text" : "password"}
                value={pwd}
                onChange={(e) => setPwd(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") masuk();
                }}
                autoComplete="current-password"
                placeholder="Password aplikasi"
                className={`w-full h-11 rounded-xl border px-3 pr-10 text-sm outline-none transition-colors ${
                  salah
                    ? "border-red-400 focus:ring-2 focus:ring-red-300"
                    : "border-slate-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                }`}
              />
              <button
                type="button"
                onClick={() => setLihat((v) => !v)}
                title={lihat ? "Sembunyikan password" : "Lihat password"}
                className="absolute right-1.5 top-1/2 -translate-y-1/2 p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100"
              >
                {lihat ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>

            <div className="h-4 mt-2">
              {salah && <p className="text-xs text-red-600 font-medium">Password salah. Coba lagi.</p>}
            </div>

            <button
              onClick={masuk}
              className="mt-1 w-full h-11 rounded-xl bg-blue-700 hover:bg-blue-800 active:bg-blue-900 text-white font-semibold text-sm flex items-center justify-center gap-2 transition-colors"
            >
              <ShieldCheck className="h-4 w-4" /> Masuk
            </button>
          </div>
        </div>

        <p className="relative text-[10px] text-slate-500 mt-6">
          SIMPLE CADGIS — GIS Web • Password dapat diubah di menu Setelan setelah masuk
        </p>
      </div>
    );
  }

  return <>{children}</>;
}
