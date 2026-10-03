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
import { store as mem, type SecurityEvent, type ContactSubmission } from "./store";

export type { SecurityEvent };

// ---- Typed rows returned by the unified data layer (TASK-007) --------------
// Postgres rows are mapped onto these shapes; the in-memory seed returns
// the same shapes so callers can rely on them on either store path.
export interface OrgRow {
  id: string;
  name: string;
}

export interface SafeUserRow {
  id: string;
  organizationId: string;
  email: string;
  fullName: string;
  role: string;
  mfaEnabled: boolean;
  emailVerified: boolean;
}

export interface PropertyRow {
  id: string;
  organizationId: string;
  name: string;
  address: string;
  /** Vendor-stable external id from the PMS sync; null for manually created properties. */
  pmsExternalId: string | null;
  /** Map coordinates (Phase 8); null until set via pin-drop or geocoding. */
  latitude: number | null;
  longitude: number | null;
}

export interface InviteRow {
  id: string;
  code: string;
  organizationId: string;
  unitId: string | null;
  role: "resident" | "prospect" | "broker";
  email: string | null;
  createdByUserId: string | null;
  createdAt: string;
  expiresAt: string;
  usedAt: string | null;
  usedByUserId: string | null;
}

export interface VerificationCodeRow {
  id: string;
  organizationId: string;
  email: string;
  code: string;
  purpose: string;
  createdAt: string;
  expiresAt: string;
  usedAt: string | null;
  attempts: number;
}

export type LeadDisposition = "pending" | "inhouse" | "management";

export interface LeadDispositionRow {
  showingId: string;
  organizationId: string;
  disposition: LeadDisposition;
  decidedByUserId: string | null;
  decidedAt: string | null;
  updatedAt: string;
}

export interface BrokerProfileRow {
  userId: string;
  organizationId: string;
  tier: "trial" | "basic" | "pro";
  tierStartedAt: string;
  trialEndsAt: string | null;
  updatedAt: string;
}

export interface UnitRow {
  id: string;
  organizationId: string;
  propertyId: string;
  label: string;
  pmsExternalId: string | null;
  eligible: boolean;
  residentAvailable: boolean;
}

export interface ResidentDetailRow {
  userId: string;
  email: string;
  fullName: string;
  unitId: string;
  unitLabel: string;
  propertyName: string;
  eligible: boolean;
  residentAvailable: boolean;
  verified: boolean;
}

export interface PmsAdapterRow {
  id: string;
  organizationId: string;
  provider: string;
  /** Which implementation backs this row: 'sandbox' | vendor name (TASK-008). */
  adapterType: string;
  /** Adapter config JSON (vendor/dataset knobs — never raw secrets). */
  config: Record<string, unknown>;
  status: string;
  lastSyncAt: string | null;
  lastHealthCheckAt: string | null;
  healthStatus: string | null;
}

export interface RatingRow {
  id: string;
  organizationId: string;  showingId: string;
  raterUserId: string;
  raterRole: string;
  stars: number;
  comment: string | null;
  createdAt: string;
}

export interface ScreeningConsentRow {
  id: string;
  organizationId: string;
  prospectUserId: string;
  scopeText: string;
  consentedAt: string;
  recordedBy: string;
}

export interface ScreeningReportRow {
  id: string;
  organizationId: string;
  prospectUserId: string;
  mode: "sandbox" | "production";
  status: "clear" | "review" | "consider";
  detail: string;
  requestedAt: string;
  completedAt: string;
  requestedBy: string | null;
}

export interface ScreeningLegalApprovalRow {
  id: string;
  organizationId: string;
  approvedAt: string;
  approvedBy: string;
  notes: string;
}

export const usingPostgres = Boolean(process.env.DATABASE_URL);

export async function migrate() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set");
  // Cold boots can race a still-unreachable database (e.g. Neon waking or a
  // brief network blip). The old fail-fast behavior turned one such blip
  // into a total API outage: instrumentation rethrows, which kills the whole
  // serverless instance, so EVERY /api/* route 500s until a later cold boot
  // happens to succeed. Retry with backoff instead — the schema runs in a
  // single transaction, so a failed attempt leaves the database untouched
  // and is safe to retry. A genuinely broken schema still fails all attempts
  // and throws, preserving the old fail-fast guarantee for real migrations.
  const attempts = 3;
  let lastErr: unknown = null;
  for (let i = 1; i <= attempts; i++) {
    try {
      await migrateOnce();
      if (i > 1) console.log(`[inssnapp] database schema is up to date (attempt ${i})`);
      return;
    } catch (err) {
      lastErr = err;
      console.error(`[inssnapp] startup migration attempt ${i}/${attempts} failed:`, err);
      if (i < attempts) await new Promise((r) => setTimeout(r, 1000 * i));
    }
  }
  throw lastErr;
}

async function migrateOnce() {
  const { default: pg } = await import("pg");
  // Schema is embedded at build time (see scripts/embed-schema.mjs) so the
  // serverless bundle carries it without fs access to the source tree.
  const { SCHEMA_SQL } = await import("./schema-embedded");
  const client = new pg.Client({
    connectionString: process.env.DATABASE_URL,
    // Fail fast on a hung connect instead of hanging the whole boot past the
    // serverless function timeout.
    connectionTimeoutMillis: 15_000,
  });
  await client.connect();
  try {
    await client.query("BEGIN");
    // Serialize concurrent boot-time migrations (multiple cold starts).
    await client.query("SELECT pg_advisory_xact_lock(hashtext('inssnapp_schema_migrate'))");
    await client.query(SCHEMA_SQL);
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

/** Human-typable invite code (no ambiguous chars: 0/O, 1/I/L). */
function randomInviteCode(): string {
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < 6; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

function inviteColumns(): string {
  return `id, code, organization_id AS "organizationId", unit_id AS "unitId", role,
          email, created_by_user_id AS "createdByUserId",
          created_at AS "createdAt", expires_at AS "expiresAt",
          used_at AS "usedAt", used_by_user_id AS "usedByUserId"`;
}

function verificationCodeColumns(): string {
  return `id, organization_id AS "organizationId", email, code, purpose,
          created_at AS "createdAt", expires_at AS "expiresAt",
          used_at AS "usedAt", attempts`;
}

function leadDispositionColumns(): string {
  return `showing_id AS "showingId", organization_id AS "organizationId", disposition,
          decided_by_user_id AS "decidedByUserId", decided_at AS "decidedAt",
          updated_at AS "updatedAt"`;
}

function brokerProfileColumns(): string {
  return `user_id AS "userId", organization_id AS "organizationId", tier,
          tier_started_at AS "tierStartedAt", trial_ends_at AS "trialEndsAt",
          updated_at AS "updatedAt"`;
}

// ---- Unified data access ----------------------------------------------------
// NOTE (TASK-002): users and server-side sessions live behind getAuthStore()
// (apps/web/lib/auth-store.ts) — in-memory seed for local dev, PostgreSQL
// when DATABASE_URL is set. They are intentionally not part of this object.
export const db = {
  orgs: {
    async list(): Promise<OrgRow[]> {
      if (!usingPostgres) return mem.orgs.list();
      const pool = await getPool();
      const res = await pool.query(`SELECT id, name FROM organizations ORDER BY name`);
      return res.rows;
    },
  },

  contact: {
    /** Contact-us landing page submissions (not org-scoped). */
    async insert(e: {
      name: string;
      email: string;
      company?: string | null;
      role?: string | null;
      message: string;
    }): Promise<ContactSubmission> {
      if (!usingPostgres) return mem.contactSubmissions.insert(e);
      const pool = await getPool();
      const res = await pool.query(
        `INSERT INTO contact_submissions (name, email, company, role, message)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, name, email, company, role, message,
                   created_at AS "createdAt"`,
        [e.name, e.email, e.company ?? null, e.role ?? null, e.message],
      );
      return res.rows[0];
    },
  },

  users: {
    /** Safe fields only — password hashes and TOTP secrets never leave this layer. */
    async byOrg(organizationId: string): Promise<SafeUserRow[]> {
      if (!usingPostgres) {
        return mem.users
          .byOrg(organizationId)
          .map((u) => ({
            id: u.id,
            organizationId: u.organizationId,
            email: u.email,
            fullName: u.fullName,
            role: u.role,
            mfaEnabled: u.mfaEnabled,
            emailVerified: u.emailVerified,
          }));
      }
      const pool = await getPool();
      const res = await pool.query(
        `SELECT id, organization_id AS "organizationId", email,
                full_name AS "fullName", role, mfa_enabled AS "mfaEnabled",
                email_verified AS "emailVerified"
         FROM users WHERE organization_id = $1 ORDER BY full_name`,
        [organizationId],
      );
      return res.rows;
    },

    /** Safe fields by id (TASK-009: org-scoped prospect lookup). */
    async byId(id: string): Promise<SafeUserRow | null> {
      if (!usingPostgres) {
        const u = mem.users.byId(id);
        return u
          ? {
              id: u.id,
              organizationId: u.organizationId,
              email: u.email,
              fullName: u.fullName,
              role: u.role,
              mfaEnabled: u.mfaEnabled,
              emailVerified: u.emailVerified,
            }
          : null;
      }
      const pool = await getPool();
      const res = await pool.query(
        `SELECT id, organization_id AS "organizationId", email,
                full_name AS "fullName", role, mfa_enabled AS "mfaEnabled",
                email_verified AS "emailVerified"
         FROM users WHERE id = $1`,
        [id],
      );
      return res.rows[0] ?? null;
    },
  },

  properties: {
    async byOrg(organizationId: string): Promise<PropertyRow[]> {
      if (!usingPostgres) return mem.properties.byOrg(organizationId);
      const pool = await getPool();
      const res = await pool.query(
        `SELECT id, organization_id AS "organizationId", name, address,
                pms_external_id AS "pmsExternalId",
                latitude, longitude
         FROM properties WHERE organization_id = $1`,
        [organizationId],
      );
      return res.rows;
    },

    async byId(id: string): Promise<PropertyRow | null> {
      if (!usingPostgres) return mem.properties.byId(id);
      const pool = await getPool();
      const res = await pool.query(
        `SELECT id, organization_id AS "organizationId", name, address,
                pms_external_id AS "pmsExternalId",
                latitude, longitude
         FROM properties WHERE id = $1`,
        [id],
      );
      return res.rows[0] ?? null;
    },

    /** Find by vendor external id within one organization (TASK-008 sync). */
    async byExternalId(organizationId: string, pmsExternalId: string): Promise<PropertyRow | null> {
      if (!usingPostgres) return mem.properties.byExternalId(organizationId, pmsExternalId);
      const pool = await getPool();
      const res = await pool.query(
        `SELECT id, organization_id AS "organizationId", name, address,
                pms_external_id AS "pmsExternalId",
                latitude, longitude
         FROM properties WHERE organization_id = $1 AND pms_external_id = $2 LIMIT 1`,
        [organizationId, pmsExternalId],
      );
      return res.rows[0] ?? null;
    },

    async create(
      organizationId: string,
      name: string,
      address: string,
      opts: {
        pmsExternalId?: string | null;
        latitude?: number | null;
        longitude?: number | null;
      } = {},
    ): Promise<PropertyRow> {
      if (!usingPostgres) return mem.properties.create(organizationId, name, address, opts);
      const pool = await getPool();
      const res = await pool.query(
        `INSERT INTO properties (organization_id, name, address, pms_external_id, latitude, longitude)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id, organization_id AS "organizationId", name, address,
                   pms_external_id AS "pmsExternalId", latitude, longitude`,
        [
          organizationId,
          name,
          address,
          opts.pmsExternalId ?? null,
          opts.latitude ?? null,
          opts.longitude ?? null,
        ],
      );
      return res.rows[0];
    },

    async patch(
      id: string,
      patch: {
        name?: string;
        address?: string;
        pmsExternalId?: string;
        latitude?: number | null;
        longitude?: number | null;
      },
    ): Promise<PropertyRow | null> {
      if (!usingPostgres) return mem.properties.patch(id, patch);
      const pool = await getPool();
      // Latitude/longitude use explicit "touched" flags so omitting them
      // leaves existing coordinates alone while null clears them.
      const res = await pool.query(
        `UPDATE properties
         SET name = COALESCE($2, name), address = COALESCE($3, address),
             pms_external_id = COALESCE($4, pms_external_id),
             latitude = CASE WHEN $5 THEN $6 ELSE latitude END,
             longitude = CASE WHEN $7 THEN $8 ELSE longitude END
         WHERE id = $1
         RETURNING id, organization_id AS "organizationId", name, address,
                   pms_external_id AS "pmsExternalId", latitude, longitude`,
        [
          id,
          patch.name ?? null,
          patch.address ?? null,
          patch.pmsExternalId ?? null,
          "latitude" in patch,
          patch.latitude ?? null,
          "longitude" in patch,
          patch.longitude ?? null,
        ],
      );
      return res.rows[0] ?? null;
    },

    async remove(id: string): Promise<boolean> {
      if (!usingPostgres) return mem.properties.remove(id);
      const pool = await getPool();
      const res = await pool.query(`DELETE FROM properties WHERE id = $1`, [id]);
      return (res.rowCount ?? 0) > 0;
    },
  },

  units: {
    async byOrg(organizationId: string): Promise<UnitRow[]> {
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

    async byId(id: string): Promise<UnitRow | null> {
      if (!usingPostgres) return mem.units.byId(id);
      const pool = await getPool();
      const res = await pool.query(
        `SELECT id, organization_id AS "organizationId", property_id AS "propertyId",
                label, pms_external_id AS "pmsExternalId", eligible,
                resident_available AS "residentAvailable"
         FROM units WHERE id = $1`,
        [id],
      );
      return res.rows[0] ?? null;
    },

    /** Find by vendor external id within one property (TASK-008 sync). */
    async byExternalId(
      organizationId: string,
      propertyId: string,
      pmsExternalId: string,
    ): Promise<UnitRow | null> {
      if (!usingPostgres) return mem.units.byExternalId(organizationId, propertyId, pmsExternalId);
      const pool = await getPool();
      const res = await pool.query(
        `SELECT id, organization_id AS "organizationId", property_id AS "propertyId",
                label, pms_external_id AS "pmsExternalId", eligible,
                resident_available AS "residentAvailable"
         FROM units
         WHERE organization_id = $1 AND property_id = $2 AND pms_external_id = $3 LIMIT 1`,
        [organizationId, propertyId, pmsExternalId],
      );
      return res.rows[0] ?? null;
    },

    async create(
      organizationId: string,
      propertyId: string,
      label: string,
      opts: { eligible?: boolean; residentAvailable?: boolean; pmsExternalId?: string | null } = {},
    ): Promise<UnitRow> {
      if (!usingPostgres) return mem.units.create(organizationId, propertyId, label, opts);
      const pool = await getPool();
      const res = await pool.query(
        `INSERT INTO units (organization_id, property_id, label, pms_external_id, eligible, resident_available)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id, organization_id AS "organizationId", property_id AS "propertyId",
                   label, pms_external_id AS "pmsExternalId", eligible,
                   resident_available AS "residentAvailable"`,
        [
          organizationId,
          propertyId,
          label,
          opts.pmsExternalId ?? null,
          opts.eligible ?? true,
          opts.residentAvailable ?? false,
        ],
      );
      return res.rows[0];
    },

    async patch(
      id: string,
      patch: { label?: string; eligible?: boolean; residentAvailable?: boolean; pmsExternalId?: string },
    ): Promise<UnitRow | null> {
      if (!usingPostgres) return mem.units.patch(id, patch);
      const pool = await getPool();
      const res = await pool.query(
        `UPDATE units
         SET label = COALESCE($2, label),
             eligible = COALESCE($3, eligible),
             resident_available = COALESCE($4, resident_available),
             pms_external_id = COALESCE($5, pms_external_id),
             updated_at = now()
         WHERE id = $1
         RETURNING id, organization_id AS "organizationId", property_id AS "propertyId",
                   label, pms_external_id AS "pmsExternalId", eligible,
                   resident_available AS "residentAvailable"`,
        [
          id,
          patch.label ?? null,
          patch.eligible ?? null,
          patch.residentAvailable ?? null,
          patch.pmsExternalId ?? null,
        ],
      );
      return res.rows[0] ?? null;
    },

    async remove(id: string): Promise<boolean> {
      if (!usingPostgres) return mem.units.remove(id);
      const pool = await getPool();
      const res = await pool.query(`DELETE FROM units WHERE id = $1`, [id]);
      return (res.rowCount ?? 0) > 0;
    },
  },

  // ---- Showing engine persistence ----
  residents: {
    /** Idempotent resident ↔ unit link (TASK-008 roster sync). Returns true when newly created. */
    async link(userId: string, unitId: string): Promise<boolean> {
      if (!usingPostgres) return mem.residents.link(userId, unitId);
      const pool = await getPool();
      const unit = await pool.query(
        `SELECT organization_id FROM units WHERE id = $1`,
        [unitId],
      );
      if (!unit.rows[0]) throw new Error(`residents.link: unit ${unitId} not found`);
      const res = await pool.query(
        `INSERT INTO residents (organization_id, user_id, unit_id)
         VALUES ($1, $2, $3)
         ON CONFLICT (user_id, unit_id) DO NOTHING`,
        [unit.rows[0].organization_id, userId, unitId],
      );
      return (res.rowCount ?? 0) > 0;
    },

    async byUnit(unitId: string) {
      if (!usingPostgres) return mem.residents.byUnit(unitId);
      const pool = await getPool();
      const res = await pool.query(
        `SELECT user_id AS "userId", unit_id AS "unitId"
         FROM residents WHERE unit_id = $1 LIMIT 1`,
        [unitId],
      );
      return res.rows[0] ?? null;
    },

    /** All resident ↔ unit links for one user (TASK-004 resident self-service). */
    async byUser(userId: string) {
      if (!usingPostgres) return mem.residents.byUser(userId);
      const pool = await getPool();
      const res = await pool.query(
        `SELECT user_id AS "userId", unit_id AS "unitId"
         FROM residents WHERE user_id = $1`,
        [userId],
      );
      return res.rows;
    },

    /**
     * Enrolled residents for an organization: user identity joined with the
     * linked unit and property. Powers the management "Residents" list and
     * participation reporting.
     */
    async byOrgDetailed(organizationId: string): Promise<ResidentDetailRow[]> {
      if (!usingPostgres) {
        const links = mem.residents.byOrg(organizationId);
        return links
          .map((l) => {
            const u = mem.users.byId(l.userId);
            const unit = mem.units.byId(l.unitId);
            const property = unit ? mem.properties.byId(unit.propertyId) : null;
            if (!u || !unit) return null;
            return {
              userId: u.id,
              email: u.email,
              fullName: u.fullName,
              unitId: unit.id,
              unitLabel: unit.label,
              propertyName: property?.name ?? "",
              eligible: unit.eligible,
              residentAvailable: unit.residentAvailable,
              verified: true,
            };
          })
          .filter((r): r is NonNullable<typeof r> => r !== null);
      }
      const pool = await getPool();
      const res = await pool.query(
        `SELECT u.id AS "userId", u.email, u.full_name AS "fullName",
                un.id AS "unitId", un.label AS "unitLabel",
                p.name AS "propertyName", un.eligible AS "eligible",
                un.resident_available AS "residentAvailable", r.verified
         FROM residents r
         JOIN users u ON u.id = r.user_id
         JOIN units un ON un.id = r.unit_id
         JOIN properties p ON p.id = un.property_id
         WHERE r.organization_id = $1
         ORDER BY u.full_name`,
        [organizationId],
      );
      return res.rows;
    },

    /**
     * The caller's own resident enrollment (TASK-004): user identity joined
     * with each linked unit. Tenant-scoped by the caller's organization —
     * a link in another org can never leak through this path.
     */
    async byUserDetailed(userId: string, organizationId: string): Promise<ResidentDetailRow[]> {
      if (!usingPostgres) {
        const links = mem.residents.byUser(userId);
        return links
          .map((l) => {
            const u = mem.users.byId(l.userId);
            const unit = mem.units.byId(l.unitId);
            const property = unit ? mem.properties.byId(unit.propertyId) : null;
            if (!u || !unit || unit.organizationId !== organizationId) return null;
            return {
              userId: u.id,
              email: u.email,
              fullName: u.fullName,
              unitId: unit.id,
              unitLabel: unit.label,
              propertyName: property?.name ?? "",
              eligible: unit.eligible,
              residentAvailable: unit.residentAvailable,
              verified: true,
            };
          })
          .filter((r): r is NonNullable<typeof r> => r !== null);
      }
      const pool = await getPool();
      const res = await pool.query(
        `SELECT u.id AS "userId", u.email, u.full_name AS "fullName",
                un.id AS "unitId", un.label AS "unitLabel",
                p.name AS "propertyName", un.eligible AS "eligible",
                un.resident_available AS "residentAvailable", r.verified
         FROM residents r
         JOIN users u ON u.id = r.user_id
         JOIN units un ON un.id = r.unit_id
         JOIN properties p ON p.id = un.property_id
         WHERE r.user_id = $1 AND r.organization_id = $2
         ORDER BY un.label`,
        [userId, organizationId],
      );
      return res.rows;
    },
  },

  /**
   * Post-completion showing ratings (TASK-004/006). Ratings are participant
   * feedback — they never change showing state.
   */
  ratings: {
    async insert(e: {
      organizationId: string;
      showingId: string;
      raterUserId: string;
      raterRole: string;
      stars: number;
      comment: string | null;
    }): Promise<RatingRow> {
      if (!usingPostgres)
        return mem.ratings.insert({
          organizationId: e.organizationId,
          showingId: e.showingId,
          raterUserId: e.raterUserId,
          raterRole: e.raterRole,
          stars: e.stars,
          comment: e.comment,
        });
      const pool = await getPool();
      const res = await pool.query(
        `INSERT INTO showing_ratings
           (organization_id, showing_id, rater_user_id, rater_role, stars, comment)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id, organization_id AS "organizationId",
                   showing_id AS "showingId", rater_user_id AS "raterUserId",
                   rater_role AS "raterRole", stars, comment, created_at AS "createdAt"`,
        [e.organizationId, e.showingId, e.raterUserId, e.raterRole, e.stars, e.comment],
      );
      return res.rows[0];
    },

    async byShowing(showingId: string): Promise<RatingRow[]> {
      if (!usingPostgres) return mem.ratings.byShowing(showingId);
      const pool = await getPool();
      const res = await pool.query(
        `SELECT id, organization_id AS "organizationId",
                showing_id AS "showingId", rater_user_id AS "raterUserId",
                rater_role AS "raterRole", stars, comment, created_at AS "createdAt"
         FROM showing_ratings WHERE showing_id = $1 ORDER BY created_at`,
        [showingId],
      );
      return res.rows;
    },
  },

  pmsAdapters: {
    async byOrg(organizationId: string): Promise<PmsAdapterRow[]> {
      if (!usingPostgres) return mem.pmsAdapters.byOrg(organizationId);
      const pool = await getPool();
      const res = await pool.query(
        `SELECT id, organization_id AS "organizationId", provider,
                adapter_type AS "adapterType", config, status,
                last_sync_at AS "lastSyncAt",
                last_health_check_at AS "lastHealthCheckAt",
                health_status AS "healthStatus"
         FROM pms_adapters WHERE organization_id = $1`,
        [organizationId],
      );
      return res.rows;
    },

    /** Partial update of an adapter row (sync/health bookkeeping, TASK-008). */
    async update(
      id: string,
      patch: {
        status?: string;
        lastSyncAt?: string | null;
        lastHealthCheckAt?: string | null;
        healthStatus?: string | null;
        config?: Record<string, unknown>;
      },
    ): Promise<PmsAdapterRow | null> {
      if (!usingPostgres) return mem.pmsAdapters.update(id, patch);
      const pool = await getPool();
      const res = await pool.query(
        `UPDATE pms_adapters
         SET status = COALESCE($2, status),
             last_sync_at = COALESCE($3, last_sync_at),
             last_health_check_at = COALESCE($4, last_health_check_at),
             health_status = COALESCE($5, health_status),
             config = COALESCE($6, config)
         WHERE id = $1
         RETURNING id, organization_id AS "organizationId", provider,
                   adapter_type AS "adapterType", config, status,
                   last_sync_at AS "lastSyncAt",
                   last_health_check_at AS "lastHealthCheckAt",
                   health_status AS "healthStatus"`,
        [
          id,
          patch.status ?? null,
          patch.lastSyncAt ?? null,
          patch.lastHealthCheckAt ?? null,
          patch.healthStatus ?? null,
          patch.config ? JSON.stringify(patch.config) : null,
        ],
      );
      return res.rows[0] ?? null;
    },
  },

  securityEvents: {
    async insert(e: {
      organizationId: string | null;
      type: SecurityEvent["type"];
      actorUserId?: string | null;
      actorEmail?: string | null;
      detail?: string | null;
    }): Promise<SecurityEvent> {
      if (!usingPostgres) return mem.securityEvents.insert(e);
      const pool = await getPool();
      const res = await pool.query(
        `INSERT INTO security_events
           (organization_id, type, actor_user_id, actor_email, detail)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, organization_id AS "organizationId", type,
                   actor_user_id AS "actorUserId", actor_email AS "actorEmail",
                   detail, at`,
        [
          e.organizationId,
          e.type,
          e.actorUserId ?? null,
          e.actorEmail ?? null,
          e.detail ?? null,
        ],
      );
      return res.rows[0];
    },

    async list(opts: {
      organizationIds?: string[];
      type?: string;
      since?: string;
      limit?: number;
    } = {}): Promise<SecurityEvent[]> {
      if (!usingPostgres) return mem.securityEvents.list(opts);
      const pool = await getPool();
      const conditions: string[] = [];
      const params: unknown[] = [];
      if (opts.organizationIds?.length) {
        params.push(opts.organizationIds);
        // NULL-org events (unknown-email login attempts) are platform-wide
        // signals; include them whenever the caller is filtering at all.
        conditions.push(`(organization_id = ANY($${params.length}) OR organization_id IS NULL)`);
      }
      if (opts.type) {
        params.push(opts.type);
        conditions.push(`type = $${params.length}`);
      }
      if (opts.since) {
        params.push(opts.since);
        conditions.push(`at >= $${params.length}`);
      }
      const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
      const limit = Math.min(Math.max(opts.limit ?? 100, 1), 500);
      const res = await pool.query(
        `SELECT id, organization_id AS "organizationId", type,
                actor_user_id AS "actorUserId", actor_email AS "actorEmail",
                detail, at
         FROM security_events ${where}
         ORDER BY at DESC LIMIT ${limit}`,
        params,
      );
      return res.rows;
    },
  },

  // ---- Screening sandbox boundary (TASK-009) --------------------------------
  // Consent records, reports, and legal approvals — org-scoped on both
  // store paths. The ScreeningService (apps/web/lib/screening.ts) is the
  // only writer of requests; it fails closed without a consent record.
  screening: {
    async recordConsent(
      organizationId: string,
      prospectUserId: string,
      scopeText: string,
      recordedBy: string,
    ): Promise<ScreeningConsentRow> {
      if (!usingPostgres) {
        return mem.screeningConsents.insert(organizationId, prospectUserId, scopeText, recordedBy);
      }
      const pool = await getPool();
      const res = await pool.query(
        `INSERT INTO screening_consents
           (organization_id, prospect_user_id, scope_text, recorded_by)
         VALUES ($1, $2, $3, $4)
         RETURNING id, organization_id AS "organizationId",
                   prospect_user_id AS "prospectUserId", scope_text AS "scopeText",
                   consented_at AS "consentedAt", recorded_by AS "recordedBy"`,
        [organizationId, prospectUserId, scopeText, recordedBy],
      );
      return res.rows[0];
    },

    async latestConsent(
      organizationId: string,
      prospectUserId: string,
    ): Promise<ScreeningConsentRow | null> {
      if (!usingPostgres) {
        return mem.screeningConsents.latest(organizationId, prospectUserId);
      }
      const pool = await getPool();
      const res = await pool.query(
        `SELECT id, organization_id AS "organizationId",
                prospect_user_id AS "prospectUserId", scope_text AS "scopeText",
                consented_at AS "consentedAt", recorded_by AS "recordedBy"
         FROM screening_consents
         WHERE organization_id = $1 AND prospect_user_id = $2
         ORDER BY consented_at DESC LIMIT 1`,
        [organizationId, prospectUserId],
      );
      return res.rows[0] ?? null;
    },

    async consentsByOrg(organizationId: string): Promise<ScreeningConsentRow[]> {
      if (!usingPostgres) return mem.screeningConsents.byOrg(organizationId);
      const pool = await getPool();
      const res = await pool.query(
        `SELECT id, organization_id AS "organizationId",
                prospect_user_id AS "prospectUserId", scope_text AS "scopeText",
                consented_at AS "consentedAt", recorded_by AS "recordedBy"
         FROM screening_consents WHERE organization_id = $1
         ORDER BY consented_at DESC`,
        [organizationId],
      );
      return res.rows;
    },

    async saveReport(report: Omit<ScreeningReportRow, "requestedBy"> & {
      requestedBy?: string | null;
    }): Promise<ScreeningReportRow> {
      if (!usingPostgres) {
        return mem.screeningReports.insert({
          ...report,
          requestedBy: report.requestedBy ?? null,
        });
      }
      const pool = await getPool();
      const res = await pool.query(
        `INSERT INTO screening_reports
           (id, organization_id, prospect_user_id, mode, status, detail,
            requested_at, completed_at, requested_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         ON CONFLICT (id) DO UPDATE SET
           mode = EXCLUDED.mode, status = EXCLUDED.status,
           detail = EXCLUDED.detail, completed_at = EXCLUDED.completed_at
         RETURNING id, organization_id AS "organizationId",
                   prospect_user_id AS "prospectUserId", mode, status, detail,
                   requested_at AS "requestedAt", completed_at AS "completedAt",
                   requested_by AS "requestedBy"`,
        [
          report.id,
          report.organizationId,
          report.prospectUserId,
          report.mode,
          report.status,
          report.detail,
          report.requestedAt,
          report.completedAt,
          report.requestedBy ?? null,
        ],
      );
      return res.rows[0];
    },

    async reportById(
      organizationId: string,
      id: string,
    ): Promise<ScreeningReportRow | null> {
      if (!usingPostgres) return mem.screeningReports.byId(organizationId, id);
      const pool = await getPool();
      const res = await pool.query(
        `SELECT id, organization_id AS "organizationId",
                prospect_user_id AS "prospectUserId", mode, status, detail,
                requested_at AS "requestedAt", completed_at AS "completedAt",
                requested_by AS "requestedBy"
         FROM screening_reports
         WHERE organization_id = $1 AND id = $2`,
        [organizationId, id],
      );
      return res.rows[0] ?? null;
    },

    async recentReports(
      organizationId: string,
      limit = 25,
    ): Promise<ScreeningReportRow[]> {
      if (!usingPostgres) return mem.screeningReports.recent(organizationId, limit);
      const pool = await getPool();
      const safeLimit = Math.min(Math.max(limit, 1), 100);
      const res = await pool.query(
        `SELECT id, organization_id AS "organizationId",
                prospect_user_id AS "prospectUserId", mode, status, detail,
                requested_at AS "requestedAt", completed_at AS "completedAt",
                requested_by AS "requestedBy"
         FROM screening_reports WHERE organization_id = $1
         ORDER BY completed_at DESC LIMIT ${safeLimit}`,
        [organizationId],
      );
      return res.rows;
    },

    async recordLegalApproval(
      organizationId: string,
      approvedBy: string,
      notes: string,
    ): Promise<ScreeningLegalApprovalRow> {
      if (!usingPostgres) {
        return mem.screeningLegalApprovals.insert(organizationId, approvedBy, notes);
      }
      const pool = await getPool();
      const res = await pool.query(
        `INSERT INTO screening_legal_approvals (organization_id, approved_by, notes)
         VALUES ($1, $2, $3)
         RETURNING id, organization_id AS "organizationId",
                   approved_at AS "approvedAt", approved_by AS "approvedBy", notes`,
        [organizationId, approvedBy, notes],
      );
      return res.rows[0];
    },

    async latestLegalApproval(
      organizationId: string,
    ): Promise<ScreeningLegalApprovalRow | null> {
      if (!usingPostgres) return mem.screeningLegalApprovals.latest(organizationId);
      const pool = await getPool();
      const res = await pool.query(
        `SELECT id, organization_id AS "organizationId",
                approved_at AS "approvedAt", approved_by AS "approvedBy", notes
         FROM screening_legal_approvals
         WHERE organization_id = $1
         ORDER BY approved_at DESC LIMIT 1`,
        [organizationId],
      );
      return res.rows[0] ?? null;
    },
  },

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

    async remove(id: string) {
      if (!usingPostgres) return mem.showings.remove(id);
      const pool = await getPool();
      await pool.query(`DELETE FROM showings WHERE id = $1`, [id]);
    },

    async list(organizationId: string) {
      if (!usingPostgres) return mem.showings.list(organizationId);
      const pool = await getPool();
      const res = await pool.query(
        `SELECT id, organization_id AS "organizationId", unit_id AS "unitId",
                resident_user_id AS "residentUserId", prospect_user_id AS "prospectUserId",
                broker_user_id AS "brokerUserId", broker_required AS "brokerRequired",
                state, outcome, version, created_at AS "createdAt", updated_at AS "updatedAt"
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

    /**
     * CONFIRMED showings whose last state change is older than
     * `cutoffIso` and that have not received a reminder yet — the
     * /api/cron/reminders candidate set (TASK-010). Cross-org by design:
     * the cron is a system job, not a user request.
     */
    async listConfirmedStale(cutoffIso: string) {
      if (!usingPostgres) {
        return mem.showings
          .listAll()
          .filter(
            (s) =>
              s.state === "CONFIRMED" &&
              s.updatedAt < cutoffIso &&
              !mem.reminders.sent(s.id),
          );
      }
      const pool = await getPool();
      const res = await pool.query(
        `SELECT s.id, s.organization_id AS "organizationId", s.unit_id AS "unitId",
                s.resident_user_id AS "residentUserId", s.prospect_user_id AS "prospectUserId",
                s.broker_user_id AS "brokerUserId", s.broker_required AS "brokerRequired",
                s.state, s.outcome, s.version,
                s.created_at AS "createdAt", s.updated_at AS "updatedAt"
         FROM showings s
         WHERE s.state = 'CONFIRMED'
           AND s.updated_at < $1
           AND NOT EXISTS (SELECT 1 FROM reminder_sends r WHERE r.showing_id = s.id)`,
        [cutoffIso],
      );
      return res.rows;
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

    async findByIdempotencyKey(key: string, organizationId: string) {
      if (!usingPostgres) return mem.showingEvents.findByIdempotencyKey(key, organizationId);
      const pool = await getPool();
      const res = await pool.query(
        `SELECT id, showing_id AS "showingId", organization_id AS "organizationId",
                actor_user_id AS "actorUserId", actor_role AS "actorRole",
                transition, from_state AS "fromState", to_state AS "toState",
                idempotency_key AS "idempotencyKey", at
         FROM showing_events WHERE idempotency_key = $1 AND organization_id = $2 LIMIT 1`,
        [key, organizationId],
      );
      return res.rows[0] ?? null;
    },

    /**
     * Filtered cross-organization audit query for the Control Center.
     * organizationIds restricts the scope; the caller (Control Center
     * routes) is responsible for requiring the inssnapp_admin role.
     */
    async listFiltered(opts: {
      organizationIds?: string[];
      transition?: string;
      fromState?: string;
      toState?: string;
      since?: string;
      limit?: number;
    } = {}) {
      if (!usingPostgres) {
        let events: ShowingEvent[];
        if (opts.organizationIds) {
          events = opts.organizationIds.flatMap((id) => mem.showingEvents.list(id));
        } else {
          events = mem.orgs.list().flatMap((o) => mem.showingEvents.list(o.id));
        }
        if (opts.transition) events = events.filter((e) => e.transition === opts.transition);
        if (opts.fromState) events = events.filter((e) => e.fromState === opts.fromState);
        if (opts.toState) events = events.filter((e) => e.toState === opts.toState);
        if (opts.since) events = events.filter((e) => e.at >= (opts.since as string));
        events.sort((a, b) => (a.at < b.at ? 1 : -1));
        const limit = Math.min(Math.max(opts.limit ?? 100, 1), 500);
        return events.slice(0, limit);
      }
      const pool = await getPool();
      const conditions: string[] = [];
      const params: unknown[] = [];
      if (opts.organizationIds?.length) {
        params.push(opts.organizationIds);
        conditions.push(`organization_id = ANY($${params.length})`);
      }
      if (opts.transition) {
        params.push(opts.transition);
        conditions.push(`transition = $${params.length}`);
      }
      if (opts.fromState) {
        params.push(opts.fromState);
        conditions.push(`from_state = $${params.length}`);
      }
      if (opts.toState) {
        params.push(opts.toState);
        conditions.push(`to_state = $${params.length}`);
      }
      if (opts.since) {
        params.push(opts.since);
        conditions.push(`at >= $${params.length}`);
      }
      const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
      const limit = Math.min(Math.max(opts.limit ?? 100, 1), 500);
      const res = await pool.query(
        `SELECT id, showing_id AS "showingId", organization_id AS "organizationId",
                actor_user_id AS "actorUserId", actor_role AS "actorRole",
                transition, from_state AS "fromState", to_state AS "toState",
                idempotency_key AS "idempotencyKey", at
         FROM showing_events ${where}
         ORDER BY at DESC LIMIT ${limit}`,
        params,
      );
      return res.rows;
    },
  },

  /**
   * Reminder-send ledger (TASK-010 cron): one reminder per showing, ever.
   */
  reminders: {
    async sent(showingId: string) {
      if (!usingPostgres) return mem.reminders.sent(showingId);
      const pool = await getPool();
      const res = await pool.query(`SELECT 1 FROM reminder_sends WHERE showing_id = $1`, [
        showingId,
      ]);
      return res.rows.length > 0;
    },
    async markSent(showingId: string) {
      if (!usingPostgres) return mem.reminders.markSent(showingId);
      const pool = await getPool();
      await pool.query(
        `INSERT INTO reminder_sends (showing_id) VALUES ($1) ON CONFLICT (showing_id) DO NOTHING`,
        [showingId],
      );
    },
  },

  // ---- Signup invitations (Phase 1) -----------------------------------------
  invites: {
    async create(input: {
      organizationId: string;
      unitId: string | null;
      role: "resident" | "prospect" | "broker";
      email?: string | null;
      createdByUserId: string;
      ttlHours?: number;
    }): Promise<InviteRow> {
      if (!usingPostgres) return mem.invites.create(input);
      const pool = await getPool();
      // Retry on the (unlikely) code collision — UNIQUE (organization_id, code).
      for (let i = 0; i < 10; i++) {
        const code = randomInviteCode();
        try {
          const res = await pool.query(
            `INSERT INTO invites
               (organization_id, code, unit_id, role, email, created_by_user_id, expires_at)
             VALUES ($1, $2, $3, $4, $5, $6, now() + make_interval(hours => $7))
             RETURNING ${inviteColumns()}`,
            [
              input.organizationId,
              code,
              input.unitId,
              input.role,
              input.email?.trim().toLowerCase() || null,
              input.createdByUserId,
              input.ttlHours ?? 72,
            ],
          );
          return res.rows[0];
        } catch (err: any) {
          if (err?.code !== "23505") throw err;
        }
      }
      throw new Error("invites.create: could not generate a unique code");
    },
    async byCode(organizationId: string, code: string): Promise<InviteRow | null> {
      if (!usingPostgres) return mem.invites.byCode(organizationId, code);
      const pool = await getPool();
      const res = await pool.query(
        `SELECT ${inviteColumns()} FROM invites
         WHERE organization_id = $1 AND code = $2 LIMIT 1`,
        [organizationId, code.trim().toUpperCase()],
      );
      return res.rows[0] ?? null;
    },
    /** Public invite validation (signup page): code is unguessable; no org needed. */
    async byCodeAnyOrg(code: string): Promise<InviteRow | null> {
      if (!usingPostgres) return mem.invites.byCodeAnyOrg(code);
      const pool = await getPool();
      const res = await pool.query(
        `SELECT ${inviteColumns()} FROM invites WHERE code = $1 LIMIT 1`,
        [code.trim().toUpperCase()],
      );
      return res.rows[0] ?? null;
    },
    async byOrg(organizationId: string): Promise<InviteRow[]> {
      if (!usingPostgres) return mem.invites.byOrg(organizationId);
      const pool = await getPool();
      const res = await pool.query(
        `SELECT ${inviteColumns()} FROM invites
         WHERE organization_id = $1 ORDER BY created_at DESC`,
        [organizationId],
      );
      return res.rows;
    },
    async markUsed(id: string, userId: string): Promise<InviteRow | null> {
      if (!usingPostgres) return mem.invites.markUsed(id, userId);
      const pool = await getPool();
      const res = await pool.query(
        `UPDATE invites SET used_at = now(), used_by_user_id = $2
         WHERE id = $1 AND used_at IS NULL
         RETURNING ${inviteColumns()}`,
        [id, userId],
      );
      return res.rows[0] ?? null;
    },
  },

  // ---- Email verification codes (Phase 2/3; free, no SMS) -------------------
  verificationCodes: {
    async issue(organizationId: string, email: string): Promise<VerificationCodeRow> {
      if (!usingPostgres) return mem.verificationCodes.issue(organizationId, email);
      const pool = await getPool();
      const target = email.trim().toLowerCase();
      await pool.query(
        `UPDATE verification_codes SET used_at = now()
         WHERE organization_id = $1 AND email = $2 AND used_at IS NULL`,
        [organizationId, target],
      );
      const code = String(Math.floor(100000 + Math.random() * 900000));
      const res = await pool.query(
        `INSERT INTO verification_codes (organization_id, email, code, purpose, expires_at)
         VALUES ($1, $2, $3, 'signup', now() + make_interval(mins => 15))
         RETURNING ${verificationCodeColumns()}`,
        [organizationId, target, code],
      );
      return res.rows[0];
    },
    async consume(
      organizationId: string,
      email: string,
      code: string,
    ): Promise<{ ok: true; record: VerificationCodeRow } | { ok: false; error: "not_found" | "expired" | "locked" }> {
      if (!usingPostgres) return mem.verificationCodes.consume(organizationId, email, code);
      const pool = await getPool();
      const target = email.trim().toLowerCase();
      const res = await pool.query(
        `SELECT ${verificationCodeColumns()} FROM verification_codes
         WHERE organization_id = $1 AND email = $2 AND used_at IS NULL
         ORDER BY created_at DESC LIMIT 1`,
        [organizationId, target],
      );
      const vc = res.rows[0] as VerificationCodeRow | undefined;
      if (!vc || vc.code !== code.trim()) {
        if (vc) {
          await pool.query(
            `UPDATE verification_codes SET attempts = attempts + 1,
               used_at = CASE WHEN attempts + 1 >= 5 THEN now() ELSE used_at END
             WHERE id = $1`,
            [vc.id],
          );
        }
        return { ok: false, error: "not_found" };
      }
      if (new Date(vc.expiresAt).getTime() <= Date.now()) {
        await pool.query(`UPDATE verification_codes SET used_at = now() WHERE id = $1`, [vc.id]);
        return { ok: false, error: "expired" };
      }
      if (vc.attempts >= 5) return { ok: false, error: "locked" };
      await pool.query(`UPDATE verification_codes SET used_at = now() WHERE id = $1`, [vc.id]);
      return { ok: true, record: vc };
    },
  },

  // ---- Lead dispositions (Phase 6) -------------------------------------------
  leadDispositions: {
    async get(showingId: string): Promise<LeadDispositionRow | null> {
      if (!usingPostgres) return mem.leadDispositions.get(showingId);
      const pool = await getPool();
      const res = await pool.query(
        `SELECT ${leadDispositionColumns()} FROM lead_dispositions WHERE showing_id = $1`,
        [showingId],
      );
      return res.rows[0] ?? null;
    },
    async byOrg(organizationId: string): Promise<LeadDispositionRow[]> {
      if (!usingPostgres) return mem.leadDispositions.byOrg(organizationId);
      const pool = await getPool();
      const res = await pool.query(
        `SELECT ${leadDispositionColumns()} FROM lead_dispositions
         WHERE organization_id = $1 ORDER BY updated_at DESC`,
        [organizationId],
      );
      return res.rows;
    },
    async set(
      showingId: string,
      organizationId: string,
      disposition: LeadDisposition,
      decidedByUserId: string | null,
    ): Promise<LeadDispositionRow> {
      if (!usingPostgres) return mem.leadDispositions.set(showingId, organizationId, disposition, decidedByUserId);
      const pool = await getPool();
      const res = await pool.query(
        `INSERT INTO lead_dispositions
           (showing_id, organization_id, disposition, decided_by_user_id, decided_at, updated_at)
         VALUES ($1, $2, $3, $4,
           CASE WHEN $3 = 'pending' THEN NULL ELSE now() END, now())
         ON CONFLICT (showing_id) DO UPDATE SET
           disposition = EXCLUDED.disposition,
           decided_by_user_id = EXCLUDED.decided_by_user_id,
           decided_at = CASE WHEN EXCLUDED.disposition = 'pending'
             THEN lead_dispositions.decided_at ELSE now() END,
           updated_at = now()
         RETURNING ${leadDispositionColumns()}`,
        [showingId, organizationId, disposition, decidedByUserId],
      );
      return res.rows[0];
    },
  },

  // ---- Broker tier profiles (Phase 7) ------------------------------------------
  brokerProfiles: {
    async get(userId: string): Promise<BrokerProfileRow | null> {
      if (!usingPostgres) return mem.brokerProfiles.get(userId);
      const pool = await getPool();
      const res = await pool.query(
        `SELECT ${brokerProfileColumns()} FROM broker_profiles WHERE user_id = $1`,
        [userId],
      );
      return res.rows[0] ?? null;
    },
    /** Get or create (new brokers start on trial). */
    async getOrCreate(userId: string, organizationId: string): Promise<BrokerProfileRow> {
      if (!usingPostgres) return mem.brokerProfiles.getOrCreate(userId, organizationId);
      const pool = await getPool();
      const res = await pool.query(
        `INSERT INTO broker_profiles (user_id, organization_id, tier, trial_ends_at)
         VALUES ($1, $2, 'trial', now() + make_interval(days => 7))
         ON CONFLICT (user_id) DO NOTHING
         RETURNING ${brokerProfileColumns()}`,
        [userId, organizationId],
      );
      if (res.rows[0]) return res.rows[0];
      const existing = await pool.query(
        `SELECT ${brokerProfileColumns()} FROM broker_profiles WHERE user_id = $1`,
        [userId],
      );
      return existing.rows[0];
    },
    async setTier(
      userId: string,
      organizationId: string,
      tier: "trial" | "basic" | "pro",
    ): Promise<BrokerProfileRow> {
      if (!usingPostgres) return mem.brokerProfiles.setTier(userId, organizationId, tier);
      const pool = await getPool();
      const res = await pool.query(
        `INSERT INTO broker_profiles
           (user_id, organization_id, tier, tier_started_at, trial_ends_at, updated_at)
         VALUES ($1, $2, $3, now(),
           CASE WHEN $3 = 'trial' THEN now() + make_interval(days => 7) ELSE NULL END, now())
         ON CONFLICT (user_id) DO UPDATE SET
           tier = EXCLUDED.tier,
           tier_started_at = now(),
           trial_ends_at = CASE WHEN EXCLUDED.tier = 'trial'
             THEN now() + make_interval(days => 7) ELSE NULL END,
           updated_at = now()
         RETURNING ${brokerProfileColumns()}`,
        [userId, organizationId, tier],
      );
      return res.rows[0];
    },
  },
};
