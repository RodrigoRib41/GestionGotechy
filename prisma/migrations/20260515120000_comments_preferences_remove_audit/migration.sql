CREATE TYPE "TimeEntryThreadStatus" AS ENUM ('OPEN', 'RESOLVED');
CREATE TYPE "NotificationType" AS ENUM ('TIME_ENTRY_COMMENT');

CREATE TABLE "UserProjectVisibility" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "visible" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "UserProjectVisibility_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TimeEntryThread" (
  "id" TEXT NOT NULL,
  "status" "TimeEntryThreadStatus" NOT NULL DEFAULT 'OPEN',
  "timeEntryId" TEXT NOT NULL,
  "createdById" TEXT NOT NULL,
  "resolvedAt" TIMESTAMP(3),
  "resolvedById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TimeEntryThread_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TimeEntryComment" (
  "id" TEXT NOT NULL,
  "message" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "threadId" TEXT NOT NULL,
  "authorId" TEXT NOT NULL,
  CONSTRAINT "TimeEntryComment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TimeEntryThreadRead" (
  "threadId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "lastReadAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TimeEntryThreadRead_pkey" PRIMARY KEY ("threadId", "userId")
);

CREATE TABLE "Notification" (
  "id" TEXT NOT NULL,
  "type" "NotificationType" NOT NULL,
  "title" TEXT NOT NULL,
  "body" TEXT,
  "readAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "userId" TEXT NOT NULL,
  "threadId" TEXT,
  "timeEntryId" TEXT,
  CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "UserProjectVisibility_userId_projectId_key" ON "UserProjectVisibility"("userId", "projectId");
CREATE INDEX "UserProjectVisibility_projectId_idx" ON "UserProjectVisibility"("projectId");
CREATE INDEX "UserProjectVisibility_userId_visible_idx" ON "UserProjectVisibility"("userId", "visible");
CREATE UNIQUE INDEX "TimeEntryThread_timeEntryId_key" ON "TimeEntryThread"("timeEntryId");
CREATE INDEX "TimeEntryThread_status_createdAt_idx" ON "TimeEntryThread"("status", "createdAt");
CREATE INDEX "TimeEntryThread_createdById_status_idx" ON "TimeEntryThread"("createdById", "status");
CREATE INDEX "TimeEntryComment_threadId_createdAt_idx" ON "TimeEntryComment"("threadId", "createdAt");
CREATE INDEX "TimeEntryComment_authorId_createdAt_idx" ON "TimeEntryComment"("authorId", "createdAt");
CREATE INDEX "TimeEntryThreadRead_userId_lastReadAt_idx" ON "TimeEntryThreadRead"("userId", "lastReadAt");
CREATE INDEX "Notification_userId_readAt_createdAt_idx" ON "Notification"("userId", "readAt", "createdAt");
CREATE INDEX "Notification_threadId_idx" ON "Notification"("threadId");
CREATE INDEX "Notification_timeEntryId_idx" ON "Notification"("timeEntryId");

ALTER TABLE "UserProjectVisibility" ADD CONSTRAINT "UserProjectVisibility_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UserProjectVisibility" ADD CONSTRAINT "UserProjectVisibility_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TimeEntryThread" ADD CONSTRAINT "TimeEntryThread_timeEntryId_fkey" FOREIGN KEY ("timeEntryId") REFERENCES "TimeEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TimeEntryThread" ADD CONSTRAINT "TimeEntryThread_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TimeEntryThread" ADD CONSTRAINT "TimeEntryThread_resolvedById_fkey" FOREIGN KEY ("resolvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "TimeEntryComment" ADD CONSTRAINT "TimeEntryComment_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "TimeEntryThread"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TimeEntryComment" ADD CONSTRAINT "TimeEntryComment_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TimeEntryThreadRead" ADD CONSTRAINT "TimeEntryThreadRead_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "TimeEntryThread"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TimeEntryThreadRead" ADD CONSTRAINT "TimeEntryThreadRead_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "TimeEntryThread"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_timeEntryId_fkey" FOREIGN KEY ("timeEntryId") REFERENCES "TimeEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "UserProjectVisibility" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "TimeEntryThread" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "TimeEntryComment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "TimeEntryThreadRead" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Notification" ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "TrackingTaskStatus" WHERE "name" = 'Bloqueada') THEN
    UPDATE "TrackingTaskStatus"
    SET "name" = 'Bloqueada', "isBlocked" = true, "updatedAt" = CURRENT_TIMESTAMP
    WHERE "name" = 'Bloqueado';
  ELSE
    UPDATE "TrackingTaskStatus"
    SET "isBlocked" = true, "updatedAt" = CURRENT_TIMESTAMP
    WHERE "name" = 'Bloqueada';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM "TrackingTaskStatus" WHERE "name" = 'Finalizada') THEN
    UPDATE "TrackingTaskStatus"
    SET "name" = 'Finalizada', "isFinal" = true, "updatedAt" = CURRENT_TIMESTAMP
    WHERE "name" = 'Finalizado';
  END IF;
END $$;

INSERT INTO "TrackingTaskStatus" ("id", "name", "color", "sortOrder", "isFinal", "isBlocked", "updatedAt")
VALUES
  ('tracking_status_pendiente', 'Pendiente', '#64748B', 10, false, false, CURRENT_TIMESTAMP),
  ('tracking_status_en_progreso', 'En progreso', '#2563EB', 20, false, false, CURRENT_TIMESTAMP),
  ('tracking_status_bloqueada', 'Bloqueada', '#F97316', 30, false, true, CURRENT_TIMESTAMP),
  ('tracking_status_finalizada', 'Finalizada', '#16A34A', 50, true, false, CURRENT_TIMESTAMP),
  ('tracking_status_archivada', 'Archivada', '#64748B', 60, true, false, CURRENT_TIMESTAMP)
ON CONFLICT ("name") DO NOTHING;

DROP TABLE IF EXISTS "AuditLog";
DROP TYPE IF EXISTS "AuditAction";
