/**
 * Database migration runner (TASK-002).
 *
 * Usage:
 *   npm run db:migrate            (from the repo root)
 *   DATABASE_URL=postgres://… node packages/db/src/migrate.ts
 *
 * Applies packages/db/src/schema.sql inside a single transaction.
 * Idempotent — safe to run repeatedly.
 */

import { migrate, usingPostgres } from "./client.ts";
import { pathToFileURL } from "node:url";

async function main(): Promise<void> {
  if (!usingPostgres) {
    console.error("DATABASE_URL is not set. PostgreSQL is required for migrations.");
    process.exit(1);
  }
  console.log("Applying migrations...");
  await migrate();
  console.log("Migrations complete.");
}

// Run only when executed directly (`npm run db:migrate`), not when imported.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error("Migration failed:", err);
    process.exit(1);
  });
}
