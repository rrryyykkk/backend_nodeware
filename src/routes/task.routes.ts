import { Hono } from "hono";
import { taskController } from "../controllers/task.controller";
import { authMiddleware } from "../middleware/auth.middleware";
import { requireRole } from "../middleware/guard.middleware";
import { validateBody } from "../middleware/validate.middleware";
import {
  updateTaskCoreSchema,
  updateTaskStatusSchema,
  addDependencySchema,
  addCommentSchema,
} from "../schemas/task.schema";

export const taskRoutes = new Hono();

taskRoutes.use("*", authMiddleware);

// Detail task
taskRoutes.get("/:id", taskController.getTaskById);

// Update core field (PM only)
taskRoutes.patch(
  "/:id",
  requireRole("PM"),
  validateBody(updateTaskCoreSchema),
  taskController.updateTaskCore,
);

// Update status (PM atau Assignee)
taskRoutes.patch(
  "/:id/status",
  validateBody(updateTaskStatusSchema),
  taskController.updateTaskStatus,
);

// Soft delete task (PM only)
taskRoutes.delete("/:id", requireRole("PM"), taskController.deleteTask);

// Dependencies (PM only)
taskRoutes.post(
  "/:id/dependencies",
  requireRole("PM"),
  validateBody(addDependencySchema),
  taskController.addDependency,
);
taskRoutes.delete(
  "/:id/dependencies/:dependsOnTaskId",
  requireRole("PM"),
  taskController.removeDependency,
);

// Comments (Staff only)
taskRoutes.get("/:id/comments", taskController.getComments);
taskRoutes.post(
  "/:id/comments",
  validateBody(addCommentSchema),
  taskController.addComment,
);

import { attachmentController } from "../controllers/attachment.controller";

// Attachments (Staff only)
taskRoutes.post("/:id/attachments", attachmentController.uploadAttachment);
taskRoutes.get(
  "/:id/attachments/:attId/download",
  attachmentController.downloadAttachment,
);
taskRoutes.delete(
  "/:id/attachments/:attId",
  attachmentController.deleteAttachment,
);

import { auditController } from "../controllers/audit.controller";

// Audit Logs per Task (Staff only)
taskRoutes.get("/:id/audit-logs", auditController.getTaskAuditLogs);
