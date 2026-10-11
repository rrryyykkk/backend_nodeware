import { Hono } from "hono";
import { projectController } from "../controllers/project.controller";
import { authMiddleware } from "../middleware/auth.middleware";
import { requireRole } from "../middleware/guard.middleware";
import { validateBody, validateQuery } from "../middleware/validate.middleware";
import {
  createProjectSchema,
  updateProjectSchema,
  addMemberSchema,
  listProjectQuerySchema,
} from "../schemas/project.schema";

export const projectRoutes = new Hono();

projectRoutes.use("*", authMiddleware);

import { taskController } from "../controllers/task.controller";
import { createTaskSchema, listTasksQuerySchema } from "../schemas/task.schema";

// Project List & Detail
projectRoutes.get(
  "/",
  validateQuery(listProjectQuerySchema),
  projectController.getProjects,
);
projectRoutes.post(
  "/",
  requireRole("PM"),
  validateBody(createProjectSchema),
  projectController.createProject,
);
projectRoutes.get("/:id", projectController.getProjectById);
projectRoutes.patch(
  "/:id",
  requireRole("PM"),
  validateBody(updateProjectSchema),
  projectController.updateProject,
);
projectRoutes.delete(
  "/:id",
  requireRole("PM"),
  projectController.deleteProject,
);

// Tasks under Project
projectRoutes.get(
  "/:id/tasks",
  validateQuery(listTasksQuerySchema),
  taskController.getTasksByProject,
);
projectRoutes.get("/:id/board", taskController.getBoard);
projectRoutes.post(
  "/:id/tasks",
  requireRole("PM"),
  validateBody(createTaskSchema),
  taskController.createTask,
);

import { auditController } from "../controllers/audit.controller";
import { standupController } from "../controllers/standup.controller";

// Metrics
projectRoutes.get("/:id/metrics", projectController.getMetrics);

// Audit Logs per Project (Staff only)
projectRoutes.get("/:id/audit-logs", auditController.getProjectAuditLogs);

// Standup Summary (PM only)
projectRoutes.get(
  "/:id/standup-summary",
  requireRole("PM"),
  standupController.getStandupSummary,
);

// Members (PM only untuk add & remove)
projectRoutes.get("/:id/members", projectController.getMembers);
projectRoutes.post(
  "/:id/members",
  requireRole("PM"),
  validateBody(addMemberSchema),
  projectController.addMember,
);
projectRoutes.delete(
  "/:id/members/:userId",
  requireRole("PM"),
  projectController.removeMember,
);
