import type { AuthenticatedUser } from "../middleware/auth.middleware";
import { computeTaskActions, type TaskActions } from "./policy";
import type { TaskStatus, Department } from "../../generated/prisma/client";

export interface ClientTaskResponse {
  id: string;
  title: string;
  description: string;
  status: TaskStatus;
  isBlocked: boolean;
}

export interface StaffAssigneeResponse {
  id: string;
  name: string;
  avatarUrl: string | null;
  department: Department | null;
}

export interface StaffDependencyItem {
  id: string;
  title: string;
  status: TaskStatus;
}

export interface StaffAttachmentItem {
  id: string;
  fileName: string;
  size: number | null;
  url: string;
  uploadedBy: {
    id: string;
    name: string;
  };
  createdAt: string;
}

export interface StaffTaskResponse {
  id: string;
  projectId: string;
  title: string;
  description: string;
  status: TaskStatus;
  isBlocked: boolean;
  blockers: StaffDependencyItem[];
  department: Department;
  assignee: StaffAssigneeResponse | null;
  clientVisible: boolean;
  version: number;
  dependsOn?: StaffDependencyItem[];
  attachments?: StaffAttachmentItem[];
  actions?: TaskActions;
  createdAt: string;
  updatedAt: string;
}

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

export function computeIsBlocked(task: RawTaskWithRelations): {
  isBlocked: boolean;
  blockers: StaffDependencyItem[];
  activePrereqs: StaffDependencyItem[];
} {
  const activeDeps = (task.dependsOn || []).filter(
    (dep) => dep.deletedAt === null && dep.dependsOn.deletedAt === null,
  );

  const activePrereqs: StaffDependencyItem[] = activeDeps.map((dep) => ({
    id: dep.dependsOn.public_id,
    title: dep.dependsOn.title,
    status: dep.dependsOn.status,
  }));

  const blockers = activePrereqs.filter((prereq) => prereq.status !== "DONE");

  return {
    isBlocked: blockers.length > 0,
    blockers,
    activePrereqs,
  };
}

export function toClientTask(task: RawTaskWithRelations): ClientTaskResponse {
  const { isBlocked } = computeIsBlocked(task);

  // WHITELIST MURNI untuk client: tidak ada nama, user, department, assignee, actions, dll.
  return {
    id: task.public_id,
    title: task.title,
    description: task.description,
    status: task.status,
    isBlocked,
  };
}

export function toStaffTask(
  task: RawTaskWithRelations,
  currentUser: AuthenticatedUser,
  options?: { includeActions?: boolean },
): StaffTaskResponse {
  const { isBlocked, blockers, activePrereqs } = computeIsBlocked(task);

  const staffTask: StaffTaskResponse = {
    id: task.public_id,
    projectId: task.project?.public_id ?? task.projectId,
    title: task.title,
    description: task.description,
    status: task.status,
    isBlocked,
    blockers,
    department: task.department,
    assignee: task.assignee
      ? {
          id: task.assignee.public_id,
          name: task.assignee.name,
          avatarUrl: task.assignee.avatarUrl,
          department: task.assignee.department,
        }
      : null,
    clientVisible: task.clientVisible,
    version: task.version,
    dependsOn: activePrereqs,
    attachments: (task.attachments || [])
      .filter((att) => att.deletedAt === null)
      .map((att) => ({
        id: att.public_id,
        fileName: att.fileName,
        size: att.size,
        url: att.url,
        uploadedBy: {
          id: att.uploader.public_id,
          name: att.uploader.name,
        },
        createdAt: att.createdAt.toISOString(),
      })),
    createdAt: task.createdAt.toISOString(),
    updatedAt: task.updatedAt.toISOString(),
  };

  if (options?.includeActions !== false) {
    staffTask.actions = computeTaskActions(currentUser, {
      id: task.id,
      public_id: task.public_id,
      projectId: task.projectId,
      status: task.status,
      department: task.department,
      assigneeId: task.assigneeId,
      assigneePublicId: task.assignee?.public_id ?? null,
      clientVisible: task.clientVisible,
      version: task.version,
      isBlocked,
      blockers,
    });
  }

  return staffTask;
}
