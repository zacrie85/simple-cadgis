import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/api-auth";

const updateHabitSchema = z.object({
  name: z.string().min(1, "Nama kebiasaan wajib diisi").max(100).optional(),
  emoji: z.string().min(1).max(8).optional(),
});

/** PATCH /api/habits/[id] — edit kebiasaan */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId, response } = await requireAuth();
  if (!userId) return response;

  const { id } = await params;

  try {
    const existing = await db.habit.findFirst({ where: { id, userId } });
    if (!existing) {
      return NextResponse.json({ error: "Kebiasaan tidak ditemukan." }, { status: 404 });
    }

    const body = await req.json();
    const parsed = updateHabitSchema.safeParse(body);
    if (!parsed.success) {
      const message = parsed.error.issues[0]?.message ?? "Data tidak valid";
      return NextResponse.json({ error: message }, { status: 400 });
    }

    const habit = await db.habit.update({
      where: { id: existing.id },
      data: {
        ...(parsed.data.name !== undefined ? { name: parsed.data.name.trim() } : {}),
        ...(parsed.data.emoji !== undefined ? { emoji: parsed.data.emoji } : {}),
      },
    });

    return NextResponse.json(habit);
  } catch (error) {
    console.error("PATCH /api/habits/[id] error:", error);
    return NextResponse.json({ error: "Gagal memperbarui kebiasaan." }, { status: 500 });
  }
}

/** DELETE /api/habits/[id] — hapus kebiasaan beserta lognya */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId, response } = await requireAuth();
  if (!userId) return response;

  const { id } = await params;

  try {
    const existing = await db.habit.findFirst({ where: { id, userId } });
    if (!existing) {
      return NextResponse.json({ error: "Kebiasaan tidak ditemukan." }, { status: 404 });
    }
    await db.habit.delete({ where: { id: existing.id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("DELETE /api/habits/[id] error:", error);
    return NextResponse.json({ error: "Gagal menghapus kebiasaan." }, { status: 500 });
  }
}
