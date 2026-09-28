/**
 * MFA verification — step 2 of the two-step login (TASK-002).
 *
 * Consumes the single-use challenge issued by /api/auth/login, verifies the
 * TOTP code against the user's enrolled secret, and issues the session.
 * Consumed challenges cannot be replayed.
 */

import { NextRequest, NextResponse } from "next/server";
import { verifyMfaToken } from "@inssnapp/auth";
import { getAuthStore } from "../../../../../lib/auth-store";
import { issueSessionResponse } from "../../../../../lib/auth-helpers";
import { db } from "../../../../../lib/db";
import {
  checkRateLimit,
  clientIp,
  rateLimitExceeded,
  rateLimitPresets,
} from "../../../../../lib/rate-limit";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const { challengeId, code, issueToken } = body as {
    challengeId?: string;
    code?: string;
    issueToken?: boolean;
  };
  if (!challengeId || !code) {
    return NextResponse.json({ error: "Challenge and code are required." }, { status: 400 });
  }

  // TASK-010: per-IP throttle on MFA code attempts (defense in depth —
  // challenges are single-use, but this caps guessing velocity).
  const limits = rateLimitPresets();
  const ipCheck = checkRateLimit(`mfa:ip:${clientIp(req)}`, limits.mfaPerIp);
  if (!ipCheck.allowed) return rateLimitExceeded(ipCheck.retryAfterSeconds);

  const store = getAuthStore();
  const challenge = await store.consumeMfaChallenge(challengeId);
  if (!challenge) {
    return NextResponse.json({ error: "Invalid or expired challenge." }, { status: 401 });
  }

  const user = await store.getUserById(challenge.userId);
  if (!user || user.organizationId !== challenge.organizationId) {
    return NextResponse.json({ error: "Invalid or expired challenge." }, { status: 401 });
  }
  if (!user.mfaEnabled || !user.mfaSecret) {
    return NextResponse.json({ error: "MFA is not enrolled for this account." }, { status: 401 });
  }
  if (!verifyMfaToken(user.mfaSecret, code)) {
    // TASK-007: record MFA failures for the Control Center security view.
    await db.securityEvents.insert({
      organizationId: user.organizationId,
      type: "mfa_failed",
      actorUserId: user.id,
      actorEmail: user.email,
      detail: null,
    });
    return NextResponse.json({ error: "Invalid code." }, { status: 401 });
  }

  await db.securityEvents.insert({
    organizationId: user.organizationId,
    type: "login_succeeded",
    actorUserId: user.id,
    actorEmail: user.email,
    detail: "mfa",
  });
  return issueSessionResponse(user, { includeToken: issueToken === true });
}
