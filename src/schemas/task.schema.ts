import { z } from "zod";

export const createTaskSchema = z.strictObject({
  title: z.string().min(1, "Judul task wajib diisi"),
  description: z.string().min(1, "Deskripsi task wajib diisi"),
  department: z.enum(["UIUX", "BACKEND", "FRONTEND"], {
    message: "Department harus UIUX, BACKEND, atau FRONTEND",
  }),
  assigneeId: z.string().nullable().optional(), // public_id user
  clientVisible: z.boolean().default(false),
});

export const updateTaskCoreSchema = z.strictObject({
  version: z.number().int({ message: "Version wajib berupa integer" }),
  title: z.string().min(1, "Judul task wajib diisi").optional(),
  description: z.string().min(1, "Deskripsi task wajib diisi").optional(),
  department: z.enum(["UIUX", "BACKEND", "FRONTEND"]).optional(),
  assigneeId: z.string().nullable().optional(),
  clientVisible: z.boolean().optional(),
});

export const updateTaskStatusSchema = z.strictObject({
  version: z.number().int({ message: "Version wajib berupa integer" }),
  status: z.enum(["TODO", "IN_PROGRESS", "DONE"], {
    message: "Status harus TODO, IN_PROGRESS, atau DONE",
  }),
});

export const addDependencySchema = z.strictObject({
  dependsOnTaskId: z.string().min(1, "dependsOnTaskId wajib diisi"), // public_id
});

export const listTasksQuerySchema = z.strictObject({
  status: z.enum(["TODO", "IN_PROGRESS", "DONE"]).optional(),
  department: z.enum(["UIUX", "BACKEND", "FRONTEND"]).optional(),
  assigneeId: z.string().optional(), // public_id user
  isBlocked: z.coerce.boolean().optional(),
  clientVisible: z.coerce.boolean().optional(),
  search: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  rows: z.coerce.number().int().min(1).max(100).default(10),
  orderKey: z.enum(["createdAt", "updatedAt", "title", "status"]).default("createdAt"),
  orderRule: z.enum(["asc", "desc"]).default("desc"),
});

export const addCommentSchema = z.strictObject({
  body: z.string().min(1, "Komentar tidak boleh kosong"),
});

export type CreateTaskSchema = z.infer<typeof createTaskSchema>;
export type UpdateTaskCoreSchema = z.infer<typeof updateTaskCoreSchema>;
export type UpdateTaskStatusSchema = z.infer<typeof updateTaskStatusSchema>;
export type AddDependencySchema = z.infer<typeof addDependencySchema>;
export type ListTasksQuerySchema = z.infer<typeof listTasksQuerySchema>;
export type AddCommentSchema = z.infer<typeof addCommentSchema>;
