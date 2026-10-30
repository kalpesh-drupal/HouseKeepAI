import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

/** Railway/proxy DBs idle-close sockets; keep Prisma from hanging on dead pool connections. */
function databaseUrl() {
  const raw = process.env.DATABASE_URL?.trim();
  if (!raw) return undefined;
  try {
    const u = new URL(raw);
    if (!u.searchParams.has("connect_timeout")) u.searchParams.set("connect_timeout", "30");
    if (!u.searchParams.has("pool_timeout")) u.searchParams.set("pool_timeout", "30");
    if (!u.searchParams.has("socket_timeout")) u.searchParams.set("socket_timeout", "60");
    // Each Vercel instance keeps one connection. A Postgres pooler in front of
    // the database is what lets a thousand properties share one server.
    if (process.env.VERCEL && !u.searchParams.has("connection_limit")) {
      u.searchParams.set("connection_limit", "1");
    } else if (process.env.NODE_ENV !== "production" && !u.searchParams.has("connection_limit")) {
      u.searchParams.set("connection_limit", "5");
    }
    return u.toString();
  } catch {
    return raw;
  }
}

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
    datasources: databaseUrl() ? { db: { url: databaseUrl() } } : undefined,
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
