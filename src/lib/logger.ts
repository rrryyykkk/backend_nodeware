/**
 * Logger - Diferensiasi antara production dan development
 *
 * PRODUCTION : structured JSON, tanpa stack trace, tanpa PII, tanpa query detail
 * DEVELOPMENT: format manusia-readable dengan warna + stack trace lengkap
 */

const IS_PROD = process.env.NODE_ENV === "production";

type LogLevel = "debug" | "info" | "warn" | "error";

interface LogMeta {
  [key: string]: unknown;
}

function sanitizeMeta(meta: LogMeta): LogMeta {
  if (!IS_PROD) return meta;

  // Hapus field sensitif dari log production
  const PII_FIELDS = ["password", "token", "authorization", "cookie", "secret", "apiKey", "api_key"];
  const clean: LogMeta = {};
  for (const [key, value] of Object.entries(meta)) {
    const lower = key.toLowerCase();
    if (PII_FIELDS.some((f) => lower.includes(f))) {
      clean[key] = "[REDACTED]";
    } else if (typeof value === "object" && value !== null && !Array.isArray(value)) {
      clean[key] = sanitizeMeta(value as LogMeta);
    } else {
      clean[key] = value;
    }
  }
  return clean;
}

function formatProduction(level: LogLevel, message: string, meta?: LogMeta): string {
  return JSON.stringify({
    timestamp: new Date().toISOString(),
    level,
    message,
    ...(meta ? sanitizeMeta(meta) : {}),
  });
}

function formatDevelopment(level: LogLevel, message: string, meta?: LogMeta): string {
  const colors: Record<LogLevel, string> = {
    debug: "\x1b[37m",
    info: "\x1b[36m",
    warn: "\x1b[33m",
    error: "\x1b[31m",
  };
  const reset = "\x1b[0m";
  const timestamp = new Date().toTimeString().split(" ")[0];
  const colored = `${colors[level]}[${level.toUpperCase()}]${reset}`;
  const metaStr = meta ? `\n  ${JSON.stringify(meta, null, 2)}` : "";
  return `${timestamp} ${colored} ${message}${metaStr}`;
}

function log(level: LogLevel, message: string, meta?: LogMeta): void {
  const output = IS_PROD ? formatProduction(level, message, meta) : formatDevelopment(level, message, meta);

  if (level === "error") {
    console.error(output);
  } else if (level === "warn") {
    console.warn(output);
  } else {
    console.log(output);
  }
}

export const logger = {
  debug: (message: string, meta?: LogMeta): void => {
    if (!IS_PROD) log("debug", message, meta);
  },
  info: (message: string, meta?: LogMeta): void => log("info", message, meta),
  warn: (message: string, meta?: LogMeta): void => log("warn", message, meta),
  error: (message: string, error?: unknown, meta?: LogMeta): void => {
    const errorMeta: LogMeta = { ...meta };

    if (error instanceof Error) {
      errorMeta.errorMessage = error.message;
      errorMeta.errorName = error.name;
      // Stack trace hanya di development
      if (!IS_PROD) {
        errorMeta.stack = error.stack;
      }
    }

    log("error", message, errorMeta);
  },
  /** Log HTTP request (info level) — tanpa body sensitif */
  request: (method: string, path: string, status: number, durationMs: number, meta?: LogMeta): void => {
    log("info", `${method} ${path} ${status}`, { durationMs, ...meta });
  },
};