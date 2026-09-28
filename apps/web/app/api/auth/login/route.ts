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
import { issueSessionResponse } from "../../../../lib/auth-helpers";
import { db } from "../../../../lib/db";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const { email, password } = body as { email?: string; password?: string };
  if (!email || !password) {
    return NextResponse.json({ error: "Email and password are required." }, { status: 400 });
  }

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
  return issueSessionResponse(user);
}
