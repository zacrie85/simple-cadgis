import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { db } from "@/lib/db";

const registerSchema = z.object({
  name: z.string().min(2, "Nama minimal 2 karakter").max(50, "Nama maksimal 50 karakter"),
  email: z.string().email("Format email tidak valid"),
  password: z.string().min(6, "Sandi minimal 6 karakter").max(100, "Sandi maksimal 100 karakter"),
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = registerSchema.safeParse(body);
    if (!parsed.success) {
      const message = parsed.error.issues[0]?.message ?? "Data tidak valid";
      return NextResponse.json({ error: message }, { status: 400 });
    }

    const email = parsed.data.email.toLowerCase().trim();
    const existing = await db.user.findUnique({ where: { email } });
    if (existing) {
      return NextResponse.json(
        { error: "Email sudah terdaftar. Silakan masuk dengan akun Anda." },
        { status: 409 }
      );
    }

    const passwordHash = await bcrypt.hash(parsed.data.password, 10);
    const user = await db.user.create({
      data: {
        name: parsed.data.name.trim(),
        email,
        passwordHash,
      },
    });

    return NextResponse.json(
      { id: user.id, name: user.name, email: user.email },
      { status: 201 }
    );
  } catch (error) {
    console.error("Kesalahan registrasi:", error);
    return NextResponse.json(
      { error: "Terjadi kesalahan pada server. Coba lagi." },
      { status: 500 }
    );
  }
}
