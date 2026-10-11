import type { Department } from "../../generated/prisma/client";

// ============================================================
// Standup Domain Types
// ============================================================

export interface StandupCompletedItem {
  taskId: string;
  title: string;
  completedBy: string;
  completedAt: string;
}

export interface StandupBlockedItem {
  taskId: string;
  title: string;
  waitingFor: { taskId: string; title: string }[];
}

export interface DepartmentSummary {
  department: Department;
  completedYesterday: StandupCompletedItem[];
  blockedToday: StandupBlockedItem[];
}

export interface StandupSummary {
  projectId: string;
  date: string;
  timezone: string;
  departments: DepartmentSummary[];
}
