import type { Context } from "hono";
import { taskService } from "../service/task.service";
import type { AuthenticatedUser } from "../types/auth.types";
import type {
  CreateTaskSchema,
  UpdateTaskCoreSchema,
  UpdateTaskStatusSchema,
  AddDependencySchema,
  ListTasksQuerySchema,
  AddCommentSchema,
} from "../schemas/task.schema";

export const taskController = {
  // Handler list task per-project dengan filter dan masking
  async getTasksByProject(c: Context): Promise<Response> {
    const user = c.get("user") as AuthenticatedUser;
    const query = c.get("validatedQuery") as ListTasksQuerySchema;
    const projectId = c.req.param("id") ?? "";
    const { data, totalData, totalPages } = await taskService.listByProject(
      projectId,
      user,
      query,
    );
    return c.json(
      {
        success: true,
        response_code: 200,
        message: "OK",
        data,
        meta: { page: query.page, rows: query.rows, totalData, totalPages },
      },
      200,
    );
  },

  // Handler board kanban task (Staff only)
  async getBoard(c: Context): Promise<Response> {
    const user = c.get("user") as AuthenticatedUser;
    const projectId = c.req.param("id") ?? "";
    const data = await taskService.getBoard(projectId, user);
    return c.json(
      { success: true, response_code: 200, message: "OK", data },
      200,
    );
  },

  // Handler pembuatan task baru (PM only)
  async createTask(c: Context): Promise<Response> {
    const user = c.get("user") as AuthenticatedUser;
    const body = c.get("validatedBody") as CreateTaskSchema;
    const projectId = c.req.param("id") ?? "";
    const task = await taskService.createTask(projectId, user, body);
    return c.json(
      {
        success: true,
        response_code: 201,
        message: "Task berhasil dibuat",
        data: task,
      },
      201,
    );
  },

  // Handler detail satu task
  async getTaskById(c: Context): Promise<Response> {
    const user = c.get("user") as AuthenticatedUser;
    const taskId = c.req.param("id") ?? "";
    const task = await taskService.getById(taskId, user);
    return c.json(
      { success: true, response_code: 200, message: "OK", data: task },
      200,
    );
  },

  // Handler update core fields task dengan optimistic locking (PM only)
  async updateTaskCore(c: Context): Promise<Response> {
    const user = c.get("user") as AuthenticatedUser;
    const body = c.get("validatedBody") as UpdateTaskCoreSchema;
    const taskId = c.req.param("id") ?? "";
    const task = await taskService.updateCore(taskId, user, body);
    return c.json(
      {
        success: true,
        response_code: 200,
        message: "Task berhasil diupdate",
        data: task,
      },
      200,
    );
  },

  // Handler transisi status task (BR-03 s/d BR-11)
  async updateTaskStatus(c: Context): Promise<Response> {
    const user = c.get("user") as AuthenticatedUser;
    const body = c.get("validatedBody") as UpdateTaskStatusSchema;
    const taskId = c.req.param("id") ?? "";
    const task = await taskService.updateStatus(taskId, user, body);
    return c.json(
      {
        success: true,
        response_code: 200,
        message: "Status task berhasil diubah",
        data: task,
      },
      200,
    );
  },

  // Handler soft-delete task (PM only)
  async deleteTask(c: Context): Promise<Response> {
    const user = c.get("user") as AuthenticatedUser;
    const taskId = c.req.param("id") ?? "";
    await taskService.deleteTask(taskId, user);
    return c.json(
      { success: true, response_code: 200, message: "Task berhasil dihapus" },
      200,
    );
  },

  // Handler penambahan dependensi antar-task (PM only)
  async addDependency(c: Context): Promise<Response> {
    const user = c.get("user") as AuthenticatedUser;
    const body = c.get("validatedBody") as AddDependencySchema;
    const taskId = c.req.param("id") ?? "";
    const result = await taskService.addDependency(taskId, user, body);
    return c.json(
      {
        success: true,
        response_code: 201,
        message: "Dependency berhasil ditambahkan",
        data: result,
      },
      201,
    );
  },

  // Handler penghapusan relasi dependensi (PM only)
  async removeDependency(c: Context): Promise<Response> {
    const user = c.get("user") as AuthenticatedUser;
    const taskId = c.req.param("id") ?? "";
    const dependsOnTaskId = c.req.param("dependsOnTaskId") ?? "";
    await taskService.removeDependency(taskId, dependsOnTaskId, user);
    return c.json(
      {
        success: true,
        response_code: 200,
        message: "Dependency berhasil dihapus",
      },
      200,
    );
  },

  // Handler list komentar pada task (Staff only)
  async getComments(c: Context): Promise<Response> {
    const user = c.get("user") as AuthenticatedUser;
    const taskId = c.req.param("id") ?? "";
    const comments = await taskService.getComments(taskId, user);
    return c.json(
      { success: true, response_code: 200, message: "OK", data: comments },
      200,
    );
  },

  // Handler penambahan komentar pada task (Staff only)
  async addComment(c: Context): Promise<Response> {
    const user = c.get("user") as AuthenticatedUser;
    const body = c.get("validatedBody") as AddCommentSchema;
    const taskId = c.req.param("id") ?? "";
    const comment = await taskService.addComment(taskId, user, body);
    return c.json(
      {
        success: true,
        response_code: 201,
        message: "Komentar berhasil ditambahkan",
        data: comment,
      },
      201,
    );
  },
};
