"use client";

import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { api, todayLocal } from "@/lib/fetcher";
import type { TaskData, Priority } from "@/lib/types";
import {
  CheckSquare,
  Plus,
  Trash2,
  Pencil,
  CalendarDays,
  Loader2,
  ListTodo,
  AlarmClockOff,
} from "lucide-react";

const PRIORITY_LABEL: Record<Priority, string> = {
  TINGGI: "Tinggi",
  SEDANG: "Sedang",
  RENDAH: "Rendah",
};

const PRIORITY_STYLE: Record<Priority, string> = {
  TINGGI: "bg-red-50 text-red-700 border-red-200",
  SEDANG: "bg-amber-50 text-amber-700 border-amber-200",
  RENDAH: "bg-emerald-50 text-emerald-700 border-emerald-200",
};

type Filter = "semua" | "aktif" | "selesai";

export default function TasksView() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // Form tambah
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("");
  const [priority, setPriority] = useState<Priority>("SEDANG");
  const [dueDate, setDueDate] = useState("");

  // Filter & edit
  const [filter, setFilter] = useState<Filter>("semua");
  const [editing, setEditing] = useState<TaskData | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [editCategory, setEditCategory] = useState("");
  const [editPriority, setEditPriority] = useState<Priority>("SEDANG");
  const [editDueDate, setEditDueDate] = useState("");

  const today = todayLocal();

  const { data: tasks, isLoading, error } = useQuery<TaskData[]>({
    queryKey: ["tasks"],
    queryFn: () => api<TaskData[]>("/api/tasks"),
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["tasks"] });
    queryClient.invalidateQueries({ queryKey: ["stats"] });
  };

  const createMutation = useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      api<TaskData>("/api/tasks", { method: "POST", body: JSON.stringify(payload) }),
    onSuccess: () => {
      invalidate();
      setTitle("");
      setCategory("");
      setPriority("SEDANG");
      setDueDate("");
      toast({ title: "Berhasil", description: "Tugas baru berhasil ditambahkan." });
    },
    onError: (e: Error) =>
      toast({ title: "Gagal", description: e.message, variant: "destructive" }),
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, completed }: { id: string; completed: boolean }) =>
      api<TaskData>(`/api/tasks/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ completed }),
      }),
    onSuccess: (updated) => {
      invalidate();
      if (updated.completed) {
        toast({ title: "Kerja bagus! 🎉", description: "Tugas ditandai selesai." });
      }
    },
    onError: (e: Error) =>
      toast({ title: "Gagal", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api(`/api/tasks/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      invalidate();
      toast({ title: "Terhapus", description: "Tugas berhasil dihapus." });
    },
    onError: (e: Error) =>
      toast({ title: "Gagal", description: e.message, variant: "destructive" }),
  });

  const editMutation = useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      api<TaskData>(`/api/tasks/${editing?.id}`, {
        method: "PATCH",
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      invalidate();
      setEditing(null);
      toast({ title: "Berhasil", description: "Tugas berhasil diperbarui." });
    },
    onError: (e: Error) =>
      toast({ title: "Gagal", description: e.message, variant: "destructive" }),
  });

  function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) {
      toast({ title: "Judul kosong", description: "Tulis dulu judul tugasnya ya.", variant: "destructive" });
      return;
    }
    createMutation.mutate({
      title: title.trim(),
      priority,
      category: category.trim() || "Umum",
      dueDate: dueDate || null,
    });
  }

  function openEdit(t: TaskData) {
    setEditing(t);
    setEditTitle(t.title);
    setEditDesc(t.description ?? "");
    setEditCategory(t.category);
    setEditPriority(t.priority);
    setEditDueDate(t.dueDate ?? "");
  }

  function handleEditSubmit() {
    if (!editTitle.trim()) {
      toast({ title: "Judul kosong", description: "Judul tidak boleh kosong.", variant: "destructive" });
      return;
    }
    editMutation.mutate({
      title: editTitle.trim(),
      description: editDesc,
      category: editCategory.trim() || "Umum",
      priority: editPriority,
      dueDate: editDueDate || null,
    });
  }

  const filtered = useMemo(() => {
    if (!tasks) return [];
    if (filter === "aktif") return tasks.filter((t) => !t.completed);
    if (filter === "selesai") return tasks.filter((t) => t.completed);
    return tasks;
  }, [tasks, filter]);

  const activeCount = tasks?.filter((t) => !t.completed).length ?? 0;
  const doneCount = tasks?.filter((t) => t.completed).length ?? 0;

  function formatTanggal(due: string) {
    const d = new Date(`${due}T00:00:00`);
    return d.toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" });
  }

  return (
    <div className="space-y-6">
      {/* Kartu tambah tugas */}
      <Card className="rounded-2xl">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <Plus className="h-5 w-5 text-primary" />
            Tambah Tugas Baru
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleAdd} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr_1fr_auto]">
            <div className="space-y-1.5">
              <Label htmlFor="task-title">Judul tugas</Label>
              <Input
                id="task-title"
                placeholder="Misal: Selesai laporan mingguan"
                className="rounded-xl"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={200}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="task-category">Kategori</Label>
              <Input
                id="task-category"
                placeholder="Misal: Kerja"
                className="rounded-xl"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                maxLength={50}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Prioritas</Label>
              <Select value={priority} onValueChange={(v) => setPriority(v as Priority)}>
                <SelectTrigger className="rounded-xl w-full">
                  <SelectValue placeholder="Pilih" />
                </SelectTrigger>
                <SelectContent className="rounded-xl">
                  <SelectItem value="TINGGI">🔴 Tinggi</SelectItem>
                  <SelectItem value="SEDANG">🟡 Sedang</SelectItem>
                  <SelectItem value="RENDAH">🟢 Rendah</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="task-due">Tenggat</Label>
              <Input
                id="task-due"
                type="date"
                className="rounded-xl"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
              />
            </div>
            <div className="flex items-end">
              <Button
                type="submit"
                className="rounded-xl w-full sm:w-auto"
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

      {/* Filter */}
      <div className="flex flex-wrap items-center gap-2">
        {(
          [
            { key: "semua", label: "Semua", count: (tasks?.length ?? 0) },
            { key: "aktif", label: "Aktif", count: activeCount },
            { key: "selesai", label: "Selesai", count: doneCount },
          ] as { key: Filter; label: string; count: number }[]
        ).map((f) => (
          <Button
            key={f.key}
            variant={filter === f.key ? "default" : "outline"}
            size="sm"
            className="rounded-full"
            onClick={() => setFilter(f.key)}
          >
            {f.label}
            <Badge
              variant="secondary"
              className={`ml-1.5 rounded-full ${
                filter === f.key ? "bg-white/20 text-white" : "bg-slate-100 text-slate-600"
              }`}
            >
              {f.count}
            </Badge>
          </Button>
        ))}
      </div>

      {/* Daftar tugas */}
      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((n) => (
            <Skeleton key={n} className="h-16 rounded-2xl" />
          ))}
        </div>
      ) : error ? (
        <Card className="rounded-2xl border-red-100 bg-red-50/50">
          <CardContent className="py-8 text-center text-red-600">
            Gagal memuat tugas. Coba muat ulang halaman.
          </CardContent>
        </Card>
      ) : filtered.length === 0 ? (
        <Card className="rounded-2xl border-dashed">
          <CardContent className="py-12 flex flex-col items-center text-center gap-3">
            <div className="h-14 w-14 rounded-2xl bg-blue-50 flex items-center justify-center">
              {filter === "selesai" ? (
                <AlarmClockOff className="h-7 w-7 text-primary" />
              ) : (
                <ListTodo className="h-7 w-7 text-primary" />
              )}
            </div>
            <div>
              <p className="font-semibold text-slate-800">
                {filter === "selesai"
                  ? "Belum ada tugas yang selesai"
                  : filter === "aktif"
                    ? "Tidak ada tugas aktif"
                    : "Belum ada tugas"}
              </p>
              <p className="text-sm text-slate-500 mt-1">
                {filter === "selesai"
                  ? "Tandai tugas sebagai selesai untuk melihatnya di sini."
                  : "Tambahkan tugas pertamamu lewat form di atas."}
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <ul className="space-y-3">
          {filtered.map((t) => {
            const overdue = !t.completed && t.dueDate && t.dueDate < today;
            return (
              <li key={t.id}>
                <Card
                  className={`rounded-2xl transition-all hover:shadow-md ${
                    t.completed ? "bg-slate-50/60" : ""
                  }`}
                >
                  <CardContent className="p-4 flex items-start gap-3">
                    <Checkbox
                      checked={t.completed}
                      onCheckedChange={(v) =>
                        toggleMutation.mutate({ id: t.id, completed: v === true })
                      }
                      className="mt-1"
                      aria-label={`Tandai ${t.title} sebagai selesai`}
                    />
                    <div className="flex-1 min-w-0">
                      <p
                        className={`font-medium leading-snug break-words ${
                          t.completed ? "line-through text-slate-400" : "text-slate-900"
                        }`}
                      >
                        {t.title}
                      </p>
                      {t.description && (
                        <p className="text-sm text-slate-500 mt-0.5 break-words">{t.description}</p>
                      )}
                      <div className="flex flex-wrap items-center gap-1.5 mt-2">
                        <Badge variant="outline" className={`rounded-full text-xs ${PRIORITY_STYLE[t.priority]}`}>
                          Prioritas {PRIORITY_LABEL[t.priority]}
                        </Badge>
                        <Badge variant="outline" className="rounded-full text-xs bg-slate-50 text-slate-600 border-slate-200">
                          {t.category}
                        </Badge>
                        {t.dueDate && (
                          <Badge
                            variant="outline"
                            className={`rounded-full text-xs gap-1 ${
                              overdue
                                ? "bg-red-50 text-red-700 border-red-200"
                                : "bg-blue-50 text-blue-700 border-blue-100"
                            }`}
                          >
                            <CalendarDays className="h-3 w-3" />
                            {overdue ? "Terlambat: " : "Tenggat: "}
                            {formatTanggal(t.dueDate)}
                          </Badge>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 rounded-lg text-slate-400 hover:text-primary"
                        onClick={() => openEdit(t)}
                        aria-label={`Edit tugas ${t.title}`}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 rounded-lg text-slate-400 hover:text-red-600"
                        onClick={() => deleteMutation.mutate(t.id)}
                        disabled={deleteMutation.isPending}
                        aria-label={`Hapus tugas ${t.title}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </li>
            );
          })}
        </ul>
      )}

      {/* Dialog edit tugas */}
      <Dialog open={!!editing} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent className="rounded-2xl sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckSquare className="h-5 w-5 text-primary" />
              Edit Tugas
            </DialogTitle>
            <DialogDescription>Ubah detail tugas sesuai kebutuhanmu.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="edit-title">Judul</Label>
              <Input
                id="edit-title"
                className="rounded-xl"
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                maxLength={200}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-desc">Deskripsi (opsional)</Label>
              <Textarea
                id="edit-desc"
                className="rounded-xl min-h-20"
                placeholder="Tambahkan detail tugas..."
                value={editDesc}
                onChange={(e) => setEditDesc(e.target.value)}
                maxLength={1000}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="edit-category">Kategori</Label>
                <Input
                  id="edit-category"
                  className="rounded-xl"
                  value={editCategory}
                  onChange={(e) => setEditCategory(e.target.value)}
                  maxLength={50}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="edit-due">Tenggat</Label>
                <Input
                  id="edit-due"
                  type="date"
                  className="rounded-xl"
                  value={editDueDate}
                  onChange={(e) => setEditDueDate(e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Prioritas</Label>
              <Select value={editPriority} onValueChange={(v) => setEditPriority(v as Priority)}>
                <SelectTrigger className="rounded-xl w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="rounded-xl">
                  <SelectItem value="TINGGI">🔴 Tinggi</SelectItem>
                  <SelectItem value="SEDANG">🟡 Sedang</SelectItem>
                  <SelectItem value="RENDAH">🟢 Rendah</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" className="rounded-xl" onClick={() => setEditing(null)}>
              Batal
            </Button>
            <Button
              className="rounded-xl"
              onClick={handleEditSubmit}
              disabled={editMutation.isPending}
            >
              {editMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                "Simpan Perubahan"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
