# -*- coding: utf-8 -*-
"""
Generator file uji SIMPLE CADGIS:
1. samples/uji-header-excel.xlsx — XLSX minimal dengan URUTAN ENTRI ZIP ALA EXCEL
   (xl/worksheets/sheet1.xml ditulis SEBELUM xl/sharedStrings.xml) dan semua
   sel teks (header + data) disimpan sebagai shared strings. Ini mereplikasi
   kondisi file Excel asli yang membuat header tampil "Kolom 1, Kolom 2, ..."
   pada parser streaming satu-pass.
2. samples/uji-tanpa-header.csv — CSV tanpa baris header (semua baris = data).
"""
import zipfile
import random
import os

random.seed(42)
os.makedirs("samples", exist_ok=True)

# ============ 1. XLSX ala Excel (sheet sebelum sharedStrings) ============
strings = []


def sst(s):
    if s not in strings:
        strings.append(s)
    return strings.index(s)


def esc(s):
    return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


baris_xml = []

# --- baris header (semua sel string via sharedStrings) ---
headers = ["No", "Nama Pelanggan", "Alamat", "Koordinat (Lat,Lng)", "Keterangan", "Elevasi (m)"]
cells = "".join(
    '<c r="%s1" t="s"><v>%d</v></c>' % (chr(65 + i), sst(h)) for i, h in enumerate(headers)
)
baris_xml.append('<row r="1">%s</row>' % cells)

# --- 50 baris data di sekitar Semarang ---
for i in range(1, 51):
    lat = -6.99 + random.uniform(-0.05, 0.05)
    lng = 110.42 + random.uniform(-0.06, 0.06)
    nama = "Pelanggan %03d" % i
    alamat = "Jl. Merdeka No.%d, Semarang" % i
    keterangan = "Aktif" if i % 3 != 0 else "Nonaktif"
    elev = round(random.uniform(2, 55), 1)
    r = i + 1
    baris_xml.append(
        '<row r="%d">'
        '<c r="A%d"><v>%d</v></c>'
        '<c r="B%d" t="s"><v>%d</v></c>'
        '<c r="C%d" t="s"><v>%d</v></c>'
        '<c r="D%d" t="s"><v>%d</v></c>'
        '<c r="E%d" t="s"><v>%d</v></c>'
        '<c r="F%d"><v>%s</v></c>'
        "</row>"
        % (r, r, i, r, sst(nama), r, sst(alamat), r, sst("(%f,%f)" % (lat, lng)), r, sst(keterangan), r, elev)
    )

content_types = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/></Types>"""

root_rels = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>"""

workbook = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Data" sheetId="1" r:id="rId1"/></sheets></workbook>"""

workbook_rels = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/></Relationships>"""

sheet = (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>'
    + "".join(baris_xml)
    + "</sheetData></worksheet>"
)

sst_xml = (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
    '<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="%d" uniqueCount="%d">'
    % (len(strings) * 3, len(strings))
    + "".join("<si><t>%s</t></si>" % esc(s) for s in strings)
    + "</sst>"
)

# URUTAN PENTING: sheet1.xml SEBELUM sharedStrings.xml (ala Excel asli)
dengan_urutan_excel = [
    ("[Content_Types].xml", content_types),
    ("_rels/.rels", root_rels),
    ("xl/worksheets/sheet1.xml", sheet),  # <- duluan
    ("xl/sharedStrings.xml", sst_xml),  # <- belakangan
    ("xl/workbook.xml", workbook),
    ("xl/_rels/workbook.xml.rels", workbook_rels),
]

with zipfile.ZipFile("samples/uji-header-excel.xlsx", "w", zipfile.ZIP_DEFLATED) as z:
    for nama, isi in dengan_urutan_excel:
        z.writestr(nama, isi)

print("OK samples/uji-header-excel.xlsx (%d string unik, 51 baris)" % len(strings))

# ============ 2. CSV tanpa header ============
with open("samples/uji-tanpa-header.csv", "w", encoding="utf-8") as f:
    f.write("-6.9812,110.4231,12.5\n")
    f.write("-6.9905,110.4302,18.0\n")
    f.write("-6.9988,110.4377,25.3\n")
    f.write("-7.0051,110.4410,31.7\n")
    f.write("-6.9764,110.4155,8.2\n")
    f.write("-6.9670,110.4080,5.9\n")
    f.write("-7.0122,110.4488,42.6\n")
    f.write("-6.9877,110.4266,15.4\n")
    f.write("-6.9959,110.4330,27.8\n")
    f.write("-7.0003,110.4399,33.1\n")
    f.write("-6.9721,110.4187,10.6\n")
    f.write("-7.0088,110.4451,38.9\n")
print("OK samples/uji-tanpa-header.csv (12 baris, tanpa header)")
