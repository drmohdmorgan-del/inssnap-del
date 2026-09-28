/**
 * Next.js instrumentation hook — runs once when the server boots
 * (nodejs runtime only).
 *
 * Applies the idempotent PostgreSQL schema before the app serves traffic,
 * so the first production boot against a fresh database self-provisions.
 * Safe to run on every cold start: schema.sql uses IF NOT EXISTS / DO
 * guards, and migrate() takes a transaction-scoped advisory lock to
 * serialize concurrent boots.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs" && process.env.DATABASE_URL) {
    const { migrate } = await import("./lib/db");
    try {
      await migrate();
      console.log("[inssnapp] database schema is up to date");
    } catch (err) {
      // Fail fast: serving traffic against a half-migrated schema would
      // corrupt data. The deploy stays red until the DB is reachable.
      console.error("[inssnapp] startup migration failed:", err);
      throw err;
    }
  }
}
