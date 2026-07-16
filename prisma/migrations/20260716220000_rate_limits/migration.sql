-- Abuse control counters. Fixed window per key.
CREATE TABLE "rate_limits" (
    "key" TEXT NOT NULL,
    "count" INTEGER NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "rate_limits_pkey" PRIMARY KEY ("key")
);

-- Supports sweeping expired windows.
CREATE INDEX "rate_limits_expiresAt_idx" ON "rate_limits"("expiresAt");
