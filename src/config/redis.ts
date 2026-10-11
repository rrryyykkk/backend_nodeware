import "dotenv/config";
import Redis from "ioredis";

function getRedisUrl(): string {
  const url = process.env.REDIS_URL;

  if (!url) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("REDIS_URL wajib diset di production");
    }
    return "redis://localhost:6379"; // fallback khusus dev
  }

  if (!/^rediss?:\/\//.test(url)) {
    throw new Error("REDIS_URL harus diawali redis:// atau rediss://");
  }
  return url;
}

export const redis = new Redis(getRedisUrl(), {
  maxRetriesPerRequest: 3,
});

redis.on("connect", () => {
  console.log("Connected to Redis");
});
redis.on("error", (e) => {
  console.log("Redis Error", e);
});

export async function cached<T>(
  key: string,
  ttl: number,
  fn: () => Promise<T>,
) {
  const cachedValue = await redis.get(key);
  if (cachedValue) {
    return JSON.parse(cachedValue) as T;
  }
  const value = await fn();
  await redis.set(key, JSON.stringify(value), "EX", ttl);
  return value;
}

//  invalidasi cache per project: naikkan versi namespace
export const projectNs = async (projectId: string) =>
  (await redis.get(`ns:project:${projectId}`)) ?? "0";
export const bumpProject = (projectId: string) =>
  redis.incr(`ns:project:${projectId}`);
