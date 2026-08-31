import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth, todayStr } from "@/lib/api-auth";

/** POST /api/habits/[id]/toggle — tandai/batal tandai kebiasaan hari ini */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId, response } = await requireAuth();
  if (!userId) return response;

  const { id } = await params;

  try {
    const habit = await db.habit.findFirst({ where: { id, userId } });
    if (!habit) {
      return NextResponse.json({ error: "Kebiasaan tidak ditemukan." }, { status: 404 });
    }

    const today = todayStr();
    const existingLog = await db.habitLog.findUnique({
      where: { habitId_date: { habitId: habit.id, date: today } },
    });

    if (existingLog) {
      await db.habitLog.delete({ where: { id: existingLog.id } });
      return NextResponse.json({ doneToday: false });
    } else {
      await db.habitLog.create({ data: { habitId: habit.id, date: today } });
      return NextResponse.json({ doneToday: true });
    }
  } catch (error) {
    console.error("POST /api/habits/[id]/toggle error:", error);
    return NextResponse.json({ error: "Gagal menandai kebiasaan." }, { status: 500 });
  }
}
