import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";

/**
 * Helper untuk melindungi API route.
 * Mengembalikan userId jika sesi valid, atau response 401 jika tidak.
 */
export async function requireAuth() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return {
      userId: null as string | null,
      response: NextResponse.json(
        { error: "Anda harus masuk terlebih dahulu." },
        { status: 401 }
      ),
    };
  }
  return { userId: session.user.id as string, response: null };
}

/** Tanggal hari ini dalam format YYYY-MM-DD (waktu server lokal). */
export function todayStr(offsetDays = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
