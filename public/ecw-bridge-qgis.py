# -*- coding: utf-8 -*-
# =========================================================================
#  ECW BRIDGE untuk SIMPLE CADGIS  —  v1.0 (2026)
#
#  Jembatan konversi .ecw / .jp2  →  GeoTIFF (.tif) siap impor ke
#  SIMPLE CADGIS (Berkas → Raster).
#
#  CARA PAKAI (QGIS 3.x — gratis, unduh di https://qgis.org):
#   1. Buka QGIS
#   2. Menu Plugins → Python Console
#   3. Klik tombol "Show Editor" (ikon buku catatan)
#   4. Klik "Open Script" (ikon folder) → pilih file ini
#   5. Klik "Run Script" (ikon segitiga ▶)
#   6. Pilih satu atau lebih file .ecw → pilih folder hasil → selesai!
#      File .tif hasilnya langsung bisa diimpor ke SIMPLE CADGIS.
#
#  KENAPA LEWAT QGIS?
#  ECW adalah format proprietary (ERDAS/Hexagon). Dekoder resminya
#  hanya boleh di-bundle di aplikasi desktop — dan installer QGIS
#  Windows sudah menyertakannya dengan lisensi gratis untuk pemakaian
#  desktop. Browser/web tidak boleh dan tidak bisa membaca ECW,
#  jadi konversi sekali ini adalah jalan resmi yang legal.
#
#  HASIL KONVERSI:
#  - GeoTIFF kompresi DEFLATE (lossless — mutu citra tidak turun)
#  - Ter-tile + piramida overview → tampil cepat walau file besar
#  - Georeferensi & proyeksi (CRS) ikut utuh — overlay di SIMPLE
#    CADGIS tetap presisi
#  - Bisa batch: pilih banyak file sekaligus
# =========================================================================

from qgis.PyQt.QtWidgets import QFileDialog, QMessageBox
import os
import traceback

try:
    from osgeo import gdal
    gdal.UseExceptions()
except Exception:
    QMessageBox.critical(
        None,
        "ECW Bridge",
        "Modul GDAL Python tidak ditemukan di QGIS ini.\n"
        "Gunakan QGIS 3.x versi standar (installer OSGeo4W).",
    )
    raise


def konversiSatu(sumber, tujuan):
    """Konversi satu file raster → GeoTIFF ter-tile + kompresi + overview."""
    ds = gdal.Open(sumber, gdal.GA_ReadOnly)
    if ds is None:
        raise RuntimeError("GDAL gagal membuka file ini")
    opsi = ["TILED=YES", "COMPRESS=DEFLATE", "BIGTIFF=IF_SAFER"]
    out = gdal.Translate(tujuan, ds, format="GTiff", creationOptions=opsi)
    if out is None:
        raise RuntimeError("Konversi gagal (driver GTiff)")
    # Piramida overview supaya zoom cepat — kegagalan di sini tidak fatal
    try:
        out.BuildOverviews("AVERAGE", [2, 4, 8, 16, 32])
    except Exception:
        pass
    out.FlushCache()
    out = None
    ds = None


def jalankan():
    files, _ = QFileDialog.getOpenFileNames(
        None,
        "Pilih file ECW / JP2 yang mau dikonversi",
        "",
        "Raster ECW/JP2 (*.ecw *.jp2);;Semua file (*.*)",
    )
    if not files:
        print("[ECW Bridge] Dibatalkan — tidak ada file dipilih.")
        return

    folder = QFileDialog.getExistingDirectory(
        None,
        "Pilih folder untuk hasil GeoTIFF",
        os.path.dirname(files[0]) or "",
    )
    if not folder:
        print("[ECW Bridge] Dibatalkan — folder hasil tidak dipilih.")
        return

    sukses, gagal = [], []
    print("[ECW Bridge] Memulai konversi %d file..." % len(files))
    for i, src in enumerate(files, 1):
        nama = os.path.splitext(os.path.basename(src))[0] + ".tif"
        dst = os.path.join(folder, nama)
        print("[ECW Bridge] (%d/%d) %s" % (i, len(files), os.path.basename(src)))
        try:
            konversiSatu(src, dst)
            mb = os.path.getsize(dst) / 1048576.0
            sukses.append("%s → %s (%.1f MB)" % (os.path.basename(src), nama, mb))
            print("    OK → %s (%.1f MB)" % (nama, mb))
        except Exception as e:
            gagal.append("%s : %s" % (os.path.basename(src), e))
            print("    GAGAL: %s" % e)

    ringkasan = "Selesai: %d berhasil, %d gagal.\n\nFolder hasil:\n%s\n\n" % (
        len(sukses),
        len(gagal),
        folder,
    )
    if sukses:
        ringkasan += "Berhasil:\n- " + "\n- ".join(sukses) + "\n\n"
    if gagal:
        ringkasan += "Gagal:\n- " + "\n- ".join(gagal)
    ringkasan += (
        "\n\nLangkah terakhir:\n"
        "Buka SIMPLE CADGIS → Berkas → Raster →\n"
        "impor file .tif hasil konversi ini."
    )
    if gagal:
        QMessageBox.warning(None, "ECW Bridge — selesai dengan catatan", ringkasan)
    else:
        QMessageBox.information(None, "ECW Bridge", ringkasan)
    print("[ECW Bridge] " + ringkasan.replace("\n", " | "))


try:
    jalankan()
except Exception:
    traceback.print_exc()
    QMessageBox.critical(
        None,
        "ECW Bridge",
        "Terjadi kesalahan:\n%s" % traceback.format_exc(),
    )
