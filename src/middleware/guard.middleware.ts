import type { Context, MiddlewareHandler, Next } from "hono";
import { ForbiddenError, RateLimitError } from "../error/error.handler";
import { redis } from "../config/redis";
import type { AuthenticatedUser } from "./auth.middleware";
import type { Role } from "../../generated/prisma/client";

export function requireRole(...allowedRoles: Role[]): MiddlewareHandler {
  return async (c: Context, next: Next): Promise<Response | void> => {
    const user = c.get("user") as AuthenticatedUser | undefined;
    if (!user) {
      throw new ForbiddenError("Akses ditolak");
    }
    if (!allowedRoles.includes(user.role)) {
      throw new ForbiddenError("Role Anda tidak memiliki izin untuk aksi ini");
    }
    await next();
  };
}

export const csrfGuard: MiddlewareHandler = async (
  c: Context,
  next: Next,
): Promise<Response | void> => {
  const method = c.req.method.toUpperCase();
  // Safe HTTP methods do not require CSRF origin validation
  if (["GET", "HEAD", "OPTIONS"].includes(method)) {
    await next();
    return;
  }

  const origin = c.req.header("Origin");
  // Jika tidak ada origin (misalnya tools API/Postman/curl), izinkan jika tidak ada origin
  if (!origin) {
    await next();
    return;
  }

  const frontendUrl = process.env.FRONTEND_URL || "http://localhost:3000";
  const allowedOrigins = [
    frontendUrl,
    "http://localhost:3000",
    "http://localhost:5173",
    "http://127.0.0.1:3000",
  ];

  try {
    const originHost = new URL(origin).host;
    const isAllowed = allowedOrigins.some((allowed) => {
      try {
        return new URL(allowed).host === originHost;
      } catch {
        return false;
      }
    });

    if (!isAllowed) {
      throw new ForbiddenError("Permintaan CSRF ditolak", {
        reason: "CSRF_REJECTED",
      });
    }
  } catch (err: unknown) {
    if (err instanceof ForbiddenError) {
      throw err;
    }
    throw new ForbiddenError("Origin tidak valid", {
      reason: "CSRF_REJECTED",
    });
  }

  await next();
};

export async function checkLoginRateLimit(
  ip: string,
  email: string,
): Promise<void> {
  const sanitizedEmail = email.toLowerCase().trim();
  const key = `rl:login:${ip}:${sanitizedEmail}`;

  const attempts = await redis.incr(key);
  if (attempts === 1) {
    await redis.expire(key, 60);
  }

  if (attempts > 5) {
    const ttl = await redis.ttl(key);
    const retryAfter = ttl > 0 ? ttl : 60;
    throw new RateLimitError(
      "Terlalu banyak percobaan login gagal. Silakan coba lagi nanti.",
      retryAfter,
    );
  }
}

export async function clearLoginRateLimit(
  ip: string,
  email: string,
): Promise<void> {
  const sanitizedEmail = email.toLowerCase().trim();
  const key = `rl:login:${ip}:${sanitizedEmail}`;
  await redis.del(key);
}
