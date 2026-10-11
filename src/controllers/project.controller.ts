import type { Context } from "hono";
import { projectService } from "../service/project.service";
import type { AuthenticatedUser } from "../types/auth.types";
import type {
  CreateProjectSchema,
  UpdateProjectSchema,
  AddMemberSchema,
  ListProjectQuerySchema,
} from "../schemas/project.schema";

export const projectController = {
  // Handler list project terfilter sesuai otorisasi user
  async getProjects(c: Context): Promise<Response> {
    const user = c.get("user") as AuthenticatedUser;
    const query = c.get("validatedQuery") as ListProjectQuerySchema;
    const { projects, totalData, totalPages } =
      await projectService.listProjects(user, query);
    return c.json(
      {
        success: true,
        response_code: 200,
        message: "OK",
        data: projects,
        meta: { page: query.page, rows: query.rows, totalData, totalPages },
      },
      200,
    );
  },

  // Handler pembuatan project baru (PM only)
  async createProject(c: Context): Promise<Response> {
    const body = c.get("validatedBody") as CreateProjectSchema;
    const project = await projectService.createProject(body);
    return c.json(
      {
        success: true,
        response_code: 201,
        message: "Project berhasil dibuat",
        data: project,
      },
      201,
    );
  },

  // Handler detail info project berdasarkan ID
  async getProjectById(c: Context): Promise<Response> {
    const user = c.get("user") as AuthenticatedUser;
    const projectId = c.req.param("id") ?? "";
    const project = await projectService.getProjectById(projectId, user);
    return c.json(
      { success: true, response_code: 200, message: "OK", data: project },
      200,
    );
  },

  // Handler update atribut project (PM only)
  async updateProject(c: Context): Promise<Response> {
    const body = c.get("validatedBody") as UpdateProjectSchema;
    const projectId = c.req.param("id") ?? "";
    const project = await projectService.updateProject(projectId, body);
    return c.json(
      {
        success: true,
        response_code: 200,
        message: "Project berhasil diupdate",
        data: project,
      },
      200,
    );
  },

  // Handler soft-delete project (PM only)
  async deleteProject(c: Context): Promise<Response> {
    const projectId = c.req.param("id") ?? "";
    await projectService.deleteProject(projectId);
    return c.json(
      {
        success: true,
        response_code: 200,
        message: "Project berhasil dihapus",
      },
      200,
    );
  },

  // Handler list member dalam project
  async getMembers(c: Context): Promise<Response> {
    const user = c.get("user") as AuthenticatedUser;
    const projectId = c.req.param("id") ?? "";
    const members = await projectService.getMembers(projectId, user);
    return c.json(
      { success: true, response_code: 200, message: "OK", data: members },
      200,
    );
  },

  // Handler penambahan user sebagai member project (PM only)
  async addMember(c: Context): Promise<Response> {
    const body = c.get("validatedBody") as AddMemberSchema;
    const projectId = c.req.param("id") ?? "";
    const member = await projectService.addMember(projectId, body);
    return c.json(
      {
        success: true,
        response_code: 201,
        message: "Member berhasil ditambahkan",
        data: member,
      },
      201,
    );
  },

  // Handler penghapusan member dari project (PM only)
  async removeMember(c: Context): Promise<Response> {
    const projectId = c.req.param("id") ?? "";
    const userId = c.req.param("userId") ?? "";
    await projectService.removeMember(projectId, userId);
    return c.json(
      {
        success: true,
        response_code: 200,
        message: "Member berhasil dihapus dari project",
      },
      200,
    );
  },

  // Handler metrik progres pengerjaan task project
  async getMetrics(c: Context): Promise<Response> {
    const user = c.get("user") as AuthenticatedUser;
    const projectId = c.req.param("id") ?? "";
    const metrics = await projectService.getMetrics(projectId, user);
    return c.json(
      { success: true, response_code: 200, message: "OK", data: metrics },
      200,
    );
  },
};