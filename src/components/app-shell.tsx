"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signOut } from "next-auth/react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import Providers from "@/components/providers";
import SummaryView from "@/components/summary-view";
import TasksView from "@/components/tasks-view";
import HabitsView from "@/components/habits-view";
import NotesView from "@/components/notes-view";
import type { UserData } from "@/lib/types";
import {
  Sparkles,
  LayoutDashboard,
  CheckSquare,
  Flame,
  StickyNote,
  LogOut,
} from "lucide-react";

export default function AppShell({ user }: { user: UserData }) {
  const router = useRouter();
  const [tab, setTab] = useState("ringkasan");

  const initial = (user.name || "P").trim().charAt(0).toUpperCase();

  async function handleLogout() {
    await signOut({ redirect: false });
    router.refresh();
  }

  return (
    <Providers>
      <div className="min-h-screen flex flex-col bg-slate-50/60">
        {/* Header */}
        <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/85 backdrop-blur">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 shrink-0">
              <div className="h-9 w-9 rounded-xl bg-primary flex items-center justify-center">
                <Sparkles className="h-5 w-5 text-white" />
              </div>
              <span className="text-lg font-bold tracking-tight text-slate-900">
                Produkta
              </span>
            </div>

            {/* Navigasi tab (desktop) */}
            <Tabs value={tab} onValueChange={setTab} className="hidden md:block">
              <TabsList className="rounded-xl bg-slate-100">
                <TabsTrigger value="ringkasan" className="rounded-lg gap-1.5">
                  <LayoutDashboard className="h-4 w-4" />
                  Ringkasan
                </TabsTrigger>
                <TabsTrigger value="tugas" className="rounded-lg gap-1.5">
                  <CheckSquare className="h-4 w-4" />
                  Tugas
                </TabsTrigger>
                <TabsTrigger value="kebiasaan" className="rounded-lg gap-1.5">
                  <Flame className="h-4 w-4" />
                  Kebiasaan
                </TabsTrigger>
                <TabsTrigger value="catatan" className="rounded-lg gap-1.5">
                  <StickyNote className="h-4 w-4" />
                  Catatan
                </TabsTrigger>
              </TabsList>
            </Tabs>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  className="rounded-xl gap-2 px-2 h-10"
                  aria-label="Menu akun"
                >
                  <Avatar className="h-8 w-8">
                    <AvatarFallback className="bg-primary text-white text-sm font-semibold">
                      {initial}
                    </AvatarFallback>
                  </Avatar>
                  <span className="hidden sm:inline text-sm font-medium text-slate-700 max-w-32 truncate">
                    {user.name}
                  </span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="rounded-xl w-56">
                <DropdownMenuLabel>
                  <p className="font-semibold text-slate-900">{user.name}</p>
                  <p className="text-xs font-normal text-slate-500 truncate">{user.email}</p>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={handleLogout}
                  className="text-red-600 focus:text-red-600 focus:bg-red-50 rounded-lg cursor-pointer"
                >
                  <LogOut className="mr-2 h-4 w-4" />
                  Keluar
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {/* Navigasi tab (mobile) */}
          <div className="md:hidden px-2 pb-2">
            <Tabs value={tab} onValueChange={setTab}>
              <TabsList className="grid grid-cols-4 w-full rounded-xl bg-slate-100 h-10">
                <TabsTrigger value="ringkasan" className="rounded-lg gap-1 text-xs px-1">
                  <LayoutDashboard className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">Ringkasan</span>
                </TabsTrigger>
                <TabsTrigger value="tugas" className="rounded-lg gap-1 text-xs px-1">
                  <CheckSquare className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">Tugas</span>
                </TabsTrigger>
                <TabsTrigger value="kebiasaan" className="rounded-lg gap-1 text-xs px-1">
                  <Flame className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">Kebiasaan</span>
                </TabsTrigger>
                <TabsTrigger value="catatan" className="rounded-lg gap-1 text-xs px-1">
                  <StickyNote className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">Catatan</span>
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
        </header>

        {/* Konten */}
        <main className="flex-1 w-full max-w-6xl mx-auto px-4 sm:px-6 py-6">
          {tab === "ringkasan" && <SummaryView onNavigate={setTab} />}
          {tab === "tugas" && <TasksView />}
          {tab === "kebiasaan" && <HabitsView />}
          {tab === "catatan" && <NotesView />}
        </main>

        {/* Footer menempel di bawah */}
        <footer className="border-t border-slate-100 mt-auto">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3 flex flex-col sm:flex-row items-center justify-between gap-1 text-xs text-slate-400">
            <p>© 2026 Produkta — Atur harimu, capai lebih.</p>
            <p>Login sebagai {user.email}</p>
          </div>
        </footer>
      </div>
    </Providers>
  );
}
