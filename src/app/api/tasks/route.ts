import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/api-auth";
import type { Priority } from "@/lib/types";

const PRIORITIES: Priority[] = ["RENDAH", "SEDANG", "TINGGI"];

const PRIORITY_ORDER: Record<string, number> = { TINGGI: 0, SEDANG: 1, RENDAH: 2 };

const createTaskSchema = z.object({
  title: z.string().min(1, "Judul tugas wajib diisi").max(200, "Judul maksimal 200 karakter"),
  description: z.string().max(1000, "Deskripsi maksimal 1000 karakter").optional().nullable(),
  priority: z.enum(["RENDAH", "SEDANG", "TINGGI"]).default("SEDANG"),
  category: z.string().max(50).default("Umum"),
  dueDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Format tanggal tidak valid")
    .optional()
    .nullable(),
});

/** GET /api/tasks — daftar seluruh tugas milik pengguna */
export async function GET() {
  const { userId, response } = await requireAuth();
  if (!userId) return response;

  try {
    const tasks = await db.task.findMany({
      where: { userId },
      orderBy: [{ createdAt: "asc" }],
    });

    // Urutkan: yang belum selesai dulu, lalu prioritas, lalu tenggat terdekat
    const sorted = tasks.sort((a, b) => {
      if (a.completed !== b.completed) return a.completed ? 1 : -1;
      const pa = PRIORITY_ORDER[a.priority] ?? 1;
      const pb = PRIORITY_ORDER[b.priority] ?? 1;
      if (pa !== pb) return pa - pb;
      const da = a.dueDate ?? "9999-12-31";
      const dbb = b.dueDate ?? "9999-12-31";
      if (da !== dbb) return da < dbb ? -1 : 1;
      return 0;
    });

    return NextResponse.json(sorted);
  } catch (error) {
    console.error("GET /api/tasks error:", error);
    return NextResponse.json({ error: "Gagal memuat tugas." }, { status: 500 });
  }
}

/** POST /api/tasks — buat tugas baru */
export async function POST(req: NextRequest) {
  const { userId, response } = await requireAuth();
  if (!userId) return response;

  try {
    const body = await req.json();
    const parsed = createTaskSchema.safeParse(body);
    if (!parsed.success) {
      const message = parsed.error.issues[0]?.message ?? "Data tugas tidak valid";
      return NextResponse.json({ error: message }, { status: 400 });
    }

    if (parsed.data.priority && !PRIORITIES.includes(parsed.data.priority as Priority)) {
      return NextResponse.json({ error: "Prioritas tidak valid" }, { status: 400 });
    }

    const task = await db.task.create({
      data: {
        userId,
        title: parsed.data.title.trim(),
        description: parsed.data.description?.trim() || null,
        priority: parsed.data.priority,
        category: parsed.data.category?.trim() || "Umum",
        dueDate: parsed.data.dueDate || null,
      },
    });

    return NextResponse.json(task, { status: 201 });
  } catch (error) {
    console.error("POST /api/tasks error:", error);
    return NextResponse.json({ error: "Gagal membuat tugas." }, { status: 500 });
  }
}
