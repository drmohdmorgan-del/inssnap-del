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
  /** Email verification (Phase 2/3 signup flow). Seed/demo users are verified. */
  emailVerified: boolean;
}

export interface Property {
  id: string;
  organizationId: string;
  name: string;
  address: string;
  /** Vendor-stable external id from the PMS sync (TASK-008); null for manually created properties. */
  pmsExternalId: string | null;
  /** Map coordinates for the live map (Phase 8); null until set via pin-drop or geocoding. */
  latitude: number | null;
  longitude: number | null;
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

/**
 * Management-issued invitation for a role signup (Phase 1).
 * The shareable link is `/signup?invite=<code>`; the code can also be
 * typed manually. A resident invite is bound to one unit — accepting it
 * links the new account to that unit.
 */
export interface Invite {
  id: string;
  /** Short human-typable code, unique per organization. */
  code: string;
  organizationId: string;
  /** Unit the invite is for (resident invites); null for open role invites. */
  unitId: string | null;
  role: "resident" | "prospect" | "broker";
  /** Optional intended recipient email (informational; not enforced). */
  email: string | null;
  createdByUserId: string;
  createdAt: string;
  expiresAt: string;
  usedAt: string | null;
  usedByUserId: string | null;
}

/** Email verification code for the signup flow (Phase 2/3). Free — no SMS. */
export interface VerificationCode {
  id: string;
  organizationId: string;
  email: string;
  /** 6-digit numeric code. */
  code: string;
  purpose: "signup";
  createdAt: string;
  expiresAt: string;
  usedAt: string | null;
  attempts: number;
}

/**
 * Lead disposition (Phase 6). A "lead" is a showing in OUTCOME state.
 * Metadata only — NOT engine state (the engine stays the sole authority
 * on showing states). Control directs each lead:
 * - pending: awaiting control decision
 * - inhouse: keep in-house — prospect works with resident/management, no broker
 * - management: sent to management's lead pool (may assign a broker)
 */
export type LeadDisposition = "pending" | "inhouse" | "management";

export interface LeadDispositionRecord {
  showingId: string;
  organizationId: string;
  disposition: LeadDisposition;
  decidedByUserId: string | null;
  decidedAt: string | null;
  updatedAt: string;
}

/** Broker subscription tier profile (Phase 7). Selection is free self-serve; no payments wired. */
export interface BrokerProfile {
  userId: string;
  organizationId: string;
  tier: "trial" | "basic" | "pro";
  tierStartedAt: string;
  /** Trial expiry (trial tier only). */
  trialEndsAt: string | null;
  updatedAt: string;
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

export interface ContactSubmission {
  id: string;
  name: string;
  email: string;
  company: string | null;
  role: string | null;
  message: string;
  createdAt: string;
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
  /** Management-issued signup invitations (Phase 1). */
  invites: Invite[];
  /** Email verification codes for the signup flow (Phase 2/3). */
  verificationCodes: VerificationCode[];
  /** Lead dispositions keyed by showing id (Phase 6). */
  leadDispositions: Map<string, LeadDispositionRecord>;
  /** Broker tier profiles keyed by user id (Phase 7). */
  brokerProfiles: Map<string, BrokerProfile>;
  pmsAdapters: PmsAdapter[];
  securityEvents: SecurityEvent[];
  /** Contact-us landing page submissions (not org-scoped). */
  contactSubmissions: ContactSubmission[];
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
      { id: "u_mgmt", organizationId: "org_1", email: "manager@inssnapp.demo", fullName: "Morgan Reyes", passwordHash: DEMO_HASH, role: "management", mfaEnabled: false, mfaSecret: null, emailVerified: true },
      { id: "u_admin", organizationId: "org_1", email: "admin@inssnapp.demo", fullName: "Avery Chen", passwordHash: DEMO_HASH, role: "inssnapp_admin", mfaEnabled: true, mfaSecret: DEMO_TOTP_SECRET, emailVerified: true },
      { id: "u_resident", organizationId: "org_1", email: "resident@inssnapp.demo", fullName: "Jordan Lee", passwordHash: DEMO_HASH, role: "resident", mfaEnabled: false, mfaSecret: null, emailVerified: true },
      { id: "u_prospect", organizationId: "org_1", email: "prospect@inssnapp.demo", fullName: "Taylor Brooks", passwordHash: DEMO_HASH, role: "prospect", mfaEnabled: false, mfaSecret: null, emailVerified: true },
      { id: "u_broker", organizationId: "org_1", email: "broker@inssnapp.demo", fullName: "Casey Kim", passwordHash: DEMO_HASH, role: "broker", mfaEnabled: false, mfaSecret: null, emailVerified: true },
      { id: "u_mgmt2", organizationId: "org_2", email: "manager2@inssnapp.demo", fullName: "Riley Park", passwordHash: DEMO_HASH, role: "management", mfaEnabled: false, mfaSecret: null, emailVerified: true },
    ],
    properties: [
      { id: "prop_1", organizationId: "org_1", name: "The Alder", address: "120 Alder St, Seattle, WA", pmsExternalId: null, latitude: 47.6062, longitude: -122.3321 },
      { id: "prop_2", organizationId: "org_1", name: "Maple Court", address: "88 Maple Ave, Bellevue, WA", pmsExternalId: null, latitude: 47.6101, longitude: -122.2015 },
      { id: "prop_3", organizationId: "org_2", name: "Harbor Lofts", address: "1 Harbor Blvd, Tacoma, WA", pmsExternalId: null, latitude: 47.2529, longitude: -122.4407 },
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
    invites: [],
    verificationCodes: [],
    leadDispositions: new Map(),
    brokerProfiles: new Map(),
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
    contactSubmissions: [],
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
    invites: [],
    verificationCodes: [],
    leadDispositions: new Map(),
    brokerProfiles: new Map(),
    pmsAdapters: [],
    securityEvents: [],
    contactSubmissions: [],
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

  // Pilot testing: seed demo test accounts so one-click test sign-in works
  // without a database. Runs regardless of the bootstrap admin below.
  // Gated by the same kill switch as test mode: INSSNAPP_TEST_MODE=0
  // disables both the seed and the test-login API. These are fake
  // @inssnapp.demo accounts; password is unusable ("!") — test-login
  // bypasses passwords entirely. Wiped on redeploy (in-memory).
  if (process.env.INSSNAPP_TEST_MODE !== "0") {
    const demoOrg: Org = { id: "org_demo", name: "Demo Test Org" };
    data.orgs.push(demoOrg);
    const demoUsers: Array<{
      id: string;
      email: string;
      fullName: string;
      role: "management" | "resident" | "prospect" | "broker";
    }> = [
      { id: "u_demo_mgmt", email: "manager@inssnapp.demo", fullName: "Demo Manager", role: "management" },
      { id: "u_demo_resident", email: "resident@inssnapp.demo", fullName: "Demo Resident", role: "resident" },
      { id: "u_demo_prospect", email: "prospect@inssnapp.demo", fullName: "Demo Prospect", role: "prospect" },
      { id: "u_demo_broker", email: "broker@inssnapp.demo", fullName: "Demo Broker", role: "broker" },
    ];
    for (const u of demoUsers) {
      data.users.push({
        id: u.id,
        organizationId: demoOrg.id,
        email: u.email,
        fullName: u.fullName,
        passwordHash: "!",
        role: u.role,
        mfaEnabled: false,
        mfaSecret: null,
        emailVerified: true,
      });
    }
    console.warn(
      "[inssnapp] production: test mode ON — seeded 4 demo test accounts " +
        "(@inssnapp.demo). Set INSSNAPP_TEST_MODE=0 before real launch.",
    );
  }

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
    emailVerified: true,
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

/** Human-typable invite code (no ambiguous chars: 0/O, 1/I/L). */
function randomCode(length: number): string {
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < length; i++) {
    out += chars[Math.floor(Math.random() * chars.length)];
  }
  return out;
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

  // ---- Signup invitations (Phase 1) ----------------------------------------
  invites: {
    /** Creates an invite with a unique human-typable code (org-scoped). */
    create(input: {
      organizationId: string;
      unitId: string | null;
      role: Invite["role"];
      email?: string | null;
      createdByUserId: string;
      ttlHours?: number;
    }): Invite {
      let code = "";
      for (let i = 0; i < 10; i++) {
        code = randomCode(6);
        if (!db.invites.some((inv) => inv.organizationId === input.organizationId && inv.code === code)) break;
      }
      const now = new Date();
      const invite: Invite = {
        id: newId("inv"),
        code,
        organizationId: input.organizationId,
        unitId: input.unitId,
        role: input.role,
        email: input.email?.trim().toLowerCase() || null,
        createdByUserId: input.createdByUserId,
        createdAt: now.toISOString(),
        expiresAt: new Date(now.getTime() + (input.ttlHours ?? 72) * 3600_000).toISOString(),
        usedAt: null,
        usedByUserId: null,
      };
      db.invites.push(invite);
      return invite;
    },
    byCode(organizationId: string, code: string): Invite | null {
      const c = code.trim().toUpperCase();
      return (
        db.invites.find((inv) => inv.organizationId === organizationId && inv.code === c) ?? null
      );
    },
    /** Public invite validation (signup page): code is unguessable; no org needed. */
    byCodeAnyOrg(code: string): Invite | null {
      const c = code.trim().toUpperCase();
      return db.invites.find((inv) => inv.code === c) ?? null;
    },
    byOrg(organizationId: string): Invite[] {
      return db.invites.filter((inv) => inv.organizationId === organizationId);
    },
    markUsed(id: string, userId: string): Invite | null {
      const inv = db.invites.find((i) => i.id === id);
      if (!inv || inv.usedAt) return null;
      inv.usedAt = new Date().toISOString();
      inv.usedByUserId = userId;
      return inv;
    },
    isUsable(inv: Invite): boolean {
      return !inv.usedAt && new Date(inv.expiresAt).getTime() > Date.now();
    },
  },

  // ---- Email verification codes (Phase 2/3) ---------------------------------
  verificationCodes: {
    /** Issues a fresh 6-digit code (15-min TTL); invalidates older unused codes for the email. */
    issue(organizationId: string, email: string): VerificationCode {
      const target = email.trim().toLowerCase();
      const now = new Date();
      for (const vc of db.verificationCodes) {
        if (vc.organizationId === organizationId && vc.email === target && !vc.usedAt) {
          vc.usedAt = now.toISOString(); // superseded
        }
      }
      const vc: VerificationCode = {
        id: newId("vrf"),
        organizationId,
        email: target,
        code: String(Math.floor(100000 + Math.random() * 900000)),
        purpose: "signup",
        createdAt: now.toISOString(),
        expiresAt: new Date(now.getTime() + 15 * 60_000).toISOString(),
        usedAt: null,
        attempts: 0,
      };
      db.verificationCodes.push(vc);
      return vc;
    },
    /** Validates a code; consumes it on success. Returns the record or an error key. */
    consume(
      organizationId: string,
      email: string,
      code: string,
    ): { ok: true; record: VerificationCode } | { ok: false; error: "not_found" | "expired" | "locked" } {
      const target = email.trim().toLowerCase();
      const vc = [...db.verificationCodes]
        .reverse()
        .find((v) => v.organizationId === organizationId && v.email === target && !v.usedAt);
      if (!vc || vc.code !== code.trim()) {
        if (vc) {
          vc.attempts += 1;
          if (vc.attempts >= 5) vc.usedAt = new Date().toISOString(); // lock after 5 tries
        }
        return { ok: false, error: "not_found" };
      }
      if (new Date(vc.expiresAt).getTime() <= Date.now()) {
        vc.usedAt = new Date().toISOString();
        return { ok: false, error: "expired" };
      }
      if (vc.attempts >= 5) return { ok: false, error: "locked" };
      vc.usedAt = new Date().toISOString();
      return { ok: true, record: vc };
    },
  },

  // ---- Lead dispositions (Phase 6) -------------------------------------------
  leadDispositions: {
    get(showingId: string): LeadDispositionRecord | null {
      return db.leadDispositions.get(showingId) ?? null;
    },
    /** All dispositions for one organization. */
    byOrg(organizationId: string): LeadDispositionRecord[] {
      return [...db.leadDispositions.values()].filter(
        (r) => r.organizationId === organizationId,
      );
    },
    set(
      showingId: string,
      organizationId: string,
      disposition: LeadDisposition,
      decidedByUserId: string | null,
    ): LeadDispositionRecord {
      const now = new Date().toISOString();
      const existing = db.leadDispositions.get(showingId);
      const record: LeadDispositionRecord = {
        showingId,
        organizationId,
        disposition,
        decidedByUserId,
        decidedAt: disposition === "pending" ? (existing?.decidedAt ?? null) : now,
        updatedAt: now,
      };
      db.leadDispositions.set(showingId, record);
      return record;
    },
  },

  // ---- Broker tier profiles (Phase 7) -----------------------------------------
  brokerProfiles: {
    get(userId: string): BrokerProfile | null {
      return db.brokerProfiles.get(userId) ?? null;
    },
    /** Get or create (new brokers start on trial). */
    getOrCreate(userId: string, organizationId: string): BrokerProfile {
      const existing = db.brokerProfiles.get(userId);
      if (existing) return existing;
      const now = new Date().toISOString();
      const profile: BrokerProfile = {
        userId,
        organizationId,
        tier: "trial",
        tierStartedAt: now,
        trialEndsAt: new Date(Date.now() + 7 * 24 * 3600_000).toISOString(),
        updatedAt: now,
      };
      db.brokerProfiles.set(userId, profile);
      return profile;
    },
    setTier(
      userId: string,
      organizationId: string,
      tier: BrokerProfile["tier"],
    ): BrokerProfile {
      const now = new Date().toISOString();
      const profile: BrokerProfile = {
        userId,
        organizationId,
        tier,
        tierStartedAt: now,
        trialEndsAt:
          tier === "trial" ? new Date(Date.now() + 7 * 24 * 3600_000).toISOString() : null,
        updatedAt: now,
      };
      db.brokerProfiles.set(userId, profile);
      return profile;
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

  contactSubmissions: {
    insert(e: {
      name: string;
      email: string;
      company?: string | null;
      role?: string | null;
      message: string;
    }): ContactSubmission {
      const submission: ContactSubmission = {
        id: newId("contact"),
        name: e.name,
        email: e.email,
        company: e.company ?? null,
        role: e.role ?? null,
        message: e.message,
        createdAt: new Date().toISOString(),
      };
      db.contactSubmissions.push(submission);
      return submission;
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
    /** Runtime user creation (Phase 2/3 signup). Per-org email uniqueness enforced. */
    create(input: {
      organizationId: string;
      email: string;
      fullName: string;
      passwordHash: string;
      role: User["role"];
      emailVerified?: boolean;
    }): User {
      const email = input.email.trim().toLowerCase();
      if (db.users.some((u) => u.organizationId === input.organizationId && u.email.toLowerCase() === email)) {
        throw new Error(`User '${email}' already exists in organization '${input.organizationId}'.`);
      }
      const user: User = {
        id: newId("u"),
        organizationId: input.organizationId,
        email,
        fullName: input.fullName.trim(),
        passwordHash: input.passwordHash,
        role: input.role,
        mfaEnabled: false,
        mfaSecret: null,
        emailVerified: input.emailVerified ?? false,
      };
      db.users.push(user);
      return user;
    },
    /** Marks the user's email as verified. Returns null when unknown. */
    setEmailVerified(userId: string): User | null {
      const u = db.users.find((x) => x.id === userId);
      if (!u) return null;
      u.emailVerified = true;
      return u;
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
      opts: { pmsExternalId?: string | null; latitude?: number | null; longitude?: number | null } = {},
    ): Property {
      const property: Property = {
        id: newId("prop"),
        organizationId,
        name,
        address,
        pmsExternalId: opts.pmsExternalId ?? null,
        latitude: opts.latitude ?? null,
        longitude: opts.longitude ?? null,
      };
      db.properties.push(property);
      return property;
    },
    patch(
      id: string,
      patch: Partial<Pick<Property, "name" | "address" | "pmsExternalId" | "latitude" | "longitude">>,
    ): Property | null {
      const idx = db.properties.findIndex((p) => p.id === id);
      if (idx === -1) return null;
      // Strip undefined so omitted coordinates don't wipe existing ones.
      const clean = Object.fromEntries(
        Object.entries(patch).filter(([, v]) => v !== undefined),
      ) as typeof patch;
      db.properties[idx] = { ...db.properties[idx], ...clean };
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
