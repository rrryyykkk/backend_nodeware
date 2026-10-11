import "dotenv/config";
import jwt from "jsonwebtoken";
import { sessionStore } from "../utils/auth.sessionStore";
import { prisma } from "../lib/prisma";
// schema
import { type LoginSchema, type RegisterSchema } from "../schemas/auth.schema";
import { ConflictError, CredentialError } from "../error/error.handler";
import { hashPassword, verifyPassword } from "../utils/component";

const JWT_SECRET: string = (() => {
  const s = process.env.JWT_SECRET;
  if (!s || s.length < 32) {
    throw new Error("JWT_SECRET wajib diset (minimal 32 karakter)");
  }
  return s;
})();

const publicUserSelect = {
  public_id: true,
  name: true,
  email: true,
  role: true,
  department: true,
  avatarUrl: true,
};

async function issueToken(userId: string) {
  const jti = await sessionStore.create(userId);
  return jwt.sign({ sub: userId, jti }, JWT_SECRET, {
    algorithm: "HS256",
    expiresIn: sessionStore.ttl,
  });
}

export const authServices = {
  // Register hanya untuk client
  async register(dto: RegisterSchema) {
    const exists = await prisma.user.findUnique({
      where: { email: dto.email },
    });

    if (exists) throw new ConflictError("Email sudah terdaftar");

    const passwordHash = await hashPassword(dto.password);

    const user = await prisma.user.create({
      data: {
        name: dto.name,
        email: dto.email,
        password: passwordHash,
        role: "CLIENT",
      },
      select: publicUserSelect,
    });

    const token = await issueToken(user.public_id);
    return {
      user: {
        id: user.public_id,
        name: user.name,
        email: user.email,
        role: user.role,
        department: user.department,
        avatarUrl: user.avatarUrl,
      },
      token,
    };
  },

  async login(dto: LoginSchema) {
    const user = await prisma.user.findFirst({
      where: {
        email: dto.email,
        deletedAt: null,
      },
    });

    // Cegah timing attack user enumeration
    const DUMMY_HASH =
      "$2b$10$e8w6Q35R.dM9B/z7nUfPqe6k8fQ8hYVw01oQz7.fL62vS0L6eY2e6";
    const passwordMatch = await verifyPassword(
      dto.password,
      user?.password ?? DUMMY_HASH,
    );

    if (!user || !passwordMatch) {
      throw new CredentialError("Email atau password salah");
    }

    const token = await issueToken(user.public_id);
    const expiresAt = new Date(
      Date.now() + sessionStore.ttl * 1000,
    ).toISOString();

    return {
      token,
      expiresAt,
      user: {
        id: user.public_id,
        name: user.name,
        role: user.role,
        department: user.department,
        avatarUrl: user.avatarUrl,
      },
    };
  },
};

export { JWT_SECRET, issueToken };
