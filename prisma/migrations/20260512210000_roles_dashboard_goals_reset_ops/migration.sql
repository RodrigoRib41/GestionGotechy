-- Normalize the legacy reporting role into the new three-role model before removing the enum value.
UPDATE "User"
SET "role" = 'ADMINISTRATOR'
WHERE "role"::text = 'REPORTER';

UPDATE "AllowedEmail"
SET "role" = 'ADMINISTRATOR'
WHERE "role"::text = 'REPORTER';

UPDATE "AllowedEmail"
SET "roles" = array_replace("roles", 'REPORTER'::"Role", 'ADMINISTRATOR'::"Role")
WHERE 'REPORTER'::"Role" = ANY("roles");

UPDATE "AllowedEmail"
SET "roles" = ARRAY(SELECT DISTINCT role_value FROM unnest("roles") AS role_value);

INSERT INTO "UserRole" ("id", "userId", "role", "createdAt")
SELECT gen_random_uuid()::text, "userId", 'ADMINISTRATOR'::"Role", now()
FROM "UserRole"
WHERE "role"::text = 'REPORTER'
ON CONFLICT ("userId", "role") DO NOTHING;

DELETE FROM "UserRole"
WHERE "role"::text = 'REPORTER';

ALTER TABLE "User" ALTER COLUMN "role" DROP DEFAULT;
ALTER TABLE "AllowedEmail" ALTER COLUMN "role" DROP DEFAULT;
ALTER TABLE "AllowedEmail" ALTER COLUMN "roles" DROP DEFAULT;

CREATE TYPE "Role_new" AS ENUM ('SUPERADMIN', 'ADMINISTRATOR', 'COLLABORATOR');

ALTER TABLE "User"
  ALTER COLUMN "role" TYPE "Role_new" USING ("role"::text::"Role_new");

ALTER TABLE "AllowedEmail"
  ALTER COLUMN "role" TYPE "Role_new" USING ("role"::text::"Role_new");

ALTER TABLE "AllowedEmail"
  ALTER COLUMN "roles" TYPE "Role_new"[] USING ("roles"::text[]::"Role_new"[]);

ALTER TABLE "UserRole"
  ALTER COLUMN "role" TYPE "Role_new" USING ("role"::text::"Role_new");

DROP TYPE "Role";
ALTER TYPE "Role_new" RENAME TO "Role";

ALTER TABLE "User" ALTER COLUMN "role" SET DEFAULT 'COLLABORATOR';
ALTER TABLE "AllowedEmail" ALTER COLUMN "role" SET DEFAULT 'COLLABORATOR';
ALTER TABLE "AllowedEmail" ALTER COLUMN "roles" SET DEFAULT ARRAY['COLLABORATOR']::"Role"[];

CREATE TYPE "GoalPeriod" AS ENUM ('WEEKLY', 'MONTHLY');
CREATE TYPE "GoalMetricKind" AS ENUM (
  'MIN_EXPECTED_PERCENT',
  'DAILY_MIN_PERCENT',
  'MIN_WEEKLY_MINUTES',
  'MAX_OVERTIME_MINUTES',
  'MIN_ACTIVE_DAYS',
  'PRIORITY_PROJECT_PERCENT',
  'PRODUCTIVE_PERCENT',
  'REDUCE_INTERNAL_MINUTES',
  'AVG_ENTRY_DELAY_MINUTES',
  'CLIENT_MINUTES',
  'CATEGORY_MINUTES'
);

CREATE TABLE "UserDashboardPreference" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "dashboardId" TEXT NOT NULL,
  "position" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "UserDashboardPreference_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "GoalObjective" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "metricKind" "GoalMetricKind" NOT NULL,
  "period" "GoalPeriod" NOT NULL DEFAULT 'WEEKLY',
  "targetPercent" DOUBLE PRECISION,
  "targetMinutes" INTEGER,
  "tolerancePercent" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "minDailyPercent" DOUBLE PRECISION,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "global" BOOLEAN NOT NULL DEFAULT true,
  "exceptions" JSONB,
  "ownerId" TEXT,
  "clientId" TEXT,
  "projectId" TEXT,
  "categoryId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "GoalObjective_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "GoalObjectiveExclusion" (
  "id" TEXT NOT NULL,
  "goalId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "GoalObjectiveExclusion_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "GoalMetric" (
  "id" TEXT NOT NULL,
  "goalId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "periodStart" TIMESTAMP(3) NOT NULL,
  "periodEnd" TIMESTAMP(3) NOT NULL,
  "expectedMinutes" INTEGER NOT NULL DEFAULT 0,
  "actualMinutes" INTEGER NOT NULL DEFAULT 0,
  "overtimeMinutes" INTEGER NOT NULL DEFAULT 0,
  "activeDays" INTEGER NOT NULL DEFAULT 0,
  "productiveMinutes" INTEGER NOT NULL DEFAULT 0,
  "internalMinutes" INTEGER NOT NULL DEFAULT 0,
  "entryDelayMinutes" INTEGER,
  "raw" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "GoalMetric_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "GoalCompliance" (
  "id" TEXT NOT NULL,
  "goalId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "periodStart" TIMESTAMP(3) NOT NULL,
  "periodEnd" TIMESTAMP(3) NOT NULL,
  "percent" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "met" BOOLEAN NOT NULL DEFAULT false,
  "reason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "GoalCompliance_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "UserDashboardPreference_userId_dashboardId_key" ON "UserDashboardPreference"("userId", "dashboardId");
CREATE INDEX "UserDashboardPreference_userId_position_idx" ON "UserDashboardPreference"("userId", "position");

CREATE INDEX "GoalObjective_active_global_idx" ON "GoalObjective"("active", "global");
CREATE INDEX "GoalObjective_period_metricKind_idx" ON "GoalObjective"("period", "metricKind");
CREATE INDEX "GoalObjective_ownerId_idx" ON "GoalObjective"("ownerId");
CREATE INDEX "GoalObjective_clientId_idx" ON "GoalObjective"("clientId");
CREATE INDEX "GoalObjective_projectId_idx" ON "GoalObjective"("projectId");
CREATE INDEX "GoalObjective_categoryId_idx" ON "GoalObjective"("categoryId");
CREATE INDEX "GoalObjective_active_period_idx" ON "GoalObjective"("period", "metricKind") WHERE "active" = true;

CREATE UNIQUE INDEX "GoalObjectiveExclusion_goalId_userId_key" ON "GoalObjectiveExclusion"("goalId", "userId");
CREATE INDEX "GoalObjectiveExclusion_userId_idx" ON "GoalObjectiveExclusion"("userId");

CREATE UNIQUE INDEX "GoalMetric_goalId_userId_periodStart_periodEnd_key" ON "GoalMetric"("goalId", "userId", "periodStart", "periodEnd");
CREATE INDEX "GoalMetric_userId_periodStart_idx" ON "GoalMetric"("userId", "periodStart");
CREATE INDEX "GoalMetric_goalId_periodStart_idx" ON "GoalMetric"("goalId", "periodStart");

CREATE UNIQUE INDEX "GoalCompliance_goalId_userId_periodStart_periodEnd_key" ON "GoalCompliance"("goalId", "userId", "periodStart", "periodEnd");
CREATE INDEX "GoalCompliance_userId_periodStart_idx" ON "GoalCompliance"("userId", "periodStart");
CREATE INDEX "GoalCompliance_met_periodStart_idx" ON "GoalCompliance"("met", "periodStart");

ALTER TABLE "UserDashboardPreference" ADD CONSTRAINT "UserDashboardPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "GoalObjective" ADD CONSTRAINT "GoalObjective_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "GoalObjective" ADD CONSTRAINT "GoalObjective_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "GoalObjective" ADD CONSTRAINT "GoalObjective_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "GoalObjective" ADD CONSTRAINT "GoalObjective_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "GoalObjectiveExclusion" ADD CONSTRAINT "GoalObjectiveExclusion_goalId_fkey" FOREIGN KEY ("goalId") REFERENCES "GoalObjective"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GoalObjectiveExclusion" ADD CONSTRAINT "GoalObjectiveExclusion_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "GoalMetric" ADD CONSTRAINT "GoalMetric_goalId_fkey" FOREIGN KEY ("goalId") REFERENCES "GoalObjective"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GoalMetric" ADD CONSTRAINT "GoalMetric_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "GoalCompliance" ADD CONSTRAINT "GoalCompliance_goalId_fkey" FOREIGN KEY ("goalId") REFERENCES "GoalObjective"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GoalCompliance" ADD CONSTRAINT "GoalCompliance_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "UserDashboardPreference" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "GoalObjective" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "GoalObjectiveExclusion" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "GoalMetric" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "GoalCompliance" ENABLE ROW LEVEL SECURITY;
