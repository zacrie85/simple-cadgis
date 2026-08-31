#!/usr/bin/env python3
"""Buat KMZ uji berpola deskripsi HTML (seperti data ODP pengguna)."""
import zipfile, os

def html_desc(judul, alamat, pasangan):
    baris = ""
    for ikon, k, v in pasangan:
        baris += f'''<table style="width:100%;border-collapse:collapse;" cellpadding="0" cellspacing="0"><tr><td style="width:32px;vertical-align:top;padding:0;"><div style="width:30px;height:30px;border-radius:8px;background:#eff6ff;text-align:center;line-height:30px;font-size:14px;">{ikon}</div></td><td style="vertical-align:top;padding:0 0 0 10px;"><div style="font-size:10px;color:#94a3b8;font-weight:bold;text-transform:uppercase;letter-spacing:0.4px;line-height:1;">{k}</div><div style="font-size:13px;color:#1e293b;font-weight:500;margin-top:4px;line-height:1.4;word-break:break-word;">{v}</div></td></tr></table><div style="height:1px;background:#f1f5f9;margin:8px 0;"></div>'''
    return f'''<div style="font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#222;max-width:460px;min-width:340px;margin:0;padding:0;border:1px solid #e0e0e0;border-radius:10px;overflow:hidden;background:#fff;"><div style="background:#2563eb;padding:14px 18px;"><div style="font-size:15px;font-weight:bold;color:#fff;line-height:1.3;">{judul}</div><div style="font-size:11px;color:#bfdbfe;margin-top:3px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">{alamat}</div></div><div style="padding:14px 18px 18px 18px;background:#fff;">{baris}</div></div>'''

def placemark_point(nama, lat, lng, desc_html):
    return f'''    <Placemark>
      <name>{nama}</name>
      <description><![CDATA[{desc_html}]]></description>
      <style><IconStyle><color>ff0000ff</color></IconStyle></style>
      <Point><coordinates>{lng},{lat},0</coordinates></Point>
    </Placemark>
'''

odp103 = html_desc("ODP 103", "Jl Perum Mutiara Kedungmundu 2 Blok D no.12B rt 007 rw 001 kel.sambiroto (milik pribadi)", [
    ("\U0001F4C4", "Provider", "OMG"),
    ("\U0001F30D", "Location Region", "BRANCH SEMARANG"),
    ("\U0001F4C5", "Req. Install Date", "2026-05-28"),
    ("\U0001F4C5", "Req. Install Time", "10:30:00"),
    ("\U0001F3E0", "Address Note", "Mutiara Kedungmundu 2 Blok D"),
    ("\U0001F4CD", "Segment", "RESIDENTIAL"),
])

odp104 = html_desc("ODP 104", "Jl. Sambiroto Raya No. 45, Semarang", [
    ("\U0001F4C4", "Provider", "HW"),
    ("\U0001F30D", "Location Region", "BRANCH SEMARANG"),
    ("\U0001F4C5", "Req. Install Date", "2026-06-02"),
    ("\U0001F50C", "Capacity", "8 port"),
])

# poligon dengan deskripsi teks polos (uji regresi)
poligon = '''    <Placemark>
      <name>Area Kerja A</name>
      <description>Contoh deskripsi teks polos tanpa HTML</description>
      <Polygon><outerBoundaryIs><LinearRing><coordinates>
        110.4290,-6.9930,0 110.4310,-6.9930,0 110.4310,-6.9950,0 110.4290,-6.9950,0 110.4290,-6.9930,0
      </coordinates></LinearRing></outerBoundaryIs></Polygon>
    </Placemark>
'''

kml = f'''<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>Uji Popup ODP</name>
{placemark_point("ODP 103", -6.994292, 110.429400, odp103)}{placemark_point("ODP 104", -6.996000, 110.431500, odp104)}{poligon}  </Document>
</kml>
'''

os.makedirs("samples", exist_ok=True)
dengan_kml = zipfile.ZIP_DEFLATED
with zipfile.ZipFile("samples/uji-popup-odp.kmz", "w", dengan_kml) as z:
    z.writestr("doc.kml", kml)
print("OK: samples/uji-popup-odp.kmz dibuat,", os.path.getsize("samples/uji-popup-odp.kmz"), "byte")
