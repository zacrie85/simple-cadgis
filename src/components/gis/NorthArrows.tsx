"use client";

import type { ReactElement } from "react";

/**
 * Kumpulan logo penunjuk arah utara untuk layout cetak (SVG, ikut tercetak).
 * Semua gaya memakai huruf "U" (Utara) agar konsisten berbahasa Indonesia.
 */

const NAVY = "#1e3a5f";
const NAVY_MUDA = "#3b6ea5";

/** Dua segitiga membentuk satu lengan kompas: sisi kanan solid, sisi kiri putih bergaris. */
function Lengan({
  deg,
  panjang,
  lebar,
  pusatX = 50,
  pusatY = 50,
  warna,
}: {
  deg: number;
  panjang: number;
  lebar: number;
  pusatX?: number;
  pusatY?: number;
  warna: string;
}) {
  const a = (deg * Math.PI) / 180;
  const dx = Math.sin(a);
  const dy = -Math.cos(a);
  const px = Math.cos(a);
  const py = Math.sin(a);
  const tx = pusatX + panjang * dx;
  const ty = pusatY + panjang * dy;
  const b1x = pusatX + lebar * px;
  const b1y = pusatY + lebar * py;
  const b2x = pusatX - lebar * px;
  const b2y = pusatY - lebar * py;
  return (
    <g>
      <polygon points={`${tx},${ty} ${b1x},${b1y} ${pusatX},${pusatY}`} fill={warna} />
      <polygon
        points={`${tx},${ty} ${b2x},${b2y} ${pusatX},${pusatY}`}
        fill="#ffffff"
        stroke={warna}
        strokeWidth={0.7}
      />
    </g>
  );
}

/** Gaya 1 — Kompas: cincin derajat, bintang 8 arah, jarum merah-biru (ref gambar user). */
export function UtaraKompas({ className }: { className?: string }) {
  const ticks: ReactElement[] = [];
  for (let i = 0; i < 72; i++) {
    const a = (i * 5 * Math.PI) / 180;
    const sin = Math.sin(a);
    const cos = Math.cos(a);
    const utama = i % 9 === 0;
    const r1 = utama ? 39.6 : 41.6;
    ticks.push(
      <line
        key={i}
        x1={50 + r1 * sin}
        y1={50 - r1 * cos}
        x2={50 + 44.4 * sin}
        y2={50 - 44.4 * cos}
        stroke={NAVY}
        strokeWidth={utama ? 1.3 : 0.55}
      />
    );
  }
  return (
    <svg viewBox="0 0 100 100" className={className} role="img" aria-label="Logo utara gaya kompas">
      <circle cx={50} cy={50} r={46.5} fill="#ffffff" fillOpacity={0.9} stroke={NAVY} strokeWidth={1.2} />
      <g>{ticks}</g>
      <circle cx={50} cy={50} r={27} fill="none" stroke={NAVY} strokeWidth={0.9} strokeDasharray="3 2.4" />
      <circle cx={50} cy={50} r={10.5} fill="none" stroke={NAVY} strokeWidth={0.8} />
      <circle cx={50} cy={50} r={7.2} fill="none" stroke={NAVY} strokeWidth={0.5} />
      {[45, 135, 225, 315].map((d) => (
        <Lengan key={d} deg={d} panjang={24} lebar={4.6} warna={NAVY_MUDA} />
      ))}
      {[0, 90, 180, 270].map((d) => (
        <Lengan key={d} deg={d} panjang={35} lebar={6.2} warna={NAVY} />
      ))}
      {/* jarum utara-selatan */}
      <polygon points="50,17 53,50 47,50" fill="#c62828" stroke="#7f1d1d" strokeWidth={0.4} />
      <polygon points="50,83 53,50 47,50" fill="#00838f" stroke="#155e63" strokeWidth={0.4} />
      <circle cx={50} cy={50} r={3} fill="#ffffff" stroke={NAVY} strokeWidth={1.1} />
      <circle cx={50} cy={50} r={1.1} fill={NAVY} />
      <text x={50} y={9.5} textAnchor="middle" fontSize={10.5} fontWeight={700} fill={NAVY}>
        U
      </text>
      <text x={50} y={97.5} textAnchor="middle" fontSize={9} fontWeight={700} fill={NAVY}>
        S
      </text>
      <text x={5.5} y={53.5} textAnchor="middle" fontSize={9} fontWeight={700} fill={NAVY}>
        B
      </text>
      <text x={94.5} y={53.5} textAnchor="middle" fontSize={9} fontWeight={700} fill={NAVY}>
        T
      </text>
    </svg>
  );
}

/** Gaya 2 — Bintang: rose hitam-putih klasik 8 arah dengan cincin (ref gambar user). */
export function UtaraBintang({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 100 100" className={className} role="img" aria-label="Logo utara gaya bintang klasik">
      <circle cx={50} cy={50} r={41} fill="#ffffff" fillOpacity={0.9} stroke="#111111" strokeWidth={1.1} />
      <circle cx={50} cy={50} r={37.5} fill="none" stroke="#9ca3af" strokeWidth={0.5} strokeDasharray="1.6 1.6" />
      {[45, 135, 225, 315].map((d) => (
        <Lengan key={d} deg={d} panjang={26} lebar={4.8} warna="#111111" />
      ))}
      {[0, 90, 180, 270].map((d) => (
        <Lengan key={d} deg={d} panjang={42.5} lebar={6.6} warna="#111111" />
      ))}
      <circle cx={50} cy={50} r={2.6} fill="#111111" />
      <circle cx={50} cy={50} r={1} fill="#ffffff" />
      <text x={50} y={7} textAnchor="middle" fontSize={11} fontWeight={800} fill="#111111">
        U
      </text>
      <text x={50} y={98.5} textAnchor="middle" fontSize={9.5} fontWeight={800} fill="#111111">
        S
      </text>
      <text x={4.5} y={53.5} textAnchor="middle" fontSize={9.5} fontWeight={800} fill="#111111">
        B
      </text>
      <text x={95.5} y={53.5} textAnchor="middle" fontSize={9.5} fontWeight={800} fill="#111111">
        T
      </text>
    </svg>
  );
}

/** Gaya 3 — Panah: minimal modern ala ArcGIS (setengah solid, setengah garis). */
export function UtaraPanah({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 60 92" className={className} role="img" aria-label="Logo utara gaya panah modern">
      <text x={30} y={15} textAnchor="middle" fontSize={17} fontWeight={800} fill="#111111">
        U
      </text>
      <polygon points="30,20 46,58 30,66" fill="#111111" />
      <polygon points="30,20 14,58 30,66" fill="#ffffff" stroke="#111111" strokeWidth={1.6} />
      <line x1={19} y1={72} x2={41} y2={72} stroke="#111111" strokeWidth={2.6} strokeLinecap="round" />
    </svg>
  );
}

/** Gaya 4 — Klasik: panah teks sederhana (tampilan bawaan GeoKita sebelumnya). */
export function UtaraKlasik({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 58" className={className} role="img" aria-label="Logo utara klasik">
      <text x={20} y={36} textAnchor="middle" fontSize={36} fontWeight={700} fill="#0f172a">
        ↑
      </text>
      <text x={20} y={55} textAnchor="middle" fontSize={16} fontWeight={800} fill="#0f172a">
        U
      </text>
    </svg>
  );
}

export type GayaUtaraId = "kompas" | "bintang" | "panah" | "klasik";

export const GAYA_UTARA: { id: GayaUtaraId; label: string; Comp: (p: { className?: string }) => ReactElement }[] = [
  { id: "kompas", label: "Kompas", Comp: UtaraKompas },
  { id: "bintang", label: "Bintang klasik", Comp: UtaraBintang },
  { id: "panah", label: "Panah modern", Comp: UtaraPanah },
  { id: "klasik", label: "Klasik", Comp: UtaraKlasik },
];
