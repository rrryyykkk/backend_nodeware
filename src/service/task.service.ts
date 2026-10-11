import { prisma } from "../lib/prisma";
import { bumpProject } from "../config/redis";
import {
  NotFoundError,
  ForbiddenError,
  ConflictError,
  VersionConflictError,
  TaskBlockedError,
  UnprocessableError,
} from "../error/error.handler";
import { detectCycle } from "../utils/graph";
import {
  toClientTask,
  toStaffTask,
  computeIsBlocked,
} from "../utils/serializer";
import type { AuthenticatedUser } from "../types/auth.types";
import type {
  RawTaskWithRelations,
  ClientTaskResponse,
  StaffTaskResponse,
} from "../types/task.types";
import type {
  CreateTaskSchema,
  UpdateTaskCoreSchema,
  UpdateTaskStatusSchema,
  AddDependencySchema,
  ListTasksQuerySchema,
  AddCommentSchema,
} from "../schemas/task.schema";
import type {
  TaskStatus,
  Department,
  Prisma,
} from "../../generated/prisma/client";

// Relasi standard task yang di-load untuk serialisasi
const taskIncludeRelations = {
  project: { select: { public_id: true } },
  assignee: {
    select: { public_id: true, name: true, avatarUrl: true, department: true },
  },
  dependsOn: {
    where: { deletedAt: null },
    include: {
      dependsOn: {
        select: { public_id: true, title: true, status: true, deletedAt: true },
      },
    },
  },
  attachments: {
    where: { deletedAt: null },
    include: { uploader: { select: { public_id: true, name: true } } },
  },
} as const;

export const taskService = {
  // Mengambil daftar task dalam project dengan filter, sortir, pagination, dan masking client
  async listByProject(
    projectPublicId: string,
    user: AuthenticatedUser,
    query: ListTasksQuerySchema,
  ): Promise<{ data: (ClientTaskResponse | StaffTaskResponse)[]; totalData: number; totalPages: number }> {
    const project = await prisma.project.findFirst({
      where: { public_id: projectPublicId, deletedAt: null },
      include: { members: { where: { deletedAt: null }, select: { userId: true } } },
    });
    if (!project) throw new NotFoundError("Project");

    if (user.role !== "PM") {
      const isMember = project.members.some((m) => m.userId === user.id);
      if (!isMember) throw new NotFoundError("Project");
    }

    if (user.role === "CLIENT" && (query.department || query.assigneeId || query.isBlocked !== undefined)) {
      throw new UnprocessableError(
        "INVALID_TRANSITION",
        "Filter field internal tidak diizinkan untuk akun Client",
      );
    }

    const where: Prisma.TaskWhereInput = { projectId: project.id, deletedAt: null };

    if (user.role === "CLIENT") {
      where.clientVisible = true;
    } else if (query.clientVisible !== undefined) {
      where.clientVisible = query.clientVisible;
    }

    if (query.status) where.status = query.status;
    if (query.department && user.role !== "CLIENT") where.department = query.department as Department;

    if (query.assigneeId && user.role !== "CLIENT") {
      const assigneeUser = await prisma.user.findFirst({
        where: { public_id: query.assigneeId, deletedAt: null },
      });
      where.assigneeId = assigneeUser ? assigneeUser.id : "non_existent";
    }

    if (query.search) {
      where.OR = [
        { title: { contains: query.search, mode: "insensitive" } },
        { description: { contains: query.search, mode: "insensitive" } },
      ];
    }

    const rawTasks = (await prisma.task.findMany({
      where,
      orderBy: { [query.orderKey]: query.orderRule },
      include: taskIncludeRelations,
    })) as unknown as RawTaskWithRelations[];

    let filteredTasks = rawTasks;
    if (query.isBlocked !== undefined) {
      filteredTasks = rawTasks.filter((t) => {
        const { isBlocked } = computeIsBlocked(t);
        return isBlocked === query.isBlocked;
      });
    }

    const totalData = filteredTasks.length;
    const skip = (query.page - 1) * query.rows;
    const paged = filteredTasks.slice(skip, skip + query.rows);
    const totalPages = Math.ceil(totalData / query.rows);

    const data = paged.map((t) =>
      user.role === "CLIENT" ? toClientTask(t) : toStaffTask(t, user),
    );

    return { data, totalData, totalPages };
  },

  // Mengambil board kanban task project (Staff only, tanpa pagination)
  async getBoard(
    projectPublicId: string,
    user: AuthenticatedUser,
  ): Promise<StaffTaskResponse[]> {
    if (user.role === "CLIENT") throw new ForbiddenError("Board hanya tersedia untuk staff");

    const project = await prisma.project.findFirst({
      where: { public_id: projectPublicId, deletedAt: null },
      include: { members: { where: { deletedAt: null }, select: { userId: true } } },
    });
    if (!project) throw new NotFoundError("Project");

    if (user.role !== "PM") {
      const isMember = project.members.some((m) => m.userId === user.id);
      if (!isMember) throw new NotFoundError("Project");
    }

    const tasks = (await prisma.task.findMany({
      where: { projectId: project.id, deletedAt: null },
      orderBy: { createdAt: "asc" },
      include: taskIncludeRelations,
    })) as unknown as RawTaskWithRelations[];

    return tasks.map((t) => toStaffTask(t, user));
  },

  // Membuat task baru dengan validasi kesesuaian departemen assignee dan pencatatan audit log awal (PM only)
  async createTask(
    projectPublicId: string,
    user: AuthenticatedUser,
    body: CreateTaskSchema,
  ): Promise<StaffTaskResponse> {
    const project = await prisma.project.findFirst({
      where: { public_id: projectPublicId, deletedAt: null },
    });
    if (!project) throw new NotFoundError("Project");

    let internalAssigneeId: string | null = null;
    let assigneePublicId: string | null = null;

    if (body.assigneeId) {
      const assigneeUser = await prisma.user.findFirst({
        where: { public_id: body.assigneeId, deletedAt: null },
        include: { memberships: { where: { projectId: project.id, deletedAt: null } } },
      });

      if (!assigneeUser || assigneeUser.memberships.length === 0) {
        throw new UnprocessableError("ASSIGNEE_DEPARTMENT_MISMATCH", "Assignee harus merupakan member dari project ini");
      }
      if (assigneeUser.department !== body.department) {
        throw new UnprocessableError(
          "ASSIGNEE_DEPARTMENT_MISMATCH",
          `Department assignee (${assigneeUser.department ?? "null"}) tidak sesuai dengan task (${body.department})`,
        );
      }

      internalAssigneeId = assigneeUser.id;
      assigneePublicId = assigneeUser.public_id;
    }

    const createdTask = await prisma.$transaction(async (tx) => {
      const t = await tx.task.create({
        data: {
          projectId: project.id,
          title: body.title,
          description: body.description,
          department: body.department,
          assigneeId: internalAssigneeId,
          createdById: user.id,
          clientVisible: body.clientVisible,
          status: "TODO",
          version: 0,
        },
      });

      const auditEntries = [
        { column: "title", newValue: body.title },
        { column: "description", newValue: body.description },
        { column: "department", newValue: body.department },
        { column: "status", newValue: "TODO" },
        { column: "clientVisible", newValue: String(body.clientVisible) },
      ];
      if (assigneePublicId) {
        auditEntries.push({ column: "assigneeId", newValue: assigneePublicId });
      }

      await tx.taskAuditLog.createMany({
        data: auditEntries.map((e) => ({
          taskId: t.id,
          projectId: project.id,
          userId: user.id,
          column: e.column,
          oldValue: null,
          newValue: e.newValue,
        })),
      });

      return t;
    });

    await bumpProject(project.id);

    const fullTask = (await prisma.task.findUnique({
      where: { id: createdTask.id },
      include: taskIncludeRelations,
    })) as unknown as RawTaskWithRelations;

    return toStaffTask(fullTask, user);
  },

  // Mengambil detail satu task dengan masking data untuk akun client
  async getById(
    taskPublicId: string,
    user: AuthenticatedUser,
  ): Promise<ClientTaskResponse | StaffTaskResponse> {
    const task = (await prisma.task.findFirst({
      where: { public_id: taskPublicId, deletedAt: null },
      include: {
        ...taskIncludeRelations,
        project: {
          include: { members: { where: { deletedAt: null }, select: { userId: true } } },
        },
      },
    })) as unknown as (RawTaskWithRelations & { project: { id: string; public_id: string; members: { userId: string }[] } }) | null;

    if (!task) throw new NotFoundError("Task");

    if (user.role !== "PM") {
      const isMember = task.project.members.some((m) => m.userId === user.id);
      if (!isMember) throw new NotFoundError("Task");
    }

    if (user.role === "CLIENT") {
      if (!task.clientVisible) throw new NotFoundError("Task");
      return toClientTask(task);
    }

    return toStaffTask(task, user);
  },

  // Memperbarui atribut utama task dengan concurrency control via optimistic locking (version)
  async updateCore(
    taskPublicId: string,
    user: AuthenticatedUser,
    body: UpdateTaskCoreSchema,
  ): Promise<StaffTaskResponse> {
    const existingTask = await prisma.task.findFirst({
      where: { public_id: taskPublicId, deletedAt: null },
      include: {
        assignee: { select: { id: true, public_id: true, department: true } },
        project: { select: { id: true, public_id: true } },
      },
    });
    if (!existingTask) throw new NotFoundError("Task");

    if (existingTask.version !== body.version) {
      throw new VersionConflictError(existingTask.version);
    }

    let nextAssigneeId: string | null | undefined = undefined;
    let nextAssigneePublicId: string | null | undefined = undefined;
    const targetDept = body.department ?? existingTask.department;

    if (body.assigneeId !== undefined) {
      if (body.assigneeId === null) {
        nextAssigneeId = null;
        nextAssigneePublicId = null;
      } else {
        const targetUser = await prisma.user.findFirst({
          where: { public_id: body.assigneeId, deletedAt: null },
          include: { memberships: { where: { projectId: existingTask.projectId, deletedAt: null } } },
        });

        if (!targetUser || targetUser.memberships.length === 0) {
          throw new UnprocessableError("ASSIGNEE_DEPARTMENT_MISMATCH", "Assignee harus member dari project ini");
        }
        if (targetUser.department !== targetDept) {
          throw new UnprocessableError(
            "ASSIGNEE_DEPARTMENT_MISMATCH",
            `Department assignee (${targetUser.department ?? "null"}) tidak sesuai dengan task (${targetDept})`,
          );
        }

        nextAssigneeId = targetUser.id;
        nextAssigneePublicId = targetUser.public_id;
      }
    } else if (body.department && body.department !== existingTask.department) {
      if (existingTask.assignee && existingTask.assignee.department !== body.department) {
        throw new UnprocessableError(
          "ASSIGNEE_DEPARTMENT_MISMATCH",
          `Department task (${body.department}) tidak cocok dengan assignee saat ini (${existingTask.assignee.department})`,
        );
      }
    }

    const auditLogsToCreate: { column: string; oldValue: string | null; newValue: string | null }[] = [];

    if (body.title !== undefined && body.title !== existingTask.title) {
      auditLogsToCreate.push({ column: "title", oldValue: existingTask.title, newValue: body.title });
    }
    if (body.description !== undefined && body.description !== existingTask.description) {
      auditLogsToCreate.push({ column: "description", oldValue: existingTask.description, newValue: body.description });
    }
    if (body.department !== undefined && body.department !== existingTask.department) {
      auditLogsToCreate.push({ column: "department", oldValue: existingTask.department, newValue: body.department });
    }
    if (body.clientVisible !== undefined && body.clientVisible !== existingTask.clientVisible) {
      auditLogsToCreate.push({ column: "clientVisible", oldValue: String(existingTask.clientVisible), newValue: String(body.clientVisible) });
    }
    if (nextAssigneeId !== undefined && nextAssigneeId !== existingTask.assigneeId) {
      auditLogsToCreate.push({ column: "assigneeId", oldValue: existingTask.assignee?.public_id ?? null, newValue: nextAssigneePublicId ?? null });
    }

    if (auditLogsToCreate.length === 0) {
      const unchanged = (await prisma.task.findUnique({
        where: { id: existingTask.id },
        include: taskIncludeRelations,
      })) as unknown as RawTaskWithRelations;
      return toStaffTask(unchanged, user);
    }

    await prisma.$transaction(async (tx) => {
      const updateResult = await tx.task.updateMany({
        where: { id: existingTask.id, version: body.version, deletedAt: null },
        data: {
          ...(body.title !== undefined && { title: body.title }),
          ...(body.description !== undefined && { description: body.description }),
          ...(body.department !== undefined && { department: body.department }),
          ...(body.clientVisible !== undefined && { clientVisible: body.clientVisible }),
          ...(nextAssigneeId !== undefined && { assigneeId: nextAssigneeId }),
          version: { increment: 1 },
        },
      });

      if (updateResult.count === 0) {
        const latest = await tx.task.findUnique({ where: { id: existingTask.id } });
        throw new VersionConflictError(latest?.version ?? body.version);
      }

      await tx.taskAuditLog.createMany({
        data: auditLogsToCreate.map((log) => ({
          taskId: existingTask.id,
          projectId: existingTask.projectId,
          userId: user.id,
          column: log.column,
          oldValue: log.oldValue,
          newValue: log.newValue,
        })),
      });
    });

    await bumpProject(existingTask.projectId);

    const updated = (await prisma.task.findUnique({
      where: { id: existingTask.id },
      include: taskIncludeRelations,
    })) as unknown as RawTaskWithRelations;

    return toStaffTask(updated, user);
  },

  // Mengubah status siklus hidup task sesuai aturan bisnis BR-03 s/d BR-11
  async updateStatus(
    taskPublicId: string,
    user: AuthenticatedUser,
    body: UpdateTaskStatusSchema,
  ): Promise<StaffTaskResponse> {
    const task = (await prisma.task.findFirst({
      where: { public_id: taskPublicId, deletedAt: null },
      include: {
        ...taskIncludeRelations,
        project: { include: { members: { where: { deletedAt: null }, select: { userId: true } } } },
      },
    })) as unknown as (RawTaskWithRelations & { project: { id: string; members: { userId: string }[] } }) | null;

    if (!task) throw new NotFoundError("Task");

    if (user.role !== "PM") {
      const isMember = task.project.members.some((m) => m.userId === user.id);
      if (!isMember) throw new NotFoundError("Task");
    }

    const isAssignee = task.assigneeId === user.id;

    if (body.status === "DONE") {
      if (user.role === "PM") throw new ForbiddenError("PM tidak dapat menyelesaikan task (hanya assignee)", { reason: "PM_CANNOT_COMPLETE" });
      if (!isAssignee) throw new ForbiddenError("Hanya assignee yang dapat menyelesaikan task", { reason: "NOT_ASSIGNEE" });
    } else {
      if (user.role !== "PM" && !isAssignee) {
        throw new ForbiddenError("Hanya assignee yang dapat mengubah status task ini", { reason: "NOT_ASSIGNEE" });
      }
    }

    const validTransitions: Record<TaskStatus, TaskStatus[]> = {
      TODO: ["IN_PROGRESS"],
      IN_PROGRESS: ["TODO", "DONE"],
      DONE: ["IN_PROGRESS"],
    };

    if (!validTransitions[task.status]?.includes(body.status)) {
      throw new UnprocessableError("INVALID_TRANSITION", `Transisi dari ${task.status} ke ${body.status} tidak diizinkan`);
    }

    if (body.status === "IN_PROGRESS" && !task.assigneeId) {
      throw new UnprocessableError("ASSIGNEE_REQUIRED", "Task harus memiliki assignee sebelum dimulai");
    }

    if (body.status === "IN_PROGRESS") {
      const { isBlocked, blockers } = computeIsBlocked(task);
      if (isBlocked) throw new TaskBlockedError(blockers.map((b) => ({ id: b.id, title: b.title })));
    }

    if (task.status === "DONE" && body.status === "IN_PROGRESS") {
      const activeDependents = await prisma.taskDependency.findMany({
        where: {
          dependsOnId: task.id,
          deletedAt: null,
          task: { deletedAt: null, status: { in: ["IN_PROGRESS", "DONE"] } },
        },
        include: { task: { select: { public_id: true, title: true, status: true } } },
      });
      if (activeDependents.length > 0) {
        throw new UnprocessableError("HAS_ACTIVE_DEPENDENTS", "Tidak dapat membuka kembali task karena ada dependent yang sedang berjalan atau sudah selesai");
      }
    }

    if (task.version !== body.version) throw new VersionConflictError(task.version);

    await prisma.$transaction(async (tx) => {
      const updateResult = await tx.task.updateMany({
        where: { id: task.id, version: body.version, deletedAt: null },
        data: { status: body.status, version: { increment: 1 } },
      });

      if (updateResult.count === 0) {
        const latest = await tx.task.findUnique({ where: { id: task.id } });
        throw new VersionConflictError(latest?.version ?? body.version);
      }

      await tx.taskAuditLog.create({
        data: {
          taskId: task.id,
          projectId: task.projectId,
          userId: user.id,
          column: "status",
          oldValue: task.status,
          newValue: body.status,
        },
      });
    });

    await bumpProject(task.projectId);

    const updated = (await prisma.task.findUnique({
      where: { id: task.id },
      include: taskIncludeRelations,
    })) as unknown as RawTaskWithRelations;

    return toStaffTask(updated, user);
  },

  // Menghapus task secara soft-delete jika tidak memiliki dependent aktif (PM only)
  async deleteTask(taskPublicId: string, user: AuthenticatedUser): Promise<void> {
    const task = await prisma.task.findFirst({
      where: { public_id: taskPublicId, deletedAt: null },
    });
    if (!task) throw new NotFoundError("Task");

    const activeDependents = await prisma.taskDependency.findFirst({
      where: { dependsOnId: task.id, deletedAt: null, task: { deletedAt: null } },
    });
    if (activeDependents) {
      throw new UnprocessableError("HAS_ACTIVE_DEPENDENTS", "Task tidak dapat dihapus karena menjadi prerequisite untuk task lain");
    }

    const now = new Date();

    await prisma.$transaction(async (tx) => {
      await tx.task.update({ where: { id: task.id }, data: { deletedAt: now } });
      await tx.taskAuditLog.create({
        data: {
          taskId: task.id,
          projectId: task.projectId,
          userId: user.id,
          column: "deletedAt",
          oldValue: null,
          newValue: now.toISOString(),
        },
      });
    });

    await bumpProject(task.projectId);
  },

  // Menambahkan relasi dependensi antar-task dengan proteksi siklus graf DFS (PM only)
  async addDependency(
    taskPublicId: string,
    user: AuthenticatedUser,
    body: AddDependencySchema,
  ): Promise<{ taskId: string; dependsOnTaskId: string; isBlocked: boolean }> {
    const [currentTask, prereqTask] = await Promise.all([
      prisma.task.findFirst({ where: { public_id: taskPublicId, deletedAt: null } }),
      prisma.task.findFirst({ where: { public_id: body.dependsOnTaskId, deletedAt: null } }),
    ]);

    if (!currentTask) throw new NotFoundError("Task");
    if (!prereqTask) throw new NotFoundError("Prerequisite Task");

    if (currentTask.id === prereqTask.id) {
      throw new UnprocessableError("INVALID_DEPENDENCY", "Task tidak dapat bergantung pada dirinya sendiri");
    }
    if (currentTask.projectId !== prereqTask.projectId) {
      throw new UnprocessableError("INVALID_DEPENDENCY", "Dependency hanya dapat dibuat antar task dalam project yang sama");
    }
    if (currentTask.status !== "TODO") {
      throw new UnprocessableError("INVALID_DEPENDENCY", "Dependency hanya dapat ditambahkan pada task yang masih berstatus TODO");
    }

    const existingEdge = await prisma.taskDependency.findUnique({
      where: { taskId_dependsOnId: { taskId: currentTask.id, dependsOnId: prereqTask.id } },
    });

    if (existingEdge && existingEdge.deletedAt === null) {
      throw new ConflictError("Dependency ini sudah ada");
    }

    const allEdges = await prisma.taskDependency.findMany({
      where: { task: { projectId: currentTask.projectId, deletedAt: null }, deletedAt: null },
      select: {
        taskId: true,
        dependsOnId: true,
        task: { select: { public_id: true } },
        dependsOn: { select: { public_id: true } },
      },
    });

    const idToPublicId: Record<string, string> = {
      [currentTask.id]: currentTask.public_id,
      [prereqTask.id]: prereqTask.public_id,
    };
    for (const e of allEdges) {
      idToPublicId[e.taskId] = e.task.public_id;
      idToPublicId[e.dependsOnId] = e.dependsOn.public_id;
    }

    const cyclePath = detectCycle(
      allEdges.map((e) => ({ from: e.taskId, to: e.dependsOnId })),
      { from: currentTask.id, to: prereqTask.id },
      idToPublicId,
    );

    if (cyclePath) {
      throw new UnprocessableError("CIRCULAR_DEPENDENCY", "Dependency akan menyebabkan siklus (circular dependency)", { path: cyclePath });
    }

    await prisma.$transaction(async (tx) => {
      if (existingEdge) {
        await tx.taskDependency.update({ where: { id: existingEdge.id }, data: { deletedAt: null } });
      } else {
        await tx.taskDependency.create({ data: { taskId: currentTask.id, dependsOnId: prereqTask.id } });
      }

      await tx.taskAuditLog.create({
        data: {
          taskId: currentTask.id,
          projectId: currentTask.projectId,
          userId: user.id,
          column: "dependencies",
          oldValue: null,
          newValue: `added:${prereqTask.public_id}`,
        },
      });
    });

    await bumpProject(currentTask.projectId);

    const reloaded = (await prisma.task.findUnique({
      where: { id: currentTask.id },
      include: taskIncludeRelations,
    })) as unknown as RawTaskWithRelations;

    const { isBlocked } = computeIsBlocked(reloaded);

    return { taskId: currentTask.public_id, dependsOnTaskId: prereqTask.public_id, isBlocked };
  },

  // Menghapus relasi dependensi antar-task secara soft-delete (PM only)
  async removeDependency(
    taskPublicId: string,
    prereqPublicId: string,
    user: AuthenticatedUser,
  ): Promise<void> {
    const [currentTask, prereqTask] = await Promise.all([
      prisma.task.findFirst({ where: { public_id: taskPublicId, deletedAt: null } }),
      prisma.task.findFirst({ where: { public_id: prereqPublicId, deletedAt: null } }),
    ]);

    if (!currentTask || !prereqTask) throw new NotFoundError("Dependency");

    const edge = await prisma.taskDependency.findUnique({
      where: { taskId_dependsOnId: { taskId: currentTask.id, dependsOnId: prereqTask.id } },
    });

    if (!edge || edge.deletedAt !== null) throw new NotFoundError("Dependency");

    await prisma.$transaction(async (tx) => {
      await tx.taskDependency.update({ where: { id: edge.id }, data: { deletedAt: new Date() } });
      await tx.taskAuditLog.create({
        data: {
          taskId: currentTask.id,
          projectId: currentTask.projectId,
          userId: user.id,
          column: "dependencies",
          oldValue: null,
          newValue: `removed:${prereqTask.public_id}`,
        },
      });
    });

    await bumpProject(currentTask.projectId);
  },

  // Mengambil daftar komentar internal pada task (Staff only)
  async getComments(
    taskPublicId: string,
    user: AuthenticatedUser,
  ): Promise<object[]> {
    if (user.role === "CLIENT") throw new ForbiddenError("Client tidak memiliki akses ke komentar");

    const task = await prisma.task.findFirst({
      where: { public_id: taskPublicId, deletedAt: null },
      include: { project: { include: { members: { where: { deletedAt: null }, select: { userId: true } } } } },
    });
    if (!task) throw new NotFoundError("Task");

    if (user.role !== "PM") {
      const isMember = task.project.members.some((m) => m.userId === user.id);
      if (!isMember) throw new NotFoundError("Task");
    }

    const comments = await prisma.comment.findMany({
      where: { taskId: task.id, deletedAt: null },
      orderBy: { createdAt: "asc" },
      include: {
        author: { select: { public_id: true, name: true, avatarUrl: true, role: true, department: true } },
      },
    });

    return comments.map((cmt) => ({
      id: cmt.public_id,
      body: cmt.body,
      isInternal: cmt.isInternal,
      author: {
        id: cmt.author.public_id,
        name: cmt.author.name,
        avatarUrl: cmt.author.avatarUrl,
        role: cmt.author.role,
        department: cmt.author.department,
      },
      createdAt: cmt.createdAt.toISOString(),
    }));
  },

  // Menambahkan komentar internal pada task (Staff only)
  async addComment(
    taskPublicId: string,
    user: AuthenticatedUser,
    body: AddCommentSchema,
  ): Promise<object> {
    if (user.role === "CLIENT") throw new ForbiddenError("Client tidak dapat membuat komentar");

    const task = await prisma.task.findFirst({
      where: { public_id: taskPublicId, deletedAt: null },
      include: { project: { include: { members: { where: { deletedAt: null }, select: { userId: true } } } } },
    });
    if (!task) throw new NotFoundError("Task");

    if (user.role !== "PM") {
      const isMember = task.project.members.some((m) => m.userId === user.id);
      if (!isMember) throw new NotFoundError("Task");
    }

    const comment = await prisma.comment.create({
      data: { taskId: task.id, authorId: user.id, body: body.body, isInternal: true },
      include: { author: { select: { public_id: true, name: true, avatarUrl: true, role: true, department: true } } },
    });

    return {
      id: comment.public_id,
      body: comment.body,
      isInternal: comment.isInternal,
      author: {
        id: comment.author.public_id,
        name: comment.author.name,
        avatarUrl: comment.author.avatarUrl,
        role: comment.author.role,
        department: comment.author.department,
      },
      createdAt: comment.createdAt.toISOString(),
    };
  },
};