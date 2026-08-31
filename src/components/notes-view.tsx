"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { api } from "@/lib/fetcher";
import type { NoteData } from "@/lib/types";
import { StickyNote, Plus, Trash2, Pencil, Loader2 } from "lucide-react";

const WARNA: Record<
  string,
  { kartu: string; titik: string; label: string }
> = {
  kuning: { kartu: "bg-amber-50 border-amber-200", titik: "bg-amber-300", label: "Kuning" },
  biru: { kartu: "bg-blue-50 border-blue-200", titik: "bg-blue-300", label: "Biru" },
  hijau: { kartu: "bg-emerald-50 border-emerald-200", titik: "bg-emerald-300", label: "Hijau" },
  merah: { kartu: "bg-rose-50 border-rose-200", titik: "bg-rose-300", label: "Merah Muda" },
  ungu: { kartu: "bg-violet-50 border-violet-200", titik: "bg-violet-300", label: "Ungu" },
};

function formatTanggal(iso: string) {
  return new Date(iso).toLocaleDateString("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export default function NotesView() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [color, setColor] = useState("kuning");

  const { data: notes, isLoading, error } = useQuery<NoteData[]>({
    queryKey: ["notes"],
    queryFn: () => api<NoteData[]>("/api/notes"),
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["notes"] });
    queryClient.invalidateQueries({ queryKey: ["stats"] });
  };

  const saveMutation = useMutation({
    mutationFn: (payload: { url: string; method: "POST" | "PATCH"; body: Record<string, unknown> }) =>
      api(payload.url, {
        method: payload.method,
        body: JSON.stringify(payload.body),
      }),
    onSuccess: (_data, variables) => {
      invalidate();
      setDialogOpen(false);
      toast({
        title: "Berhasil",
        description:
          variables.method === "POST"
            ? "Catatan baru berhasil dibuat."
            : "Catatan berhasil diperbarui.",
      });
    },
    onError: (e: Error) =>
      toast({ title: "Gagal", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api(`/api/notes/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      invalidate();
      toast({ title: "Terhapus", description: "Catatan berhasil dihapus." });
    },
    onError: (e: Error) =>
      toast({ title: "Gagal", description: e.message, variant: "destructive" }),
  });

  function openCreate() {
    setEditingId(null);
    setTitle("");
    setContent("");
    setColor("kuning");
    setDialogOpen(true);
  }

  function openEdit(n: NoteData) {
    setEditingId(n.id);
    setTitle(n.title);
    setContent(n.content);
    setColor(n.color);
    setDialogOpen(true);
  }

  function handleSave() {
    if (!title.trim()) {
      toast({
        title: "Judul kosong",
        description: "Tulis dulu judul catatannya ya.",
        variant: "destructive",
      });
      return;
    }
    saveMutation.mutate({
      url: editingId ? `/api/notes/${editingId}` : "/api/notes",
      method: editingId ? "PATCH" : "POST",
      body: { title: title.trim(), content, color },
    });
  }

  return (
    <div className="space-y-6">
      {/* Tombol tambah */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
            <StickyNote className="h-5 w-5 text-primary" />
            Catatanmu
          </h2>
          <p className="text-sm text-slate-500 mt-0.5">
            Simpan ide, rencana, dan hal penting lainnya.
          </p>
        </div>
        <Button className="rounded-xl" onClick={openCreate}>
          <Plus className="h-4 w-4 mr-1" />
          Catatan Baru
        </Button>
      </div>

      {/* Daftar catatan */}
      {isLoading ? (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((n) => (
            <Skeleton key={n} className="h-40 rounded-2xl" />
          ))}
        </div>
      ) : error ? (
        <Card className="rounded-2xl border-red-100 bg-red-50/50">
          <CardContent className="py-8 text-center text-red-600">
            Gagal memuat catatan. Coba muat ulang halaman.
          </CardContent>
        </Card>
      ) : !notes || notes.length === 0 ? (
        <Card className="rounded-2xl border-dashed">
          <CardContent className="py-12 flex flex-col items-center text-center gap-3">
            <div className="h-14 w-14 rounded-2xl bg-blue-50 flex items-center justify-center">
              <StickyNote className="h-7 w-7 text-primary" />
            </div>
            <div>
              <p className="font-semibold text-slate-800">Belum ada catatan</p>
              <p className="text-sm text-slate-500 mt-1">
                Klik &quot;Catatan Baru&quot; untuk menyimpan ide pertamamu.
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {notes.map((n) => {
            const w = WARNA[n.color] ?? WARNA.kuning;
            return (
              <Card
                key={n.id}
                className={`rounded-2xl border ${w.kartu} transition-all hover:shadow-md group`}
              >
                <CardContent className="p-4 flex flex-col h-full">
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-semibold text-slate-900 leading-snug break-words flex-1">
                      {n.title}
                    </p>
                    <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 rounded-lg text-slate-500 hover:text-primary"
                        onClick={() => openEdit(n)}
                        aria-label={`Edit catatan ${n.title}`}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 rounded-lg text-slate-500 hover:text-red-600"
                        onClick={() => deleteMutation.mutate(n.id)}
                        disabled={deleteMutation.isPending}
                        aria-label={`Hapus catatan ${n.title}`}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                  {n.content && (
                    <p className="text-sm text-slate-600 mt-2 whitespace-pre-wrap break-words line-clamp-6 flex-1">
                      {n.content}
                    </p>
                  )}
                  <div className="flex items-center gap-1.5 mt-3 pt-2 border-t border-black/5">
                    <span className={`h-2.5 w-2.5 rounded-full ${w.titik}`} aria-hidden />
                    <span className="text-xs text-slate-500">{w.label}</span>
                    <span className="text-xs text-slate-400 ml-auto">
                      {formatTanggal(n.updatedAt)}
                    </span>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Dialog catatan */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="rounded-2xl sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <StickyNote className="h-5 w-5 text-primary" />
              {editingId ? "Edit Catatan" : "Catatan Baru"}
            </DialogTitle>
            <DialogDescription>
              {editingId
                ? "Perbarui isi catatanmu di sini."
                : "Tuliskan ide atau hal penting yang ingin kamu simpan."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="note-title">Judul</Label>
              <Input
                id="note-title"
                placeholder="Misal: Ide proyek akhir pekan"
                className="rounded-xl"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={100}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="note-content">Isi catatan</Label>
              <Textarea
                id="note-content"
                placeholder="Tulis apa saja di sini..."
                className="rounded-xl min-h-32"
                value={content}
                onChange={(e) => setContent(e.target.value)}
                maxLength={5000}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Warna catatan</Label>
              <div className="flex gap-2">
                {Object.entries(WARNA).map(([key, w]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setColor(key)}
                    aria-label={`Warna ${w.label}`}
                    aria-pressed={color === key}
                    className={`h-9 w-9 rounded-full ${w.titik} transition-all ${
                      color === key
                        ? "ring-2 ring-offset-2 ring-slate-400 scale-110"
                        : "opacity-70 hover:opacity-100"
                    }`}
                  />
                ))}
              </div>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" className="rounded-xl" onClick={() => setDialogOpen(false)}>
              Batal
            </Button>
            <Button className="rounded-xl" onClick={handleSave} disabled={saveMutation.isPending}>
              {saveMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : editingId ? (
                "Simpan Perubahan"
              ) : (
                "Buat Catatan"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
