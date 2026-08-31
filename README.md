# SIMPLE CADGIS 🗺️ — GIS Web & Desktop Sederhana (ArcGIS + AutoCAD + Surfer ringkas)

Aplikasi pemetaan **100% client-side** dengan seluruh tombol di **satu panel atas** (tanpa panel samping/bawah). Peta memenuhi layar. Tersedia 2 cara pakai di PC: **installer Windows (.exe)** dan **PWA** (install dari browser).

![Teknologi](https://img.shields.io/badge/Next.js%2016-React%2019-blue) ![Peta](https://img.shields.io/badge/Leaflet-OSM%20%2B%20Satelit-green)

## ✨ Fitur

| Menu | Fungsi |
|------|--------|
| **Impor** | Excel (.xlsx), CSV, KML, KMZ hingga **250 MB** — diproses **streaming per-chunk di Web Worker** dengan progress bar sehingga aplikasi tidak hang. Pilih kolom koordinat manual (mendukung format `(-6.994292,110.429400)` dalam 1 kolom, atau kolom lat/lng terpisah) + kolom elevasi opsional. |
| **Tabel** | Tabel atribut ala ArcGIS: cari, pilih (centang), edit, hapus, filter *"titik di dalam poligon"*, dan lompat ke titik. |
| **Titik** | Klik peta → isi **judul, deskripsi, foto**, dan elevasi. Klik titik di peta → popup lengkap + tombol **Edit**. |
| **Bentuk** | Poligon **tertutup**, garis terbuka, **Bulatan**, **Elips**, dan **Lengkung kiri/kanan** (busur setengah lingkaran). **Edit Bentuk ala AutoCAD**: seret titik untuk memindahkan, seret bulat biru di tengah ruas untuk **melengkungkan garis lurus**, Alt+klik hapus titik. |
| **Poligon / Garis** | Gambar poligon **tertutup** atau **terbuka** dengan tombol **Selesai** (tertutup: titik akhir otomatis menyambung ke titik pertama; terbuka: tidak). |
| **Teks** | Label teks di atas titik/poligon/area kosong — bisa diedit dengan klik. |
| **Ukur** | Jarak 2 titik atau **multi-titik** (tiap segmen + total, satuan m/km). |
| **Kontur** | Interpolasi IDW + marching squares. Interval **manual 1/3/5/7/10/30/50/70/100 m** atau nilai bebas, atau **otomatis**. Garis kontur berlabel elevasi (m). |
| **3D** | Visualisasi kontur + permukaan (surface) 3 dimensi yang bisa diputar/zoom (three.js). |
| **Volume** | **Cut & Fill** dan **Overburden** (m³) di dalam poligon vs elevasi rencana/seam — hasil bisa disimpan ke deskripsi poligon. |
| **Ekspor** | Titik / Polygon-Garis / Tabel → **KMZ, Excel, SHP (.zip berisi .shp+.shx+.dbf+.prj)** — pilih *semua* atau *terpilih saja*. |
| **Layout** | Editor layout cetak ala ArcGIS: judul, bingkai, panah utara (4 gaya), skala cetak 1:n, basemap OSM/Satelit/Putih, **legenda** (ukuran manual + tulisan kustom sendiri), **foto** di dalam layout, orientasi A4 lanskap/potret → **Cetak / Simpan PDF**. |
| **Label** | Mode tampil nama titik/poligon/garis: **Semua / Terpilih / Sembunyi**. Tandai per fitur lewat tombol 🏷 di popup, centang di dialog edit, atau blok lalu **Tandai**. Mode label ikut ke **Google Earth** saat ekspor KMZ/KML (LabelStyle). |
| **Peta** | Basemap **OpenStreetMap ↔ Satelit (Esri World Imagery)** bergantian satu klik. |
| **Demo** | Tombol *Demo* memuat 25 titik elevasi + poligon contoh untuk langsung mencoba Kontur, 3D, dan Volume. |

## 🚀 Menjalankan di PC (lokal)

```bash
bun install      # atau: npm install
bun run dev      # buka http://localhost:3000
```

## 📦 Build produksi (folder `out/` siap hosting statis)

```bash
bun run build    # hasil di folder out/
npx serve out    # tes hasil build secara lokal
```

## 🌍 Posting ke GitHub Pages

1. Push repo ini ke GitHub.
2. Jika repo berada di sub-path (`username.github.io/nama-repo`), buka `next.config.ts` lalu aktifkan:
   ```ts
   basePath: "/nama-repo",
   ```
3. Workflow `.github/workflows/deploy.yml` sudah disediakan — setiap push ke `main` akan otomatis mem-build dan men-deploy ke **GitHub Pages** (aktifkan *Settings → Pages → Source: GitHub Actions*).

## 💻 Install di PC — Installer Windows (.exe)

1. Buka halaman **Releases** repo ini (kanan → *Releases*).
2. Download **SIMPLE-CADGIS-Setup-1.1.0.exe**.
3. Jalankan → pilih folder tujuan → **Next**. Shortcut **SIMPLE CADGIS** otomatis muncul di desktop.

> Installer dibangun otomatis oleh GitHub Actions setiap ada tag baru (mis. `v1.0.0`) — lihat `.github/workflows/build-desktop.yml`. Membangun sendiri secara lokal: `bun install && bun run build && bun run dist:win`.

## 🌐 Install di PC — PWA (lewat browser)

Setelah aplikasi online (GitHub Pages / hosting lain):
- **Chrome/Edge desktop**: klik ikon **install (⬇)** di address bar → aplikasi terpasang seperti software biasa.
- Berjalan offline untuk shell aplikasi berkat service worker (tile peta tetap butuh internet).

## 🧰 Teknologi

Next.js 16 (static export) · React 19 · TypeScript · Tailwind CSS 4 · Leaflet (OSM + Esri Satellite) · fflate (streaming unzip/zip) · Web Worker (parser streaming XLSX/KML/KMZ) · d3-contour (marching squares) + IDW · three.js (3D) · SheetJS (Excel) · Penulis Shapefile bawaan (SHP/SHX/DBF/PRJ) · **Electron + electron-builder (installer Windows)**.

## ⚠️ Catatan

- Batas aman pembacaan: ±300.000 baris Excel / 50.000 fitur KML per file (melindungi memori browser).
- `z` nilai XLSX bertipe tanggal dibaca sebagai angka serial — gunakan kolom angka biasa untuk koordinat/elevasi.
- SHP diekspor dalam proyeksi WGS 84 (EPSG:4326).
