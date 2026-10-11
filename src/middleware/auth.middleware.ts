import type { Context, MiddlewareHandler, Next } from "hono";
import { getCookie } from "hono/cookie";
import jwt from "jsonwebtoken";
import { AuthError } from "../error/error.handler";
import { sessionStore } from "../utils/auth.sessionStore";
import { prisma } from "../lib/prisma";
import { JWT_SECRET } from "../service/auth.service";
import type { AuthenticatedUser, JwtPayload } from "../types/auth.types";

// Re-export for backward compat (legacy import from auth.middleware)
export type { AuthenticatedUser };

export const authMiddleware: MiddlewareHandler = async (
  c: Context,
  next: Next,
): Promise<Response | void> => {
  // 1. Ambil token: cookie httpOnly "session" atau fallback Bearer header
  const cookieToken = getCookie(c, "session");
  const authHeader = c.req.header("Authorization");
  const bearerToken = authHeader?.startsWith("Bearer ")
    ? authHeader.slice(7).trim()
    : undefined;

  const token = cookieToken || bearerToken;
  if (!token) throw new AuthError("Sesi tidak ditemukan atau belum login");

  // 2. Verifikasi JWT — hanya HS256 diizinkan (BR-20)
  let decoded: JwtPayload;
  try {
    const verified = jwt.verify(token, JWT_SECRET, { algorithms: ["HS256"] });
    if (typeof verified === "string" || !verified.sub || !verified.jti) {
      throw new AuthError("Token tidak valid");
    }
    decoded = verified as JwtPayload;
  } catch (err: unknown) {
    if (err instanceof AuthError) throw err;
    if (err instanceof jwt.TokenExpiredError)
      throw new AuthError("Sesi telah kedaluwarsa");
    throw new AuthError("Token tidak valid atau rusak");
  }

  // 3. Verifikasi session di Redis (BR-20)
  const activeUserPublicId = await sessionStore.get(decoded.jti);
  if (!activeUserPublicId || activeUserPublicId !== decoded.sub) {
    throw new AuthError("Sesi telah berakhir atau telah dicabut");
  }

  // 4. Verifikasi user di DB masih aktif (BR-20)
  const user = await prisma.user.findFirst({
    where: { public_id: decoded.sub, deletedAt: null },
    select: {
      id: true,
      public_id: true,
      name: true,
      email: true,
      role: true,
      department: true,
      avatarUrl: true,
    },
  });

  if (!user)
    throw new AuthError("Pengguna tidak ditemukan atau sudah dinonaktifkan");

  c.set("user", user as AuthenticatedUser);
  c.set("jti", decoded.jti);

  await next();
};
