#!/usr/bin/env python3
"""
Buat GeoTIFF uji utk CRS proyeksi non-WGS84 (SIMPLE CADGIS):
  1. uji-crs-9377.tif  — EPSG:9377 MAGNA-SIRGAS 2018 / Origen-Nacional (Kolombia)
     isi piksel gradien, tiepoint di sekitar Bogota (-73.16, 4.60).
  2. uji-crs-tm3.tif   — EPSG:23834 DGN95 / Indonesia TM-3 zona 48.2 (CM 106.5)
     tiepoint di sekitar Jakarta (106.85, -6.10).

GeoKeys: GTModelType=2 (projected), GeographicType=4326, ProjectedCSType=<kode>.
Output: scripts/uji-crs-9377.tif & scripts/uji-crs-tm3.tif + cetak pusat WGS84
yang diharapkan (acuan assert e2e).
"""
import numpy as np
import tifffile
from pyproj import CRS, Transformer

# ---------- param umum ----------
W, H = 200, 150
SCALE = 10.0  # meter per piksel

def gradien(w, h):
    r = np.linspace(255, 0, w, dtype=np.uint8)[None, :].repeat(h, 0)
    g = np.linspace(0, 255, w, dtype=np.uint8)[None, :].repeat(h, 0)
    b = np.full((h, w), 128, dtype=np.uint8)
    return np.dstack([r, g, b])

def buat(nama, epsg, crs_def, lng, lat):
    """Tiepoint sudut kiri-atas dipasang pada koordinat (lng,lat) acuan."""
    tr = Transformer.from_crs(CRS("EPSG:4326"), CRS(crs_def), always_xy=True)
    x0, y0 = tr.transform(lng, lat)
    data = gradien(W, H)
    extratags = [
        (33550, 11, 3, (SCALE, SCALE, 0.0), False),            # ModelPixelScale
        (33922, 12, 6, (0.0, 0.0, 0.0, x0, y0, 0.0), False),   # ModelTiepoint
        (34735, 3, 16, (1, 1, 0, 3, 1024, 0, 1, 2, 2048, 0, 1, 4326, 3072, 0, 1, epsg), False),  # GeoKeyDirectory: header + 3 kunci
    ]
    with tifffile.TiffWriter(nama) as tif:
        tif.write(
            data,
            photometric="rgb",
            planarconfig="contig",
            compression="deflate",
            extratags=extratags,
        )
    # pusat raster di WGS84 (acuan assert e2e): tiepoint + setengah dimensi piksel
    xcen = x0 + (W / 2) * SCALE
    ycen = y0 - (H / 2) * SCALE  # y turun ke selatan saat piksel baris bertambah
    inv = Transformer.from_crs(CRS(crs_def), CRS("EPSG:4326"), always_xy=True)
    lngc, latc = inv.transform(xcen, ycen)
    print(f"{nama}: EPSG:{epsg} tiepoint=({x0:.2f},{y0:.2f}) pusat_WGS84=({latc:.6f},{lngc:.6f})")

buat("scripts/uji-crs-9377.tif", 9377,
     "+proj=tmerc +lat_0=4 +lon_0=-73 +k=0.9992 +x_0=5000000 +y_0=2000000 +ellps=GRS80 +units=m +no_defs",
     -73.16, 4.60)
buat("scripts/uji-crs-tm3.tif", 23834,
     "+proj=tmerc +lat_0=0 +lon_0=106.5 +k=0.9999 +x_0=200000 +y_0=1500000 +ellps=WGS84 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs",
     106.85, -6.10)
