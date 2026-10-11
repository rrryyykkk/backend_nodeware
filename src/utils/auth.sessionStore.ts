import { redis } from "../config/redis";
import { ServiceUnavailableError } from "../error/error.handler";

const rawTtl = Number(process.env.SESSION_TTL_SECONDS);
const TTL: number = (!Number.isFinite(rawTtl) || rawTtl <= 0) ? 86400 : rawTtl;
const key = (jti: string): string => `session:${jti}`;

export const sessionStore = {
  ttl: TTL,
  async create(userId: string): Promise<string> {
    try {
      const jti = crypto.randomUUID();
      await redis.set(key(jti), userId, "EX", TTL);
      return jti;
    } catch {
      throw new ServiceUnavailableError("Layanan sesi sementara tidak tersedia");
    }
  },
  async get(jti: string): Promise<string | null> {
    try {
      return await redis.get(key(jti));
    } catch {
      throw new ServiceUnavailableError("Layanan sesi sementara tidak tersedia");
    }
  },
  async revoke(jti: string): Promise<void> {
    try {
      await redis.del(key(jti));
    } catch {
      throw new ServiceUnavailableError("Layanan sesi sementara tidak tersedia");
    }
  },
};
