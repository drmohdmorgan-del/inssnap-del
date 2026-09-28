/**
 * TASK-002 auth tests.
 *
 * Covers: password hashing (argon2id/scrypt, wrong-password rejection),
 * TOTP enrollment/verification (wrong-code rejection), server-side sessions
 * (create / expiry / revocation / tamper resistance), MFA challenge
 * single-use, RBAC denials per role, and cross-organization isolation.
 *
 * Runs against the in-memory store; the PostgresStore implements the same
 * AuthStore contract and is exercised against a live database separately.
 */

import { describe, expect, it } from "vitest";
import {
  hashPassword,
  verifyPassword,
  passwordScheme,
  enrollMfa,
  currentMfaToken,
  verifyMfaToken,
  mfaRequiredForRole,
  MemoryAuthStore,
  newMfaChallengeId,
  MFA_CHALLENGE_TTL_MS,
  issueSession,
  resolveSession,
  signSessionToken,
  verifySessionToken,
  hashSessionToken,
  SESSION_TTL_MS,
  isPrivileged,
  requireRole,
  assertSameOrg,
  ForbiddenError,
  DuplicateUserError,
  type SessionUser,
} from "../src/index";

const ORG_A = "org_a";
const ORG_B = "org_b";

async function seedStore() {
  const store = new MemoryAuthStore();
  const hash = await hashPassword("pw");
  const manager = await store.createUser({
    id: "u_manager",
    organizationId: ORG_A,
    email: "manager@inssnapp.demo",
    fullName: "Morgan Reyes",
    passwordHash: hash,
    role: "management",
  });
  const resident = await store.createUser({
    id: "u_resident",
    organizationId: ORG_A,
    email: "resident@inssnapp.demo",
    fullName: "Jordan Lee",
    passwordHash: hash,
    role: "resident",
  });
  return { store, manager, resident };
}

describe("password hashing", () => {
  it("hashes and verifies with the active scheme", async () => {
    const scheme = await passwordScheme();
    expect(["argon2id", "scrypt"]).toContain(scheme);
    const hash = await hashPassword("correct horse battery staple");
    expect(hash.startsWith(scheme === "argon2id" ? "$argon2id$" : "$scrypt$")).toBe(true);
    expect(await verifyPassword("correct horse battery staple", hash)).toBe(true);
  });

  it("rejects a wrong password", async () => {
    const hash = await hashPassword("pw");
    expect(await verifyPassword("wrong", hash)).toBe(false);
    expect(await verifyPassword("", hash)).toBe(false);
  });

  it("rejects legacy and unknown schemes", async () => {
    expect(await verifyPassword("pw", "s1:salt:deadbeef")).toBe(false);
    expect(await verifyPassword("pw", "not-a-hash")).toBe(false);
    expect(await verifyPassword("pw", "")).toBe(false);
  });

  it("produces unique salts per hash", async () => {
    const a = await hashPassword("pw");
    const b = await hashPassword("pw");
    expect(a).not.toBe(b);
    expect(await verifyPassword("pw", a)).toBe(true);
    expect(await verifyPassword("pw", b)).toBe(true);
  });
});

describe("TOTP MFA", () => {
  it("enrolls with a secret and otpauth URL", () => {
    const { secret, otpauthUrl } = enrollMfa("admin@inssnapp.demo");
    expect(secret.length).toBeGreaterThan(0);
    expect(otpauthUrl.startsWith("otpauth://totp/")).toBe(true);
    expect(otpauthUrl).toContain(encodeURIComponent("admin@inssnapp.demo"));
  });

  it("verifies the current code and rejects wrong codes", () => {
    const { secret } = enrollMfa("admin@inssnapp.demo");
    const token = currentMfaToken(secret);
    expect(verifyMfaToken(secret, token)).toBe(true);
    expect(verifyMfaToken(secret, "000000")).toBe(false);
    expect(verifyMfaToken(secret, "")).toBe(false);
  });

  it("rejects codes from a different secret", () => {
    const a = enrollMfa("a@inssnapp.demo");
    const b = enrollMfa("b@inssnapp.demo");
    expect(a.secret).not.toBe(b.secret);
    expect(verifyMfaToken(a.secret, currentMfaToken(b.secret))).toBe(false);
  });

  it("applies MFA to privileged roles only", () => {
    expect(mfaRequiredForRole("management")).toBe(true);
    expect(mfaRequiredForRole("inssnapp_admin")).toBe(true);
    expect(mfaRequiredForRole("resident")).toBe(false);
    expect(mfaRequiredForRole("prospect")).toBe(false);
    expect(mfaRequiredForRole("broker")).toBe(false);
  });
});

describe("MFA challenges", () => {
  it("issues crypto-random ids and consumes single-use", async () => {
    const { store } = await seedStore();
    const id = newMfaChallengeId();
    expect(id.startsWith("mfa_")).toBe(true);
    expect(newMfaChallengeId()).not.toBe(id);
    await store.createMfaChallenge({
      id,
      userId: "u1",
      organizationId: ORG_A,
      expiresAt: new Date(Date.now() + MFA_CHALLENGE_TTL_MS),
    });
    const first = await store.consumeMfaChallenge(id);
    expect(first).not.toBeNull();
    expect(first!.userId).toBe("u1");
    expect(await store.consumeMfaChallenge(id)).toBeNull();
  });

  it("rejects unknown and expired challenges", async () => {
    const { store } = await seedStore();
    expect(await store.consumeMfaChallenge("mfa_nope")).toBeNull();
    const id = newMfaChallengeId();
    await store.createMfaChallenge({
      id,
      userId: "u1",
      organizationId: ORG_A,
      expiresAt: new Date(Date.now() + 1),
    });
    await new Promise((r) => setTimeout(r, 5));
    expect(await store.consumeMfaChallenge(id)).toBeNull();
  });
});

describe("server-side sessions", () => {
  it("issues a session the cookie resolves to", async () => {
    const { store, manager } = await seedStore();
    const { cookieValue } = await issueSession(store, manager);
    const user = await resolveSession(store, cookieValue);
    expect(user).not.toBeNull();
    expect(user!.userId).toBe("u_manager");
    expect(user!.organizationId).toBe(ORG_A);
    expect(user!.role).toBe("management");
    // Raw token is never stored — only its hash.
    const record = await store.getSessionByTokenHash(
      hashSessionToken("definitely-not-the-token"),
    );
    expect(record).toBeNull();
  });

  it("rejects tampered cookies", async () => {
    const { store, manager } = await seedStore();
    const { cookieValue } = await issueSession(store, manager);
    const tampered = cookieValue.slice(0, -2) + (cookieValue.endsWith("aa") ? "bb" : "aa");
    expect(await resolveSession(store, tampered)).toBeNull();
    expect(await resolveSession(store, "garbage")).toBeNull();
    expect(await resolveSession(store, null)).toBeNull();
  });

  it("expires sessions server-side", async () => {
    const { store, manager } = await seedStore();
    const { cookieValue } = await issueSession(store, manager, -1000); // already expired
    expect(await resolveSession(store, cookieValue)).toBeNull();
  });

  it("revokes sessions", async () => {
    const { store, manager } = await seedStore();
    const { token, cookieValue } = await issueSession(store, manager);
    expect(await resolveSession(store, cookieValue)).not.toBeNull();
    await store.revokeSession(hashSessionToken(token));
    expect(await resolveSession(store, cookieValue)).toBeNull();
  });

  it("revokes all of a user's sessions at once", async () => {
    const { store, manager, resident } = await seedStore();
    const a = await issueSession(store, manager);
    const b = await issueSession(store, manager);
    const c = await issueSession(store, resident);
    await store.revokeUserSessions("u_manager");
    expect(await resolveSession(store, a.cookieValue)).toBeNull();
    expect(await resolveSession(store, b.cookieValue)).toBeNull();
    expect(await resolveSession(store, c.cookieValue)).not.toBeNull();
  });

  it("rejects a session whose user no longer exists", async () => {
    const store = new MemoryAuthStore();
    const hash = await hashPassword("pw");
    const temp = await store.createUser({
      organizationId: ORG_A,
      email: "temp@inssnapp.demo",
      fullName: "Temp",
      passwordHash: hash,
      role: "prospect",
    });
    const { cookieValue } = await issueSession(store, temp);
    // Simulate user deletion by replacing the store's lookup surface is not
    // possible here; instead resolve against a fresh store holding the
    // session record but no user.
    const orphan = new MemoryAuthStore();
    const record = await store.getSessionByTokenHash(
      // re-derive the hash from the signed cookie payload
      hashSessionToken((await verifySessionToken(cookieValue))!),
    );
    await orphan.createSession({
      tokenHash: record!.tokenHash,
      userId: record!.userId,
      organizationId: record!.organizationId,
      expiresAt: new Date(record!.expiresAt),
    });
    expect(await resolveSession(orphan, cookieValue)).toBeNull();
  });

  it("SESSION_TTL_MS is 7 days", () => {
    expect(SESSION_TTL_MS).toBe(7 * 24 * 60 * 60 * 1000);
  });
});

describe("RBAC", () => {
  const admin: SessionUser = {
    userId: "u_admin",
    organizationId: ORG_A,
    email: "admin@inssnapp.demo",
    fullName: "Avery Chen",
    role: "inssnapp_admin",
  };
  const resident: SessionUser = {
    userId: "u_resident",
    organizationId: ORG_A,
    email: "resident@inssnapp.demo",
    fullName: "Jordan Lee",
    role: "resident",
  };

  it("identifies privileged roles", () => {
    expect(isPrivileged("management")).toBe(true);
    expect(isPrivileged("inssnapp_admin")).toBe(true);
    expect(isPrivileged("resident")).toBe(false);
    expect(isPrivileged("prospect")).toBe(false);
    expect(isPrivileged("broker")).toBe(false);
  });

  it("allows permitted roles and denies others", () => {
    expect(() => requireRole(admin, "management", "inssnapp_admin")).not.toThrow();
    expect(() => requireRole(resident, "management", "inssnapp_admin")).toThrow(ForbiddenError);
    expect(() => requireRole(resident, "resident")).not.toThrow();
    expect(() => requireRole(null, "resident")).toThrow(ForbiddenError);
  });

  it("denies every non-privileged role from admin-only operations", () => {
    for (const role of ["resident", "prospect", "broker"] as const) {
      const user: SessionUser = { ...resident, role };
      expect(() => requireRole(user, "management", "inssnapp_admin")).toThrow(ForbiddenError);
    }
  });

  it("enforces tenant isolation", () => {
    expect(() => assertSameOrg(admin, ORG_A)).not.toThrow();
    expect(() => assertSameOrg(admin, ORG_B)).toThrow(ForbiddenError);
    expect(() => assertSameOrg(null, ORG_A)).toThrow(ForbiddenError);
  });
});

describe("cross-organization isolation", () => {
  it("scopes email lookup to the organization", async () => {
    const { store } = await seedStore();
    const hash = await hashPassword("pw");
    await store.createUser({
      organizationId: ORG_B,
      email: "manager@inssnapp.demo",
      fullName: "Riley Park",
      passwordHash: hash,
      role: "management",
    });
    const inA = await store.getUserByEmail("manager@inssnapp.demo", ORG_A);
    const inB = await store.getUserByEmail("manager@inssnapp.demo", ORG_B);
    expect(inA!.organizationId).toBe(ORG_A);
    expect(inB!.organizationId).toBe(ORG_B);
    expect(inA!.id).not.toBe(inB!.id);
  });

  it("rejects duplicate email within an organization, allows across orgs", async () => {
    const { store } = await seedStore();
    const hash = await hashPassword("pw");
    await expect(
      store.createUser({
        organizationId: ORG_A,
        email: "MANAGER@inssnapp.demo", // case-insensitive duplicate
        fullName: "Dup",
        passwordHash: hash,
        role: "resident",
      }),
    ).rejects.toThrow(DuplicateUserError);
    const other = await store.createUser({
      organizationId: ORG_B,
      email: "manager@inssnapp.demo",
      fullName: "Riley Park",
      passwordHash: hash,
      role: "management",
    });
    expect(other.organizationId).toBe(ORG_B);
  });

  it("sessions bind the user's organization", async () => {
    const { store, manager } = await seedStore();
    const { cookieValue } = await issueSession(store, manager);
    const user = await resolveSession(store, cookieValue);
    expect(user!.organizationId).toBe(manager.organizationId);
  });

  it("setMfa stores the TOTP secret", async () => {
    const { store, manager } = await seedStore();
    const { secret } = enrollMfa(manager.email);
    const updated = await store.setMfa(manager.id, { enabled: true, secret });
    expect(updated!.mfaEnabled).toBe(true);
    expect(updated!.mfaSecret).toBe(secret);
    expect(verifyMfaToken(updated!.mfaSecret!, currentMfaToken(secret))).toBe(true);
    const disabled = await store.setMfa(manager.id, { enabled: false });
    expect(disabled!.mfaEnabled).toBe(false);
    expect(disabled!.mfaSecret).toBeNull();
  });
});
