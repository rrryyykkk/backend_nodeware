import { prisma } from "../lib/prisma";
import { bumpProject, cached, projectNs } from "../config/redis";
import { NotFoundError, ConflictError } from "../error/error.handler";
import type { AuthenticatedUser } from "../types/auth.types";
import type {
  CreateProjectSchema,
  UpdateProjectSchema,
  AddMemberSchema,
  ListProjectQuerySchema,
} from "../schemas/project.schema";
import type {
  ProjectPublicProfile,
  ProjectMemberProfile,
  ListProjectsResult,
  ProjectMetrics,
  StaffProjectMetrics,
  ClientProjectMetrics,
} from "../types/project.types";
import type { Prisma } from "../../generated/prisma/client";

export const projectService = {
  // Mengambil daftar project yang dapat diakses oleh user (PM melihat semua, Staff/Client melihat project terdaftar)
  async listProjects(
    user: AuthenticatedUser,
    query: ListProjectQuerySchema,
  ): Promise<ListProjectsResult> {
    const { search, page, rows } = query;

    const where: Prisma.ProjectWhereInput = { deletedAt: null };

    if (user.role !== "PM") {
      where.members = { some: { userId: user.id, deletedAt: null } };
    }
    if (search) {
      where.OR = [
        { name: { contains: search, mode: "insensitive" } },
        { description: { contains: search, mode: "insensitive" } },
      ];
    }

    const skip = (page - 1) * rows;

    const [totalData, projects] = await Promise.all([
      prisma.project.count({ where }),
      prisma.project.findMany({
        where,
        skip,
        take: rows,
        orderBy: { createdAt: "desc" },
        select: {
          public_id: true,
          name: true,
          description: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
    ]);

    const totalPages = Math.ceil(totalData / rows);
    const mapped: ProjectPublicProfile[] = projects.map((p) => ({
      id: p.public_id,
      name: p.name,
      description: p.description,
      createdAt: p.createdAt.toISOString(),
      updatedAt: p.updatedAt.toISOString(),
    }));

    return { projects: mapped, totalData, totalPages };
  },

  // Membuat project baru (PM only)
  async createProject(
    body: CreateProjectSchema,
  ): Promise<ProjectPublicProfile> {
    const project = await prisma.project.create({
      data: { name: body.name, description: body.description ?? null },
      select: {
        public_id: true,
        name: true,
        description: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return {
      id: project.public_id,
      name: project.name,
      description: project.description,
      createdAt: project.createdAt.toISOString(),
      updatedAt: project.updatedAt.toISOString(),
    };
  },

  // Mengambil detail project berdasarkan public_id dengan validasi hak akses member
  async getProjectById(
    projectPublicId: string,
    user: AuthenticatedUser,
  ): Promise<ProjectPublicProfile> {
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

    return {
      id: project.public_id,
      name: project.name,
      description: project.description,
      createdAt: project.createdAt.toISOString(),
      updatedAt: project.updatedAt.toISOString(),
    };
  },

  // Memperbarui nama dan deskripsi project serta invalidasi cache (PM only)
  async updateProject(
    projectPublicId: string,
    body: UpdateProjectSchema,
  ): Promise<ProjectPublicProfile> {
    const project = await prisma.project.findFirst({
      where: { public_id: projectPublicId, deletedAt: null },
    });
    if (!project) throw new NotFoundError("Project");

    const updated = await prisma.project.update({
      where: { id: project.id },
      data: {
        name: body.name ?? project.name,
        description:
          body.description !== undefined
            ? body.description
            : project.description,
      },
      select: {
        id: true,
        public_id: true,
        name: true,
        description: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    await bumpProject(updated.id);

    return {
      id: updated.public_id,
      name: updated.name,
      description: updated.description,
      createdAt: updated.createdAt.toISOString(),
      updatedAt: updated.updatedAt.toISOString(),
    };
  },

  // Menghapus project secara soft-delete (PM only)
  async deleteProject(projectPublicId: string): Promise<void> {
    const project = await prisma.project.findFirst({
      where: { public_id: projectPublicId, deletedAt: null },
    });
    if (!project) throw new NotFoundError("Project");

    await prisma.project.update({
      where: { id: project.id },
      data: { deletedAt: new Date() },
    });

    await bumpProject(project.id);
  },

  // Mengambil daftar member dalam sebuah project
  async getMembers(
    projectPublicId: string,
    user: AuthenticatedUser,
  ): Promise<ProjectMemberProfile[]> {
    const project = await prisma.project.findFirst({
      where: { public_id: projectPublicId, deletedAt: null },
    });
    if (!project) throw new NotFoundError("Project");

    if (user.role !== "PM") {
      const membership = await prisma.projectMember.findFirst({
        where: { projectId: project.id, userId: user.id, deletedAt: null },
      });
      if (!membership) throw new NotFoundError("Project");
    }

    const members = await prisma.projectMember.findMany({
      where: {
        projectId: project.id,
        deletedAt: null,
        user: { deletedAt: null },
      },
      include: {
        user: {
          select: {
            public_id: true,
            name: true,
            email: true,
            role: true,
            department: true,
            avatarUrl: true,
          },
        },
      },
      orderBy: { createdAt: "asc" },
    });

    return members.map((m) => ({
      id: m.user.public_id,
      name: m.user.name,
      email: m.user.email,
      role: m.user.role,
      department: m.user.department,
      avatarUrl: m.user.avatarUrl,
    }));
  },

  // Menambahkan member ke project atau memulihkan jika sebelumnya terhapus (PM only)
  async addMember(
    projectPublicId: string,
    body: AddMemberSchema,
  ): Promise<ProjectMemberProfile> {
    const [project, targetUser] = await Promise.all([
      prisma.project.findFirst({
        where: { public_id: projectPublicId, deletedAt: null },
      }),
      prisma.user.findFirst({
        where: { public_id: body.userId, deletedAt: null },
      }),
    ]);

    if (!project) throw new NotFoundError("Project");
    if (!targetUser) throw new NotFoundError("User");

    const existing = await prisma.projectMember.findUnique({
      where: {
        projectId_userId: { projectId: project.id, userId: targetUser.id },
      },
    });

    if (existing && existing.deletedAt === null) {
      throw new ConflictError("User sudah menjadi member project");
    }

    if (existing) {
      await prisma.projectMember.update({
        where: { id: existing.id },
        data: { deletedAt: null },
      });
    } else {
      await prisma.projectMember.create({
        data: { projectId: project.id, userId: targetUser.id },
      });
    }

    await bumpProject(project.id);

    return {
      id: targetUser.public_id,
      name: targetUser.name,
      email: targetUser.email,
      role: targetUser.role,
      department: targetUser.department,
      avatarUrl: targetUser.avatarUrl,
    };
  },

  // Menghapus member dari project secara soft-delete (PM only)
  async removeMember(
    projectPublicId: string,
    memberPublicId: string,
  ): Promise<void> {
    const [project, targetUser] = await Promise.all([
      prisma.project.findFirst({
        where: { public_id: projectPublicId, deletedAt: null },
      }),
      prisma.user.findFirst({
        where: { public_id: memberPublicId, deletedAt: null },
      }),
    ]);

    if (!project) throw new NotFoundError("Project");
    if (!targetUser) throw new NotFoundError("Member");

    const membership = await prisma.projectMember.findUnique({
      where: {
        projectId_userId: { projectId: project.id, userId: targetUser.id },
      },
    });

    if (!membership || membership.deletedAt !== null) {
      throw new NotFoundError("Member dalam project ini");
    }

    await prisma.projectMember.update({
      where: { id: membership.id },
      data: { deletedAt: new Date() },
    });

    await bumpProject(project.id);
  },

  // Mengkalkulasi metrik progres task project (dengan cache Redis dan masking untuk Client)
  async getMetrics(
    projectPublicId: string,
    user: AuthenticatedUser,
  ): Promise<ProjectMetrics> {
    const project = await prisma.project.findFirst({
      where: { public_id: projectPublicId, deletedAt: null },
    });
    if (!project) throw new NotFoundError("Project");

    if (user.role !== "PM") {
      const membership = await prisma.projectMember.findFirst({
        where: { projectId: project.id, userId: user.id, deletedAt: null },
      });
      if (!membership) throw new NotFoundError("Project");
    }

    const view = user.role === "CLIENT" ? "client" : "staff";
    const ns = await projectNs(project.id);
    const cacheKey = `cache:p:${project.id}:${ns}:metrics:${view}`;

    return cached<ProjectMetrics>(cacheKey, 30, async () => {
      const tasks = await prisma.task.findMany({
        where: { projectId: project.id, deletedAt: null },
        select: {
          id: true,
          status: true,
          dependsOn: {
            where: { deletedAt: null },
            select: {
              dependsOn: { select: { status: true, deletedAt: true } },
            },
          },
        },
      });

      const totalTasks = tasks.length;
      let doneTasks = 0;
      let inProgressTasks = 0;
      let blockedTasks = 0;
      let todoTasks = 0;

      for (const t of tasks) {
        if (t.status === "DONE") {
          doneTasks++;
        } else if (t.status === "IN_PROGRESS") {
          inProgressTasks++;
        } else if (t.status === "TODO") {
          const hasBlocker = t.dependsOn.some(
            (dep) =>
              dep.dependsOn.deletedAt === null &&
              dep.dependsOn.status !== "DONE",
          );
          if (hasBlocker) blockedTasks++;
          else todoTasks++;
        }
      }

      const percentComplete =
        totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0;

      if (view === "client") {
        const clientMetrics: ClientProjectMetrics = {
          totalTasks,
          doneTasks,
          percentComplete,
          label: `${percentComplete}% Complete`,
        };
        return clientMetrics;
      }

      const staffMetrics: StaffProjectMetrics = {
        totalTasks,
        doneTasks,
        inProgressTasks,
        blockedTasks,
        todoTasks,
        percentComplete,
      };
      return staffMetrics;
    });
  },
};
