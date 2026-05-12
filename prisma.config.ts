import "dotenv/config";
import { defineConfig } from "prisma/config";

const fallbackDatabaseUrl = "postgresql://postgres:postgres@localhost:5432/gotechy_hours?schema=public";
const migrationDatabaseUrl = process.env.DIRECT_URL ?? process.env.DATABASE_URL ?? fallbackDatabaseUrl;

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts"
  },
  datasource: {
    url: migrationDatabaseUrl
  }
});
