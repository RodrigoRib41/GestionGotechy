ALTER TABLE "TimeEntryTemplate" DROP CONSTRAINT IF EXISTS "TimeEntryTemplate_activityTypeId_fkey";
ALTER TABLE "TimeEntry" DROP CONSTRAINT IF EXISTS "TimeEntry_activityTypeId_fkey";

ALTER TABLE "TimeEntryTemplate" DROP COLUMN IF EXISTS "activityTypeId";
ALTER TABLE "TimeEntryTemplate" DROP COLUMN IF EXISTS "tags";
ALTER TABLE "TimeEntry" DROP COLUMN IF EXISTS "activityTypeId";
ALTER TABLE "TimeEntry" DROP COLUMN IF EXISTS "tags";

DROP TABLE IF EXISTS "ActivityType";

CREATE INDEX IF NOT EXISTS "TimeEntry_categoryId_date_idx" ON "TimeEntry"("categoryId", "date");
CREATE INDEX IF NOT EXISTS "TimeEntry_date_userId_idx" ON "TimeEntry"("date", "userId");
CREATE INDEX IF NOT EXISTS "TimeEntry_date_projectId_idx" ON "TimeEntry"("date", "projectId");
CREATE INDEX IF NOT EXISTS "TimeEntry_date_clientId_idx" ON "TimeEntry"("date", "clientId");
CREATE INDEX IF NOT EXISTS "TimeEntryTemplate_projectId_idx" ON "TimeEntryTemplate"("projectId");
CREATE INDEX IF NOT EXISTS "TimeEntryTemplate_categoryId_idx" ON "TimeEntryTemplate"("categoryId");
