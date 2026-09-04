#!/usr/bin/env python3
"""Siapkan aset uji gambar+world file & hitung posisi harapan (Task 46).

1. Verifikasi file asli user (upload/tes.tif = PNG 693x480 + tes.tfw UTM) —
   hitung batas WGS84 yang diharapkan utk beberapa zona UTM.
2. Buat pasangan uji KOORDINAT DERAJAT: uji-derajat.png + uji-derajat.pgw
   (WGS84, sekitar Monas Jakarta) → harus terimpor otomatis tanpa zona picker.
"""
import struct, zlib, math
from pathlib import Path

SCRIPTS = Path(__file__).parent

# ---------- 1. verifikasi file user ----------
A = 0.14843183406946
D = -0.00056259350214
B = -0.00056259350214
E = -0.14843183406946
C = 700157.61679833900000
F = 9239054.96948080000000
W, H = 693, 480

kolom = [-0.5, W - 0.5]
baris = [-0.5, H - 0.5]
sudut = []
for r in baris:
    for c in kolom:
        sudut.append((C + A * c + D * r, F + B * c + E * r))
xs = [p[0] for p in sudut]
ys = [p[1] for p in sudut]
print(f"Batas CRS sumber: X {min(xs):.3f}..{max(xs):.3f}  Y {min(ys):.3f}..{max(ys):.3f}")

try:
    from pyproj import Transformer
    for zona, sisi in [(47, True), (48, True), (49, True)]:
        tr = Transformer.from_crs(
            f"+proj=utm +zone={zona} {'+south ' if sisi else ''}+datum=WGS84 +units=m +no_defs",
            "EPSG:4326", always_xy=True)
        lon_min, lat_min = tr.transform(min(xs), min(ys))
        lon_max, lat_max = tr.transform(max(xs), max(ys))
        print(f"UTM {zona}{'S' if sisi else 'N'}: lat {lat_min:.6f}..{lat_max:.6f}  lon {lon_min:.6f}..{lon_max:.6f}")
except ImportError:
    print("pyproj tidak ada — lewati perhitungan WGS84")

# ---------- 2. PNG derajat sederhana (Tanah Kusir, Jakarta Selatan) ----------
def png_minimal(lebar, tinggi, rgb):
    def chunk(tipe, data):
        c = tipe + data
        return struct.pack(">I", len(data)) + c + struct.pack(">I", zlib.crc32(c) & 0xFFFFFFFF)
    ihdr = struct.pack(">IIBBBBB", lebar, tinggi, 8, 2, 0, 0, 0)
    raw = b"".join(b"\x00" + bytes(rgb) * lebar for _ in range(tinggi))
    return (b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", ihdr)
            + chunk(b"IDAT", zlib.compress(raw)) + chunk(b"IEND", b""))

# resolusi ~0.5 m/piksel? tidak — derajat: 500 px x 300 px, 3.6e-6 derajat/px (±0.4 m)
gambar = png_minimal(500, 300, (200, 90, 60))
(SCRIPTS / "uji-derajat.png").write_bytes(gambar)

# pojok kiri-atas pusat piksel: lon 106.80000, lat -6.20000
pgw = "\n".join([
    f"{3.6e-6:.10f}", "0.0000000000", "0.0000000000", f"{-3.6e-6:.10f}",
    "106.8000000000", "-6.2000000000",
])
(SCRIPTS / "uji-derajat.pgw").write_text(pgw, encoding="ascii")

batas_timur = 106.8 + 3.6e-6 * 500
batas_selatan = -6.2 - 3.6e-6 * 300
print(f"uji-derajat: lat {batas_selatan:.7f}..-6.2000000  lon 106.8000000..{batas_timur:.7f}")
print("Aset uji siap: scripts/uji-derajat.png + uji-derajat.pgw (+ file user di scripts/uji-gambar-renamed.*)")
