CREATE TYPE "TrackingTaskPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'URGENT');
CREATE TYPE "TrackingHistoryAction" AS ENUM ('CREATE', 'UPDATE', 'STATUS_CHANGE', 'ASSIGNEE_CHANGE', 'COMMENT', 'TIME_LOGGED', 'CLOSE', 'REOPEN');

CREATE TABLE "TrackingTaskStatus" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "color" TEXT NOT NULL DEFAULT '#64748B',
  "active" BOOLEAN NOT NULL DEFAULT true,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "isFinal" BOOLEAN NOT NULL DEFAULT false,
  "isBlocked" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TrackingTaskStatus_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TrackingTask" (
  "id" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "priority" "TrackingTaskPriority" NOT NULL DEFAULT 'MEDIUM',
  "dueDate" TIMESTAMP(3),
  "estimatedMinutes" INTEGER NOT NULL DEFAULT 0,
  "consumedMinutes" INTEGER NOT NULL DEFAULT 0,
  "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "attachmentMeta" JSONB,
  "closedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "clientId" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "assigneeId" TEXT NOT NULL,
  "createdById" TEXT,
  "statusId" TEXT NOT NULL,
  CONSTRAINT "TrackingTask_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TrackingTaskHistory" (
  "id" TEXT NOT NULL,
  "action" "TrackingHistoryAction" NOT NULL,
  "message" TEXT,
  "fromValue" JSONB,
  "toValue" JSONB,
  "minutes" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "taskId" TEXT NOT NULL,
  "actorId" TEXT,
  CONSTRAINT "TrackingTaskHistory_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TrackingTaskAttachment" (
  "id" TEXT NOT NULL,
  "fileName" TEXT NOT NULL,
  "mimeType" TEXT,
  "sizeBytes" INTEGER NOT NULL DEFAULT 0,
  "url" TEXT,
  "storageKey" TEXT,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "taskId" TEXT NOT NULL,
  "createdById" TEXT,
  CONSTRAINT "TrackingTaskAttachment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TrackingTaskStatus_name_key" ON "TrackingTaskStatus"("name");
CREATE INDEX "TrackingTaskStatus_active_sortOrder_idx" ON "TrackingTaskStatus"("active", "sortOrder");
CREATE INDEX "TrackingTaskStatus_isFinal_idx" ON "TrackingTaskStatus"("isFinal");
CREATE INDEX "TrackingTaskStatus_isBlocked_idx" ON "TrackingTaskStatus"("isBlocked");
CREATE INDEX "TrackingTask_assigneeId_statusId_idx" ON "TrackingTask"("assigneeId", "statusId");
CREATE INDEX "TrackingTask_clientId_projectId_idx" ON "TrackingTask"("clientId", "projectId");
CREATE INDEX "TrackingTask_statusId_updatedAt_idx" ON "TrackingTask"("statusId", "updatedAt");
CREATE INDEX "TrackingTask_priority_idx" ON "TrackingTask"("priority");
CREATE INDEX "TrackingTask_dueDate_idx" ON "TrackingTask"("dueDate");
CREATE INDEX "TrackingTask_createdAt_idx" ON "TrackingTask"("createdAt");
CREATE INDEX "TrackingTask_updatedAt_idx" ON "TrackingTask"("updatedAt");
CREATE INDEX "TrackingTaskHistory_taskId_createdAt_idx" ON "TrackingTaskHistory"("taskId", "createdAt");
CREATE INDEX "TrackingTaskHistory_actorId_createdAt_idx" ON "TrackingTaskHistory"("actorId", "createdAt");
CREATE INDEX "TrackingTaskHistory_action_idx" ON "TrackingTaskHistory"("action");
CREATE INDEX "TrackingTaskAttachment_taskId_idx" ON "TrackingTaskAttachment"("taskId");
CREATE INDEX "TrackingTaskAttachment_createdById_idx" ON "TrackingTaskAttachment"("createdById");
CREATE INDEX "TrackingTaskAttachment_active_idx" ON "TrackingTaskAttachment"("active");

ALTER TABLE "TrackingTask" ADD CONSTRAINT "TrackingTask_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TrackingTask" ADD CONSTRAINT "TrackingTask_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TrackingTask" ADD CONSTRAINT "TrackingTask_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TrackingTask" ADD CONSTRAINT "TrackingTask_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "TrackingTask" ADD CONSTRAINT "TrackingTask_statusId_fkey" FOREIGN KEY ("statusId") REFERENCES "TrackingTaskStatus"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TrackingTaskHistory" ADD CONSTRAINT "TrackingTaskHistory_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "TrackingTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TrackingTaskHistory" ADD CONSTRAINT "TrackingTaskHistory_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "TrackingTaskAttachment" ADD CONSTRAINT "TrackingTaskAttachment_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "TrackingTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TrackingTaskAttachment" ADD CONSTRAINT "TrackingTaskAttachment_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

INSERT INTO "TrackingTaskStatus" ("id", "name", "color", "sortOrder", "isFinal", "isBlocked", "updatedAt")
VALUES
  (gen_random_uuid()::TEXT, 'Pendiente', '#64748B', 10, false, false, CURRENT_TIMESTAMP),
  (gen_random_uuid()::TEXT, 'En progreso', '#2563EB', 20, false, false, CURRENT_TIMESTAMP),
  (gen_random_uuid()::TEXT, 'Bloqueado', '#F97316', 30, false, true, CURRENT_TIMESTAMP),
  (gen_random_uuid()::TEXT, 'En revision', '#8B5CF6', 40, false, false, CURRENT_TIMESTAMP),
  (gen_random_uuid()::TEXT, 'Finalizado', '#16A34A', 50, true, false, CURRENT_TIMESTAMP),
  (gen_random_uuid()::TEXT, 'Cancelado', '#EF4444', 60, true, false, CURRENT_TIMESTAMP)
ON CONFLICT ("name") DO NOTHING;

ALTER TABLE "TrackingTaskStatus" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "TrackingTask" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "TrackingTaskHistory" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "TrackingTaskAttachment" ENABLE ROW LEVEL SECURITY;
