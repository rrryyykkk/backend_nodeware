import type { AuthenticatedUser } from "../middleware/auth.middleware";
import type { TaskStatus, Department } from "../../generated/prisma/client";

export interface PolicyTask {
  id: string; // internal id
  public_id: string;
  projectId: string;
  status: TaskStatus;
  department: Department;
  assigneeId: string | null;
  assigneePublicId?: string | null;
  clientVisible: boolean;
  version: number;
  isBlocked: boolean;
  blockers?: { id: string; title: string; status: TaskStatus }[];
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

export function computeTaskActions(
  user: AuthenticatedUser,
  task: PolicyTask,
): TaskActions {
  const isPM = user.role === "PM";
  const isAssignee = task.assigneePublicId
    ? user.public_id === task.assigneePublicId
    : false;

  const actions: TaskActions = {
    edit: isPM,
    upload: isPM || user.role === "INTERNAL",
    manageDependencies: isPM,
    delete: isPM,
    statusTransitions: [],
  };

  const possibleTransitions: TaskStatus[] = ["TODO", "IN_PROGRESS", "DONE"];

  for (const targetStatus of possibleTransitions) {
    if (targetStatus === task.status) continue;

    let allowed = true;
    let reason: string | undefined;
    let message: string | undefined;

    // 1. Cek validitas transisi state graph
    const validTransitions: Record<TaskStatus, TaskStatus[]> = {
      TODO: ["IN_PROGRESS"],
      IN_PROGRESS: ["TODO", "DONE"],
      DONE: ["IN_PROGRESS"],
    };

    if (!validTransitions[task.status]?.includes(targetStatus)) {
      continue; // Tidak termasuk transisi yang logis ditampilkan
    }

    // 2. Role permission
    if (targetStatus === "DONE") {
      if (isPM) {
        allowed = false;
        reason = "PM_CANNOT_COMPLETE";
        message = "Hanya assignee yang dapat menyelesaikan task";
      } else if (!isAssignee) {
        allowed = false;
        reason = "NOT_ASSIGNEE";
        message = "Hanya assignee yang dapat menyelesaikan task";
      }
    } else if (task.status === "TODO" && targetStatus === "IN_PROGRESS") {
      if (!task.assigneeId) {
        allowed = false;
        reason = "ASSIGNEE_REQUIRED";
        message = "Task harus memiliki assignee sebelum dimulai";
      } else if (!isPM && !isAssignee) {
        allowed = false;
        reason = "NOT_ASSIGNEE";
        message = "Hanya assignee atau PM yang dapat memulai task";
      } else if (task.isBlocked) {
        allowed = false;
        reason = "TASK_BLOCKED";
        const blockerTitles =
          task.blockers?.map((b) => b.title).join(", ") || "";
        message = blockerTitles
          ? `Menunggu task: ${blockerTitles}`
          : "Task masih menunggu prerequisite";
      }
    } else if (task.status === "IN_PROGRESS" && targetStatus === "TODO") {
      if (!isPM && !isAssignee) {
        allowed = false;
        reason = "NOT_ASSIGNEE";
        message = "Hanya assignee atau PM yang dapat mengembalikan status";
      }
    } else if (task.status === "DONE" && targetStatus === "IN_PROGRESS") {
      if (!isPM && !isAssignee) {
        allowed = false;
        reason = "NOT_ASSIGNEE";
        message = "Hanya assignee atau PM yang dapat me-reopen task";
      }
    }

    actions.statusTransitions.push({
      to: targetStatus,
      allowed,
      reason,
      message,
    });
  }

  return actions;
}
