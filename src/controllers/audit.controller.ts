import type { Context } from "hono";
import { auditService } from "../service/audit.service";
import type { AuthenticatedUser } from "../types/auth.types";

export const auditController = {
  // Handler riwayat audit logs task (Staff only)
  async getTaskAuditLogs(c: Context): Promise<Response> {
    const user = c.get("user") as AuthenticatedUser;
    const taskPublicId = c.req.param("id") ?? "";
    const page = Math.max(1, Number(c.req.query("page")) || 1);
    const rows = Math.min(100, Math.max(1, Number(c.req.query("rows")) || 10));
    const { logs, totalData, totalPages } = await auditService.getTaskAuditLogs(
      taskPublicId,
      user,
      {
        page,
        rows,
        column: c.req.query("column"),
        userId: c.req.query("userId"),
        from: c.req.query("from"),
        to: c.req.query("to"),
      },
    );
    return c.json(
      {
        success: true,
        response_code: 200,
        message: "OK",
        data: logs,
        meta: { page, rows, totalData, totalPages },
      },
      200,
    );
  },

  // Handler riwayat audit logs seluruh aktivitas dalam project (Staff only)
  async getProjectAuditLogs(c: Context): Promise<Response> {
    const user = c.get("user") as AuthenticatedUser;
    const projectPublicId = c.req.param("id") ?? "";
    const page = Math.max(1, Number(c.req.query("page")) || 1);
    const rows = Math.min(100, Math.max(1, Number(c.req.query("rows")) || 10));
    const { logs, totalData, totalPages } =
      await auditService.getProjectAuditLogs(projectPublicId, user, {
        page,
        rows,
      });
    return c.json(
      {
        success: true,
        response_code: 200,
        message: "OK",
        data: logs,
        meta: { page, rows, totalData, totalPages },
      },
      200,
    );
  },
};