import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireAuth, todayStr } from "@/lib/api-auth";
import type { HabitData } from "@/lib/types";

const createHabitSchema = z.object({
  name: z.string().min(1, "Nama kebiasaan wajib diisi").max(100, "Nama maksimal 100 karakter"),
  emoji: z.string().min(1).max(8).default("✅"),
});

/** Hitung rentang beruntun (streak) dari daftar tanggal YYYY-MM-DD. */
function computeStreak(dates: Set<string>): number {
  let streak = 0;
  let cursor = todayStr(); // mulai dari hari ini
  if (!dates.has(cursor)) {
    // Jika hari ini belum ditandai, streak masih dihitung dari kemarin
    cursor = todayStr(-1);
    if (!dates.has(cursor)) return 0;
  }
  while (dates.has(cursor)) {
    streak += 1;
    const d = new Date(cursor + "T00:00:00");
    d.setDate(d.getDate() - 1);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    cursor = `${y}-${m}-${day}`;
  }
  return streak;
}

/** GET /api/habits — daftar kebiasaan + log 60 hari terakhir untuk streak */
export async function GET() {
  const { userId, response } = await requireAuth();
  if (!userId) return response;

  try {
    const habits = await db.habit.findMany({
      where: { userId },
      include: {
        logs: {
          where: {
            date: { gte: todayStr(-59) },
          },
          orderBy: { date: "desc" },
        },
      },
      orderBy: { createdAt: "asc" },
    });

    const today = todayStr();
    const result: HabitData[] = habits.map((h) => {
      const dates = new Set(h.logs.map((l) => l.date));
      return {
        id: h.id,
        name: h.name,
        emoji: h.emoji,
        createdAt: h.createdAt.toISOString(),
        logs: h.logs.map((l) => ({ id: l.id, habitId: l.habitId, date: l.date })),
        streak: computeStreak(dates),
        doneToday: dates.has(today),
      };
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error("GET /api/habits error:", error);
    return NextResponse.json({ error: "Gagal memuat kebiasaan." }, { status: 500 });
  }
}

/** POST /api/habits — buat kebiasaan baru */
export async function POST(req: NextRequest) {
  const { userId, response } = await requireAuth();
  if (!userId) return response;

  try {
    const body = await req.json();
    const parsed = createHabitSchema.safeParse(body);
    if (!parsed.success) {
      const message = parsed.error.issues[0]?.message ?? "Data tidak valid";
      return NextResponse.json({ error: message }, { status: 400 });
    }

    const habit = await db.habit.create({
      data: {
        userId,
        name: parsed.data.name.trim(),
        emoji: parsed.data.emoji,
      },
    });

    return NextResponse.json(
      { id: habit.id, name: habit.name, emoji: habit.emoji, logs: [], streak: 0, doneToday: false },
      { status: 201 }
    );
  } catch (error) {
    console.error("POST /api/habits error:", error);
    return NextResponse.json({ error: "Gagal membuat kebiasaan." }, { status: 500 });
  }
}
