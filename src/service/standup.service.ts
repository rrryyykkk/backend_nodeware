import { prisma } from "../lib/prisma";
import { cached } from "../config/redis";
import { NotFoundError } from "../error/error.handler";
import type { StandupSummary } from "../types/standup.types";
import type { Department } from "../../generated/prisma/client";

export const standupService = {
  // Mengagregasikan ringkasan standup harian per-departemen (task selesai kemarin & task terblokir hari ini)
  async getSummary(projectPublicId: string, dateParam?: string): Promise<StandupSummary> {
    const project = await prisma.project.findFirst({
      where: { public_id: projectPublicId, deletedAt: null },
    });
    if (!project) throw new NotFoundError("Project");

    // Hitung tanggal target berdasarkan zona waktu WIB (Asia/Jakarta = UTC+7)
    const now = new Date();
    const jakartaTime = new Date(now.getTime() + 7 * 60 * 60 * 1000);

    let targetDateStr: string;
    if (dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam)) {
      targetDateStr = dateParam;
    } else {
      const yesterdayJakarta = new Date(jakartaTime.getTime() - 24 * 60 * 60 * 1000);
      targetDateStr = yesterdayJakarta.toISOString().split("T")[0]!;
    }

    const startWib = new Date(`${targetDateStr}T00:00:00+07:00`);
    const endWib = new Date(`${targetDateStr}T23:59:59.999+07:00`);
    const cacheKey = `cache:p:${project.id}:standup:${targetDateStr}`;

    // Caching hasil rekap selama 60 detik
    return cached<StandupSummary>(cacheKey, 60, async () => {
      const [completedAuditLogs, activeTodoTasks] = await Promise.all([
        prisma.taskAuditLog.findMany({
          where: {
            projectId: project.id,
            column: "status",
            newValue: "DONE",
            createdAt: { gte: startWib, lte: endWib },
          },
          include: {
            task: { select: { public_id: true, title: true, department: true } },
            user: { select: { name: true } },
          },
          orderBy: { createdAt: "asc" },
        }),
        prisma.task.findMany({
          where: { projectId: project.id, status: "TODO", deletedAt: null },
          include: {
            dependsOn: {
              where: { deletedAt: null },
              include: {
                dependsOn: { select: { public_id: true, title: true, status: true, deletedAt: true } },
              },
            },
          },
        }),
      ]);

      const departments: Department[] = ["BACKEND", "FRONTEND", "UIUX"];

      const deptSummary = departments.map((dept) => {
        const completedYesterday = completedAuditLogs
          .filter((log) => log.task.department === dept)
          .map((log) => ({
            taskId: log.task.public_id,
            title: log.task.title,
            completedBy: log.user.name,
            completedAt: log.createdAt.toISOString(),
          }));

        const blockedToday = activeTodoTasks
          .filter((t) => t.department === dept)
          .flatMap((t) => {
            const activePrereqs = t.dependsOn.filter(
              (d) => d.dependsOn.deletedAt === null && d.dependsOn.status !== "DONE",
            );
            if (activePrereqs.length === 0) return [];
            return [{
              taskId: t.public_id,
              title: t.title,
              waitingFor: activePrereqs.map((d) => ({
                taskId: d.dependsOn.public_id,
                title: d.dependsOn.title,
              })),
            }];
          });

        return { department: dept, completedYesterday, blockedToday };
      });

      return {
        projectId: project.public_id,
        date: targetDateStr,
        timezone: "Asia/Jakarta",
        departments: deptSummary,
      };
    });
  },
};