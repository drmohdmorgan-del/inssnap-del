/**
 * Unified data access layer.
 *
 * When DATABASE_URL is set, all reads/writes go through PostgreSQL with
 * organization-scoped queries. Otherwise, the in-memory store is used for
 * local development and demos.
 *
 * Self-contained: no cross-package imports, so webpack resolves cleanly.
 */

import type { Showing, ShowingEvent, ShowingState } from "@inssnapp/engine";
import { store as mem } from "./store";

export const usingPostgres = Boolean(process.env.DATABASE_URL);

export async function migrate() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set");
  const { default: pg } = await import("pg");
  const { readFile } = await import("node:fs/promises");
  const { join, dirname } = await import("node:path");
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    await client.query("BEGIN");
    const schemaPath = join(process.cwd(), "packages/db/src/schema.sql");
    const sql = await readFile(schemaPath, "utf8");
    await client.query(sql);
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    await client.end();
  }
}

// ---- Lazy Postgres pool ----------------------------------------------------
let pgPool: any = null;
async function getPool(): Promise<any> {
  if (!pgPool) {
    const { default: pg } = await import("pg");
    pgPool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  }
  return pgPool;
}

// ---- Unified data access ----------------------------------------------------
// NOTE (TASK-002): users and server-side sessions live behind getAuthStore()
// (apps/web/lib/auth-store.ts) — in-memory seed for local dev, PostgreSQL
// when DATABASE_URL is set. They are intentionally not part of this object.
export const db = {
  properties: {
    async byOrg(organizationId: string) {
      if (!usingPostgres) return mem.properties.byOrg(organizationId);
      const pool = await getPool();
      const res = await pool.query(
        `SELECT id, organization_id AS "organizationId", name, address
         FROM properties WHERE organization_id = $1`,
        [organizationId],
      );
      return res.rows;
    },
  },

  units: {
    async byOrg(organizationId: string) {
      if (!usingPostgres) return mem.units.byOrg(organizationId);
      const pool = await getPool();
      const res = await pool.query(
        `SELECT id, organization_id AS "organizationId", property_id AS "propertyId",
                label, pms_external_id AS "pmsExternalId", eligible,
                resident_available AS "residentAvailable"
         FROM units WHERE organization_id = $1`,
        [organizationId],
      );
      return res.rows;
    },

    async byId(id: string) {
      if (!usingPostgres) return mem.units.byId(id);
      const pool = await getPool();
      const res = await pool.query(
        `SELECT id, organization_id AS "organizationId", property_id AS "propertyId",
                label, eligible, resident_available AS "residentAvailable"
         FROM units WHERE id = $1`,
        [id],
      );
      return res.rows[0] ?? null;
    },
  },

  // ---- Showing engine persistence ----
  showings: {
    async get(id: string) {
      if (!usingPostgres) return mem.showings.get(id);
      const pool = await getPool();
      const res = await pool.query(
        `SELECT id, organization_id AS "organizationId", unit_id AS "unitId",
                resident_user_id AS "residentUserId", prospect_user_id AS "prospectUserId",
                broker_user_id AS "brokerUserId", broker_required AS "brokerRequired",
                state, outcome, version,
                created_at AS "createdAt", updated_at AS "updatedAt"
         FROM showings WHERE id = $1`,
        [id],
      );
      return res.rows[0] ?? null;
    },

    async create(unitId: string, residentUserId: string, organizationId: string, brokerRequired = false) {
      if (!usingPostgres) return mem.showings.create(unitId, residentUserId, organizationId, brokerRequired);
      const pool = await getPool();
      const res = await pool.query(
        `INSERT INTO showings (unit_id, resident_user_id, organization_id, broker_required)
         VALUES ($1, $2, $3, $4)
         RETURNING id, organization_id AS "organizationId", unit_id AS "unitId",
                   resident_user_id AS "residentUserId", prospect_user_id AS "prospectUserId",
                   broker_user_id AS "brokerUserId", broker_required AS "brokerRequired",
                   state, outcome, version, created_at AS "createdAt", updated_at AS "updatedAt"`,
        [unitId, residentUserId, organizationId, brokerRequired],
      );
      return res.rows[0];
    },

    async list(organizationId: string) {
      if (!usingPostgres) return mem.showings.list(organizationId);
      const pool = await getPool();
      const res = await pool.query(
        `SELECT id, organization_id AS "organizationId", unit_id AS "unitId",
                resident_user_id AS "residentUserId", prospect_user_id AS "prospectUserId",
                broker_user_id AS "brokerUserId", broker_required AS "brokerRequired",
                state, outcome, version, updated_at AS "updatedAt"
         FROM showings WHERE organization_id = $1 ORDER BY created_at DESC`,
        [organizationId],
      );
      return res.rows;
    },

    async byUnitActive(unitId: string) {
      if (!usingPostgres) return mem.showings.byUnitActive(unitId);
      const active: ShowingState[] = ["REQUESTED", "RESIDENT_ACCEPTED", "BROKER_GATE", "CONFIRMED", "IN_PROGRESS", "COMPLETED"];
      const pool = await getPool();
      const res = await pool.query(
        `SELECT id, unit_id AS "unitId", state FROM showings
         WHERE unit_id = $1 AND state = ANY($2) LIMIT 1`,
        [unitId, active],
      );
      return res.rows[0] ?? null;
    },

    async set(id: string, updated: Showing) {
      if (!usingPostgres) return mem.showings.set(id, updated);
      const pool = await getPool();
      await pool.query(
        `UPDATE showings
         SET state = $2, outcome = $3, prospect_user_id = $4,
             broker_user_id = $5, version = $6, updated_at = now()
         WHERE id = $1`,
        [id, updated.state, updated.outcome, updated.prospectUserId, updated.brokerUserId, updated.version],
      );
    },
  },

  showingEvents: {
    async insert(e: Omit<ShowingEvent, "id" | "at">) {
      if (!usingPostgres) return mem.showingEvents.insert(e);
      const pool = await getPool();
      const res = await pool.query(
        `INSERT INTO showing_events
           (organization_id, showing_id, actor_user_id, actor_role, transition, from_state, to_state, idempotency_key)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
         RETURNING id, at`,
        [e.organizationId, e.showingId, e.actorUserId, e.actorRole, e.transition, e.fromState, e.toState, e.idempotencyKey],
      );
      return { ...e, id: res.rows[0].id, at: res.rows[0].at };
    },

    async list(organizationId: string) {
      if (!usingPostgres) return mem.showingEvents.list(organizationId);
      const pool = await getPool();
      const res = await pool.query(
        `SELECT id, showing_id AS "showingId", organization_id AS "organizationId",
                actor_user_id AS "actorUserId", actor_role AS "actorRole",
                transition, from_state AS "fromState", to_state AS "toState",
                idempotency_key AS "idempotencyKey", at
         FROM showing_events WHERE organization_id = $1 ORDER BY at DESC`,
        [organizationId],
      );
      return res.rows;
    },

    async findByIdempotencyKey(key: string) {
      if (!usingPostgres) return mem.showingEvents.findByIdempotencyKey(key);
      const pool = await getPool();
      const res = await pool.query(
        `SELECT id, showing_id AS "showingId", organization_id AS "organizationId",
                actor_user_id AS "actorUserId", actor_role AS "actorRole",
                transition, from_state AS "fromState", to_state AS "toState",
                idempotency_key AS "idempotencyKey", at
         FROM showing_events WHERE idempotency_key = $1 LIMIT 1`,
        [key],
      );
      return res.rows[0] ?? null;
    },
  },
};
