import type { Context } from "hono";
import { setCookie, deleteCookie } from "hono/cookie";
import { authServices } from "../service/auth.service";
import { sessionStore } from "../utils/auth.sessionStore";
import { checkLoginRateLimit, clearLoginRateLimit } from "../middleware/guard.middleware";
import type { RegisterSchema, LoginSchema } from "../schemas/auth.schema";
import type { AuthenticatedUser } from "../types/auth.types";

// Konfigurasi opsi cookie session HTTP-only yang aman
function getCookieOptions(): {
  httpOnly: boolean;
  secure: boolean;
  sameSite: "Lax" | "None" | "Strict";
  path: string;
  maxAge: number;
} {
  const isProd = process.env.NODE_ENV === "production";
  const sameSiteConfig = (process.env.COOKIE_SAMESITE?.toLowerCase() ?? "lax") as "lax" | "none" | "strict";
  const sameSite =
    sameSiteConfig === "none" ? "None" : sameSiteConfig === "strict" ? "Strict" : "Lax";
  return { httpOnly: true, secure: isProd || sameSite === "None", sameSite, path: "/", maxAge: sessionStore.ttl };
}

export const authController = {
  // Mendaftarkan akun Client baru dan menyetel session cookie
  async register(c: Context): Promise<Response> {
    const body = c.get("validatedBody") as RegisterSchema;
    const { user, token } = await authServices.register(body);
    setCookie(c, "session", token, getCookieOptions());
    return c.json({ success: true, response_code: 201, message: "Registered", data: user }, 201);
  },

  // Mengautentikasi login dengan rate limit IP & email, lalu memasang session cookie
  async login(c: Context): Promise<Response> {
    const body = c.get("validatedBody") as LoginSchema;
    const ip = c.req.header("x-forwarded-for")?.split(",")[0]?.trim() || "127.0.0.1";
    await checkLoginRateLimit(ip, body.email);
    const result = await authServices.login(body);
    await clearLoginRateLimit(ip, body.email);
    setCookie(c, "session", result.token, getCookieOptions());
    return c.json({
      success: true,
      response_code: 200,
      message: "OK",
      data: { expiresAt: result.expiresAt, user: result.user },
    }, 200);
  },

  // Mencabut session ID dari Redis dan menghapus cookie session
  async logout(c: Context): Promise<Response> {
    const jti = c.get("jti") as string | undefined;
    if (jti) await sessionStore.revoke(jti);
    const opts = getCookieOptions();
    deleteCookie(c, "session", { path: opts.path, secure: opts.secure });
    return c.json({ success: true, response_code: 200, message: "Logged out successfully" }, 200);
  },

  // Mengambil profil data user yang saat ini sedang login
  async me(c: Context): Promise<Response> {
    const user = c.get("user") as AuthenticatedUser;
    return c.json({
      success: true,
      response_code: 200,
      message: "OK",
      data: {
        id: user.public_id,
        name: user.name,
        email: user.email,
        role: user.role,
        department: user.department,
        avatarUrl: user.avatarUrl,
      },
    }, 200);
  },
};