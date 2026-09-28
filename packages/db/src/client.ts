/**
 * PostgreSQL client for TASK-002/003.
 *
 * Uses `pg` as a peer dependency. The engine's ShowingStore interface is
 * implemented here with organization scoping, optimistic locking, and
 * idempotent audit events — matching the in-memory semantics exactly.
 *
 * `pg` is loaded lazily so the in-memory path works without it installed.
 */

import { readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { Showing, ShowingEvent } from "@inssnapp/engine";
import type {
  AuthStore,
  CreateMfaChallengeInput,
  CreateSessionInput,
  CreateUserInput,
  MfaChallengeRecord,
  SessionRecord,
  UserRecord,
} from "@inssnapp/auth";
import { DuplicateUserError } from "@inssnapp/auth";

const connectionString = process.env.DATABASE_URL;

export const usingPostgres = Boolean(connectionString);

/** Runs all migrations in a transaction. Idempotent. */
export async function migrate(): Promise<void> {
  if (!connectionString) throw new Error("DATABASE_URL is not set");
  const { default: pg } = await import("pg");
  const client = new pg.Client({ connectionString });
  await client.connect();
  try {
    await client.query("BEGIN");
    // fileURLToPath(import.meta.url) — not dirname(__filename): under
    // Node's native type-stripping there is no CommonJS __filename.
    const schemaPath = join(dirname(fileURLToPath(import.meta.url)), "schema.sql");
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

/** Postgres-backed store implementing the engine's persistence contract. */
export class PostgresStore implements AuthStore {
  private pool: unknown = null;

  private async pool_(): Promise<any> {
    if (!this.pool) {
      const { default: pg } = await import("pg");
      this.pool = new pg.Pool({ connectionString });
    }
    return this.pool;
  }

  // ---- Auth (TASK-002): users & server-side sessions ---------------------

  private static mapUser(row: any): UserRecord {
    return {
      id: row.id,
      organizationId: row.organizationId,
      email: row.email,
      fullName: row.fullName,
      passwordHash: row.passwordHash,
      role: row.role,
      mfaEnabled: row.mfaEnabled,
      mfaSecret: row.mfaSecret ?? null,
      createdAt:
        row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt),
    };
  }

  private static mapSession(row: any): SessionRecord {
    return {
      tokenHash: row.tokenHash,
      userId: row.userId,
      organizationId: row.organizationId,
      expiresAt: row.expiresAt instanceof Date ? row.expiresAt.toISOString() : String(row.expiresAt),
      createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt),
    };
  }

  private static userColumns(): string {
    return `id, organization_id AS "organizationId", email, full_name AS "fullName",
            password_hash AS "passwordHash", role,
            mfa_enabled AS "mfaEnabled", mfa_secret AS "mfaSecret",
            created_at AS "createdAt"`;
  }

  async createUser(input: CreateUserInput): Promise<UserRecord> {
    const pool = await this.pool_();
    try {
      const res = await pool.query(
        `INSERT INTO users
           (organization_id, email, full_name, password_hash, role, mfa_enabled, mfa_secret)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING ${PostgresStore.userColumns()}`,
        [
          input.organizationId,
          input.email.trim().toLowerCase(),
          input.fullName,
          input.passwordHash,
          input.role,
          input.mfaEnabled ?? false,
          input.mfaSecret ?? null,
        ],
      );
      return PostgresStore.mapUser(res.rows[0]);
    } catch (err: any) {
      if (err?.code === "23505") {
        throw new DuplicateUserError(input.email.trim().toLowerCase(), input.organizationId);
      }
      throw err;
    }
  }

  async getUserByEmail(email: string, organizationId: string): Promise<UserRecord | null> {
    const pool = await this.pool_();
    const res = await pool.query(
      `SELECT ${PostgresStore.userColumns()}
       FROM users WHERE organization_id = $1 AND email = $2 LIMIT 1`,
      [organizationId, email.trim().toLowerCase()],
    );
    return res.rows[0] ? PostgresStore.mapUser(res.rows[0]) : null;
  }

  async getUserByEmailAnyOrg(email: string): Promise<UserRecord | null> {
    const pool = await this.pool_();
    const res = await pool.query(
      `SELECT ${PostgresStore.userColumns()}
       FROM users WHERE email = $1 ORDER BY created_at ASC LIMIT 1`,
      [email.trim().toLowerCase()],
    );
    return res.rows[0] ? PostgresStore.mapUser(res.rows[0]) : null;
  }

  async getUserById(id: string): Promise<UserRecord | null> {
    const pool = await this.pool_();
    const res = await pool.query(
      `SELECT ${PostgresStore.userColumns()} FROM users WHERE id = $1 LIMIT 1`,
      [id],
    );
    return res.rows[0] ? PostgresStore.mapUser(res.rows[0]) : null;
  }

  async setMfa(
    userId: string,
    opts: { enabled: boolean; secret?: string | null },
  ): Promise<UserRecord | null> {
    const pool = await this.pool_();
    const res = await pool.query(
      `UPDATE users
       SET mfa_enabled = $2,
           mfa_secret = CASE WHEN $2 THEN COALESCE($3, mfa_secret) ELSE NULL END,
           updated_at = now()
       WHERE id = $1
       RETURNING ${PostgresStore.userColumns()}`,
      [userId, opts.enabled, opts.secret ?? null],
    );
    return res.rows[0] ? PostgresStore.mapUser(res.rows[0]) : null;
  }

  async createSession(input: CreateSessionInput): Promise<SessionRecord> {
    const pool = await this.pool_();
    const res = await pool.query(
      `INSERT INTO sessions (token_hash, user_id, organization_id, expires_at)
       VALUES ($1, $2, $3, $4)
       RETURNING token_hash AS "tokenHash", user_id AS "userId",
                 organization_id AS "organizationId",
                 expires_at AS "expiresAt", created_at AS "createdAt"`,
      [input.tokenHash, input.userId, input.organizationId, input.expiresAt.toISOString()],
    );
    return PostgresStore.mapSession(res.rows[0]);
  }

  async getSessionByTokenHash(tokenHash: string): Promise<SessionRecord | null> {
    const pool = await this.pool_();
    const res = await pool.query(
      `SELECT token_hash AS "tokenHash", user_id AS "userId",
              organization_id AS "organizationId",
              expires_at AS "expiresAt", created_at AS "createdAt"
       FROM sessions WHERE token_hash = $1 LIMIT 1`,
      [tokenHash],
    );
    return res.rows[0] ? PostgresStore.mapSession(res.rows[0]) : null;
  }

  async revokeSession(tokenHash: string): Promise<void> {
    const pool = await this.pool_();
    await pool.query(`DELETE FROM sessions WHERE token_hash = $1`, [tokenHash]);
  }

  async revokeUserSessions(userId: string): Promise<void> {
    const pool = await this.pool_();
    await pool.query(`DELETE FROM sessions WHERE user_id = $1`, [userId]);
  }

  private static mapMfaChallenge(row: any): MfaChallengeRecord {
    return {
      id: row.id,
      userId: row.userId,
      organizationId: row.organizationId,
      expiresAt: row.expiresAt instanceof Date ? row.expiresAt.toISOString() : String(row.expiresAt),
      createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt),
    };
  }

  async createMfaChallenge(input: CreateMfaChallengeInput): Promise<MfaChallengeRecord> {
    const pool = await this.pool_();
    // Opportunistic sweep of expired challenges.
    await pool.query(`DELETE FROM mfa_challenges WHERE expires_at < now()`);
    const res = await pool.query(
      `INSERT INTO mfa_challenges (id, user_id, organization_id, expires_at)
       VALUES ($1, $2, $3, $4)
       RETURNING id, user_id AS "userId", organization_id AS "organizationId",
                 expires_at AS "expiresAt", created_at AS "createdAt"`,
      [input.id, input.userId, input.organizationId, input.expiresAt.toISOString()],
    );
    return PostgresStore.mapMfaChallenge(res.rows[0]);
  }

  async consumeMfaChallenge(id: string): Promise<MfaChallengeRecord | null> {
    const pool = await this.pool_();
    // Atomic single-use consume: DELETE ... RETURNING is the only read.
    const res = await pool.query(
      `DELETE FROM mfa_challenges WHERE id = $1
       RETURNING id, user_id AS "userId", organization_id AS "organizationId",
                 expires_at AS "expiresAt", created_at AS "createdAt"`,
      [id],
    );
    if (!res.rows[0]) return null;
    const challenge = PostgresStore.mapMfaChallenge(res.rows[0]);
    if (new Date(challenge.expiresAt).getTime() <= Date.now()) return null;
    return challenge;
  }

  // ---- Showing engine persistence (unchanged) ------------------------------

  async getShowing(id: string): Promise<Showing | null> {
    const pool = await this.pool_();
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
  }

  async insertEvent(e: Omit<ShowingEvent, "id" | "at">): Promise<ShowingEvent> {
    const pool = await this.pool_();
    const res = await pool.query(
      `INSERT INTO showing_events
         (organization_id, showing_id, actor_user_id, actor_role, transition, from_state, to_state, idempotency_key)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       RETURNING id, at`,
      [e.organizationId, e.showingId, e.actorUserId, e.actorRole, e.transition, e.fromState, e.toState, e.idempotencyKey],
    );
    return { ...e, id: res.rows[0].id, at: res.rows[0].at };
  }

  async commitShowing(
    id: string,
    expectedVersion: number,
    patch: Partial<Pick<Showing, "state" | "outcome" | "prospectUserId" | "brokerUserId">>,
  ): Promise<Showing | null> {
    const pool = await this.pool_();
    const res = await pool.query(
      `UPDATE showings
       SET state = COALESCE($3, state),
           outcome = COALESCE($4, outcome),
           prospect_user_id = COALESCE($5, prospect_user_id),
           broker_user_id = COALESCE($6, broker_user_id),
           version = version + 1,
           updated_at = now()
       WHERE id = $1 AND version = $2
       RETURNING id, organization_id AS "organizationId", unit_id AS "unitId",
                 resident_user_id AS "residentUserId", prospect_user_id AS "prospectUserId",
                 broker_user_id AS "brokerUserId", broker_required AS "brokerRequired",
                 state, outcome, version, created_at AS "createdAt", updated_at AS "updatedAt"`,
      [id, expectedVersion, patch.state ?? null, patch.outcome ?? null, patch.prospectUserId ?? null, patch.brokerUserId ?? null],
    );
    return res.rows[0] ?? null;
  }

  /**
   * TASK-010: atomic state-commit + audit-event insert in a single
   * transaction. Returns null when the optimistic version check fails
   * (the transaction is rolled back). A duplicate idempotency key
   * aborts the transaction with the 23505 unique-violation error, which
   * the engine propagates so the route layer can replay the winner.
   */
  async commitAndAudit(args: {
    id: string;
    expectedVersion: number;
    patch: Partial<Pick<Showing, "state" | "outcome" | "prospectUserId" | "brokerUserId">>;
    event: Omit<ShowingEvent, "id" | "at">;
  }): Promise<{ showing: Showing; event: ShowingEvent } | null> {
    const pool = await this.pool_();
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const upd = await client.query(
        `UPDATE showings
         SET state = COALESCE($3, state),
             outcome = COALESCE($4, outcome),
             prospect_user_id = COALESCE($5, prospect_user_id),
             broker_user_id = COALESCE($6, broker_user_id),
             version = version + 1,
             updated_at = now()
         WHERE id = $1 AND version = $2
         RETURNING id, organization_id AS "organizationId", unit_id AS "unitId",
                   resident_user_id AS "residentUserId", prospect_user_id AS "prospectUserId",
                   broker_user_id AS "brokerUserId", broker_required AS "brokerRequired",
                   state, outcome, version, created_at AS "createdAt", updated_at AS "updatedAt"`,
        [
          args.id,
          args.expectedVersion,
          args.patch.state ?? null,
          args.patch.outcome ?? null,
          args.patch.prospectUserId ?? null,
          args.patch.brokerUserId ?? null,
        ],
      );
      if (upd.rows.length === 0) {
        await client.query("ROLLBACK");
        return null;
      }
      const e = args.event;
      const ins = await client.query(
        `INSERT INTO showing_events
           (organization_id, showing_id, actor_user_id, actor_role, transition, from_state, to_state, idempotency_key)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
         RETURNING id, at`,
        [e.organizationId, e.showingId, e.actorUserId, e.actorRole, e.transition, e.fromState, e.toState, e.idempotencyKey],
      );
      await client.query("COMMIT");
      const showing = upd.rows[0] as Showing;
      const event: ShowingEvent = { ...e, id: ins.rows[0].id, at: ins.rows[0].at };
      return { showing, event };
    } catch (err) {
      try {
        await client.query("ROLLBACK");
      } catch {
        // Rollback best-effort; the original error is what matters.
      }
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * TASK-010: idempotency lookups are organization-scoped, matching the
   * UNIQUE (organization_id, idempotency_key) constraint.
   */
  async getIdempotent(key: string, organizationId: string): Promise<ShowingEvent | null> {
    const pool = await this.pool_();
    const res = await pool.query(
      `SELECT id, showing_id AS "showingId", organization_id AS "organizationId",
              actor_user_id AS "actorUserId", actor_role AS "actorRole",
              transition, from_state AS "fromState", to_state AS "toState",
              idempotency_key AS "idempotencyKey", at
       FROM showing_events WHERE idempotency_key = $1 AND organization_id = $2 LIMIT 1`,
      [key, organizationId],
    );
    return res.rows[0] ?? null;
  }

  // ---- Unit/showing locks (TASK-003) ---------------------------------------
  // Atomic acquisition: the primary key on showing_locks.unit_id makes the
  // INSERT the serialization point — exactly one concurrent CONFIRM wins.
  async tryAcquireUnitLock(
    unitId: string,
    showingId: string,
    organizationId: string,
  ): Promise<boolean> {
    const pool = await this.pool_();
    const res = await pool.query(
      `INSERT INTO showing_locks (unit_id, showing_id, organization_id)
       VALUES ($1, $2, $3)
       ON CONFLICT (unit_id) DO NOTHING`,
      [unitId, showingId, organizationId],
    );
    return (res.rowCount ?? 0) === 1;
  }

  async releaseUnitLock(showingId: string): Promise<void> {
    const pool = await this.pool_();
    await pool.query(`DELETE FROM showing_locks WHERE showing_id = $1`, [showingId]);
  }

  /** Returns the lock row for a unit, if one is held (introspection/testing). */
  async getUnitLock(unitId: string): Promise<{ showingId: string; organizationId: string } | null> {
    const pool = await this.pool_();
    const res = await pool.query(
      `SELECT showing_id AS "showingId", organization_id AS "organizationId"
       FROM showing_locks WHERE unit_id = $1 LIMIT 1`,
      [unitId],
    );
    return res.rows[0] ?? null;
  }
}
