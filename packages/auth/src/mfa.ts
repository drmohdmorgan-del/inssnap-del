/**
 * TOTP multi-factor authentication — TASK-002.
 *
 * Enrollment generates a per-user secret plus an `otpauth://` URL for QR
 * provisioning in any standard authenticator app. Verification accepts the
 * current 30-second step with ±1 step tolerance for clock drift.
 *
 * MFA is enforced for privileged roles (`management`, `inssnapp_admin`):
 * the login flow issues a short-lived single-use challenge instead of a
 * session when `mfaEnabled` is set on the user record.
 */

import { generateSecret, generateURI, generateSync, verifySync } from "otplib";
import { randomBytes } from "node:crypto";
import type { Role } from "@inssnapp/engine";
import { isPrivileged } from "./rbac.ts";

export interface MfaEnrollment {
  /** Base32 TOTP secret — store on the user record, never log. */
  secret: string;
  /** otpauth:// URL for QR-code provisioning in an authenticator app. */
  otpauthUrl: string;
}

/** Generates a fresh TOTP secret and provisioning URL for an account. */
export function enrollMfa(accountName: string, issuer = "INSSNAPP"): MfaEnrollment {
  const secret = generateSecret();
  const otpauthUrl = generateURI({ issuer, label: accountName, secret });
  return { secret, otpauthUrl };
}

/** Generates the current TOTP code for a secret (dev tooling / tests). */
export function currentMfaToken(secret: string): string {
  return generateSync({ secret });
}

/** Verifies a user-supplied TOTP code. Returns false on any failure. */
export function verifyMfaToken(secret: string, token: string): boolean {
  if (!secret || typeof token !== "string") return false;
  try {
    const clean = token.replace(/[\s-]+/g, "");
    // ±30s tolerance for client/server clock drift (one 30s step each way).
    return verifySync({ secret, token: clean, epochTolerance: 30 }).valid === true;
  } catch {
    return false;
  }
}

/** Whether the MFA gate applies to a role (privileged roles only). */
export function mfaRequiredForRole(role: Role): boolean {
  return isPrivileged(role);
}

/**
 * Lifetime of an MFA challenge: 5 minutes. Challenges are short-lived by
 * nature — long enough for a user to open their authenticator app, short
 * enough to bound replay exposure.
 */
export const MFA_CHALLENGE_TTL_MS = 5 * 60 * 1000;

/**
 * Generates a cryptographically random challenge id.
 *
 * The id is only a lookup key into the AuthStore (see
 * AuthStore.createMfaChallenge / consumeMfaChallenge) — it carries no
 * claims and cannot be forged into a session without the TOTP code.
 */
export function newMfaChallengeId(): string {
  return `mfa_${randomBytes(18).toString("base64url")}`;
}
