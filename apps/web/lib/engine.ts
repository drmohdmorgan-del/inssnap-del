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
    getIdempotent: (key) => db.showingEvents.findByIdempotencyKey(key),
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
