import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/api-auth";

const updateNoteSchema = z.object({
  title: z.string().min(1, "Judul catatan wajib diisi").max(100).optional(),
  content: z.string().max(5000).optional(),
  color: z.enum(["kuning", "biru", "hijau", "merah", "ungu"]).optional(),
});

/** PATCH /api/notes/[id] — perbarui catatan */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId, response } = await requireAuth();
  if (!userId) return response;

  const { id } = await params;

  try {
    const existing = await db.note.findFirst({ where: { id, userId } });
    if (!existing) {
      return NextResponse.json({ error: "Catatan tidak ditemukan." }, { status: 404 });
    }

    const body = await req.json();
    const parsed = updateNoteSchema.safeParse(body);
    if (!parsed.success) {
      const message = parsed.error.issues[0]?.message ?? "Data tidak valid";
      return NextResponse.json({ error: message }, { status: 400 });
    }

    const note = await db.note.update({
      where: { id: existing.id },
      data: {
        ...(parsed.data.title !== undefined ? { title: parsed.data.title.trim() } : {}),
        ...(parsed.data.content !== undefined ? { content: parsed.data.content } : {}),
        ...(parsed.data.color !== undefined ? { color: parsed.data.color } : {}),
      },
    });

    return NextResponse.json(note);
  } catch (error) {
    console.error("PATCH /api/notes/[id] error:", error);
    return NextResponse.json({ error: "Gagal memperbarui catatan." }, { status: 500 });
  }
}

/** DELETE /api/notes/[id] — hapus catatan */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId, response } = await requireAuth();
  if (!userId) return response;

  const { id } = await params;

  try {
    const existing = await db.note.findFirst({ where: { id, userId } });
    if (!existing) {
      return NextResponse.json({ error: "Catatan tidak ditemukan." }, { status: 404 });
    }
    await db.note.delete({ where: { id: existing.id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("DELETE /api/notes/[id] error:", error);
    return NextResponse.json({ error: "Gagal menghapus catatan." }, { status: 500 });
  }
}
