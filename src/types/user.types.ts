// ============================================================
// User Domain Types
// ============================================================

export interface UserPublicProfile {
  id: string;       // public_id
  name: string;
  email: string;
  role: import("../../generated/prisma/client").Role;
  department: import("../../generated/prisma/client").Department | null;
  avatarUrl: string | null;
}

export interface CreateUserResult extends UserPublicProfile {
  createdAt: string;
}

export interface ListUsersResult {
  users: UserPublicProfile[];
  totalData: number;
  totalPages: number;
}
