import { prisma } from "../lib/prisma";
import { hashPassword } from "../utils/component";
import { ConflictError } from "../error/error.handler";
import type {
  CreateUserSchema,
  ListUserQuerySchema,
} from "../schemas/user.schema";
import type {
  CreateUserResult,
  ListUsersResult,
  UserPublicProfile,
} from "../types/user.types";
import type { Prisma } from "../../generated/prisma/client";

export const userService = {
  // Membuat user baru (PM only), password di-hash secara aman
  async createUser(body: CreateUserSchema): Promise<CreateUserResult> {
    const exists = await prisma.user.findUnique({
      where: { email: body.email },
    });
    if (exists) throw new ConflictError("Email sudah terdaftar");

    const hashedPassword = await hashPassword(body.password);

    const user = await prisma.user.create({
      data: {
        name: body.name,
        email: body.email,
        password: hashedPassword,
        role: body.role,
        department: body.department ?? null,
      },
      select: {
        public_id: true,
        name: true,
        email: true,
        role: true,
        department: true,
        avatarUrl: true,
        createdAt: true,
      },
    });

    return {
      id: user.public_id,
      name: user.name,
      email: user.email,
      role: user.role,
      department: user.department,
      avatarUrl: user.avatarUrl,
      createdAt: user.createdAt.toISOString(),
    };
  },

  // Mengambil daftar user dengan filter role, departemen, pencarian nama/email, dan pagination
  async listUsers(query: ListUserQuerySchema): Promise<ListUsersResult> {
    const { role, department, search, page, rows } = query;

    const where: Prisma.UserWhereInput = { deletedAt: null };

    if (role) where.role = role;
    if (department) where.department = department;
    if (search) {
      where.OR = [
        { name: { contains: search, mode: "insensitive" } },
        { email: { contains: search, mode: "insensitive" } },
      ];
    }

    const skip = (page - 1) * rows;

    const [totalData, users] = await Promise.all([
      prisma.user.count({ where }),
      prisma.user.findMany({
        where,
        skip,
        take: rows,
        orderBy: { createdAt: "desc" },
        select: {
          public_id: true,
          name: true,
          email: true,
          role: true,
          department: true,
          avatarUrl: true,
        },
      }),
    ]);

    const totalPages = Math.ceil(totalData / rows);

    const mappedUsers: UserPublicProfile[] = users.map((u) => ({
      id: u.public_id,
      name: u.name,
      email: u.email,
      role: u.role,
      department: u.department,
      avatarUrl: u.avatarUrl,
    }));

    return { users: mappedUsers, totalData, totalPages };
  },
};
