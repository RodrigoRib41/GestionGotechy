ALTER TYPE "UserStatus" ADD VALUE IF NOT EXISTS 'DELETED';
ALTER TYPE "GoalPeriod" ADD VALUE IF NOT EXISTS 'DAILY';

DO $$
BEGIN
  CREATE TYPE "GoalHistoryFrequency" AS ENUM ('DAILY', 'WEEKLY', 'MONTHLY');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS "archivedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "User_status_role_idx" ON "User"("status", "role");

CREATE TABLE IF NOT EXISTS "GoalHistorySetting" (
  "id" TEXT NOT NULL,
  "frequency" "GoalHistoryFrequency" NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "GoalHistorySetting_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "GoalHistorySetting_frequency_key" ON "GoalHistorySetting"("frequency");
CREATE INDEX IF NOT EXISTS "GoalHistorySetting_enabled_idx" ON "GoalHistorySetting"("enabled");

CREATE TABLE IF NOT EXISTS "GoalCheckpoint" (
  "id" TEXT NOT NULL,
  "checkpointKey" TEXT NOT NULL,
  "userId" TEXT,
  "userName" TEXT NOT NULL,
  "period" "GoalPeriod" NOT NULL DEFAULT 'WEEKLY',
  "periodStart" TIMESTAMP(3) NOT NULL,
  "periodEnd" TIMESTAMP(3) NOT NULL,
  "percent" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "met" BOOLEAN NOT NULL DEFAULT false,
  "expectedMinutes" INTEGER NOT NULL DEFAULT 0,
  "actualMinutes" INTEGER NOT NULL DEFAULT 0,
  "reachedGoals" INTEGER NOT NULL DEFAULT 0,
  "missedGoals" INTEGER NOT NULL DEFAULT 0,
  "trend" TEXT,
  "summary" TEXT NOT NULL,
  "raw" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "GoalCheckpoint_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "GoalCheckpoint_checkpointKey_key" ON "GoalCheckpoint"("checkpointKey");
CREATE INDEX IF NOT EXISTS "GoalCheckpoint_period_periodStart_idx" ON "GoalCheckpoint"("period", "periodStart");
CREATE INDEX IF NOT EXISTS "GoalCheckpoint_userId_periodStart_idx" ON "GoalCheckpoint"("userId", "periodStart");
CREATE INDEX IF NOT EXISTS "GoalCheckpoint_met_periodStart_idx" ON "GoalCheckpoint"("met", "periodStart");
CREATE INDEX IF NOT EXISTS "GoalCheckpoint_createdAt_idx" ON "GoalCheckpoint"("createdAt");

ALTER TABLE "GoalCheckpoint"
  ADD CONSTRAINT "GoalCheckpoint_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "GoalHistorySetting" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "GoalCheckpoint" ENABLE ROW LEVEL SECURITY;
