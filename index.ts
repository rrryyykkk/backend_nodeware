import "dotenv/config";
import { Hono } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { cors } from "hono/cors";

// lib & config
import { prisma } from "./src/lib/prisma";
import { redis } from "./src/config/redis";
import { logger } from "./src/lib/logger";

// routes
import { authRoutes } from "./src/routes/auth.routes";
import { userRoutes } from "./src/routes/user.routes";
import { projectRoutes } from "./src/routes/project.routes";
import { taskRoutes } from "./src/routes/task.routes";

// middleware
import { AppError } from "./src/error/error.handler";
import { csrfGuard } from "./src/middleware/guard.middleware";
import {
  securityHeaders,
  requestSizeLimit,
} from "./src/middleware/security.middleware";

const app = new Hono();
const port = process.env.PORT ? Number(process.env.PORT) : 3001;
const IS_PROD = process.env.NODE_ENV === "production";

// ---------------------------------------------------------------------------
// Global Middleware
// ---------------------------------------------------------------------------

// Security headers (OWASP / CVE hardening)
app.use("*", securityHeaders);

// Request body size limit (default 1 MB for JSON, attachment route overrides)
app.use("/api/v1/*", requestSizeLimit(1 * 1024 * 1024));

// CORS
const frontendUrl = process.env.FRONTEND_URL || "http://localhost:3000";
app.use(
  "*",
  cors({
    origin: (origin) => {
      const allowed = [
        frontendUrl,
        "http://localhost:3000",
        "http://localhost:5173",
        "http://127.0.0.1:3000",
      ];
      return allowed.includes(origin) ? origin : frontendUrl;
    },
    credentials: true,
  }),
);

// CSRF guard untuk semua mutasi
app.use("*", csrfGuard);

// Request logger
app.use("*", async (c, next) => {
  const start = Date.now();
  await next();
  const duration = Date.now() - start;
  // Jangan log path sensitif di production
  const path = IS_PROD ? c.req.routePath : c.req.path;
  logger.request(c.req.method, path, c.res.status, duration);
});

// ---------------------------------------------------------------------------
// Health Check
// ---------------------------------------------------------------------------
app.get("/health", async (c) => {
  await prisma.$queryRaw`SELECT 1`;
  await redis.ping();
  return c.json({
    success: true,
    response_code: 200,
    message: "Service healthy",
    data: { status: "ok", db: "ok", redis: "ok" },
  });
});

// ---------------------------------------------------------------------------
// API Routes v1
// ---------------------------------------------------------------------------
const apiV1 = new Hono();
apiV1.route("/auth", authRoutes);
apiV1.route("/users", userRoutes);
apiV1.route("/projects", projectRoutes);
apiV1.route("/tasks", taskRoutes);

app.route("/api/v1", apiV1);

// ---------------------------------------------------------------------------
// Global Error Handler
// ---------------------------------------------------------------------------
app.onError((error, c) => {
  if (error instanceof AppError) {
    // Log di level yang sesuai
    if (error.statusCode >= 500) {
      logger.error("Server error", error, {
        path: c.req.path,
        method: c.req.method,
      });
    } else {
      logger.warn("Client error", {
        code: error.code,
        status: error.statusCode,
        path: c.req.path,
      });
    }

    return c.json(
      {
        success: false,
        response_code: error.statusCode,
        message: error.message,
        error: {
          code: error.code,
          // Details HANYA di non-production (hindari leak stack/query)
          ...(IS_PROD ? {} : { details: error.details }),
        },
      },
      error.statusCode as ContentfulStatusCode,
    );
  }

  // Unexpected error — jangan bocorkan detail di production
  logger.error("Unexpected error", error, {
    path: c.req.path,
    method: c.req.method,
  });

  return c.json(
    {
      success: false,
      response_code: 500,
      message: "Terjadi kesalahan internal server",
      error: { code: "INTERNAL_SERVER_ERROR" },
    },
    500,
  );
});

// ---------------------------------------------------------------------------
// Bootstrap
// ---------------------------------------------------------------------------
await prisma.$connect();
await redis.ping();
logger.info("Server starting", {
  port,
  env: process.env.NODE_ENV ?? "development",
});

export default {
  port,
  fetch: app.fetch,
};
