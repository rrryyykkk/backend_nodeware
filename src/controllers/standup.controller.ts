import type { Context } from "hono";
import { standupService } from "../service/standup.service";

export const standupController = {
  // Handler rekap standup harian per departemen (PM only)
  async getStandupSummary(c: Context): Promise<Response> {
    const projectId = c.req.param("id") ?? "";
    const date = c.req.query("date");
    const summary = await standupService.getSummary(projectId, date);
    return c.json({ success: true, response_code: 200, message: "OK", data: summary }, 200);
  },
};