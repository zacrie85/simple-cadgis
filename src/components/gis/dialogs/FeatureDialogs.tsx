"use client";

import { useState } from "react";
import { useGis, simpanShapeDariPending, pastikanLayerManualSekarang } from "@/lib/gis/store";
import { uid, fmtMeter } from "@/lib/gis/geo";
import type { GisPoint } from "@/lib/gis/types";
import { ambilElevasiDEM } from "@/lib/gis/elevasi";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { MapPin, Type, Shapes, Camera, X, Trash2, Loader2, Sticker } from "lucide-react";
import { DAFTAR_IKON, htmlPolos, ikonHtml } from "@/lib/gis/ikon-titik";

const WARNA = ["#2563eb", "#f59e0b", "#10b981", "#ef4444", "#8b5cf6", "#0ea5e9", "#f97316", "#64748b"];

/** Pratinjau ikon penanda untuk tombol picker (SVG inline ringan). */
function IkonPratinjau({ id }: { id: string }) {
  const html = ikonHtml(id === "polos" ? undefined : id, false) ?? htmlPolos;
  return <span className="pointer-events-none block" dangerouslySetInnerHTML={{ __html: html }} />;
}

/** Grid pilihan ikon titik (polos + 10 ikon FO/pin) — dipakai dialog titik & dialog massal. */
function PemilihIkon({ nilai, pilih }: { nilai: string; pilih: (id: string) => void }) {
  return (
    <div className="grid grid-cols-6 gap-1.5">
      {[{ id: "polos", nama: "Titik Polos (bulat)" }, ...DAFTAR_IKON].map((it) => (
        <button
          key={it.id}
          type="button"
          onClick={() => pilih(it.id)}
          title={it.nama}
          aria-pressed={nilai === it.id}
          className={`flex h-11 items-center justify-center rounded-lg border ${
            nilai === it.id
              ? "border-blue-600 bg-blue-50 ring-2 ring-blue-500"
              : "border-slate-200 bg-white hover:bg-slate-100"
          }`}
        >
          <IkonPratinjau id={it.id} />
        </button>
      ))}
    </div>
  );
}

function kompresFoto(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const maks = 640;
        const skala = Math.min(1, maks / Math.max(img.width, img.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(img.width * skala);
        canvas.height = Math.round(img.height * skala);
        const ctx = canvas.getContext("2d");
        ctx?.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", 0.75));
      };
      img.onerror = () => reject(new Error("Foto tidak dapat dibaca"));
      img.src = reader.result as string;
    };
    reader.onerror = () => reject(new Error("Foto tidak dapat dibaca"));
    reader.readAsDataURL(file);
  });
}

/** Dialog titik: buat baru (judul, deskripsi, foto, elevasi) / edit titik yang ada. */
export function PointDialog() {
  const state = useGis((s) => s.dialogs.point);
  const setDialog = useGis((s) => s.setDialog);

  if (!state) return null;

  const kunci = state.mode === "edit" ? state.id : `baru-${state.lat.toFixed(6)}-${state.lng.toFixed(6)}`;
  return <PointForm key={kunci} state={state} tutup={() => setDialog("point", null)} />;
}

function PointForm({
  state,
  tutup,
}: {
  state: { mode: "create"; lat: number; lng: number } | { mode: "edit"; id: string };
  tutup: () => void;
}) {
  const points = useGis((s) => s.points);
  const awal = state.mode === "edit" ? points.find((x) => x.id === state.id) : null;

  const [title, setTitle] = useState(awal?.title ?? "");
  const [description, setDescription] = useState(awal?.description ?? "");
  const [elevation, setElevation] = useState(awal?.elevation != null ? String(awal.elevation) : "");
  const [photo, setPhoto] = useState<string | undefined>(awal?.photo);
  const [labelTampil, setLabelTampil] = useState(awal?.labelTampil ?? false);
  const [ikon, setIkon] = useState(awal?.ikon ?? "polos");
  const [loadingFoto, setLoadingFoto] = useState(false);

  const simpan = () => {
    const st = useGis.getState();
    const elev = elevation.trim() === "" ? null : parseFloat(elevation.replace(",", "."));
    if (state.mode === "create") {
      const idBaru = uid("titik");
      st.addPoint({
        id: idBaru,
        lat: state.lat,
        lng: state.lng,
        title: title.trim() || "Titik baru",
        description: description.trim(),
        elevation: elev != null && !isNaN(elev) ? elev : null,
        photo,
        attrs: {},
        source: "manual",
        visible: true,
        labelTampil,
        ikon: ikon !== "polos" ? ikon : undefined,
        layerId: pastikanLayerManualSekarang(),
      });
      // elevasi kosong → ambil otomatis dari DEM satelit (tak menimpa isi manual)
      if (elev == null || isNaN(elev)) {
        const judul = title.trim() || "Titik baru";
        ambilElevasiDEM([{ lat: state.lat, lng: state.lng }]).then(([e]) => {
          if (e != null) {
            useGis.getState().updatePoint(idBaru, { elevation: e });
            toast.info(`Elevasi DEM: ${e} m`, { description: judul });
          }
        });
      }
      toast.success("Titik ditambahkan", { description: title.trim() || "Titik baru" });
    } else {
      st.updatePoint(state.id, {
        title: title.trim() || "Titik",
        description: description.trim(),
        elevation: elev != null && !isNaN(elev) ? elev : null,
        photo,
        labelTampil,
        ikon: ikon !== "polos" ? ikon : undefined,
      });
      toast.success("Titik diperbarui");
    }
    tutup();
  };

  return (
    <Dialog open onOpenChange={(v) => !v && tutup()}>
      <DialogContent className="rounded-2xl sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MapPin className="h-5 w-5 text-primary" />
            {state.mode === "create" ? "Titik Baru" : "Edit Titik"}
          </DialogTitle>
        </DialogHeader>

        {state.mode === "create" && (
          <p className="text-xs text-slate-500 -mt-2">
            Koordinat: {state.lat.toFixed(6)}, {state.lng.toFixed(6)}
          </p>
        )}

        <div className="space-y-3.5">
          <div className="space-y-1.5">
            <Label htmlFor="pt-title">Judul</Label>
            <Input id="pt-title" className="rounded-xl" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Misal: Titik Kontrol BM-01" maxLength={100} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pt-desc">Deskripsi</Label>
            <Textarea id="pt-desc" className="rounded-xl min-h-16" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Keterangan titik…" maxLength={500} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pt-elev">Ketinggian / elevasi (m) — untuk kontur &amp; volume</Label>
            <Input id="pt-elev" type="number" step="0.01" className="rounded-xl" value={elevation} onChange={(e) => setElevation(e.target.value)} placeholder="Misal: 325.5" />
          </div>
          <div className="space-y-1.5">
            <Label className="flex items-center gap-1.5">
              <Sticker className="h-3.5 w-3.5 text-slate-400" />
              Ikon penanda titik
            </Label>
            <PemilihIkon nilai={ikon} pilih={setIkon} />
            <p className="text-[10px] text-slate-400">
              Ikon as-built jaringan fiber optik: tiang tumpu, ODP, ODC, closure, handhole, menara + pin warna.
            </p>
          </div>
          <label className="flex items-center gap-2.5 rounded-xl border border-slate-200 px-3 py-2.5 cursor-pointer hover:bg-slate-50">
            <input
              type="checkbox"
              className="h-4 w-4 accent-blue-600"
              checked={labelTampil}
              onChange={(e) => setLabelTampil(e.target.checked)}
            />
            <span className="text-sm text-slate-700">
              Tampilkan label nama titik ini di peta <span className="text-xs text-slate-400">(mode label "Terpilih")</span>
            </span>
          </label>
          <div className="space-y-1.5">
            <Label>Foto</Label>
            {photo ? (
              <div className="relative w-fit">
                <img src={photo} alt="Foto titik" className="rounded-xl max-h-36 border" />
                <button
                  onClick={() => setPhoto(undefined)}
                  aria-label="Hapus foto"
                  className="absolute -top-2 -right-2 h-7 w-7 rounded-full bg-red-600 text-white flex items-center justify-center shadow hover:bg-red-700"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ) : (
              <label className="flex items-center gap-2 text-sm text-blue-700 cursor-pointer w-fit rounded-xl border border-dashed border-blue-300 px-3 py-2 hover:bg-blue-50">
                {loadingFoto ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
                Pilih foto dari perangkat
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={async (e) => {
                    const f = e.target.files?.[0];
                    if (!f) return;
                    setLoadingFoto(true);
                    try {
                      const dataUrl = await kompresFoto(f);
                      setPhoto(dataUrl);
                    } catch {
                      toast.error("Foto gagal dibaca");
                    } finally {
                      setLoadingFoto(false);
                      e.target.value = "";
                    }
                  }}
                />
              </label>
            )}
          </div>
        </div>

        <DialogFooter className="gap-2">
          {state.mode === "edit" && (
            <Button
              variant="outline"
              className="rounded-xl text-red-600 hover:bg-red-50 border-red-200 mr-auto"
              onClick={() => {
                useGis.getState().deletePoint(state.id);
                toast.success("Titik dihapus");
                tutup();
              }}
            >
              <Trash2 className="h-4 w-4 mr-1" />
              Hapus
            </Button>
          )}
          <Button variant="outline" className="rounded-xl" onClick={tutup}>
            Batal
          </Button>
          <Button className="rounded-xl" onClick={simpan}>
            {state.mode === "create" ? "Simpan Titik" : "Simpan Perubahan"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Dialog label teks: buat baru / edit. */
export function TextDialog() {
  const state = useGis((s) => s.dialogs.text);
  const setDialog = useGis((s) => s.setDialog);

  if (!state) return null;

  const kunci = state.editId ?? `baru-${state.lat.toFixed(6)}-${state.lng.toFixed(6)}`;
  return <TextForm key={kunci} state={state} tutup={() => setDialog("text", null)} />;
}

function TextForm({
  state,
  tutup,
}: {
  state: { lat: number; lng: number; editId?: string };
  tutup: () => void;
}) {
  const [text, setText] = useState(() => {
    if (state.editId) {
      const l = useGis.getState().labels.find((x) => x.id === state.editId);
      return l?.text ?? "";
    }
    return "";
  });

  const simpan = () => {
    const st = useGis.getState();
    if (!text.trim()) {
      toast.error("Teks kosong");
      return;
    }
    if (state.editId) {
      st.updateLabel(state.editId, { text: text.trim() });
      toast.success("Label diperbarui");
    } else {
      st.addLabel({ id: uid("label"), lat: state.lat, lng: state.lng, text: text.trim(), layerId: pastikanLayerManualSekarang() });
      toast.success("Label teks ditambahkan");
    }
    tutup();
  };

  return (
    <Dialog open onOpenChange={(v) => !v && tutup()}>
      <DialogContent className="rounded-2xl sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Type className="h-5 w-5 text-primary" />
            {state.editId ? "Edit Label Teks" : "Label Teks Baru"}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor="lbl-text">Isi teks</Label>
          <Input
            id="lbl-text"
            autoFocus
            className="rounded-xl"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Tulis teks…"
            maxLength={120}
            onKeyDown={(e) => e.key === "Enter" && simpan()}
          />
        </div>
        <DialogFooter className="gap-2">
          {state.editId && (
            <Button
              variant="outline"
              className="rounded-xl text-red-600 hover:bg-red-50 border-red-200 mr-auto"
              onClick={() => {
                useGis.getState().deleteLabel(state.editId!);
                toast.success("Label dihapus");
                tutup();
              }}
            >
              <Trash2 className="h-4 w-4 mr-1" />
              Hapus
            </Button>
          )}
          <Button variant="outline" className="rounded-xl" onClick={tutup}>
            Batal
          </Button>
          <Button className="rounded-xl" onClick={simpan}>
            Simpan
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Dialog info bentuk: penamaan hasil gambar / edit poligon & garis. */
export function ShapeInfoDialog() {
  const state = useGis((s) => s.dialogs.shapeInfo);
  const setDialog = useGis((s) => s.setDialog);

  if (!state) return null;

  const tutup = () => {
    // jika dibatalkan saat penamaan shape baru, buang gambarannya
    if (state.id === "pending:baru") useGis.getState().cancelDraw();
    setDialog("shapeInfo", null);
  };

  return <ShapeForm key={state.id} state={state} tutup={tutup} />;
}

function ShapeForm({
  state,
  tutup,
}: {
  state: { id: string };
  tutup: () => void;
}) {
  const shapes = useGis((s) => s.shapes);
  const baru = state.id === "pending:baru";
  const sh = baru ? null : shapes.find((x) => x.id === state.id);

  const [title, setTitle] = useState(sh?.title ?? "");
  const [description, setDescription] = useState(sh?.description ?? "");
  const [color, setColor] = useState(sh?.color ?? WARNA[0]);
  const [labelTampil, setLabelTampil] = useState(sh?.labelTampil ?? false);

  const simpan = () => {
    const st = useGis.getState();
    if (baru) {
      const pending = st.consumePendingShape();
      if (!pending) {
        tutup();
        return;
      }
      simpanShapeDariPending(pending.kind, pending.vertices, title.trim(), description.trim(), color, labelTampil);
      toast.success(pending.kind === "closed" ? "Poligon tersimpan" : "Garis tersimpan", {
        description: title.trim() || undefined,
      });
      // titik pertama tarikan bulatan/elips → OTOMATIS menjadi titik koordinat berikon "Titik Awal Tarikan"
      if (pending.titikAwal) {
        const ta = pending.titikAwal;
        const judul = title.trim() || (pending.kind === "closed" ? "Poligon" : "Garis");
        const titik: GisPoint = {
          id: uid("point"),
          lat: ta.lat,
          lng: ta.lng,
          title: `Titik Awal — ${judul}`,
          description:
            ta.jenis === "bulatan"
              ? `Titik awal tarikan (pusat lingkaran). Radius ${fmtMeter(ta.radius ?? 0)}.`
              : `Titik awal tarikan (pusat elips). Jangkauan ${fmtMeter(ta.rx ?? 0)} × ${fmtMeter(ta.ry ?? 0)}.`,
          attrs:
            ta.jenis === "bulatan"
              ? { keterangan: "Titik awal tarikan", radius: fmtMeter(ta.radius ?? 0) }
              : {
                  keterangan: "Titik awal tarikan",
                  "radius-x": fmtMeter(ta.rx ?? 0),
                  "radius-y": fmtMeter(ta.ry ?? 0),
                },
          source: "manual",
          visible: true,
          ikon: "titik-awal",
          layerId: pastikanLayerManualSekarang(),
        };
        st.addPoint(titik);
        toast.info("Titik awal otomatis dibuat", {
          description: `Ikon "Titik Awal Tarikan" pada pusat ${ta.jenis} — koordinat ${ta.lat.toFixed(6)}, ${ta.lng.toFixed(6)}`,
        });
      }
    } else {
      st.updateShape(state.id, { title: title.trim() || "Tanpa Judul", description: description.trim(), color, labelTampil });
      toast.success("Perubahan disimpan");
    }
    tutup();
  };

  return (
    <Dialog open onOpenChange={(v) => !v && tutup()}>
      <DialogContent className="rounded-2xl sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Shapes className="h-5 w-5 text-primary" />
            {baru ? "Simpan Gambar" : "Edit Poligon / Garis"}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3.5">
          <div className="space-y-1.5">
            <Label htmlFor="sh-title">Judul</Label>
            <Input id="sh-title" autoFocus className="rounded-xl" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Misal: Area Ijin" maxLength={100} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="sh-desc">Deskripsi</Label>
            <Textarea id="sh-desc" className="rounded-xl min-h-14" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Keterangan…" maxLength={500} />
          </div>
          <div className="space-y-1.5">
            <Label>Warna</Label>
            <div className="flex gap-2">
              {WARNA.map((w) => (
                <button
                  key={w}
                  aria-label={`Warna ${w}`}
                  aria-pressed={color === w}
                  onClick={() => setColor(w)}
                  className={`h-8 w-8 rounded-full transition-transform ${color === w ? "ring-2 ring-offset-2 ring-slate-500 scale-110" : "opacity-80"}`}
                  style={{ backgroundColor: w }}
                />
              ))}
            </div>
          </div>
          <label className="flex items-center gap-2.5 rounded-xl border border-slate-200 px-3 py-2.5 cursor-pointer hover:bg-slate-50">
            <input
              type="checkbox"
              className="h-4 w-4 accent-blue-600"
              checked={labelTampil}
              onChange={(e) => setLabelTampil(e.target.checked)}
            />
            <span className="text-sm text-slate-700">
              Tampilkan label nama bentuk ini di peta <span className="text-xs text-slate-400">(mode label "Terpilih")</span>
            </span>
          </label>
        </div>
        <DialogFooter className="gap-2">
          {!baru && sh && (
            <Button
              variant="outline"
              className="rounded-xl text-red-600 hover:bg-red-50 border-red-200 mr-auto"
              onClick={() => {
                useGis.getState().deleteShape(sh.id);
                toast.success("Dihapus");
                tutup();
              }}
            >
              <Trash2 className="h-4 w-4 mr-1" />
              Hapus
            </Button>
          )}
          <Button variant="outline" className="rounded-xl" onClick={tutup}>
            Batal
          </Button>
          <Button className="rounded-xl" onClick={simpan}>
            Simpan
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Ganti ikon penanda SEKALIGUS untuk semua titik terpilih (hasil Blok). */
export function IkonTitikDialog() {
  const open = useGis((s) => s.dialogs.ikonTitik);
  const setDialog = useGis((s) => s.setDialog);
  const selection = useGis((s) => s.selection);
  const points = useGis((s) => s.points);
  const [ikon, setIkon] = useState("odp");

  if (!open) return null;

  const idsTitik = points.filter((p) => selection.includes(p.id)).map((p) => p.id);

  const terapkan = () => {
    if (idsTitik.length === 0) return;
    const st = useGis.getState();
    idsTitik.forEach((id) => st.updatePoint(id, { ikon: ikon !== "polos" ? ikon : undefined }));
    toast.success(`Ikon diterapkan ke ${idsTitik.length} titik`, {
      description: ikon === "polos" ? "Kembali ke titik polos (bulat)." : DAFTAR_IKON.find((x) => x.id === ikon)?.nama,
    });
    setDialog("ikonTitik", false);
  };

  return (
    <Dialog open onOpenChange={(v) => !v && setDialog("ikonTitik", false)}>
      <DialogContent className="rounded-2xl sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sticker className="h-5 w-5 text-primary" />
            Ikon Titik Terpilih
          </DialogTitle>
        </DialogHeader>
        <p className="text-xs text-slate-500 -mt-2">
          {idsTitik.length > 0
            ? `${idsTitik.length} titik terpilih akan diberi ikon yang sama — cocok untuk mengganti penanda as-built jaringan FO secara massal.`
            : "Belum ada titik terpilih. Gunakan menu Blok (drag kotak di peta) lalu buka dialog ini lagi."}
        </p>
        <div className="space-y-1.5">
          <Label>Pilih ikon</Label>
          <PemilihIkon nilai={ikon} pilih={setIkon} />
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" className="rounded-xl" onClick={() => setDialog("ikonTitik", false)}>
            Batal
          </Button>
          <Button className="rounded-xl" onClick={terapkan} disabled={idsTitik.length === 0}>
            Terapkan ({idsTitik.length})
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
