import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/api-auth";

const updateTaskSchema = z.object({
  title: z.string().min(1, "Judul tugas wajib diisi").max(200).optional(),
  description: z.string().max(1000).optional().nullable(),
  priority: z.enum(["RENDAH", "SEDANG", "TINGGI"]).optional(),
  category: z.string().max(50).optional(),
  dueDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Format tanggal tidak valid")
    .optional()
    .nullable(),
  completed: z.boolean().optional(),
});

/** PATCH /api/tasks/[id] — perbarui tugas (ubah status / edit isi) */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId, response } = await requireAuth();
  if (!userId) return response;

  const { id } = await params;

  try {
    const existing = await db.task.findFirst({ where: { id, userId } });
    if (!existing) {
      return NextResponse.json({ error: "Tugas tidak ditemukan." }, { status: 404 });
    }

    const body = await req.json();
    const parsed = updateTaskSchema.safeParse(body);
    if (!parsed.success) {
      const message = parsed.error.issues[0]?.message ?? "Data tidak valid";
      return NextResponse.json({ error: message }, { status: 400 });
    }

    const data = parsed.data;
    const task = await db.task.update({
      where: { id: existing.id },
      data: {
        ...(data.title !== undefined ? { title: data.title.trim() } : {}),
        ...(data.description !== undefined
          ? { description: data.description?.trim() || null }
          : {}),
        ...(data.priority !== undefined ? { priority: data.priority } : {}),
        ...(data.category !== undefined ? { category: data.category.trim() || "Umum" } : {}),
        ...(data.dueDate !== undefined ? { dueDate: data.dueDate || null } : {}),
        ...(data.completed !== undefined
          ? {
              completed: data.completed,
              completedAt: data.completed ? new Date() : null,
            }
          : {}),
      },
    });

    return NextResponse.json(task);
  } catch (error) {
    console.error("PATCH /api/tasks/[id] error:", error);
    return NextResponse.json({ error: "Gagal memperbarui tugas." }, { status: 500 });
  }
}

/** DELETE /api/tasks/[id] — hapus tugas */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId, response } = await requireAuth();
  if (!userId) return response;

  const { id } = await params;

  try {
    const existing = await db.task.findFirst({ where: { id, userId } });
    if (!existing) {
      return NextResponse.json({ error: "Tugas tidak ditemukan." }, { status: 404 });
    }
    await db.task.delete({ where: { id: existing.id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("DELETE /api/tasks/[id] error:", error);
    return NextResponse.json({ error: "Gagal menghapus tugas." }, { status: 500 });
  }
}
