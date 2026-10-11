import type { Context, MiddlewareHandler, Next } from "hono";
import { type ZodType } from "zod";
import { formatZodIssues, ValidationError } from "../error/error.handler";

export function validateBody<T>(schema: ZodType<T>): MiddlewareHandler {
  return async (c: Context, next: Next): Promise<Response | void> => {
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      throw new ValidationError(
        { _root: ["Body request harus berupa JSON yang valid"] },
        "JSON tidak valid",
      );
    }

    const result = schema.safeParse(body);
    if (!result.success) {
      throw new ValidationError(
        formatZodIssues(result.error),
        "Validasi gagal",
      );
    }

    c.set("validatedBody", result.data);
    await next();
  };
}

export function validateQuery<T>(schema: ZodType<T>): MiddlewareHandler {
  return async (c: Context, next: Next): Promise<Response | void> => {
    const query = c.req.query();
    const result = schema.safeParse(query);
    if (!result.success) {
      throw new ValidationError(
        formatZodIssues(result.error),
        "Validasi gagal",
      );
    }

    c.set("validatedQuery", result.data);
    await next();
  };
}
