import type { MiddlewareHandler, Context, Next } from "hono";
import { redis } from "../config/redis";
import { RateLimitError, AppError } from "../error/error.handler";

/**
 * Security Headers Middleware
 * Sesuai standar CVE 2026 / OWASP: mencegah clickjacking, XSS, MIME-sniffing, dll.
 */
export const securityHeaders: MiddlewareHandler = async (
  c: Context,
  next: Next,
): Promise<Response | void> => {
  await next();

  const res = c.res;

  // Content Security Policy
  res.headers.set(
    "Content-Security-Policy",
    "default-src 'none'; script-src 'self'; connect-src 'self'; img-src 'self' data:; style-src 'self'; frame-ancestors 'none'",
  );

  // Prevent MIME sniffing
  res.headers.set("X-Content-Type-Options", "nosniff");

  // Clickjacking
  res.headers.set("X-Frame-Options", "DENY");

  // XSS filter (legacy browsers)
  res.headers.set("X-XSS-Protection", "1; mode=block");

  // HSTS (strict transport, production only)
  if (process.env.NODE_ENV === "production") {
    res.headers.set("Strict-Transport-Security", "max-age=63072000; includeSubDomains; preload");
  }

  // Referrer policy
  res.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");

  // Permissions policy (disable unneeded APIs)
  res.headers.set(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=(), payment=()",
  );

  // Remove fingerprinting headers
  res.headers.delete("X-Powered-By");
  res.headers.delete("Server");
};

/**
 * General Rate Limiting — dapat digunakan di semua endpoint sensitif.
 * @param limit  max requests per window
 * @param windowSec  window dalam detik
 * @param keyFn  fungsi untuk membuat key unik per request (default: IP)
 */
export function generalRateLimit(
  limit: number,
  windowSec: number,
  keyFn?: (c: Context) => string,
): MiddlewareHandler {
  return async (c: Context, next: Next): Promise<Response | void> => {
    const defaultKey = c.req.header("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
    const key = `rl:gen:${keyFn ? keyFn(c) : defaultKey}:${c.req.path}`;

    const current = await redis.incr(key);
    if (current === 1) {
      await redis.expire(key, windowSec);
    }

    if (current > limit) {
      const ttl = await redis.ttl(key);
      const retryAfter = ttl > 0 ? ttl : windowSec;

      c.res.headers.set("Retry-After", String(retryAfter));
      c.res.headers.set("X-RateLimit-Limit", String(limit));
      c.res.headers.set("X-RateLimit-Remaining", "0");

      throw new RateLimitError(
        `Terlalu banyak permintaan. Coba lagi dalam ${retryAfter} detik.`,
        retryAfter,
      );
    }

    c.res.headers.set("X-RateLimit-Limit", String(limit));
    c.res.headers.set("X-RateLimit-Remaining", String(Math.max(0, limit - current)));

    await next();
  };
}

/**
 * Prevent excessively large request bodies
 * Proteksi dari: DoS via payload, HTTP request smuggling
 */
export function requestSizeLimit(maxBytes: number = 1 * 1024 * 1024): MiddlewareHandler {
  return async (c: Context, next: Next): Promise<Response | void> => {
    const contentLength = c.req.header("content-length");
    if (contentLength && parseInt(contentLength, 10) > maxBytes) {
      throw new AppError(
        `Request body terlalu besar (maksimal ${Math.round(maxBytes / 1024)} KB)`,
        413,
        "PAYLOAD_TOO_LARGE",
      );
    }
    await next();
  };
}

/**
 * Open Redirect Prevention - validasi target redirect
 */
export function isSafeRedirect(url: string): boolean {
  try {
    const parsed = new URL(url);
    const allowedHosts = (process.env.FRONTEND_URL || "http://localhost:3000")
      .split(",")
      .map((u) => new URL(u.trim()).host);
    return allowedHosts.includes(parsed.host);
  } catch {
    // Relative URL - aman
    return url.startsWith("/") && !url.startsWith("//");
  }
}