import type { ZodError } from "zod";

export class AppError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly code: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export class ValidationError extends AppError {
  constructor(details?: unknown, message = "Validasi gagal") {
    super(message, 400, "VALIDATION_ERROR", details);
    this.name = "ValidationError";
  }
}

export class AuthError extends AppError {
  constructor(message = "Unauthorized") {
    super(message, 401, "UNAUTHORIZED");
    this.name = "AuthError";
  }
}

export class CredentialError extends AppError {
  constructor(message = "Email atau password salah") {
    super(message, 401, "INVALID_CREDENTIALS");
    this.name = "CredentialError";
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "Akses ditolak", details?: unknown) {
    super(message, 403, "FORBIDDEN", details);
    this.name = "ForbiddenError";
  }
}

export class NotFoundError extends AppError {
  constructor(resource = "") {
    super(
      resource ? `${resource} tidak ditemukan` : "Data tidak ditemukan",
      404,
      "NOT_FOUND",
    );
    this.name = "NotFoundError";
  }
}

export class ConflictError extends AppError {
  constructor(message = "Data sudah ada") {
    super(message, 409, "CONFLICT_ERROR");
    this.name = "ConflictError";
  }
}

// Optimistic locking: data sudah diubah orang lain
export class VersionConflictError extends AppError {
  constructor(
    currentVersion?: number,
    message = "Task sudah diubah pengguna lain. Muat ulang data terbaru.",
  ) {
    super(message, 409, "VERSION_CONFLICT", { currentVersion });
    this.name = "VersionConflictError";
  }
}

// State-based permission: prasyarat belum Done
export class TaskBlockedError extends AppError {
  constructor(
    blockers: { id: string; title: string }[],
    message = "Task masih menunggu prerequisite",
  ) {
    super(message, 422, "TASK_BLOCKED", { blockers });
    this.name = "TaskBlockedError";
  }
}

export type BusinessRuleCode =
  | "INVALID_TRANSITION"
  | "ASSIGNEE_REQUIRED"
  | "ASSIGNEE_DEPARTMENT_MISMATCH"
  | "INVALID_DEPENDENCY"
  | "CIRCULAR_DEPENDENCY"
  | "HAS_ACTIVE_DEPENDENTS";

export class UnprocessableError extends AppError {
  constructor(
    code: BusinessRuleCode,
    message = "Permintaan tidak dapat diproses",
    details?: unknown,
  ) {
    super(message, 422, code, details);
    this.name = "UnprocessableError";
  }
}

export class RateLimitError extends AppError {
  constructor(
    message = "Terlalu banyak permintaan. Silakan coba lagi nanti.",
    public readonly retryAfter?: number,
  ) {
    super(message, 429, "TOO_MANY_REQUESTS");
    this.name = "RateLimitError";
  }
}

export class ServiceUnavailableError extends AppError {
  constructor(message = "Layanan sementara tidak tersedia") {
    super(message, 503, "SERVICE_UNAVAILABLE");
    this.name = "ServiceUnavailableError";
  }
}

export class InternalError extends AppError {
  constructor(message = "Terjadi kesalahan internal server") {
    super(message, 500, "INTERNAL_SERVER_ERROR");
    this.name = "InternalError";
  }
}

// ─── Label enum ─────────────────────────────────────────────────────────────
const ENUM_LABELS: Record<string, string> = {
  PM: "Product Manager",
  INTERNAL: "Internal Team",
  CLIENT: "Client Guest",
  UIUX: "UI/UX",
  FRONTEND: "Frontend",
  BACKEND: "Backend",
  TODO: "To Do",
  IN_PROGRESS: "In Progress",
  DONE: "Done",
};

const labelize = (v: unknown) => ENUM_LABELS[String(v)] ?? String(v);

// ─── Terjemahan issue Zod (v4) ──────────────────────────────────────────────
function translateZodIssue(issue: ZodError["issues"][number]): string {
  switch (issue.code) {
    case "invalid_type":
      return "Tipe data tidak sesuai";
    case "invalid_value":
      if ("values" in issue && Array.isArray(issue.values)) {
        return `Pilih salah satu dari: ${issue.values.map(labelize).join(", ")}`;
      }
      return "Nilai tidak valid";
    case "too_small":
      if ("minimum" in issue) {
        return issue.origin === "string"
          ? `Minimal ${issue.minimum} karakter`
          : `Minimal ${issue.minimum}`;
      }
      return "Nilai terlalu kecil";
    case "too_big":
      if ("maximum" in issue) {
        return issue.origin === "string"
          ? `Maksimal ${issue.maximum} karakter`
          : `Maksimal ${issue.maximum}`;
      }
      return "Nilai terlalu besar";
    case "unrecognized_keys":
      if ("keys" in issue && Array.isArray(issue.keys)) {
        return `Field tidak dikenal: ${issue.keys.join(", ")}`;
      }
      return "Ada field yang tidak dikenal";
    case "invalid_format":
      return "Format tidak valid";
    default:
      return issue.message;
  }
}

export function formatZodIssues(error: ZodError): Record<string, string[]> {
  const result: Record<string, string[]> = Object.create(null);
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "_root";
    (result[key] ??= []).push(translateZodIssue(issue));
  }
  return result;
}
