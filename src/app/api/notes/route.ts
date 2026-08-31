import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/api-auth";

const NOTE_COLORS = ["kuning", "biru", "hijau", "merah", "ungu"] as const;

const createNoteSchema = z.object({
  title: z.string().min(1, "Judul catatan wajib diisi").max(100, "Judul maksimal 100 karakter"),
  content: z.string().max(5000, "Isi catatan maksimal 5000 karakter").default(""),
  color: z.enum(NOTE_COLORS).default("kuning"),
});

/** GET /api/notes — daftar catatan milik pengguna (terbaru dulu) */
export async function GET() {
  const { userId, response } = await requireAuth();
  if (!userId) return response;

  try {
    const notes = await db.note.findMany({
      where: { userId },
      orderBy: { updatedAt: "desc" },
    });
    return NextResponse.json(notes);
  } catch (error) {
    console.error("GET /api/notes error:", error);
    return NextResponse.json({ error: "Gagal memuat catatan." }, { status: 500 });
  }
}

/** POST /api/notes — buat catatan baru */
export async function POST(req: NextRequest) {
  const { userId, response } = await requireAuth();
  if (!userId) return response;

  try {
    const body = await req.json();
    const parsed = createNoteSchema.safeParse(body);
    if (!parsed.success) {
      const message = parsed.error.issues[0]?.message ?? "Data tidak valid";
      return NextResponse.json({ error: message }, { status: 400 });
    }

    const note = await db.note.create({
      data: {
        userId,
        title: parsed.data.title.trim(),
        content: parsed.data.content,
        color: parsed.data.color,
      },
    });

    return NextResponse.json(note, { status: 201 });
  } catch (error) {
    console.error("POST /api/notes error:", error);
    return NextResponse.json({ error: "Gagal membuat catatan." }, { status: 500 });
  }
}
