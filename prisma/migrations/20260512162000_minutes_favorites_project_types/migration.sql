-- Project status is intentionally reduced to the product surface: active or inactive.
DROP INDEX IF EXISTS "Project_status_idx";
CREATE TYPE "ProjectStatus_new" AS ENUM ('ACTIVE', 'INACTIVE');
ALTER TABLE "Project" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "Project" ADD COLUMN "status_new" "ProjectStatus_new" NOT NULL DEFAULT 'ACTIVE';
UPDATE "Project"
SET "status_new" = CASE WHEN "status"::TEXT = 'ACTIVE' THEN 'ACTIVE'::"ProjectStatus_new" ELSE 'INACTIVE'::"ProjectStatus_new" END;
ALTER TABLE "Project" DROP COLUMN "status";
ALTER TABLE "Project" RENAME COLUMN "status_new" TO "status";
DROP TYPE IF EXISTS "ProjectStatus";
ALTER TYPE "ProjectStatus_new" RENAME TO "ProjectStatus";
ALTER TABLE "Project" ALTER COLUMN "status" SET DEFAULT 'ACTIVE';
CREATE INDEX IF NOT EXISTS "Project_status_idx" ON "Project"("status");

-- Replace hardcoded project type enum with an administrable catalog.
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "legacyProjectType" TEXT;
UPDATE "Project" SET "legacyProjectType" = "type"::TEXT WHERE "legacyProjectType" IS NULL;
DROP INDEX IF EXISTS "Project_type_idx";
ALTER TABLE "Project" DROP COLUMN IF EXISTS "type";
DROP TYPE IF EXISTS "ProjectType";

CREATE TABLE IF NOT EXISTS "ProjectType" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "monthlyReset" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ProjectType_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ProjectType_name_key" ON "ProjectType"("name");
CREATE INDEX IF NOT EXISTS "ProjectType_active_idx" ON "ProjectType"("active");
CREATE INDEX IF NOT EXISTS "ProjectType_monthlyReset_idx" ON "ProjectType"("monthlyReset");

INSERT INTO "ProjectType" ("id", "name", "description", "monthlyReset", "updatedAt")
VALUES
  (gen_random_uuid()::TEXT, 'Soporte', 'Bolsa mensual de horas disponible por cliente o proyecto.', true, CURRENT_TIMESTAMP),
  (gen_random_uuid()::TEXT, 'Implementacion', 'Proyectos con alcance inicial definido.', false, CURRENT_TIMESTAMP),
  (gen_random_uuid()::TEXT, 'Evolutivo', 'Mejoras continuas y nuevas funcionalidades.', false, CURRENT_TIMESTAMP),
  (gen_random_uuid()::TEXT, 'Correctivo', 'Correcciones y mantenimiento puntual.', false, CURRENT_TIMESTAMP),
  (gen_random_uuid()::TEXT, 'Consultoria', 'Acompanamiento tecnico o funcional.', false, CURRENT_TIMESTAMP),
  (gen_random_uuid()::TEXT, 'Basis', 'Administracion tecnica recurrente.', false, CURRENT_TIMESTAMP),
  (gen_random_uuid()::TEXT, 'Desarrollo', 'Construccion de software a medida.', false, CURRENT_TIMESTAMP),
  (gen_random_uuid()::TEXT, 'Gestion', 'Gestion interna o coordinacion.', false, CURRENT_TIMESTAMP),
  (gen_random_uuid()::TEXT, 'Interno', 'Trabajo interno no facturable.', false, CURRENT_TIMESTAMP),
  (gen_random_uuid()::TEXT, 'Otro', 'Clasificacion general.', false, CURRENT_TIMESTAMP)
ON CONFLICT ("name") DO NOTHING;

ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "projectTypeId" TEXT;
UPDATE "Project"
SET "projectTypeId" = (
  SELECT "id"
  FROM "ProjectType"
  WHERE "name" = CASE "Project"."legacyProjectType"
    WHEN 'SUPPORT' THEN 'Soporte'
    WHEN 'BASIS' THEN 'Basis'
    WHEN 'DEVELOPMENT' THEN 'Desarrollo'
    WHEN 'MANAGEMENT' THEN 'Gestion'
    WHEN 'INTERNAL' THEN 'Interno'
    ELSE 'Otro'
  END
  LIMIT 1
)
WHERE "projectTypeId" IS NULL;
ALTER TABLE "Project" DROP COLUMN IF EXISTS "legacyProjectType";
CREATE INDEX IF NOT EXISTS "Project_projectTypeId_idx" ON "Project"("projectTypeId");
ALTER TABLE "Project" ADD CONSTRAINT "Project_projectTypeId_fkey" FOREIGN KEY ("projectTypeId") REFERENCES "ProjectType"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Estimated time is optional and stored in minutes end-to-end.
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "usesEstimatedTime" BOOLEAN NOT NULL DEFAULT false;
UPDATE "Project" SET "usesEstimatedTime" = true WHERE "estimatedMinutes" > 0;

-- Remove client/project codes from storage and constraints.
DROP INDEX IF EXISTS "Client_code_key";
DROP INDEX IF EXISTS "Project_code_key";
ALTER TABLE "Client" DROP COLUMN IF EXISTS "code";
ALTER TABLE "Project" DROP COLUMN IF EXISTS "code";

-- Complete personal favorites for fast time entry. Keep at most five migrated templates per user.
CREATE TABLE IF NOT EXISTS "TimeEntryFavorite" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "detail" TEXT NOT NULL,
  "observations" TEXT,
  "minutes" INTEGER NOT NULL DEFAULT 30,
  "overtimeMinutes" INTEGER NOT NULL DEFAULT 0,
  "userId" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "categoryId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TimeEntryFavorite_pkey" PRIMARY KEY ("id")
);

INSERT INTO "TimeEntryFavorite" (
  "id", "name", "detail", "observations", "minutes", "overtimeMinutes", "userId", "projectId", "categoryId", "createdAt", "updatedAt"
)
SELECT gen_random_uuid()::TEXT, "name", "detail", "observations", "minutes", "overtimeMinutes", "userId", "projectId", "categoryId", "createdAt", "updatedAt"
FROM (
  SELECT
    t.*,
    ROW_NUMBER() OVER (PARTITION BY "userId" ORDER BY "updatedAt" DESC) AS rn
  FROM "TimeEntryTemplate" t
  WHERE "userId" IS NOT NULL AND "projectId" IS NOT NULL AND "categoryId" IS NOT NULL AND COALESCE("active", true) = true
) ranked
WHERE rn <= 5
ON CONFLICT DO NOTHING;

CREATE INDEX IF NOT EXISTS "TimeEntryFavorite_userId_idx" ON "TimeEntryFavorite"("userId");
CREATE INDEX IF NOT EXISTS "TimeEntryFavorite_projectId_idx" ON "TimeEntryFavorite"("projectId");
CREATE INDEX IF NOT EXISTS "TimeEntryFavorite_categoryId_idx" ON "TimeEntryFavorite"("categoryId");
CREATE UNIQUE INDEX IF NOT EXISTS "TimeEntryFavorite_userId_projectId_categoryId_detail_minutes_overtimeMinutes_key"
  ON "TimeEntryFavorite"("userId", "projectId", "categoryId", "detail", "minutes", "overtimeMinutes");
ALTER TABLE "TimeEntryFavorite" ADD CONSTRAINT "TimeEntryFavorite_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TimeEntryFavorite" ADD CONSTRAINT "TimeEntryFavorite_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TimeEntryFavorite" ADD CONSTRAINT "TimeEntryFavorite_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE CASCADE ON UPDATE CASCADE;

DROP TABLE IF EXISTS "TimeEntryFavoriteProject";
DROP TABLE IF EXISTS "TimeEntryTemplate";

ALTER TABLE "ProjectType" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "TimeEntryFavorite" ENABLE ROW LEVEL SECURITY;
