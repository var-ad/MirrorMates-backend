import "dotenv/config";
import { defineConfig } from "prisma/config";

const fallbackBuildDatabaseUrl =
  "postgresql://postgres:postgres@localhost:5432/postgres";
const runtimeEnv =
  (globalThis as { process?: { env?: Record<string, string | undefined> } })
    .process?.env ?? {};
const databaseUrl =
  runtimeEnv.POSTGRES_URL && runtimeEnv.POSTGRES_URL.trim().length > 0
    ? runtimeEnv.POSTGRES_URL
    : fallbackBuildDatabaseUrl;

export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: {
    // Prisma client generation does not require a live DB connection.
    // This avoids Railway build failures when env vars are not injected during npm ci.
    url: databaseUrl,
  },
  migrations: {
    seed: "npm run seed",
  },
});
