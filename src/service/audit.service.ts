import { prisma } from "../lib/prisma";
import { NotFoundError, ForbiddenError } from "../error/error.handler";
import type { AuthenticatedUser } from "../types/auth.types";
import type { AuditLogsResult } from "../types/audit.types";
import type { Prisma } from "../../generated/prisma/client";

interface AuditQueryParams {
  page: number;
  rows: number;
  column?: string;
  userId?: string;
  from?: string;
  to?: string;
}

export const auditService = {
  // Mengambil daftar audit log riwayat perubahan spesifik pada task (Staff only)
  async getTaskAuditLogs(
    taskPublicId: string,
    user: AuthenticatedUser,
    params: AuditQueryParams,
  ): Promise<AuditLogsResult> {
    if (user.role === "CLIENT")
      throw new ForbiddenError("Client tidak diizinkan mengakses audit logs");

    const task = await prisma.task.findFirst({
      where: { public_id: taskPublicId, deletedAt: null },
      include: {
        project: {
          include: {
            members: { where: { deletedAt: null }, select: { userId: true } },
          },
        },
      },
    });
    if (!task) throw new NotFoundError("Task");

    if (user.role !== "PM") {
      const isMember = task.project.members.some((m) => m.userId === user.id);
      if (!isMember) throw new NotFoundError("Task");
    }

    const { page, rows, column, userId: userPublicId, from, to } = params;
    const where: Prisma.TaskAuditLogWhereInput = { taskId: task.id };

    if (column) where.column = column;
    if (userPublicId) {
      const targetUser = await prisma.user.findFirst({
        where: { public_id: userPublicId },
      });
      where.userId = targetUser ? targetUser.id : "non_existent";
    }
    if (from || to) {
      where.createdAt = {
        ...(from && { gte: new Date(from) }),
        ...(to && { lte: new Date(to) }),
      };
    }

    const skip = (page - 1) * rows;

    const [totalData, logs] = await Promise.all([
      prisma.taskAuditLog.count({ where }),
      prisma.taskAuditLog.findMany({
        where,
        skip,
        take: rows,
        orderBy: { createdAt: "desc" },
        include: {
          task: { select: { public_id: true } },
          user: { select: { public_id: true, name: true } },
        },
      }),
    ]);

    const totalPages = Math.ceil(totalData / rows);

    return {
      logs: logs.map((l) => ({
        id: l.id,
        taskId: l.task.public_id,
        user: { id: l.user.public_id, name: l.user.name },
        column: l.column,
        oldValue: l.oldValue,
        newValue: l.newValue,
        createdAt: l.createdAt.toISOString(),
      })),
      totalData,
      totalPages,
    };
  },

  // Mengambil daftar seluruh audit log aktivitas yang terjadi dalam project (Staff only)
  async getProjectAuditLogs(
    projectPublicId: string,
    user: AuthenticatedUser,
    params: Pick<AuditQueryParams, "page" | "rows">,
  ): Promise<AuditLogsResult> {
    if (user.role === "CLIENT")
      throw new ForbiddenError("Client tidak diizinkan mengakses audit logs");

    const project = await prisma.project.findFirst({
      where: { public_id: projectPublicId, deletedAt: null },
      include: {
        members: { where: { deletedAt: null }, select: { userId: true } },
      },
    });
    if (!project) throw new NotFoundError("Project");

    if (user.role !== "PM") {
      const isMember = project.members.some((m) => m.userId === user.id);
      if (!isMember) throw new NotFoundError("Project");
    }

    const { page, rows } = params;
    const where: Prisma.TaskAuditLogWhereInput = { projectId: project.id };
    const skip = (page - 1) * rows;

    const [totalData, logs] = await Promise.all([
      prisma.taskAuditLog.count({ where }),
      prisma.taskAuditLog.findMany({
        where,
        skip,
        take: rows,
        orderBy: { createdAt: "desc" },
        include: {
          task: { select: { public_id: true } },
          user: { select: { public_id: true, name: true } },
        },
      }),
    ]);

    const totalPages = Math.ceil(totalData / rows);

    return {
      logs: logs.map((l) => ({
        id: l.id,
        taskId: l.task.public_id,
        user: { id: l.user.public_id, name: l.user.name },
        column: l.column,
        oldValue: l.oldValue,
        newValue: l.newValue,
        createdAt: l.createdAt.toISOString(),
      })),
      totalData,
      totalPages,
    };
  },
};
