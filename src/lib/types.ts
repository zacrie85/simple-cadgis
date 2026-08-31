export type Priority = "TINGGI" | "SEDANG" | "RENDAH";

export interface TaskData {
  id: string;
  title: string;
  description?: string | null;
  priority: Priority;
  category: string;
  dueDate?: string | null;
  completed: boolean;
  createdAt: string;
  completedAt?: string | null;
}

export interface HabitLogData {
  id: string;
  habitId: string;
  date: string;
}

export interface HabitData {
  id: string;
  name: string;
  emoji: string;
  createdAt: string;
  logs: HabitLogData[];
  streak: number;
  doneToday: boolean;
}

export interface NoteData {
  id: string;
  title: string;
  content: string;
  color: string;
  createdAt: string;
  updatedAt: string;
}

export interface StatsData {
  activeTasks: number;
  completedToday: number;
  totalTasks: number;
  totalCompleted: number;
  habitsTotal: number;
  habitsDoneToday: number;
  notesCount: number;
  weekly: { date: string; label: string; selesai: number }[];
  upcomingTasks: TaskData[];
}

export interface UserData {
  name: string;
  email: string;
}
