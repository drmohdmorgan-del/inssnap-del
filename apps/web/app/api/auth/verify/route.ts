import { NextRequest, NextResponse } from "next/server";
import { getAuthStore } from "../../../../lib/auth-store";
import { issueSessionResponse } from "../../../../lib/auth-helpers";
import { db } from "../../../../lib/db";
import {
  checkRateLimit,
  clientIp,
  rateLimitExceeded,
  rateLimitPresets,
} from "../../../../lib/rate-limit";

/**
 * Email verification completing signup (Phase 2/3).
 *
 * POST { email, code, inviteCode? }
 *
 * Consumes the 6-digit code (15-min TTL, 5 attempts then locked), marks the
 * email verified, consumes the invite when given (linking a resident to the
 * invite's unit), and issues the session — the user is signed in.
 */
export async function POST(req: NextRequest) {
  const limits = rateLimitPresets();
  const ipCheck = checkRateLimit(`verify:ip:${clientIp(req)}`, limits.signupPerIp);
  if (!ipCheck.allowed) return rateLimitExceeded(ipCheck.retryAfterSeconds);

  const body = (await req.json().catch(() => ({}))) as {
    email?: unknown;
    code?: unknown;
    inviteCode?: unknown;
  };
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const code = typeof body.code === "string" ? body.code.trim() : "";
  if (!email || !code) {
    return NextResponse.json({ error: "Email and verification code are required." }, { status: 400 });
  }

  const store = getAuthStore();
  const user = await store.getUserByEmailAnyOrg(email);
  if (!user) {
    return NextResponse.json({ error: "Invalid code." }, { status: 400 });
  }
  if (user.emailVerified) {
    // Already verified — just sign them in.
    return issueSessionResponse(user);
  }

  const consumed = await db.verificationCodes.consume(user.organizationId, email, code);
  if (!consumed.ok) {
    const msg =
      consumed.error === "expired"
        ? "That code has expired. Request a new one."
        : consumed.error === "locked"
          ? "Too many attempts. Request a new code."
          : "Invalid code.";
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  // Invite: validate again, consume, and link a resident to the unit.
  const inviteCode =
    typeof body.inviteCode === "string" && body.inviteCode.trim()
      ? body.inviteCode.trim()
      : null;
  if (inviteCode) {
    const invite = await db.invites.byCode(user.organizationId, inviteCode);
    if (!invite || invite.usedAt || new Date(invite.expiresAt).getTime() <= Date.now()) {
      return NextResponse.json({ error: "That invite code is invalid or expired." }, { status: 400 });
    }
    if (invite.role !== user.role) {
      return NextResponse.json(
        { error: `That invite code is for a ${invite.role} account.` },
        { status: 400 },
      );
    }
    await db.invites.markUsed(invite.id, user.id);
    if (user.role === "resident" && invite.unitId) {
      await db.residents.link(user.id, invite.unitId);
    }
  }

  const verified = await store.setEmailVerified(user.id);
  if (verified && verified.role === "broker") {
    // Phase 7: new brokers start on the free trial tier.
    await db.brokerProfiles.getOrCreate(verified.id, verified.organizationId);
  }
  return issueSessionResponse(verified ?? user);
}
