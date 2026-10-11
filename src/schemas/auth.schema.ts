import { z } from "zod";

export const registerSchema = z.strictObject({
  name: z.string().min(1, "Nama wajib diisi"),
  email: z.string().email("Format tidak valid"),
  password: z.string().min(8, "Minimal 8 karakter"),
});

export const loginSchema = z.strictObject({
  email: z.string().email("Format tidak valid"),
  password: z.string().min(1, "Password wajib diisi"),
});

export type RegisterSchema = z.infer<typeof registerSchema>;
export type LoginSchema = z.infer<typeof loginSchema>;
