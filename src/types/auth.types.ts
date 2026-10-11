import type { Role, Department } from "../../generated/prisma/client";

// ============================================================
// API Response Envelope Types
// ============================================================

export interface SuccessEnvelope<T = unknown> {
  success: true;
  response_code: number;
  message: string;
  data?: T;
  meta?: PaginationMeta;
}

export interface ErrorEnvelope {
  success: false;
  response_code: number;
  message: string;
  error: {
    code: string;
    details?: unknown;
  };
}

export interface PaginationMeta {
  page: number;
  rows: number;
  totalData: number;
  totalPages: number;
}

export type ApiEnvelope<T = unknown> = SuccessEnvelope<T> | ErrorEnvelope;

// ============================================================
// Auth Domain Types
// ============================================================

/** Shape stored in Hono context after authMiddleware resolves. */
export interface AuthenticatedUser {
  id: string; // internal cuid (DB primary key — never exposed to API)
  public_id: string;
  name: string;
  email: string;
  role: Role;
  department: Department | null;
  avatarUrl: string | null;
}

/** JWT payload stored inside the signed token. */
export interface JwtPayload {
  sub: string; // user.public_id
  jti: string; // unique session ID (stored in Redis)
  iat: number;
  exp: number;
}

/** Return shape from authService.register / authService.login. */
export interface AuthResult {
  token: string;
  expiresAt: string; // ISO-8601
  user: {
    id: string; // public_id
    name: string;
    email: string;
    role: Role;
    department: Department | null;
    avatarUrl: string | null;
  };
}
