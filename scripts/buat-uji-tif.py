"""Buat GeoTIFF uji kecil (WGS84, dekat Jakarta) untuk e2e impor raster."""
import numpy as np
import tifffile

w, h = 160, 120
y, x = np.mgrid[0:h, 0:w]
img = np.stack(
    [(x / w * 255).astype(np.uint8), (y / h * 255).astype(np.uint8), np.full((h, w), 120, np.uint8)],
    axis=-1,
)

sx = sy = 0.0001  # ±11 m/px
minx, maxy = 106.80, -6.10  # WGS84, sekitar Jakarta
pixel_scale = (sx, sy, 0.0)
tiepoint = (0.0, 0.0, 0.0, minx, maxy, 0.0)
geokeys = (
    1, 1, 0, 6,
    1024, 0, 1, 2,     # GTModelTypeGeoKey = geographic
    1025, 0, 1, 1,     # GTRasterTypeGeoKey = pixel is area
    2048, 0, 1, 4326,  # GeographicTypeGeoKey = WGS84
    2054, 0, 1, 9102,  # angular unit = degree
)

tifffile.imwrite(
    "/home/z/my-project/scripts/uji-raster.tif",
    img,
    extratags=[
        (33550, "d", 3, pixel_scale, True),
        (33922, "d", 6, tiepoint, True),
        (34735, "H", len(geokeys), geokeys, True),
    ],
)
print("OK: scripts/uji-raster.tif")
