import type { Showing, ShowingEvent, ShowingState } from "@inssnapp/engine";
import { DEMO_TOTP_SECRET } from "./demo";

/**
 * In-memory data store implementing the engine's persistence boundary.
 *
 * This is the MVP/demo foundation. The production implementation (TASK-002)
 * will provide a PostgreSQL-backed store with identical semantics:
 * organization scoping, optimistic locking, idempotent events, audit trail.
 *
 * State lives on globalThis so it survives Next.js dev-mode hot reloads.
 */

export interface User {
  id: string;
  organizationId: string;
  email: string;
  fullName: string;
  passwordHash: string;
  role: "management" | "resident" | "prospect" | "broker" | "inssnapp_admin";
  mfaEnabled: boolean;
  /** Base32 TOTP secret; null until enrolled. Never log or expose. */
  mfaSecret: string | null;
}

export interface Property {
  id: string;
  organizationId: string;
  name: string;
  address: string;
  /** Vendor-stable external id from the PMS sync (TASK-008); null for manually created properties. */
  pmsExternalId: string | null;
}

export interface Unit {
  id: string;
  organizationId: string;
  propertyId: string;
  label: string;
  pmsExternalId: string | null;
  eligible: boolean;
  residentAvailable: boolean;
}

export interface Org {
  id: string;
  name: string;
}

export interface ResidentLink {
  userId: string;
  unitId: string;
}

/** Post-completion rating of a showing by a participant (TASK-004/006). */
export interface ShowingRating {
  id: string;
  organizationId: string;
  showingId: string;
  raterUserId: string;
  raterRole: string;
  stars: number;
  comment: string | null;
  createdAt: string;
}

export interface PmsAdapter {
  id: string;
  organizationId: string;
  /** Vendor name for display: 'yardi' | 'entrata' | … */
  provider: string;
  /**
   * Which implementation backs this row: 'sandbox' today. Real vendor
   * adapters register here as commercial/API access permits (TASK-008).
   */
  adapterType: string;
  /** Adapter config JSON (vendor/dataset knobs — never raw secrets). */
  config: Record<string, unknown>;
  /** 'sandbox' | 'connected' | 'error' | 'not_connected' */
  status: string;
  lastSyncAt: string | null;
  lastHealthCheckAt: string | null;
  /** 'ok' | 'error' | null — outcome of the last health check. */
  healthStatus: string | null;
}

export interface SecurityEvent {
  id: string;
  /** NULL when the event cannot be attributed to an organization (unknown-email login attempt). */
  organizationId: string | null;
  type: "login_failed" | "login_succeeded" | "login_denied" | "mfa_failed" | "session_revoked";
  actorUserId: string | null;
  actorEmail: string | null;
  detail: string | null;
  at: string;
}

/**
 * Prospect screening consent record (TASK-009). A screening request is
 * created only when one of these exists — requesting without it fails
 * closed (scope §4: consent flows are a production prerequisite).
 */
export interface ScreeningConsent {
  id: string;
  organizationId: string;
  prospectUserId: string;
  /** The exact consent language the prospect accepted. */
  scopeText: string;
  consentedAt: string;
  /** User id that recorded the consent (prospect themselves or staff). */
  recordedBy: string;
}

/** One screening report record (sandbox fixture until the production gate opens). */
export interface ScreeningReport {
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

/** Recorded legal/compliance approval — the second half of the production gate. */
export interface ScreeningLegalApproval {
  id: string;
  organizationId: string;
  approvedAt: string;
  approvedBy: string;
  notes: string;
}

// DEV-ONLY demo credentials. argon2id hash of the password "pw", generated
// at seed time for TASK-002 (see packages/auth/src/password.ts).
// The admin TOTP secret lives in ./demo.ts (dev-only fixed secret so local
// MFA login works); real users enroll their own secret.
const DEMO_HASH =
  "$argon2id$v=19$m=19456,p=1,t=2$OYHMuHyTLMC4R0bIny3QRA$q9Lu4q9xPqFR1KxuHvns52eTycXSLUe4uKZu3Fvyqfg";

interface StoreData {
  orgs: Org[];
  users: User[];
  properties: Property[];
  units: Unit[];
  residents: ResidentLink[];
  pmsAdapters: PmsAdapter[];
  securityEvents: SecurityEvent[];
  /** Screening consent records (org-scoped; TASK-009). */
  screeningConsents: ScreeningConsent[];
  /** Screening report records (org-scoped; TASK-009). */
  screeningReports: ScreeningReport[];
  /** Recorded legal approvals for production screening (TASK-009). */
  screeningLegalApprovals: ScreeningLegalApproval[];
  showings: Map<string, Showing>;
  events: ShowingEvent[];
  ratings: ShowingRating[];
  /** Showing ids that already received a reminder (TASK-010 cron). */
  reminderSends: Set<string>;
  sessions: Map<string, { tokenHash: string; userId: string; organizationId: string; expiresAt: number }>;
  seq: number;
}

function seed(): StoreData {
  return {
    orgs: [
      { id: "org_1", name: "Skyline Residential Group" },
      { id: "org_2", name: "Harbor Point Management" },
    ],
    users: [
      { id: "u_mgmt", organizationId: "org_1", email: "manager@inssnapp.demo", fullName: "Morgan Reyes", passwordHash: DEMO_HASH, role: "management", mfaEnabled: false, mfaSecret: null },
      { id: "u_admin", organizationId: "org_1", email: "admin@inssnapp.demo", fullName: "Avery Chen", passwordHash: DEMO_HASH, role: "inssnapp_admin", mfaEnabled: true, mfaSecret: DEMO_TOTP_SECRET },
      { id: "u_resident", organizationId: "org_1", email: "resident@inssnapp.demo", fullName: "Jordan Lee", passwordHash: DEMO_HASH, role: "resident", mfaEnabled: false, mfaSecret: null },
      { id: "u_prospect", organizationId: "org_1", email: "prospect@inssnapp.demo", fullName: "Taylor Brooks", passwordHash: DEMO_HASH, role: "prospect", mfaEnabled: false, mfaSecret: null },
      { id: "u_broker", organizationId: "org_1", email: "broker@inssnapp.demo", fullName: "Casey Kim", passwordHash: DEMO_HASH, role: "broker", mfaEnabled: false, mfaSecret: null },
      { id: "u_mgmt2", organizationId: "org_2", email: "manager2@inssnapp.demo", fullName: "Riley Park", passwordHash: DEMO_HASH, role: "management", mfaEnabled: false, mfaSecret: null },
    ],
    properties: [
      { id: "prop_1", organizationId: "org_1", name: "The Alder", address: "120 Alder St, Seattle, WA", pmsExternalId: null },
      { id: "prop_2", organizationId: "org_1", name: "Maple Court", address: "88 Maple Ave, Bellevue, WA", pmsExternalId: null },
      { id: "prop_3", organizationId: "org_2", name: "Harbor Lofts", address: "1 Harbor Blvd, Tacoma, WA", pmsExternalId: null },
    ],
    units: [
      { id: "unit_1", organizationId: "org_1", propertyId: "prop_1", label: "4B", pmsExternalId: "YRD-10042", eligible: true, residentAvailable: true },
      { id: "unit_2", organizationId: "org_1", propertyId: "prop_1", label: "2A", pmsExternalId: "YRD-10031", eligible: true, residentAvailable: true },
      { id: "unit_3", organizationId: "org_1", propertyId: "prop_2", label: "1C", pmsExternalId: "ENT-20011", eligible: true, residentAvailable: false },
      { id: "unit_4", organizationId: "org_2", propertyId: "prop_3", label: "PH1", pmsExternalId: "APP-30007", eligible: true, residentAvailable: true },
    ],
    // Verified resident ↔ unit links (TASK-003; mirrors the `residents` table).
    residents: [
      { userId: "u_resident", unitId: "unit_1" },
      { userId: "u_resident", unitId: "unit_2" },
    ],
    // PMS adapter rows (TASK-007 boundary, TASK-008 working sandbox).
    // org_1 has a sandbox adapter registered (vendor fixture: yardi);
    // org_2 has none — the integrations status API reports this honestly
    // instead of hardcoding "connected".
    pmsAdapters: [
      {
        id: "pms_1",
        organizationId: "org_1",
        provider: "yardi",
        adapterType: "sandbox",
        config: { vendor: "yardi", dataset: "sandbox-default" },
        status: "sandbox",
        lastSyncAt: null,
        lastHealthCheckAt: null,
        healthStatus: null,
      },
    ],
    securityEvents: [],
    screeningConsents: [],
    screeningReports: [],
    screeningLegalApprovals: [],
    showings: new Map(),
    events: [],
    ratings: [],
    reminderSends: new Set(),
    sessions: new Map(),
    seq: 100,
  };
}

/**
 * Production seed — TASK-010 hardening.
 *
 * Demo credentials are publicly documented (password "pw", fixed demo TOTP
 * secret in ./demo.ts), so they must never exist on a production instance.
 * This seeds NO demo users/orgs/data. Instead, a single bootstrap
 * administrator is created when ALL of these are set:
 *   INSSNAPP_BOOTSTRAP_ADMIN_EMAIL        — admin email
 *   INSSNAPP_BOOTSTRAP_ADMIN_PASSWORD_HASH — argon2id hash of the password
 *     (generate locally; the plaintext password must never be stored here)
 *   INSSNAPP_BOOTSTRAP_ADMIN_TOTP_SECRET — base32 TOTP secret, enrolled in
 *     an authenticator app before first login
 * When any is missing, zero users exist and nobody can log in — fail
 * closed. Real user management belongs on PostgreSQL (TASK-002); the
 * in-memory store is a dev fallback.
 */
function seedProduction(): StoreData {
  const data: StoreData = {
    orgs: [],
    users: [],
    properties: [],
    units: [],
    residents: [],
    pmsAdapters: [],
    securityEvents: [],
    screeningConsents: [],
    screeningReports: [],
    screeningLegalApprovals: [],
    showings: new Map(),
    events: [],
    ratings: [],
    reminderSends: new Set(),
    sessions: new Map(),
    seq: 100,
  };

  const email = process.env.INSSNAPP_BOOTSTRAP_ADMIN_EMAIL?.trim().toLowerCase();
  const passwordHash = process.env.INSSNAPP_BOOTSTRAP_ADMIN_PASSWORD_HASH?.trim();
  const totpSecret = process.env.INSSNAPP_BOOTSTRAP_ADMIN_TOTP_SECRET?.trim();
  if (!email || !passwordHash || !totpSecret) {
    console.warn(
      "[inssnapp] production: INSSNAPP_BOOTSTRAP_ADMIN_{EMAIL,PASSWORD_HASH,TOTP_SECRET} " +
        "not all set — no users seeded; login is disabled until they are.",
    );
    return data;
  }
  if (!passwordHash.startsWith("$argon2id$")) {
    console.warn(
      "[inssnapp] production: INSSNAPP_BOOTSTRAP_ADMIN_PASSWORD_HASH is not an " +
        "argon2id hash — refusing to seed the bootstrap admin.",
    );
    return data;
  }

  const org: Org = { id: "org_bootstrap", name: "Pilot Organization" };
  data.orgs.push(org);
  data.users.push({
    id: "u_bootstrap_admin",
    organizationId: org.id,
    email,
    fullName: "Bootstrap Admin",
    passwordHash,
    role: "inssnapp_admin",
    mfaEnabled: true,
    mfaSecret: totpSecret,
  });
  console.warn(
    `[inssnapp] production: seeded bootstrap admin ${email} (MFA required). ` +
      "Rotate to PostgreSQL-backed user management before the pilot.",
  );
  return data;
}

const g = globalThis as typeof globalThis & { __inssnappStore?: StoreData };
if (!g.__inssnappStore) {
  // TASK-010 hardening: the well-known demo accounts (public password
  // "pw", public demo TOTP secret) are NEVER seeded in production — no
  // override. A single bootstrap administrator is created from environment
  // variables instead (all three required, or no users exist at all).
  g.__inssnappStore =
    process.env.NODE_ENV === "production" ? seedProduction() : seed();
}
const db = g.__inssnappStore;

function newId(prefix: string): string {
  db.seq += 1;
  return `${prefix}_${db.seq.toString(36)}${Date.now().toString(36)}`;
}

export const store = {
  orgs: {
    list(): Org[] {
      return db.orgs;
    },
    get(id: string): Org | null {
      return db.orgs.find((o) => o.id === id) ?? null;
    },
  },

  residents: {
    byUnit(unitId: string): ResidentLink | null {
      return db.residents.find((r) => r.unitId === unitId) ?? null;
    },
    /** All resident ↔ unit links for one user (TASK-004: resident self-service). */
    byUser(userId: string): ResidentLink[] {
      return db.residents.filter((r) => r.userId === userId);
    },
    /** Links whose unit belongs to the given organization. */
    byOrg(organizationId: string): { userId: string; unitId: string }[] {
      const unitIds = new Set(
        db.units.filter((u) => u.organizationId === organizationId).map((u) => u.id),
      );
      return db.residents.filter((r) => unitIds.has(r.unitId));
    },
    /** Idempotent resident ↔ unit link (TASK-008 roster sync). Returns true when newly created. */
    link(userId: string, unitId: string): boolean {
      if (db.residents.some((r) => r.userId === userId && r.unitId === unitId)) return false;
      db.residents.push({ userId, unitId });
      return true;
    },
  },

  pmsAdapters: {
    byOrg(organizationId: string): PmsAdapter[] {
      return db.pmsAdapters.filter((a) => a.organizationId === organizationId);
    },
    /** Partial update of an adapter row (sync/health bookkeeping). */
    update(
      id: string,
      patch: Partial<Pick<PmsAdapter, "status" | "lastSyncAt" | "lastHealthCheckAt" | "healthStatus" | "config">>,
    ): PmsAdapter | null {
      const idx = db.pmsAdapters.findIndex((a) => a.id === id);
      if (idx === -1) return null;
      db.pmsAdapters[idx] = { ...db.pmsAdapters[idx], ...patch };
      return db.pmsAdapters[idx];
    },
  },

  securityEvents: {
    insert(e: {
      organizationId: string | null;
      type: SecurityEvent["type"];
      actorUserId?: string | null;
      actorEmail?: string | null;
      detail?: string | null;
    }): SecurityEvent {
      const event: SecurityEvent = {
        id: newId("sec"),
        at: new Date().toISOString(),
        organizationId: e.organizationId,
        type: e.type,
        actorUserId: e.actorUserId ?? null,
        actorEmail: e.actorEmail ?? null,
        detail: e.detail ?? null,
      };
      db.securityEvents.push(event);
      return event;
    },
    list(opts: {
      organizationIds?: string[];
      type?: string;
      since?: string;
      limit?: number;
    }): SecurityEvent[] {
      let events = [...db.securityEvents];
      if (opts.organizationIds) {
        const ids = new Set(opts.organizationIds);
        // NULL-org events (e.g. unknown-email login attempts) are included
        // whenever the caller is filtering at all — they are platform-wide
        // signals, not attributable to a single organization.
        events = events.filter((e) => e.organizationId === null || ids.has(e.organizationId));
      }
      if (opts.type) events = events.filter((e) => e.type === opts.type);
      if (opts.since) events = events.filter((e) => e.at >= opts.since!);
      events.sort((a, b) => (a.at < b.at ? 1 : -1));
      if (opts.limit) events = events.slice(0, opts.limit);
      return events;
    },
  },

  // ---- Screening sandbox boundary (TASK-009) ---------------------------------
  // Consent records, screening reports, and legal approvals — all
  // org-scoped. The service layer (apps/web/lib/screening.ts) refuses to
  // create a screening request without a consent record for the org+prospect.
  screeningConsents: {
    insert(
      organizationId: string,
      prospectUserId: string,
      scopeText: string,
      recordedBy: string,
    ): ScreeningConsent {
      const consent: ScreeningConsent = {
        id: newId("scr_c"),
        organizationId,
        prospectUserId,
        scopeText,
        consentedAt: new Date().toISOString(),
        recordedBy,
      };
      db.screeningConsents.push(consent);
      return consent;
    },
    /** Most recent consent for this prospect in this organization (org-scoped). */
    latest(organizationId: string, prospectUserId: string): ScreeningConsent | null {
      const mine = db.screeningConsents.filter(
        (c) => c.organizationId === organizationId && c.prospectUserId === prospectUserId,
      );
      return mine.length ? mine[mine.length - 1] : null;
    },
    byOrg(organizationId: string): ScreeningConsent[] {
      return db.screeningConsents.filter((c) => c.organizationId === organizationId);
    },
  },

  screeningReports: {
    insert(report: Omit<ScreeningReport, "id"> & { id?: string }): ScreeningReport {
      const row: ScreeningReport = { ...report, id: report.id ?? newId("scr_r") };
      // Idempotent by deterministic id (sandbox adapter re-requests).
      const idx = db.screeningReports.findIndex((r) => r.id === row.id);
      if (idx === -1) db.screeningReports.push(row);
      else db.screeningReports[idx] = row;
      return row;
    },
    byId(organizationId: string, id: string): ScreeningReport | null {
      return (
        db.screeningReports.find((r) => r.organizationId === organizationId && r.id === id) ??
        null
      );
    },
    recent(organizationId: string, limit = 25): ScreeningReport[] {
      return db.screeningReports
        .filter((r) => r.organizationId === organizationId)
        .slice(-limit)
        .reverse();
    },
  },

  screeningLegalApprovals: {
    insert(organizationId: string, approvedBy: string, notes: string): ScreeningLegalApproval {
      const approval: ScreeningLegalApproval = {
        id: newId("scr_a"),
        organizationId,
        approvedAt: new Date().toISOString(),
        approvedBy,
        notes,
      };
      db.screeningLegalApprovals.push(approval);
      return approval;
    },
    latest(organizationId: string): ScreeningLegalApproval | null {
      const mine = db.screeningLegalApprovals.filter(
        (a) => a.organizationId === organizationId,
      );
      return mine.length ? mine[mine.length - 1] : null;
    },
  },

  users: {
    byEmail(email: string): User | null {
      return db.users.find((u) => u.email.toLowerCase() === email.toLowerCase()) ?? null;
    },
    byId(id: string): User | null {
      return db.users.find((u) => u.id === id) ?? null;
    },
    byOrg(organizationId: string): User[] {
      return db.users.filter((u) => u.organizationId === organizationId);
    },
  },

  properties: {
    byOrg(organizationId: string): Property[] {
      return db.properties.filter((p) => p.organizationId === organizationId);
    },
    byId(id: string): Property | null {
      return db.properties.find((p) => p.id === id) ?? null;
    },
    /** Find a property by its vendor external id within one organization (TASK-008 sync). */
    byExternalId(organizationId: string, pmsExternalId: string): Property | null {
      return (
        db.properties.find(
          (p) => p.organizationId === organizationId && p.pmsExternalId === pmsExternalId,
        ) ?? null
      );
    },
    create(
      organizationId: string,
      name: string,
      address: string,
      opts: { pmsExternalId?: string | null } = {},
    ): Property {
      const property: Property = {
        id: newId("prop"),
        organizationId,
        name,
        address,
        pmsExternalId: opts.pmsExternalId ?? null,
      };
      db.properties.push(property);
      return property;
    },
    patch(
      id: string,
      patch: Partial<Pick<Property, "name" | "address" | "pmsExternalId">>,
    ): Property | null {
      const idx = db.properties.findIndex((p) => p.id === id);
      if (idx === -1) return null;
      db.properties[idx] = { ...db.properties[idx], ...patch };
      return db.properties[idx];
    },
    remove(id: string): boolean {
      const idx = db.properties.findIndex((p) => p.id === id);
      if (idx === -1) return false;
      db.properties.splice(idx, 1);
      // Keep referential sanity: units of a deleted property are removed too.
      for (let i = db.units.length - 1; i >= 0; i--) {
        if (db.units[i].propertyId === id) db.units.splice(i, 1);
      }
      return true;
    },
  },

  units: {
    byOrg(organizationId: string): Unit[] {
      return db.units.filter((u) => u.organizationId === organizationId);
    },
    byId(id: string): Unit | null {
      return db.units.find((u) => u.id === id) ?? null;
    },
    /** Find a unit by vendor external id within one property (TASK-008 sync). */
    byExternalId(organizationId: string, propertyId: string, pmsExternalId: string): Unit | null {
      return (
        db.units.find(
          (u) =>
            u.organizationId === organizationId &&
            u.propertyId === propertyId &&
            u.pmsExternalId === pmsExternalId,
        ) ?? null
      );
    },
    create(
      organizationId: string,
      propertyId: string,
      label: string,
      opts: { eligible?: boolean; residentAvailable?: boolean; pmsExternalId?: string | null } = {},
    ): Unit {
      const unit: Unit = {
        id: newId("unit"),
        organizationId,
        propertyId,
        label,
        pmsExternalId: opts.pmsExternalId ?? null,
        eligible: opts.eligible ?? true,
        residentAvailable: opts.residentAvailable ?? false,
      };
      db.units.push(unit);
      return unit;
    },
    patch(
      id: string,
      patch: Partial<Pick<Unit, "label" | "eligible" | "residentAvailable">> & {
        pmsExternalId?: string;
      },
    ): Unit | null {
      const idx = db.units.findIndex((u) => u.id === id);
      if (idx === -1) return null;
      db.units[idx] = { ...db.units[idx], ...patch };
      return db.units[idx];
    },
    remove(id: string): boolean {
      const idx = db.units.findIndex((u) => u.id === id);
      if (idx === -1) return false;
      db.units.splice(idx, 1);
      return true;
    },
  },

  // ---- Showing engine persistence (used by the engine) ----
  showings: {
    get(id: string): Showing | null {
      return db.showings.get(id) ?? null;
    },
    create(unitId: string, residentUserId: string, organizationId: string, brokerRequired = false): Showing {
      const showing: Showing = {
        id: newId("sh"),
        organizationId,
        unitId,
        residentUserId,
        prospectUserId: null,
        brokerUserId: null,
        brokerRequired,
        state: "AVAILABLE",
        outcome: null,
        version: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      db.showings.set(showing.id, showing);
      return showing;
    },
    list(organizationId: string): Showing[] {
      return [...db.showings.values()].filter((s) => s.organizationId === organizationId);
    },
    /** All showings, every org — for system jobs (the reminder cron), not user requests. */
    listAll(): Showing[] {
      return [...db.showings.values()];
    },
    remove(id: string): void {
      db.showings.delete(id);
    },
    byUnitActive(unitId: string): Showing | null {
      const active = ["REQUESTED", "RESIDENT_ACCEPTED", "BROKER_GATE", "CONFIRMED", "IN_PROGRESS", "COMPLETED"] as ShowingState[];
      return (
        [...db.showings.values()].find(
          (s) => s.unitId === unitId && active.includes(s.state),
        ) ?? null
      );
    },
    set(id: string, updated: Showing): void {
      db.showings.set(id, updated);
    },
  },

  showingEvents: {
    insert(e: Omit<ShowingEvent, "id" | "at">): ShowingEvent {
      // Mirror the Postgres UNIQUE (organization_id, idempotency_key)
      // constraint so the in-memory path has identical idempotency
      // semantics under concurrency (TASK-010). The duplicate throws a
      // 23505-like error that the /api/showings/request race-replay logic
      // already handles.
      const dup = db.events.some(
        (x) => x.organizationId === e.organizationId && x.idempotencyKey === e.idempotencyKey,
      );
      if (dup) {
        const err = new Error(
          'duplicate key value violates unique constraint "showing_events_organization_id_idempotency_key_key"',
        ) as Error & { code: string };
        err.code = "23505";
        throw err;
      }
      const event: ShowingEvent = { ...e, id: newId("evt"), at: new Date().toISOString() };
      db.events.push(event);
      return event;
    },
    list(organizationId: string): ShowingEvent[] {
      return db.events
        .filter((e) => e.organizationId === organizationId)
        .sort((a, b) => (a.at < b.at ? 1 : -1));
    },
    /**
     * Idempotency lookups are organization-scoped (TASK-010): keys are
     * namespaced per org, matching the UNIQUE (organization_id,
     * idempotency_key) constraint. Callers pass the actor's org.
     */
    findByIdempotencyKey(key: string, organizationId?: string): ShowingEvent | null {
      return (
        db.events.find(
          (e) =>
            e.idempotencyKey === key &&
            (organizationId === undefined || e.organizationId === organizationId),
        ) ?? null
      );
    },
  },

  /**
   * Post-completion showing ratings (TASK-004/006). Ratings never change
   * showing state — the engine remains the sole authority on transitions.
   * One rating per rater per showing (409 on duplicate at the route layer).
   */
  ratings: {
    insert(e: Omit<ShowingRating, "id" | "createdAt">): ShowingRating {
      const rating: ShowingRating = {
        ...e,
        id: newId("rtg"),
        createdAt: new Date().toISOString(),
      };
      db.ratings.push(rating);
      return rating;
    },
    byShowing(showingId: string): ShowingRating[] {
      return db.ratings.filter((r) => r.showingId === showingId);
    },
  },

  sessions: {
    create(record: {
      tokenHash: string;
      userId: string;
      organizationId: string;
      expiresAt: Date;
    }): { tokenHash: string; userId: string; organizationId: string; expiresAt: number } {
      const row = {
        tokenHash: record.tokenHash,
        userId: record.userId,
        organizationId: record.organizationId,
        expiresAt: record.expiresAt.getTime(),
      };
      db.sessions.set(record.tokenHash, row);
      return row;
    },
    getByTokenHash(tokenHash: string): {
      tokenHash: string;
      userId: string;
      organizationId: string;
      expiresAt: number;
    } | null {
      const s = db.sessions.get(tokenHash);
      if (!s) return null;
      if (s.expiresAt < Date.now()) {
        db.sessions.delete(tokenHash);
        return null;
      }
      return s;
    },
    revoke(tokenHash: string): void {
      db.sessions.delete(tokenHash);
    },
    revokeByUser(userId: string): void {
      for (const [hash, s] of db.sessions) {
        if (s.userId === userId) db.sessions.delete(hash);
      }
    },
  },

  /**
   * Reminder sends (TASK-010 cron). One reminder per showing, ever —
   * the set is the "already reminded" ledger.
   */
  reminders: {
    sent(showingId: string): boolean {
      return db.reminderSends.has(showingId);
    },
    markSent(showingId: string): void {
      db.reminderSends.add(showingId);
    },
  },
};
