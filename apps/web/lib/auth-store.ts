/**
 * AuthStore for the web app — TASK-002.
 *
 * Returns the in-memory adapter (backed by lib/store.ts seed data) when
 * DATABASE_URL is unset, and PostgresStore when it is set. Both implement
 * the same @inssnapp/auth AuthStore contract: organization-scoped user
 * lookups and server-side sessions keyed by token hash.
 */

import type {
  AuthStore,
  CreateMfaChallengeInput,
  CreateSessionInput,
  CreateUserInput,
  MfaChallengeRecord,
  SessionRecord,
  UserRecord,
} from "@inssnapp/auth";
import { DuplicateUserError, MemoryAuthStore } from "@inssnapp/auth";
import { store as mem, type User } from "./store";
import { usingPostgres } from "./db";
import { PostgresStore } from "@inssnapp/db";

// MFA challenges need process-wide storage shared across routes (Next.js
// bundles each route separately, so a plain module-level instance would not
// be visible to both /api/auth/login and /api/auth/mfa/verify).
const gc = globalThis as typeof globalThis & { __inssnappChallengeStore?: MemoryAuthStore };
function challengeStore(): MemoryAuthStore {
  if (!gc.__inssnappChallengeStore) gc.__inssnappChallengeStore = new MemoryAuthStore();
  return gc.__inssnappChallengeStore;
}

/** AuthStore adapter over the in-memory seed store (local dev). */
class MemAuthStore implements AuthStore {
  private toRecord(u: User): UserRecord {
    return {
      id: u.id,
      organizationId: u.organizationId,
      email: u.email,
      fullName: u.fullName,
      passwordHash: u.passwordHash,
      role: u.role,
      mfaEnabled: u.mfaEnabled,
      mfaSecret: u.mfaSecret,
      createdAt: new Date(0).toISOString(),
    };
  }

  async createUser(input: CreateUserInput): Promise<UserRecord> {
    const email = input.email.trim().toLowerCase();
    const existing = await this.getUserByEmail(email, input.organizationId);
    if (existing) throw new DuplicateUserError(email, input.organizationId);
    // The in-memory seed is fixed; runtime user creation is not supported
    // on the dev store (use PostgreSQL for real user management).
    throw new Error("User creation is not supported on the in-memory dev store.");
  }

  async getUserByEmail(email: string, organizationId: string): Promise<UserRecord | null> {
    const target = email.trim().toLowerCase();
    const u = mem.users
      .byOrg(organizationId)
      .find((x) => x.email.toLowerCase() === target);
    return u ? this.toRecord(u) : null;
  }

  async getUserByEmailAnyOrg(email: string): Promise<UserRecord | null> {
    const u = mem.users.byEmail(email);
    return u ? this.toRecord(u) : null;
  }

  async getUserById(id: string): Promise<UserRecord | null> {
    const u = mem.users.byId(id);
    return u ? this.toRecord(u) : null;
  }

  async setMfa(
    userId: string,
    opts: { enabled: boolean; secret?: string | null },
  ): Promise<UserRecord | null> {
    // MFA enrollment on the dev store is fixed at seed time.
    const u = mem.users.byId(userId);
    return u ? this.toRecord(u) : null;
  }

  async createSession(input: CreateSessionInput): Promise<SessionRecord> {
    const row = mem.sessions.create({
      tokenHash: input.tokenHash,
      userId: input.userId,
      organizationId: input.organizationId,
      expiresAt: input.expiresAt,
    });
    return {
      tokenHash: row.tokenHash,
      userId: row.userId,
      organizationId: row.organizationId,
      expiresAt: new Date(row.expiresAt).toISOString(),
      createdAt: new Date().toISOString(),
    };
  }

  async getSessionByTokenHash(tokenHash: string): Promise<SessionRecord | null> {
    const s = mem.sessions.getByTokenHash(tokenHash);
    if (!s) return null;
    return {
      tokenHash: s.tokenHash,
      userId: s.userId,
      organizationId: s.organizationId,
      expiresAt: new Date(s.expiresAt).toISOString(),
      createdAt: new Date().toISOString(),
    };
  }

  async revokeSession(tokenHash: string): Promise<void> {
    mem.sessions.revoke(tokenHash);
  }

  async revokeUserSessions(userId: string): Promise<void> {
    mem.sessions.revokeByUser(userId);
  }

  async createMfaChallenge(input: CreateMfaChallengeInput): Promise<MfaChallengeRecord> {
    return challengeStore().createMfaChallenge(input);
  }

  async consumeMfaChallenge(id: string): Promise<MfaChallengeRecord | null> {
    return challengeStore().consumeMfaChallenge(id);
  }
}

const g = globalThis as typeof globalThis & { __inssnappPgAuthStore?: PostgresStore };
const memStore = new MemAuthStore();

/** Returns the active AuthStore for this runtime. */
export function getAuthStore(): AuthStore {
  if (usingPostgres) {
    // globalThis: Next.js bundles routes separately; keep one pool per process.
    if (!g.__inssnappPgAuthStore) g.__inssnappPgAuthStore = new PostgresStore();
    return g.__inssnappPgAuthStore;
  }
  return memStore;
}
