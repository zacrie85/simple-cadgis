import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth, todayStr } from "@/lib/api-auth";
import type { StatsData } from "@/lib/types";

const DAY_LABELS = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];

function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** GET /api/stats — ringkasan data untuk dashboard */
export async function GET() {
  const { userId, response } = await requireAuth();
  if (!userId) return response;

  try {
    const today = todayStr();

    const [totalTasks, totalCompleted, tasksToday, habits, notesCount] =
      await Promise.all([
        db.task.count({ where: { userId } }),
        db.task.count({ where: { userId, completed: true } }),
        db.task.findMany({
          where: {
            userId,
            completed: true,
            completedAt: { gte: new Date(`${today}T00:00:00`) },
          },
        }),
        db.habit.findMany({
          where: { userId },
          include: { logs: { where: { date: { gte: todayStr(-6) } } } },
          orderBy: { createdAt: "asc" },
        }),
        db.note.count({ where: { userId } }),
      ]);

    const habitsDoneToday = habits.filter((h) =>
      h.logs.some((l) => l.date === today)
    ).length;

    // Grafik 7 hari terakhir: tugas yang diselesaikan per hari
    const weekly: StatsData["weekly"] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateStr = toISODate(d);
      const count = await db.task.count({
        where: {
          userId,
          completed: true,
          completedAt: {
            gte: new Date(`${dateStr}T00:00:00`),
            lt: new Date(`${toISODate(new Date(d.getTime() + 86400000))}T00:00:00`),
          },
        },
      });
      weekly.push({ date: dateStr, label: DAY_LABELS[d.getDay()], selesai: count });
    }

    // Tugas mendatang: maksimal 5 tugas aktif dengan tenggat terdekat
    const activeTasks = await db.task.findMany({
      where: { userId, completed: false },
      orderBy: [{ dueDate: "asc" }, { createdAt: "desc" }],
      take: 10,
    });
    const upcomingTasks = activeTasks
      .sort((a, b) => {
        const da = a.dueDate ?? "9999-12-31";
        const dbb = b.dueDate ?? "9999-12-31";
        return da < dbb ? -1 : da > dbb ? 1 : 0;
      })
      .slice(0, 5);

    const stats: StatsData = {
      activeTasks: totalTasks - totalCompleted,
      completedToday: tasksToday.length,
      totalTasks,
      totalCompleted,
      habitsTotal: habits.length,
      habitsDoneToday,
      notesCount,
      weekly,
      upcomingTasks: upcomingTasks.map((t) => ({
        id: t.id,
        title: t.title,
        description: t.description,
        priority: t.priority as StatsData["upcomingTasks"][number]["priority"],
        category: t.category,
        dueDate: t.dueDate,
        completed: t.completed,
        createdAt: t.createdAt.toISOString(),
        completedAt: t.completedAt ? t.completedAt.toISOString() : null,
      })),
    };

    return NextResponse.json(stats);
  } catch (error) {
    console.error("GET /api/stats error:", error);
    return NextResponse.json({ error: "Gagal memuat ringkasan." }, { status: 500 });
  }
}
