import { ShowingEngine, type ShowingStore } from "@inssnapp/engine";
import { PostgresStore } from "@inssnapp/db";
import { db } from "./db";
import { store as mem } from "./store";

/**
 * Wires the Authoritative Showing Engine to the persistence boundary.
 *
 * When DATABASE_URL is set, the engine persists through PostgresStore
 * (PostgreSQL: showings, audit events, idempotency keys, unit locks).
 * Otherwise the in-memory dev store is used with identical semantics.
 * The engine itself is unchanged across both paths.
 */

function memAdapter(): ShowingStore {
  // Module-level lock map: single-threaded Node makes check-then-set
  // atomic, mirroring the Postgres INSERT ... ON CONFLICT semantics.
  // Keyed by unitId -> showingId.
  const locks = new Map<string, string>();

  return {
    getShowing: (id) => db.showings.get(id),
    insertEvent: (e) => db.showingEvents.insert(e),
    // TASK-010: idempotency lookups are organization-scoped.
    getIdempotent: (key, organizationId) =>
      db.showingEvents.findByIdempotencyKey(key, organizationId),
    /**
     * TASK-010: atomic commit+audit for the in-memory store. The mem
     * store's get/set/insert are all synchronous, so this whole section
     * runs without yielding to the event loop — no interleaving is
     * possible, mirroring the Postgres transaction in PostgresStore.
     * The duplicate (organization_id, idempotency_key) check runs BEFORE
     * any mutation and throws a 23505-like error, exactly like Postgres:
     * no state change survives a failed commit.
     */
    commitAndAudit: async ({ id, expectedVersion, patch, event }) => {
      const s = mem.showings.get(id);
      if (!s || s.version !== expectedVersion) return null;
      if (mem.showingEvents.findByIdempotencyKey(event.idempotencyKey, event.organizationId)) {
        const err = new Error(
          `duplicate key value violates unique constraint "showing_events_organization_id_idempotency_key_key"`,
        ) as Error & { code?: string };
        err.code = "23505";
        throw err;
      }
      const updated = {
        ...s,
        ...patch,
        version: s.version + 1,
        updatedAt: new Date().toISOString(),
      };
      mem.showings.set(id, updated);
      const evt = mem.showingEvents.insert(event);
      return { showing: updated, event: evt };
    },
    commitShowing: async (id, expectedVersion, patch) => {
      const s = await db.showings.get(id);
      if (!s || s.version !== expectedVersion) return null;
      const updated = {
        ...s,
        ...patch,
        version: s.version + 1,
        updatedAt: new Date().toISOString(),
      };
      await db.showings.set(id, updated);
      return updated;
    },
    tryAcquireUnitLock: async (unitId, showingId) => {
      if (locks.has(unitId)) return false;
      locks.set(unitId, showingId);
      return true;
    },
    releaseUnitLock: async (showingId) => {
      for (const [unitId, holder] of locks) {
        if (holder === showingId) locks.delete(unitId);
      }
    },
  };
}

function createStore(): ShowingStore {
  if (process.env.DATABASE_URL) {
    // One PostgresStore per process (it pools internally); the pool is
    // shared on globalThis so Next.js route bundling reuses it.
    const g = globalThis as typeof globalThis & { __inssnappPgEngineStore?: PostgresStore };
    if (!g.__inssnappPgEngineStore) g.__inssnappPgEngineStore = new PostgresStore();
    return g.__inssnappPgEngineStore;
  }
  return memAdapter();
}

export const engine = new ShowingEngine(createStore());
