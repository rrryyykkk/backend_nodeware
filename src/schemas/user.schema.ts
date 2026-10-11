import { z } from "zod";

export const createUserSchema = z
  .strictObject({
    name: z.string().min(1, "Nama wajib diisi"),
    email: z.string().email("Format tidak valid"),
    password: z.string().min(8, "Minimal 8 karakter"),
    role: z.enum(["INTERNAL", "CLIENT"], {
      message: "Role harus INTERNAL atau CLIENT",
    }),
    department: z.enum(["UIUX", "BACKEND", "FRONTEND"]).nullable().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.role === "INTERNAL") {
      if (!data.department) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Department wajib diisi untuk user INTERNAL",
          path: ["department"],
        });
      }
    } else if (data.role === "CLIENT") {
      if (data.department) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Department harus kosong untuk CLIENT",
          path: ["department"],
        });
      }
    }
  });

export const listUserQuerySchema = z.strictObject({
  role: z.enum(["PM", "INTERNAL", "CLIENT"]).optional(),
  department: z.enum(["UIUX", "BACKEND", "FRONTEND"]).optional(),
  search: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  rows: z.coerce.number().int().min(1).max(100).default(10),
});

export type CreateUserSchema = z.infer<typeof createUserSchema>;
export type ListUserQuerySchema = z.infer<typeof listUserQuerySchema>;
