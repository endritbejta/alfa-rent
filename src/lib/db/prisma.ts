import { PrismaClient } from "@prisma/client";

// Reuse one client across hot reloads in dev and across invocations in
// serverless — a new client per import exhausts the connection pool.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
    /*
     * Stated rather than left to the defaults (maxWait 2s, timeout 5s),
     * because production runs through a pooler documented at
     * connection_limit=1: waiting for that one connection is the ordinary
     * case, not an anomaly, and a 13-query dashboard transaction can exhaust
     * 2s just acquiring it — surfacing as an opaque 500.
     *
     * timeout stays close to the default on purpose. Raising it further would
     * hold the single connection longer under load, which is the opposite of
     * what a contended pool needs.
     */
    transactionOptions: { maxWait: 8_000, timeout: 8_000 },
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
