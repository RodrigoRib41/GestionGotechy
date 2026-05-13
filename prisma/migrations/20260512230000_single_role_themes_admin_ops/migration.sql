-- Collapse hybrid RBAC into a single strict role per user.
UPDATE "User" u
SET "role" = 'SUPERADMIN'
FROM "UserRole" ur
WHERE ur."userId" = u."id" AND ur."role"::text = 'SUPERADMIN';

UPDATE "User" u
SET "role" = 'ADMINISTRATOR'
FROM "UserRole" ur
WHERE ur."userId" = u."id"
  AND ur."role"::text = 'ADMINISTRATOR'
  AND u."role"::text <> 'SUPERADMIN';

UPDATE "AllowedEmail" ae
SET "role" = 'SUPERADMIN'
WHERE 'SUPERADMIN'::"Role" = ANY(ae."roles");

UPDATE "AllowedEmail" ae
SET "role" = 'ADMINISTRATOR'
WHERE 'ADMINISTRATOR'::"Role" = ANY(ae."roles")
  AND ae."role"::text <> 'SUPERADMIN';

ALTER TABLE "User" ALTER COLUMN "role" DROP DEFAULT;
ALTER TABLE "AllowedEmail" ALTER COLUMN "role" DROP DEFAULT;

CREATE TYPE "Role_new" AS ENUM ('SUPERADMIN', 'ADMINISTRADOR', 'COLABORADOR');

ALTER TABLE "User"
  ALTER COLUMN "role" TYPE "Role_new"
  USING (
    CASE
      WHEN "role"::text = 'ADMINISTRATOR' THEN 'ADMINISTRADOR'
      WHEN "role"::text = 'COLLABORATOR' THEN 'COLABORADOR'
      ELSE "role"::text
    END
  )::"Role_new";

ALTER TABLE "AllowedEmail"
  ALTER COLUMN "role" TYPE "Role_new"
  USING (
    CASE
      WHEN "role"::text = 'ADMINISTRATOR' THEN 'ADMINISTRADOR'
      WHEN "role"::text = 'COLLABORATOR' THEN 'COLABORADOR'
      ELSE "role"::text
    END
  )::"Role_new";

DROP TABLE IF EXISTS "UserRole";
DROP TABLE IF EXISTS "UserPermission";

ALTER TABLE "AllowedEmail" DROP COLUMN IF EXISTS "roles";

DROP TYPE "Role";
ALTER TYPE "Role_new" RENAME TO "Role";

ALTER TABLE "User" ALTER COLUMN "role" SET DEFAULT 'COLABORADOR';
ALTER TABLE "AllowedEmail" ALTER COLUMN "role" SET DEFAULT 'COLABORADOR';

CREATE TYPE "ThemeVariant" AS ENUM ('DEFAULT', 'MIDNIGHT', 'EMERALD', 'CORPORATE');
ALTER TABLE "User" ADD COLUMN "themeVariant" "ThemeVariant" NOT NULL DEFAULT 'DEFAULT';
CREATE INDEX "User_themeVariant_idx" ON "User"("themeVariant");
