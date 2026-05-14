ALTER TABLE "TrackingTask"
  ADD COLUMN "archivedAt" TIMESTAMP(3),
  ADD COLUMN "archivedById" TEXT,
  ADD COLUMN "deletedAt" TIMESTAMP(3),
  ADD COLUMN "deletedById" TEXT;

CREATE INDEX "TrackingTask_archivedAt_idx" ON "TrackingTask"("archivedAt");
CREATE INDEX "TrackingTask_deletedAt_idx" ON "TrackingTask"("deletedAt");
CREATE INDEX "TrackingTask_assigneeId_deletedAt_archivedAt_idx" ON "TrackingTask"("assigneeId", "deletedAt", "archivedAt");
CREATE INDEX "TrackingTask_active_updatedAt_idx" ON "TrackingTask"("updatedAt") WHERE "deletedAt" IS NULL AND "archivedAt" IS NULL;

INSERT INTO "TrackingTaskStatus" ("id", "name", "color", "sortOrder", "isFinal", "isBlocked", "updatedAt")
VALUES (gen_random_uuid()::TEXT, 'Archivada', '#475569', 70, true, false, CURRENT_TIMESTAMP)
ON CONFLICT ("name") DO NOTHING;

CREATE TABLE "TimeImportBatch" (
  "id" TEXT NOT NULL,
  "fileName" TEXT,
  "source" TEXT NOT NULL DEFAULT 'REPORTS_IMPORT',
  "totalRows" INTEGER NOT NULL DEFAULT 0,
  "validRows" INTEGER NOT NULL DEFAULT 0,
  "invalidRows" INTEGER NOT NULL DEFAULT 0,
  "duplicateRows" INTEGER NOT NULL DEFAULT 0,
  "importedRows" INTEGER NOT NULL DEFAULT 0,
  "skippedRows" INTEGER NOT NULL DEFAULT 0,
  "errors" JSONB,
  "createdProjects" JSONB,
  "createdClients" JSONB,
  "importedById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TimeImportBatch_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "TimeImportBatch_importedById_createdAt_idx" ON "TimeImportBatch"("importedById", "createdAt");
CREATE INDEX "TimeImportBatch_createdAt_idx" ON "TimeImportBatch"("createdAt");

ALTER TABLE "TimeImportBatch"
  ADD CONSTRAINT "TimeImportBatch_importedById_fkey"
  FOREIGN KEY ("importedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "TimeImportBatch" ENABLE ROW LEVEL SECURITY;
