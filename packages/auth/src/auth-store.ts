/**
 * In-memory AuthStore — local development and tests.
 *
 * Mirrors the PostgresStore semantics exactly: email unique per
 * organization, all lookups organization-scoped, sessions keyed by token
 * hash with server-side expiry. Used automatically when DATABASE_URL is
 * unset.
 */

import { randomUUID } from "node:crypto";
import type {
  AuthStore,
  CreateMfaChallengeInput,
  CreateSessionInput,
  CreateUserInput,
  MfaChallengeRecord,
  SessionRecord,
  UserRecord,
} from "./types.ts";
import { DuplicateUserError } from "./types.ts";

function normEmail(email: string): string {
  return email.trim().toLowerCase();
}

export class MemoryAuthStore implements AuthStore {
  private users = new Map<string, UserRecord>();
  private sessions = new Map<string, SessionRecord>();
  private mfaChallenges = new Map<string, MfaChallengeRecord>();

  async createUser(input: CreateUserInput): Promise<UserRecord> {
    const email = normEmail(input.email);
    for (const u of this.users.values()) {
      if (u.organizationId === input.organizationId && u.email === email) {
        throw new DuplicateUserError(email, input.organizationId);
      }
    }
    const now = new Date().toISOString();
    const user: UserRecord = {
      id: input.id ?? randomUUID(),
      organizationId: input.organizationId,
      email,
      fullName: input.fullName,
      passwordHash: input.passwordHash,
      role: input.role,
      mfaEnabled: input.mfaEnabled ?? false,
      mfaSecret: input.mfaSecret ?? null,
      createdAt: now,
    };
    this.users.set(user.id, user);
    return { ...user };
  }

  async getUserByEmail(email: string, organizationId: string): Promise<UserRecord | null> {
    const target = normEmail(email);
    for (const u of this.users.values()) {
      if (u.organizationId === organizationId && u.email === target) return { ...u };
    }
    return null;
  }

  async getUserByEmailAnyOrg(email: string): Promise<UserRecord | null> {
    const target = normEmail(email);
    for (const u of this.users.values()) {
      if (u.email === target) return { ...u };
    }
    return null;
  }

  async getUserById(id: string): Promise<UserRecord | null> {
    const u = this.users.get(id);
    return u ? { ...u } : null;
  }

  async setMfa(
    userId: string,
    opts: { enabled: boolean; secret?: string | null },
  ): Promise<UserRecord | null> {
    const u = this.users.get(userId);
    if (!u) return null;
    u.mfaEnabled = opts.enabled;
    if (opts.secret !== undefined) u.mfaSecret = opts.secret;
    if (!opts.enabled) u.mfaSecret = null;
    return { ...u };
  }

  async createSession(input: CreateSessionInput): Promise<SessionRecord> {
    const now = new Date().toISOString();
    const record: SessionRecord = {
      tokenHash: input.tokenHash,
      userId: input.userId,
      organizationId: input.organizationId,
      expiresAt: input.expiresAt.toISOString(),
      createdAt: now,
    };
    this.sessions.set(record.tokenHash, record);
    return { ...record };
  }

  async getSessionByTokenHash(tokenHash: string): Promise<SessionRecord | null> {
    const s = this.sessions.get(tokenHash);
    return s ? { ...s } : null;
  }

  async revokeSession(tokenHash: string): Promise<void> {
    this.sessions.delete(tokenHash);
  }

  async revokeUserSessions(userId: string): Promise<void> {
    for (const [hash, s] of this.sessions) {
      if (s.userId === userId) this.sessions.delete(hash);
    }
  }

  async createMfaChallenge(input: CreateMfaChallengeInput): Promise<MfaChallengeRecord> {
    // Opportunistic sweep of expired challenges.
    const now = Date.now();
    for (const [id, c] of this.mfaChallenges) {
      if (new Date(c.expiresAt).getTime() <= now) this.mfaChallenges.delete(id);
    }
    const record: MfaChallengeRecord = {
      id: input.id,
      userId: input.userId,
      organizationId: input.organizationId,
      expiresAt: input.expiresAt.toISOString(),
      createdAt: new Date().toISOString(),
    };
    this.mfaChallenges.set(record.id, record);
    return { ...record };
  }

  async consumeMfaChallenge(id: string): Promise<MfaChallengeRecord | null> {
    const c = this.mfaChallenges.get(id);
    if (!c) return null;
    this.mfaChallenges.delete(id);
    if (new Date(c.expiresAt).getTime() <= Date.now()) return null;
    return { ...c };
  }
}
