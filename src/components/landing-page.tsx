"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
  CheckSquare,
  Flame,
  StickyNote,
  BarChart3,
  Sparkles,
  Lock,
  Mail,
  User,
  Loader2,
  ShieldCheck,
  Zap,
} from "lucide-react";

export default function LandingPage() {
  const router = useRouter();

  // State form masuk
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginError, setLoginError] = useState("");

  // State form daftar
  const [regName, setRegName] = useState("");
  const [regEmail, setRegEmail] = useState("");
  const [regPassword, setRegPassword] = useState("");
  const [regConfirm, setRegConfirm] = useState("");
  const [regAgree, setRegAgree] = useState(false);
  const [regLoading, setRegLoading] = useState(false);
  const [regError, setRegError] = useState("");

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoginError("");

    if (!loginEmail.trim() || !loginPassword) {
      setLoginError("Email dan sandi wajib diisi.");
      return;
    }

    setLoginLoading(true);
    try {
      const res = await signIn("credentials", {
        redirect: false,
        email: loginEmail.trim(),
        password: loginPassword,
      });
      if (res?.error) {
        setLoginError("Email atau sandi salah. Silakan coba lagi.");
      } else {
        router.refresh();
      }
    } catch {
      setLoginError("Terjadi kesalahan. Silakan coba lagi.");
    } finally {
      setLoginLoading(false);
    }
  }

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    setRegError("");

    if (regName.trim().length < 2) {
      setRegError("Nama minimal 2 karakter.");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(regEmail.trim())) {
      setRegError("Format email tidak valid.");
      return;
    }
    if (regPassword.length < 6) {
      setRegError("Sandi minimal 6 karakter.");
      return;
    }
    if (regPassword !== regConfirm) {
      setRegError("Konfirmasi sandi tidak cocok.");
      return;
    }
    if (!regAgree) {
      setRegError("Centang persetujuan untuk melanjutkan.");
      return;
    }

    setRegLoading(true);
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: regName.trim(),
          email: regEmail.trim(),
          password: regPassword,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setRegError(data.error ?? "Registrasi gagal. Coba lagi.");
        return;
      }
      // Otomatis masuk setelah daftar
      const login = await signIn("credentials", {
        redirect: false,
        email: regEmail.trim(),
        password: regPassword,
      });
      if (login?.error) {
        setRegError("Akun dibuat, namun gagal masuk otomatis. Silakan masuk manual.");
        return;
      }
      router.refresh();
    } catch {
      setRegError("Terjadi kesalahan. Silakan coba lagi.");
    } finally {
      setRegLoading(false);
    }
  }

  const fitur = [
    {
      icon: CheckSquare,
      judul: "Kelola Tugas",
      desc: "Catat tugas harian, atur prioritas dan tenggat, tandai yang selesai.",
    },
    {
      icon: Flame,
      judul: "Bangun Kebiasaan",
      desc: "Lacak kebiasaan baik harian dan jaga rentang beruntunmu tetap menyala.",
    },
    {
      icon: StickyNote,
      judul: "Simpan Catatan",
      desc: "Ide, rencana, dan hal penting tersimpan rapi dalam catatan berwarna.",
    },
    {
      icon: BarChart3,
      judul: "Pantau Progres",
      desc: "Lihat ringkasan produktivitas dan grafik aktivitas 7 hari terakhir.",
    },
  ];

  return (
    <div className="min-h-screen flex flex-col bg-white relative overflow-hidden">
      {/* Dekorasi latar lembut */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-32 -right-32 h-96 w-96 rounded-full bg-blue-100 blur-3xl opacity-70"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute top-1/2 -left-40 h-96 w-96 rounded-full bg-sky-50 blur-3xl opacity-80"
      />

      {/* Navigasi atas */}
      <header className="relative z-10 border-b border-slate-100 bg-white/80 backdrop-blur">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="h-9 w-9 rounded-xl bg-primary flex items-center justify-center">
              <Sparkles className="h-5 w-5 text-white" />
            </div>
            <span className="text-xl font-bold tracking-tight text-slate-900">Produkta</span>
          </div>
          <Badge variant="secondary" className="hidden sm:flex gap-1 items-center rounded-full">
            <Zap className="h-3 w-3 text-primary" />
            100% gratis untuk semua orang
          </Badge>
        </div>
      </header>

      {/* Konten utama */}
      <main className="relative z-10 flex-1 w-full max-w-6xl mx-auto px-4 sm:px-6 py-10 lg:py-16">
        <div className="grid lg:grid-cols-2 gap-10 lg:gap-16 items-center">
          {/* Sisi kiri: promosi */}
          <section aria-label="Tentang Produkta">
            <Badge className="rounded-full bg-blue-50 text-blue-700 hover:bg-blue-50 border border-blue-100 mb-4">
              <Sparkles className="h-3 w-3 mr-1" />
              Aplikasi produktivitas all-in-one
            </Badge>
            <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight text-slate-900 leading-tight">
              Atur harimu,{" "}
              <span className="text-primary">capai lebih</span> banyak.
            </h1>
            <p className="mt-4 text-lg text-slate-600 leading-relaxed">
              Produkta membantumu mengelola tugas, membangun kebiasaan baik, dan
              menyimpan ide penting — semuanya dalam satu aplikasi yang bersih dan
              mudah digunakan. Tidak perlu kartu kredit, cukup daftar dan langsung mulai.
            </p>

            <div className="mt-8 grid sm:grid-cols-2 gap-4">
              {fitur.map((f) => (
                <div
                  key={f.judul}
                  className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm hover:shadow-md hover:border-blue-100 transition-all"
                >
                  <div className="h-10 w-10 rounded-xl bg-blue-50 flex items-center justify-center mb-3">
                    <f.icon className="h-5 w-5 text-primary" />
                  </div>
                  <h3 className="font-semibold text-slate-900">{f.judul}</h3>
                  <p className="mt-1 text-sm text-slate-500 leading-relaxed">{f.desc}</p>
                </div>
              ))}
            </div>
          </section>

          {/* Sisi kanan: kartu masuk / daftar */}
          <section aria-label="Masuk atau daftar">
            <Card className="rounded-2xl border-slate-200 shadow-xl shadow-blue-100/50">
              <CardHeader className="pb-2">
                <CardTitle className="text-2xl font-bold text-slate-900">
                  Selamat datang 👋
                </CardTitle>
                <CardDescription>
                  Masuk atau buat akun gratis untuk mulai meningkatkan produktivitasmu.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Tabs defaultValue="masuk">
                  <TabsList className="grid grid-cols-2 w-full rounded-xl mb-4">
                    <TabsTrigger value="masuk" className="rounded-lg">Masuk</TabsTrigger>
                    <TabsTrigger value="daftar" className="rounded-lg">Daftar</TabsTrigger>
                  </TabsList>

                  {/* Form Masuk */}
                  <TabsContent value="masuk">
                    <form onSubmit={handleLogin} className="space-y-4">
                      <div className="space-y-2">
                        <Label htmlFor="login-email">Email</Label>
                        <div className="relative">
                          <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                          <Input
                            id="login-email"
                            type="email"
                            placeholder="nama@email.com"
                            className="pl-9 rounded-xl"
                            value={loginEmail}
                            onChange={(e) => setLoginEmail(e.target.value)}
                            autoComplete="email"
                          />
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="login-password">Sandi</Label>
                        <div className="relative">
                          <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                          <Input
                            id="login-password"
                            type="password"
                            placeholder="Sandi kamu"
                            className="pl-9 rounded-xl"
                            value={loginPassword}
                            onChange={(e) => setLoginPassword(e.target.value)}
                            autoComplete="current-password"
                          />
                        </div>
                      </div>
                      {loginError && (
                        <p role="alert" className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">
                          {loginError}
                        </p>
                      )}
                      <Button
                        type="submit"
                        className="w-full rounded-xl h-11"
                        disabled={loginLoading}
                      >
                        {loginLoading ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Sedang masuk...
                          </>
                        ) : (
                          "Masuk"
                        )}
                      </Button>
                    </form>
                  </TabsContent>

                  {/* Form Daftar */}
                  <TabsContent value="daftar">
                    <form onSubmit={handleRegister} className="space-y-4">
                      <div className="space-y-2">
                        <Label htmlFor="reg-name">Nama Lengkap</Label>
                        <div className="relative">
                          <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                          <Input
                            id="reg-name"
                            type="text"
                            placeholder="Misal: Budi Santoso"
                            className="pl-9 rounded-xl"
                            value={regName}
                            onChange={(e) => setRegName(e.target.value)}
                            autoComplete="name"
                          />
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="reg-email">Email</Label>
                        <div className="relative">
                          <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                          <Input
                            id="reg-email"
                            type="email"
                            placeholder="nama@email.com"
                            className="pl-9 rounded-xl"
                            value={regEmail}
                            onChange={(e) => setRegEmail(e.target.value)}
                            autoComplete="email"
                          />
                        </div>
                      </div>
                      <div className="grid sm:grid-cols-2 gap-3">
                        <div className="space-y-2">
                          <Label htmlFor="reg-password">Sandi</Label>
                          <Input
                            id="reg-password"
                            type="password"
                            placeholder="Min. 6 karakter"
                            className="rounded-xl"
                            value={regPassword}
                            onChange={(e) => setRegPassword(e.target.value)}
                            autoComplete="new-password"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="reg-confirm">Ulangi Sandi</Label>
                          <Input
                            id="reg-confirm"
                            type="password"
                            placeholder="Ulangi sandi"
                            className="rounded-xl"
                            value={regConfirm}
                            onChange={(e) => setRegConfirm(e.target.value)}
                            autoComplete="new-password"
                          />
                        </div>
                      </div>
                      <label className="flex items-start gap-2 text-sm text-slate-600 cursor-pointer">
                        <Checkbox
                          checked={regAgree}
                          onCheckedChange={(v) => setRegAgree(v === true)}
                          className="mt-0.5"
                          aria-label="Saya setuju data saya diproses"
                        />
                        <span>
                          Saya setuju data akun saya digunakan untuk keperluan aplikasi ini.
                        </span>
                      </label>
                      {regError && (
                        <p role="alert" className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">
                          {regError}
                        </p>
                      )}
                      <Button
                        type="submit"
                        className="w-full rounded-xl h-11"
                        disabled={regLoading}
                      >
                        {regLoading ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Sedang mendaftar...
                          </>
                        ) : (
                          "Buat Akun Gratis"
                        )}
                      </Button>
                    </form>
                  </TabsContent>
                </Tabs>

                <div className="mt-4 flex items-center gap-2 justify-center text-xs text-slate-400">
                  <ShieldCheck className="h-3.5 w-3.5" />
                  Sandi kamu disimpan terenkripsi dan aman
                </div>
              </CardContent>
            </Card>
          </section>
        </div>
      </main>

      {/* Footer menempel di bawah */}
      <footer className="relative z-10 border-t border-slate-100 mt-auto">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4 flex flex-col sm:flex-row items-center justify-between gap-2 text-sm text-slate-400">
          <p>© 2026 Produkta. Semua hak dilindungi.</p>
          <p>Dibuat dengan ❤️ untuk produktivitasmu</p>
        </div>
      </footer>
    </div>
  );
}
