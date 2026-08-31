"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { api, todayLocal } from "@/lib/fetcher";
import type { StatsData, HabitData } from "@/lib/types";
import {
  LayoutDashboard,
  ListTodo,
  CheckCircle2,
  Flame,
  StickyNote,
  CalendarDays,
  TrendingUp,
  Loader2,
  ArrowRight,
} from "lucide-react";

const PRIORITY_LABEL: Record<string, string> = {
  TINGGI: "Tinggi",
  SEDANG: "Sedang",
  RENDAH: "Rendah",
};

export default function SummaryView({ onNavigate }: { onNavigate: (tab: string) => void }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const today = todayLocal();

  const { data: stats, isLoading, error } = useQuery<StatsData>({
    queryKey: ["stats"],
    queryFn: () => api<StatsData>("/api/stats"),
  });

  const { data: habits } = useQuery<HabitData[]>({
    queryKey: ["habits"],
    queryFn: () => api<HabitData[]>("/api/habits"),
  });

  const toggleTaskMutation = useMutation({
    mutationFn: ({ id, completed }: { id: string; completed: boolean }) =>
      api(`/api/tasks/${id}`, { method: "PATCH", body: JSON.stringify({ completed }) }),
    onSuccess: (_d, variables) => {
      queryClient.invalidateQueries({ queryKey: ["stats"] });
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      if (variables.completed) {
        toast({ title: "Kerja bagus! 🎉", description: "Tugas ditandai selesai." });
      }
    },
    onError: (e: Error) =>
      toast({ title: "Gagal", description: e.message, variant: "destructive" }),
  });

  const toggleHabitMutation = useMutation({
    mutationFn: (id: string) =>
      api<{ doneToday: boolean }>(`/api/habits/${id}/toggle`, { method: "POST" }),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["stats"] });
      queryClient.invalidateQueries({ queryKey: ["habits"] });
      if (data.doneToday) {
        toast({ title: "Mantap! 🔥", description: "Kebiasaan ditandai untuk hari ini." });
      }
    },
    onError: (e: Error) =>
      toast({ title: "Gagal", description: e.message, variant: "destructive" }),
  });

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((n) => (
            <Skeleton key={n} className="h-28 rounded-2xl" />
          ))}
        </div>
        <div className="grid lg:grid-cols-2 gap-4">
          <Skeleton className="h-72 rounded-2xl" />
          <Skeleton className="h-72 rounded-2xl" />
        </div>
      </div>
    );
  }

  if (error || !stats) {
    return (
      <Card className="rounded-2xl border-red-100 bg-red-50/50">
        <CardContent className="py-10 text-center text-red-600">
          Gagal memuat ringkasan. Coba muat ulang halaman.
        </CardContent>
      </Card>
    );
  }

  const totalHariIni = stats.habitsTotal;
  const persenKebiasaan = totalHariIni > 0
    ? Math.round((stats.habitsDoneToday / totalHariIni) * 100)
    : 0;
  const persenTugas = stats.totalTasks > 0
    ? Math.round((stats.totalCompleted / stats.totalTasks) * 100)
    : 0;

  const kartuStat = [
    {
      judul: "Tugas Aktif",
      nilai: stats.activeTasks,
      ikon: ListTodo,
      warna: "bg-blue-50 text-primary",
      ket: `${stats.totalTasks} total tugas`,
    },
    {
      judul: "Selesai Hari Ini",
      nilai: stats.completedToday,
      ikon: CheckCircle2,
      warna: "bg-emerald-50 text-emerald-600",
      ket: "Tugas diselesaikan hari ini",
    },
    {
      judul: "Kebiasaan Hari Ini",
      nilai: `${stats.habitsDoneToday}/${stats.habitsTotal}`,
      ikon: Flame,
      warna: "bg-orange-50 text-orange-500",
      ket: persenKebiasaan > 50 ? "Kamu di jalur yang tepat!" : "Ayo tandai kebiasaanmu",
    },
    {
      judul: "Total Catatan",
      nilai: stats.notesCount,
      ikon: StickyNote,
      warna: "bg-violet-50 text-violet-600",
      ket: "Catatan tersimpan",
    },
  ];

  return (
    <div className="space-y-6">
      {/* Sapaan */}
      <div>
        <h2 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
          <LayoutDashboard className="h-6 w-6 text-primary" />
          Ringkasan Produktivitas
        </h2>
        <p className="text-sm text-slate-500 mt-1">
          Pantau kemajuan tugas dan kebiasaanmu dalam sekilas pandang.
        </p>
      </div>

      {/* Kartu statistik */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {kartuStat.map((k) => (
          <Card key={k.judul} className="rounded-2xl hover:shadow-md transition-shadow">
            <CardContent className="p-4 sm:p-5">
              <div className={`h-10 w-10 rounded-xl flex items-center justify-center mb-3 ${k.warna}`}>
                <k.ikon className="h-5 w-5" />
              </div>
              <p className="text-2xl sm:text-3xl font-extrabold text-slate-900 leading-none">
                {k.nilai}
              </p>
              <p className="text-sm font-medium text-slate-700 mt-1.5">{k.judul}</p>
              <p className="text-xs text-slate-400 mt-0.5">{k.ket}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        {/* Grafik 7 hari */}
        <Card className="rounded-2xl">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-primary" />
              Aktivitas 7 Hari Terakhir
            </CardTitle>
            <CardDescription>Jumlah tugas yang diselesaikan per hari.</CardDescription>
          </CardHeader>
          <CardContent className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={stats.weekly} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 12, fill: "#64748b" }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  allowDecimals={false}
                  tick={{ fontSize: 12, fill: "#64748b" }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  cursor={{ fill: "rgba(37,99,235,0.06)" }}
                  contentStyle={{
                    borderRadius: 12,
                    border: "1px solid #e2e8f0",
                    fontSize: 13,
                  }}
                  formatter={(value: number | string) => [`${value} tugas`, "Selesai"]}
                  labelFormatter={(label: string) => `Hari: ${label}`}
                />
                <Bar dataKey="selesai" fill="#2563eb" radius={[6, 6, 0, 0]} maxBarSize={36} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Progres */}
        <Card className="rounded-2xl">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-primary" />
              Progres Keseluruhan
            </CardTitle>
            <CardDescription>Seberapa jauh kamu sudah melangkah.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5 pt-2">
            <div>
              <div className="flex items-center justify-between text-sm mb-1.5">
                <span className="font-medium text-slate-700">Tugas selesai</span>
                <span className="text-slate-500">
                  {stats.totalCompleted}/{stats.totalTasks} ({persenTugas}%)
                </span>
              </div>
              <Progress value={persenTugas} className="h-2.5 rounded-full" />
            </div>
            <div>
              <div className="flex items-center justify-between text-sm mb-1.5">
                <span className="font-medium text-slate-700">Kebiasaan hari ini</span>
                <span className="text-slate-500">
                  {stats.habitsDoneToday}/{stats.habitsTotal} ({persenKebiasaan}%)
                </span>
              </div>
              <Progress value={persenKebiasaan} className="h-2.5 rounded-full" />
            </div>
            <div className="grid grid-cols-2 gap-3 pt-1">
              <Button
                variant="outline"
                className="rounded-xl"
                onClick={() => onNavigate("tugas")}
              >
                Kelola Tugas
                <ArrowRight className="h-4 w-4 ml-1" />
              </Button>
              <Button
                variant="outline"
                className="rounded-xl"
                onClick={() => onNavigate("kebiasaan")}
              >
                Kelola Kebiasaan
                <ArrowRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        {/* Tugas mendatang */}
        <Card className="rounded-2xl">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <CalendarDays className="h-4 w-4 text-primary" />
              Tugas Prioritas Berikutnya
            </CardTitle>
            <CardDescription>Fokus pada 5 tugas teratas ini.</CardDescription>
          </CardHeader>
          <CardContent>
            {stats.upcomingTasks.length === 0 ? (
              <div className="py-8 text-center">
                <p className="text-sm text-slate-500">
                  Semua tugas selesai! Tambahkan tugas baru kapan pun kamu siap.
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-3 rounded-xl"
                  onClick={() => onNavigate("tugas")}
                >
                  Tambah Tugas
                </Button>
              </div>
            ) : (
              <ul className="space-y-2.5">
                {stats.upcomingTasks.map((t) => {
                  const overdue = t.dueDate && t.dueDate < today;
                  return (
                    <li
                      key={t.id}
                      className="flex items-start gap-3 rounded-xl border border-slate-100 p-3 hover:bg-slate-50/60 transition-colors"
                    >
                      <Checkbox
                        className="mt-0.5"
                        onCheckedChange={(v) =>
                          toggleTaskMutation.mutate({ id: t.id, completed: v === true })
                        }
                        aria-label={`Tandai ${t.title} selesai`}
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-900 break-words leading-snug">
                          {t.title}
                        </p>
                        <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                          <Badge
                            variant="outline"
                            className={`rounded-full text-[11px] ${
                              t.priority === "TINGGI"
                                ? "bg-red-50 text-red-700 border-red-200"
                                : t.priority === "SEDANG"
                                  ? "bg-amber-50 text-amber-700 border-amber-200"
                                  : "bg-emerald-50 text-emerald-700 border-emerald-200"
                            }`}
                          >
                            {PRIORITY_LABEL[t.priority] ?? t.priority}
                          </Badge>
                          {t.dueDate && (
                            <span
                              className={`text-[11px] inline-flex items-center gap-1 ${
                                overdue ? "text-red-600 font-medium" : "text-slate-400"
                              }`}
                            >
                              <CalendarDays className="h-3 w-3" />
                              {new Date(`${t.dueDate}T00:00:00`).toLocaleDateString("id-ID", {
                                day: "numeric",
                                month: "short",
                              })}
                              {overdue && " (terlambat)"}
                            </span>
                          )}
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* Kebiasaan hari ini */}
        <Card className="rounded-2xl">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Flame className="h-4 w-4 text-primary" />
              Kebiasaan Hari Ini
            </CardTitle>
            <CardDescription>Tandai kebiasaan yang sudah kamu lakukan.</CardDescription>
          </CardHeader>
          <CardContent>
            {!habits || habits.length === 0 ? (
              <div className="py-8 text-center">
                <p className="text-sm text-slate-500">
                  Belum ada kebiasaan. Mulai bangun kebiasaan baik pertamamu!
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-3 rounded-xl"
                  onClick={() => onNavigate("kebiasaan")}
                >
                  Buat Kebiasaan
                </Button>
              </div>
            ) : (
              <ul className="space-y-2.5 max-h-72 overflow-y-auto scrollbar-halus pr-1">
                {habits.map((h) => (
                  <li
                    key={h.id}
                    className="flex items-center gap-3 rounded-xl border border-slate-100 p-3 hover:bg-slate-50/60 transition-colors"
                  >
                    <span className="text-xl shrink-0" aria-hidden>
                      {h.emoji}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-900 truncate">{h.name}</p>
                      <p className="text-xs text-slate-400">
                        🔥 {h.streak} hari beruntun
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant={h.doneToday ? "default" : "outline"}
                      className={`rounded-lg h-8 min-w-9 px-2 shrink-0 ${
                        h.doneToday ? "bg-emerald-600 hover:bg-emerald-700" : ""
                      }`}
                      onClick={() => toggleHabitMutation.mutate(h.id)}
                      disabled={toggleHabitMutation.isPending}
                      aria-label={
                        h.doneToday
                          ? `Batal tandai ${h.name} hari ini`
                          : `Tandai ${h.name} hari ini`
                      }
                    >
                      {toggleHabitMutation.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : h.doneToday ? (
                        <CheckCircle2 className="h-4 w-4" />
                      ) : (
                        <Flame className="h-4 w-4" />
                      )}
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
