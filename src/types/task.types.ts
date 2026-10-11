import type { TaskStatus, Department } from "../../generated/prisma/client";
import type { AuthenticatedUser } from "./auth.types";

// ============================================================
// Task Domain Types
// ============================================================

/** Full raw task shape from Prisma with all includes — used internally only. */
export interface RawTaskWithRelations {
  id: string;
  public_id: string;
  projectId: string;
  title: string;
  description: string;
  status: TaskStatus;
  department: Department;
  assigneeId: string | null;
  clientVisible: boolean;
  version: number;
  createdAt: Date;
  updatedAt: Date;
  project?: {
    public_id: string;
  };
  assignee?: {
    public_id: string;
    name: string;
    avatarUrl: string | null;
    department: Department | null;
  } | null;
  dependsOn?: {
    deletedAt: Date | null;
    dependsOn: {
      public_id: string;
      title: string;
      status: TaskStatus;
      deletedAt: Date | null;
    };
  }[];
  attachments?: {
    public_id: string;
    fileName: string;
    size: number | null;
    url: string;
    deletedAt: Date | null;
    createdAt: Date;
    uploader: {
      public_id: string;
      name: string;
    };
  }[];
}

/** Computed blocked state returned from computeIsBlocked. */
export interface BlockedState {
  isBlocked: boolean;
  blockers: TaskDependencyItem[];
  activePrereqs: TaskDependencyItem[];
}

export interface TaskDependencyItem {
  id: string;
  title: string;
  status: TaskStatus;
}

export interface TaskAttachmentItem {
  id: string;
  fileName: string;
  size: number | null;
  url: string;
  uploadedBy: { id: string; name: string };
  createdAt: string;
}

export interface TaskAssigneeItem {
  id: string;
  name: string;
  avatarUrl: string | null;
  department: Department | null;
}

export interface StatusTransitionAction {
  to: TaskStatus;
  allowed: boolean;
  reason?: string;
  message?: string;
}

export interface TaskActions {
  edit: boolean;
  upload: boolean;
  manageDependencies: boolean;
  delete: boolean;
  statusTransitions: StatusTransitionAction[];
}

/** Input to computeTaskActions. */
export interface PolicyTask {
  id: string;
  public_id: string;
  projectId: string;
  status: TaskStatus;
  department: Department;
  assigneeId: string | null;
  assigneePublicId?: string | null;
  clientVisible: boolean;
  version: number;
  isBlocked: boolean;
  blockers?: TaskDependencyItem[];
}

/** Client-facing task response (masked). */
export interface ClientTaskResponse {
  id: string;
  title: string;
  description: string;
  status: TaskStatus;
  isBlocked: boolean;
}

/** Staff/PM task response with full details. */
export interface StaffTaskResponse {
  id: string;
  projectId: string;
  title: string;
  description: string;
  status: TaskStatus;
  isBlocked: boolean;
  blockers: TaskDependencyItem[];
  department: Department;
  assignee: TaskAssigneeItem | null;
  clientVisible: boolean;
  version: number;
  dependsOn?: TaskDependencyItem[];
  attachments?: TaskAttachmentItem[];
  actions?: TaskActions;
  createdAt: string;
  updatedAt: string;
}

/** Audit log entry. */
export interface AuditLogEntry {
  id: string;
  taskId: string;
  user: { id: string; name: string };
  column: string;
  oldValue: string | null;
  newValue: string | null;
  createdAt: string;
}

/** Input params for task listing. */
export interface ListTasksInput {
  projectId: string; // internal DB id
  projectPublicId: string;
  user: AuthenticatedUser;
  status?: TaskStatus;
  department?: Department;
  assigneeId?: string; // user.public_id if given
  isBlocked?: boolean;
  clientVisible?: boolean;
  search?: string;
  page: number;
  rows: number;
  orderKey: string;
  orderRule: "asc" | "desc";
}
