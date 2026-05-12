ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'ADMINISTRATOR';
ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'REPORTER';

CREATE TYPE "WorkModality" AS ENUM ('ONSITE', 'REMOTE', 'HYBRID', 'FLEX');
CREATE TYPE "CategoryKind" AS ENUM ('PRODUCTIVE', 'INTERNAL', 'ADMINISTRATIVE', 'TRAINING');

ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'STATUS_CHANGE';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'CONFIG_CHANGE';

ALTER TABLE "AllowedEmail" ADD COLUMN IF NOT EXISTS "roles" "Role"[] NOT NULL DEFAULT ARRAY['COLLABORATOR']::"Role"[];
UPDATE "AllowedEmail" SET "roles" = ARRAY["role"]::"Role"[] WHERE "roles" = ARRAY['COLLABORATOR']::"Role"[];

ALTER TABLE "Category" ADD COLUMN IF NOT EXISTS "kind" "CategoryKind" NOT NULL DEFAULT 'PRODUCTIVE';
ALTER TABLE "TimeEntry" ADD COLUMN IF NOT EXISTS "observations" TEXT;

CREATE TABLE IF NOT EXISTS "UserRole" (
  "id" TEXT NOT NULL,
  "role" "Role" NOT NULL,
  "userId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "UserRole_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "WorkSchedule" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "weeklyMinutes" INTEGER NOT NULL DEFAULT 2400,
  "dailyMinutes" INTEGER NOT NULL DEFAULT 480,
  "workdays" INTEGER[] DEFAULT ARRAY[1,2,3,4,5]::INTEGER[],
  "modality" "WorkModality" NOT NULL DEFAULT 'HYBRID',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "WorkSchedule_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "TimeEntryFavoriteProject" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TimeEntryFavoriteProject_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "TimeEntryTemplate" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "detail" TEXT NOT NULL,
  "observations" TEXT,
  "minutes" INTEGER NOT NULL DEFAULT 60,
  "overtimeMinutes" INTEGER NOT NULL DEFAULT 0,
  "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "active" BOOLEAN NOT NULL DEFAULT true,
  "userId" TEXT,
  "projectId" TEXT,
  "categoryId" TEXT,
  "activityTypeId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TimeEntryTemplate_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "UserRole_userId_role_key" ON "UserRole"("userId", "role");
CREATE INDEX IF NOT EXISTS "UserRole_role_idx" ON "UserRole"("role");
CREATE UNIQUE INDEX IF NOT EXISTS "WorkSchedule_userId_key" ON "WorkSchedule"("userId");
CREATE UNIQUE INDEX IF NOT EXISTS "TimeEntryFavoriteProject_userId_projectId_key" ON "TimeEntryFavoriteProject"("userId", "projectId");
CREATE INDEX IF NOT EXISTS "TimeEntryFavoriteProject_projectId_idx" ON "TimeEntryFavoriteProject"("projectId");
CREATE INDEX IF NOT EXISTS "TimeEntryTemplate_userId_idx" ON "TimeEntryTemplate"("userId");
CREATE INDEX IF NOT EXISTS "TimeEntryTemplate_active_idx" ON "TimeEntryTemplate"("active");

ALTER TABLE "UserRole" ADD CONSTRAINT "UserRole_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkSchedule" ADD CONSTRAINT "WorkSchedule_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TimeEntryFavoriteProject" ADD CONSTRAINT "TimeEntryFavoriteProject_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TimeEntryFavoriteProject" ADD CONSTRAINT "TimeEntryFavoriteProject_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TimeEntryTemplate" ADD CONSTRAINT "TimeEntryTemplate_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TimeEntryTemplate" ADD CONSTRAINT "TimeEntryTemplate_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "TimeEntryTemplate" ADD CONSTRAINT "TimeEntryTemplate_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "TimeEntryTemplate" ADD CONSTRAINT "TimeEntryTemplate_activityTypeId_fkey" FOREIGN KEY ("activityTypeId") REFERENCES "ActivityType"("id") ON DELETE SET NULL ON UPDATE CASCADE;

INSERT INTO "UserRole" ("id", "userId", "role")
SELECT gen_random_uuid()::TEXT, "id", "role"
FROM "User"
ON CONFLICT ("userId", "role") DO NOTHING;

INSERT INTO "WorkSchedule" ("id", "userId", "weeklyMinutes", "dailyMinutes", "workdays", "modality", "updatedAt")
SELECT gen_random_uuid()::TEXT, "id", 2400, 480, ARRAY[1,2,3,4,5]::INTEGER[], 'HYBRID', CURRENT_TIMESTAMP
FROM "User"
ON CONFLICT ("userId") DO NOTHING;

ALTER TABLE "UserRole" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "WorkSchedule" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "TimeEntryFavoriteProject" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "TimeEntryTemplate" ENABLE ROW LEVEL SECURITY;
