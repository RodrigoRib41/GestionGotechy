ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'TRACKING_TASK_ASSIGNED';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'TRACKING_TASK_STATUS';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'TRACKING_TASK_COMMENT';

CREATE TYPE "RealtimeEventType" AS ENUM ('NOTIFICATION', 'TRACKING', 'TIME_ENTRY_COMMENT');

ALTER TABLE "Notification" ADD COLUMN "trackingTaskId" TEXT;

CREATE TABLE "RealtimeEvent" (
  "id" TEXT NOT NULL,
  "type" "RealtimeEventType" NOT NULL,
  "payload" JSONB,
  "userId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RealtimeEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Notification_trackingTaskId_idx" ON "Notification"("trackingTaskId");
CREATE INDEX "RealtimeEvent_createdAt_idx" ON "RealtimeEvent"("createdAt");
CREATE INDEX "RealtimeEvent_type_createdAt_idx" ON "RealtimeEvent"("type", "createdAt");
CREATE INDEX "RealtimeEvent_userId_createdAt_idx" ON "RealtimeEvent"("userId", "createdAt");

ALTER TABLE "Notification" ADD CONSTRAINT "Notification_trackingTaskId_fkey" FOREIGN KEY ("trackingTaskId") REFERENCES "TrackingTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RealtimeEvent" ADD CONSTRAINT "RealtimeEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "RealtimeEvent" ENABLE ROW LEVEL SECURITY;
