import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";

export const authOptions: NextAuthOptions = {
  session: {
    strategy: "jwt",
    maxAge: 60 * 60 * 24 * 30, // 30 hari
  },
  secret: process.env.NEXTAUTH_SECRET ?? "produkta-fallback-secret",
  pages: {
    signIn: "/",
  },
  providers: [
    CredentialsProvider({
      name: "Email dan Sandi",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Sandi", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          return null;
        }
        const email = credentials.email.toLowerCase().trim();
        const user = await db.user.findUnique({ where: { email } });
        if (!user) return null;
        const valid = await bcrypt.compare(credentials.password, user.passwordHash);
        if (!valid) return null;
        return { id: user.id, name: user.name, email: user.email };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = (token.id as string) ?? "";
      }
      return session;
    },
  },
};
