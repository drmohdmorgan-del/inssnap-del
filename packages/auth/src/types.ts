/**
 * Auth record types — TASK-002.
 *
 * Every user record is organization-scoped; every query against the store
 * carries the organization id. Sessions bind to a user + organization and
 * expire server-side.
 */

import type { Role } from "@inssnapp/engine";

export interface UserRecord {
  id: string;
  organizationId: string;
  email: string;
  fullName: string;
  /** argon2id (`$argon2id$…`) or scrypt (`$scrypt$…`) hash. Never the password. */
  passwordHash: string;
  role: Role;
  mfaEnabled: boolean;
  /** Base32 TOTP secret; null until the user enrolls. Never log or expose. */
  mfaSecret: string | null;
  createdAt: string;
}

export interface SessionRecord {
  /** SHA-256 hex of the opaque session token presented in the cookie. */
  tokenHash: string;
  userId: string;
  organizationId: string;
  expiresAt: string; // ISO-8601
  createdAt: string; // ISO-8601
}

export interface CreateUserInput {
  id?: string;
  organizationId: string;
  email: string;
  fullName: string;
  passwordHash: string;
  role: Role;
  mfaEnabled?: boolean;
  mfaSecret?: string | null;
}

export interface CreateSessionInput {
  tokenHash: string;
  userId: string;
  organizationId: string;
  expiresAt: Date;
}

/** Short-lived single-use MFA challenge issued after a password check. */
export interface MfaChallengeRecord {
  id: string;
  userId: string;
  organizationId: string;
  expiresAt: string; // ISO-8601
  createdAt: string; // ISO-8601
}

export interface CreateMfaChallengeInput {
  id: string;
  userId: string;
  organizationId: string;
  expiresAt: Date;
}

/**
 * Persistence contract for users and server-side sessions.
 *
 * Implemented by the in-memory store (local dev / tests) and by
 * PostgresStore (production path, TASK-003). All lookups are
 * organization-scoped; `getUserByEmailAnyOrg` exists solely for the login
 * route, which resolves the organization from the matched user record —
 * every subsequent query is org-scoped.
 */
export interface AuthStore {
  createUser(input: CreateUserInput): Promise<UserRecord>;
  getUserByEmail(email: string, organizationId: string): Promise<UserRecord | null>;
  getUserByEmailAnyOrg(email: string): Promise<UserRecord | null>;
  getUserById(id: string): Promise<UserRecord | null>;
  setMfa(userId: string, opts: { enabled: boolean; secret?: string | null }): Promise<UserRecord | null>;

  createSession(input: CreateSessionInput): Promise<SessionRecord>;
  getSessionByTokenHash(tokenHash: string): Promise<SessionRecord | null>;
  revokeSession(tokenHash: string): Promise<void>;
  revokeUserSessions(userId: string): Promise<void>;

  /**
   * MFA challenges live in the store (not process memory) so they survive
   * across server instances. consumeMfaChallenge atomically deletes and
   * returns the challenge, or null when unknown / expired / already used.
   */
  createMfaChallenge(input: CreateMfaChallengeInput): Promise<MfaChallengeRecord>;
  consumeMfaChallenge(id: string): Promise<MfaChallengeRecord | null>;
}

export class DuplicateUserError extends Error {
  constructor(email: string, organizationId: string) {
    super(`User '${email}' already exists in organization '${organizationId}'.`);
    this.name = "DuplicateUserError";
  }
}
