ALTER TYPE "UserStatus" ADD VALUE IF NOT EXISTS 'ARCHIVED';

CREATE TABLE IF NOT EXISTS "GoalComplianceHistory" (
  "id" TEXT NOT NULL,
  "snapshotKey" TEXT NOT NULL,
  "goalId" TEXT,
  "userId" TEXT,
  "goalName" TEXT NOT NULL,
  "userName" TEXT NOT NULL,
  "metricKind" "GoalMetricKind" NOT NULL,
  "period" "GoalPeriod" NOT NULL,
  "periodStart" TIMESTAMP(3) NOT NULL,
  "periodEnd" TIMESTAMP(3) NOT NULL,
  "percent" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "met" BOOLEAN NOT NULL DEFAULT false,
  "reason" TEXT,
  "expectedMinutes" INTEGER NOT NULL DEFAULT 0,
  "actualMinutes" INTEGER NOT NULL DEFAULT 0,
  "overtimeMinutes" INTEGER NOT NULL DEFAULT 0,
  "activeDays" INTEGER NOT NULL DEFAULT 0,
  "raw" JSONB,
  "calculatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "GoalComplianceHistory_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "GoalComplianceHistory_snapshotKey_key" ON "GoalComplianceHistory"("snapshotKey");
CREATE INDEX IF NOT EXISTS "GoalComplianceHistory_period_periodStart_idx" ON "GoalComplianceHistory"("period", "periodStart");
CREATE INDEX IF NOT EXISTS "GoalComplianceHistory_userId_periodStart_idx" ON "GoalComplianceHistory"("userId", "periodStart");
CREATE INDEX IF NOT EXISTS "GoalComplianceHistory_goalId_periodStart_idx" ON "GoalComplianceHistory"("goalId", "periodStart");
CREATE INDEX IF NOT EXISTS "GoalComplianceHistory_met_periodStart_idx" ON "GoalComplianceHistory"("met", "periodStart");
CREATE INDEX IF NOT EXISTS "GoalComplianceHistory_calculatedAt_idx" ON "GoalComplianceHistory"("calculatedAt");

ALTER TABLE "GoalComplianceHistory"
  ADD CONSTRAINT "GoalComplianceHistory_goalId_fkey"
  FOREIGN KEY ("goalId") REFERENCES "GoalObjective"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "GoalComplianceHistory"
  ADD CONSTRAINT "GoalComplianceHistory_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "GoalComplianceHistory" ENABLE ROW LEVEL SECURITY;
