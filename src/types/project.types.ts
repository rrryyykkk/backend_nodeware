// ============================================================
// Project Domain Types
// ============================================================

export interface ProjectPublicProfile {
  id: string; // public_id
  name: string;
  description: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectMemberProfile {
  id: string; // user.public_id
  name: string;
  email: string;
  role: import("../../generated/prisma/client").Role;
  department: import("../../generated/prisma/client").Department | null;
  avatarUrl: string | null;
}

export interface ListProjectsResult {
  projects: ProjectPublicProfile[];
  totalData: number;
  totalPages: number;
}

export interface StaffProjectMetrics {
  totalTasks: number;
  doneTasks: number;
  inProgressTasks: number;
  blockedTasks: number;
  todoTasks: number;
  percentComplete: number;
}

export interface ClientProjectMetrics {
  totalTasks: number;
  doneTasks: number;
  percentComplete: number;
  label: string;
}

export type ProjectMetrics = StaffProjectMetrics | ClientProjectMetrics;
