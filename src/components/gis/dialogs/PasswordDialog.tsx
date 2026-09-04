"use client";

import { useState } from "react";
import { useGis } from "@/lib/gis/store";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Eye, EyeOff, KeyRound, LockKeyhole, ShieldCheck } from "lucide-react";
import { kunciGerbang, simpanPasswordBaru, verifyPassword } from "@/lib/gis/gate";

/**
 * Dialog Setelan Password Gerbang:
 * - ganti password pembuka aplikasi (password saat ini → baru)
 * - tombol "Kunci Sekarang" untuk langsung mengunci aplikasi (kembali ke layar password)
 */
export default function PasswordDialog() {
  const open = useGis((s) => s.dialogs.password);
  const setDialog = useGis((s) => s.setDialog);

  const [lama, setLama] = useState("");
  const [baru, setBaru] = useState("");
  const [konf, setKonf] = useState("");
  const [lihat, setLihat] = useState(false);

  if (!open) return null;

  const tutup = () => {
    setDialog("password", false);
    setLama("");
    setBaru("");
    setKonf("");
    setLihat(false);
  };

  const simpan = () => {
    if (!verifyPassword(lama)) {
      toast.error("Password saat ini salah", { description: "Isi password yang sedang aktif terlebih dulu." });
      return;
    }
    if (baru.trim().length < 4) {
      toast.error("Password baru terlalu pendek", { description: "Gunakan minimal 4 karakter." });
      return;
    }
    if (baru !== konf) {
      toast.error("Konfirmasi tidak sama", { description: "Ketik ulang password baru dengan tepat di kolom konfirmasi." });
      return;
    }
    simpanPasswordBaru(baru);
    toast.success("Password gerbang berhasil diubah", {
      description: "Tab/sesi baru akan diminta memakai password ini. Sesi sekarang tetap terbuka.",
    });
    tutup();
  };

  const kunciSekarang = () => {
    kunciGerbang();
    window.location.reload(); // muat ulang → layar kunci tampil lagi
  };

  return (
    <Dialog open onOpenChange={(v) => !v && tutup()}>
      <DialogContent className="rounded-2xl sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <KeyRound className="h-5 w-5 text-blue-700" /> Password Gerbang
          </DialogTitle>
        </DialogHeader>

        <p className="text-xs text-slate-500 -mt-1">
          Password ini diminta setiap kali aplikasi dibuka di tab/sesi baru. Password bawaan pabrik:{" "}
          <b>A$rama33</b> — ganti di bawah ini sesukamu.
        </p>

        <div className="space-y-3">
          <div>
            <label className="text-xs font-semibold text-slate-500">Password saat ini</label>
            <Input
              type={lihat ? "text" : "password"}
              value={lama}
              onChange={(e) => setLama(e.target.value)}
              autoComplete="current-password"
              placeholder="Password yang sedang aktif"
              className="mt-1 h-9"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-500">Password baru (min. 4 karakter)</label>
            <Input
              type={lihat ? "text" : "password"}
              value={baru}
              onChange={(e) => setBaru(e.target.value)}
              autoComplete="new-password"
              placeholder="Password baru"
              className="mt-1 h-9"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-500">Ulangi password baru</label>
            <Input
              type={lihat ? "text" : "password"}
              value={konf}
              onChange={(e) => setKonf(e.target.value)}
              autoComplete="new-password"
              placeholder="Ketik ulang password baru"
              className="mt-1 h-9"
            />
          </div>

          <button
            type="button"
            onClick={() => setLihat((v) => !v)}
            className="flex items-center gap-1.5 text-[11px] text-slate-500 hover:text-blue-700"
          >
            {lihat ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
            {lihat ? "Sembunyikan password" : "Lihat password"}
          </button>
        </div>

        <div className="flex flex-col sm:flex-row gap-2">
          <Button className="flex-1 bg-blue-700 hover:bg-blue-800 text-white" onClick={simpan}>
            <ShieldCheck className="h-4 w-4" /> Simpan Password
          </Button>
          <Button variant="outline" className="flex-1 sm:border-red-200 sm:text-red-600 hover:bg-red-50" onClick={kunciSekarang}>
            <LockKeyhole className="h-4 w-4" /> Kunci Sekarang
          </Button>
        </div>

        <p className="text-[11px] leading-relaxed text-slate-400 border-t border-slate-100 pt-2.5">
          <b>Lupa password?</b> Hapus data situs (Site data) browser untuk aplikasi ini — password kembali ke{" "}
          <b>A$rama33</b>. Catatan: password hanya disimpan di perangkat ini (hash lokal), tidak dikirim ke mana pun.
        </p>
      </DialogContent>
    </Dialog>
  );
}
