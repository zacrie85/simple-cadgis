"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { api, todayLocal } from "@/lib/fetcher";
import type { HabitData } from "@/lib/types";
import { Flame, Plus, Trash2, Loader2, Check, CalendarRange } from "lucide-react";

const EMOJI_OPTIONS = ["💪", "📖", "🏃", "🧘", "💧", "🌱", "🎯", "🛌", "✍️", "🍎", "🧹", "☀️"];

const HARI_SINGKAT = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];

function last7Days(): { date: string; label: string }[] {
  const days: { date: string; label: string }[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    days.push({ date: `${y}-${m}-${day}`, label: HARI_SINGKAT[d.getDay()] });
  }
  return days;
}

export default function HabitsView() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [name, setName] = useState("");
  const [emoji, setEmoji] = useState(EMOJI_OPTIONS[0]);
  const today = todayLocal();
  const week = last7Days();

  const { data: habits, isLoading, error } = useQuery<HabitData[]>({
    queryKey: ["habits"],
    queryFn: () => api<HabitData[]>("/api/habits"),
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["habits"] });
    queryClient.invalidateQueries({ queryKey: ["stats"] });
  };

  const createMutation = useMutation({
    mutationFn: (payload: { name: string; emoji: string }) =>
      api("/api/habits", { method: "POST", body: JSON.stringify(payload) }),
    onSuccess: () => {
      invalidate();
      setName("");
      setEmoji(EMOJI_OPTIONS[0]);
      toast({ title: "Berhasil", description: "Kebiasaan baru berhasil dibuat." });
    },
    onError: (e: Error) =>
      toast({ title: "Gagal", description: e.message, variant: "destructive" }),
  });

  const toggleMutation = useMutation({
    mutationFn: (id: string) =>
      api<{ doneToday: boolean }>(`/api/habits/${id}/toggle`, { method: "POST" }),
    onSuccess: (data) => {
      invalidate();
      if (data.doneToday) {
        toast({ title: "Mantap! 🔥", description: "Kebiasaan ditandai untuk hari ini." });
      } else {
        toast({ title: "Dibatalkan", description: "Penandaan hari ini dilepas." });
      }
    },
    onError: (e: Error) =>
      toast({ title: "Gagal", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api(`/api/habits/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      invalidate();
      toast({ title: "Terhapus", description: "Kebiasaan berhasil dihapus." });
    },
    onError: (e: Error) =>
      toast({ title: "Gagal", description: e.message, variant: "destructive" }),
  });

  function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      toast({
        title: "Nama kosong",
        description: "Tulis dulu nama kebiasaannya ya.",
        variant: "destructive",
      });
      return;
    }
    createMutation.mutate({ name: name.trim(), emoji });
  }

  const doneTodayCount = habits?.filter((h) => h.doneToday).length ?? 0;

  return (
    <div className="space-y-6">
      {/* Kartu tambah kebiasaan */}
      <Card className="rounded-2xl">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <Flame className="h-5 w-5 text-primary" />
            Tambah Kebiasaan Baik
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleAdd} className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-[2fr_1fr_auto] items-end">
              <div className="space-y-1.5">
                <Label htmlFor="habit-name">Nama kebiasaan</Label>
                <Input
                  id="habit-name"
                  placeholder="Misal: Minum 8 gelas air"
                  className="rounded-xl"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  maxLength={100}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Pilih ikon</Label>
                <div className="flex flex-wrap gap-1">
                  {EMOJI_OPTIONS.map((opt) => (
                    <button
                      key={opt}
                      type="button"
                      onClick={() => setEmoji(opt)}
                      aria-label={`Pilih ikon ${opt}`}
                      aria-pressed={emoji === opt}
                      className={`h-9 w-9 rounded-xl text-lg flex items-center justify-center transition-all border ${
                        emoji === opt
                          ? "bg-blue-50 border-primary ring-1 ring-primary"
                          : "bg-white border-slate-200 hover:bg-slate-50"
                      }`}
                    >
                      {opt}
                    </button>
                  ))}
                </div>
              </div>
              <Button
                type="submit"
                className="rounded-xl"
                disabled={createMutation.isPending}
              >
                {createMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <>
                    <Plus className="h-4 w-4 sm:mr-1" />
                    <span className="hidden sm:inline">Tambah</span>
                  </>
                )}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Ringkasan hari ini */}
      {habits && habits.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 text-sm text-slate-600">
          <Badge
            variant="outline"
            className="rounded-full bg-blue-50 text-blue-700 border-blue-100 gap-1"
          >
            <CalendarRange className="h-3 w-3" />
            Hari ini: {doneTodayCount}/{habits.length} kebiasaan ditandai
          </Badge>
        </div>
      )}

      {/* Daftar kebiasaan */}
      {isLoading ? (
        <div className="grid sm:grid-cols-2 gap-4">
          {[1, 2].map((n) => (
            <Skeleton key={n} className="h-44 rounded-2xl" />
          ))}
        </div>
      ) : error ? (
        <Card className="rounded-2xl border-red-100 bg-red-50/50">
          <CardContent className="py-8 text-center text-red-600">
            Gagal memuat kebiasaan. Coba muat ulang halaman.
          </CardContent>
        </Card>
      ) : !habits || habits.length === 0 ? (
        <Card className="rounded-2xl border-dashed">
          <CardContent className="py-12 flex flex-col items-center text-center gap-3">
            <div className="h-14 w-14 rounded-2xl bg-blue-50 flex items-center justify-center">
              <Flame className="h-7 w-7 text-primary" />
            </div>
            <div>
              <p className="font-semibold text-slate-800">Belum ada kebiasaan</p>
              <p className="text-sm text-slate-500 mt-1">
                Mulai bangun kebiasaan baikmu — misalnya olahraga, membaca, atau minum air.
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid sm:grid-cols-2 gap-4">
          {habits.map((h) => (
            <Card
              key={h.id}
              className={`rounded-2xl transition-all hover:shadow-md ${
                h.doneToday ? "border-emerald-200 bg-emerald-50/40" : ""
              }`}
            >
              <CardContent className="p-5">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="h-11 w-11 rounded-xl bg-white border border-slate-100 flex items-center justify-center text-2xl shrink-0">
                      {h.emoji}
                    </div>
                    <div className="min-w-0">
                      <p className="font-semibold text-slate-900 truncate">{h.name}</p>
                      <p className="text-xs text-slate-500 flex items-center gap-1 mt-0.5">
                        <Flame
                          className={`h-3.5 w-3.5 ${
                            h.streak > 0 ? "text-orange-500" : "text-slate-300"
                          }`}
                        />
                        Rentang beruntun: <span className="font-semibold">{h.streak}</span> hari
                      </p>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 rounded-lg text-slate-400 hover:text-red-600 shrink-0"
                    onClick={() => deleteMutation.mutate(h.id)}
                    disabled={deleteMutation.isPending}
                    aria-label={`Hapus kebiasaan ${h.name}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>

                {/* 7 hari terakhir */}
                <div className="mt-4 grid grid-cols-7 gap-1.5">
                  {week.map((d) => {
                    const logged = h.logs.some((l) => l.date === d.date);
                    const isToday = d.date === today;
                    return (
                      <div key={d.date} className="flex flex-col items-center gap-1">
                        <span
                          className={`text-[10px] ${
                            isToday ? "font-bold text-primary" : "text-slate-400"
                          }`}
                        >
                          {d.label}
                        </span>
                        <div
                          className={`h-7 w-full rounded-lg flex items-center justify-center border ${
                            logged
                              ? "bg-emerald-100 border-emerald-300"
                              : "bg-slate-50 border-slate-100"
                          } ${isToday ? "ring-1 ring-primary" : ""}`}
                          title={d.date}
                        >
                          {logged && <Check className="h-3.5 w-3.5 text-emerald-700" />}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Tombol tandai hari ini */}
                <Button
                  className={`w-full mt-4 rounded-xl ${
                    h.doneToday
                      ? "bg-emerald-600 hover:bg-emerald-700"
                      : ""
                  }`}
                  variant={h.doneToday ? "default" : "outline"}
                  onClick={() => toggleMutation.mutate(h.id)}
                  disabled={toggleMutation.isPending}
                >
                  {toggleMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <>
                      <Check className="h-4 w-4 mr-1" />
                      {h.doneToday ? "Selesai hari ini" : "Tandai hari ini"}
                    </>
                  )}
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
