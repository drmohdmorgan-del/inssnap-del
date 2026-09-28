/**
 * Two-step login — TASK-002.
 *
 * Step 1 (this route): verify email + password. If the account has MFA
 * enabled, return HTTP 202 with a short-lived single-use challenge id
 * instead of a session. Otherwise issue the session immediately.
 * Step 2: POST /api/auth/mfa/verify with { challengeId, code }.
 */

import { NextRequest, NextResponse } from "next/server";
import { verifyPassword, newMfaChallengeId, MFA_CHALLENGE_TTL_MS } from "@inssnapp/auth";
import { getAuthStore } from "../../../../lib/auth-store";
import { issueSessionResponse, isMobileLoginAllowed } from "../../../../lib/auth-helpers";
import { db } from "../../../../lib/db";
import {
  checkRateLimit,
  clientIp,
  rateLimitExceeded,
  rateLimitPresets,
} from "../../../../lib/rate-limit";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const { email, password, issueToken } = body as {
    email?: string;
    password?: string;
    issueToken?: boolean;
  };
  if (!email || !password) {
    return NextResponse.json({ error: "Email and password are required." }, { status: 400 });
  }

  // TASK-010: rate limit BEFORE password verification — per account (so one
  // attacker's guesses don't lock out other users) and per IP (so one IP
  // can't sweep many accounts).
  const limits = rateLimitPresets();
  const accountKey = `login:acct:${email.trim().toLowerCase()}`;
  const accountCheck = checkRateLimit(accountKey, limits.loginPerAccount);
  if (!accountCheck.allowed) return rateLimitExceeded(accountCheck.retryAfterSeconds);
  const ipKey = `login:ip:${clientIp(req)}`;
  const ipCheck = checkRateLimit(ipKey, limits.loginPerIp);
  if (!ipCheck.allowed) return rateLimitExceeded(ipCheck.retryAfterSeconds);

  const store = getAuthStore();
  // Login-only cross-org lookup; the organization is resolved from the
  // matched user record and every later query is org-scoped.
  const user = await store.getUserByEmailAnyOrg(email);
  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    // Same response for unknown email vs wrong password (no oracle).
    // TASK-007: record the failure for the Control Center security view.
    // The org is unknown when the email matches nobody — record it anyway
    // with a null organization.
    await db.securityEvents.insert({
      organizationId: user?.organizationId ?? null,
      type: "login_failed",
      actorUserId: user?.id ?? null,
      actorEmail: email.trim().toLowerCase(),
      detail: user ? "incorrect password" : "unknown email",
    });
    return NextResponse.json({ error: "Invalid credentials." }, { status: 401 });
  }

  // MFA gate for privileged roles: no session until the TOTP step passes.
  if (user.mfaEnabled) {
    // Challenges persist in the AuthStore (not process memory) so the
    // challenge issued here is consumable by any server instance.
    const challengeId = newMfaChallengeId();
    await store.createMfaChallenge({
      id: challengeId,
      userId: user.id,
      organizationId: user.organizationId,
      expiresAt: new Date(Date.now() + MFA_CHALLENGE_TTL_MS),
    });
    return NextResponse.json({ mfaRequired: true, challengeId }, { status: 202 });
  }

  await db.securityEvents.insert({
    organizationId: user.organizationId,
    type: "login_succeeded",
    actorUserId: user.id,
    actorEmail: user.email,
    detail: null,
  });
  // Platform authority: mobile tokens are only minted for the field roles.
  if (issueToken === true && !isMobileLoginAllowed(user.role)) {
    await db.securityEvents.insert({
      organizationId: user.organizationId,
      type: "login_denied",
      actorUserId: user.id,
      actorEmail: user.email,
      detail: "mobile platform not authorized for role",
    });
    return NextResponse.json(
      { error: "This account is not authorized for mobile sign-in." },
      { status: 403 }
    );
  }
  return issueSessionResponse(user, { includeToken: issueToken === true });
}
