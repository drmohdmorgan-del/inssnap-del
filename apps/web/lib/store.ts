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
  provider: string;
  /** 'sandbox' | 'connected' | 'error' | 'not_connected' */
  status: string;
  lastSyncAt: string | null;
}

export interface SecurityEvent {
  id: string;
  /** NULL when the event cannot be attributed to an organization (unknown-email login attempt). */
  organizationId: string | null;
  type: "login_failed" | "login_succeeded" | "mfa_failed" | "session_revoked";
  actorUserId: string | null;
  actorEmail: string | null;
  detail: string | null;
  at: string;
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
  showings: Map<string, Showing>;
  events: ShowingEvent[];
  ratings: ShowingRating[];
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
      { id: "prop_1", organizationId: "org_1", name: "The Alder", address: "120 Alder St, Seattle, WA" },
      { id: "prop_2", organizationId: "org_1", name: "Maple Court", address: "88 Maple Ave, Bellevue, WA" },
      { id: "prop_3", organizationId: "org_2", name: "Harbor Lofts", address: "1 Harbor Blvd, Tacoma, WA" },
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
    // PMS adapter boundary rows (TASK-007). Only org_1 has a configured
    // adapter and it is sandbox-only; org_2 has none — the integrations
    // status API reports this honestly instead of hardcoding "connected".
    pmsAdapters: [
      {
        id: "pms_1",
        organizationId: "org_1",
        provider: "yardi",
        status: "sandbox",
        lastSyncAt: null,
      },
    ],
    securityEvents: [],
    showings: new Map(),
    events: [],
    ratings: [],
    sessions: new Map(),
    seq: 100,
  };
}

const g = globalThis as typeof globalThis & { __inssnappStore?: StoreData };
if (!g.__inssnappStore) {
  g.__inssnappStore = seed();
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
  },

  pmsAdapters: {
    byOrg(organizationId: string): PmsAdapter[] {
      return db.pmsAdapters.filter((a) => a.organizationId === organizationId);
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
    create(organizationId: string, name: string, address: string): Property {
      const property: Property = { id: newId("prop"), organizationId, name, address };
      db.properties.push(property);
      return property;
    },
    patch(id: string, patch: Partial<Pick<Property, "name" | "address">>): Property | null {
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
      const event: ShowingEvent = { ...e, id: newId("evt"), at: new Date().toISOString() };
      db.events.push(event);
      return event;
    },
    list(organizationId: string): ShowingEvent[] {
      return db.events
        .filter((e) => e.organizationId === organizationId)
        .sort((a, b) => (a.at < b.at ? 1 : -1));
    },
    findByIdempotencyKey(key: string): ShowingEvent | null {
      return db.events.find((e) => e.idempotencyKey === key) ?? null;
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
};
