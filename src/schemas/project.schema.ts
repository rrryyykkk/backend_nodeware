import { z } from "zod";

export const createProjectSchema = z.strictObject({
  name: z.string().min(1, "Nama project wajib diisi"),
  description: z.string().optional(),
});

export const updateProjectSchema = z.strictObject({
  name: z.string().min(1, "Nama project wajib diisi").optional(),
  description: z.string().optional(),
});

export const addMemberSchema = z.strictObject({
  userId: z.string().min(1, "User ID wajib diisi"), // public_id
});

export const listProjectQuerySchema = z.strictObject({
  search: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  rows: z.coerce.number().int().min(1).max(100).default(10),
});

export type CreateProjectSchema = z.infer<typeof createProjectSchema>;
export type UpdateProjectSchema = z.infer<typeof updateProjectSchema>;
export type AddMemberSchema = z.infer<typeof addMemberSchema>;
export type ListProjectQuerySchema = z.infer<typeof listProjectQuerySchema>;
