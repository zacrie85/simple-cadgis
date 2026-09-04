"""GeoTIFF uji piramida: basis 6144x4608 RGB + overview 4096 & 2048 (bawaan GDAL-style).
Pola gradasi sinus — JPEG size realistis, beda detail kasar/halus terlihat saat zoom."""
import numpy as np
import tifffile

W, H = 6144, 4608
y, x = np.mgrid[0:H, 0:W].astype(np.float64)
r = (127 + 127 * np.sin(x / 41.0) * np.cos(y / 57.0)).astype(np.uint8)
g = (127 + 127 * np.sin((x + y) / 83.0)).astype(np.uint8)
b = (127 + 127 * np.cos(x / 29.0 + y / 37.0)).astype(np.uint8)
base = np.stack([r, g, b], axis=-1)

def turunkan(im, f):
    return im[::f, ::f]

ov1 = turunkan(base, 2)   # 3072 (di bawah level 4096 — hanya jadi pratinjau)
ov2 = turunkan(base, 3)   # 2048

sx = sy = 0.00001  # ±1.1 m/px
minx, maxy = 106.75, -6.05
pixel_scale = (sx, sy, 0.0)
tiepoint = (0.0, 0.0, 0.0, minx, maxy, 0.0)
geokeys = (1, 1, 0, 6, 1024, 0, 1, 2, 1025, 0, 1, 1, 2048, 0, 1, 4326, 2054, 0, 1, 9102)
extra = [
    (33550, "d", 3, pixel_scale, True),
    (33922, "d", 6, tiepoint, True),
    (34735, "H", len(geokeys), geokeys, True),
]

path = "/home/z/my-project/scripts/uji-piramida.tif"
with tifffile.TiffWriter(path) as t:
    t.write(base, photometric="rgb", subfiletype=0, compression="deflate", tile=(256, 256), extratags=extra)
    t.write(ov2, photometric="rgb", subfiletype=1, compression="deflate", tile=(256, 256), extratags=extra)
    t.write(ov1, photometric="rgb", subfiletype=1, compression="deflate", tile=(256, 256), extratags=extra)

import os
print("OK:", path, f"{os.path.getsize(path)/1048576:.1f} MB")
