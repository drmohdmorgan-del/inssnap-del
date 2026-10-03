import { NextRequest, NextResponse } from "next/server";
import { getAuthStore } from "../../../../../lib/auth-store";
import { db } from "../../../../../lib/db";
import { notifyVerificationCode } from "../../../../../lib/notifications";
import {
  checkRateLimit,
  clientIp,
  rateLimitExceeded,
  rateLimitPresets,
} from "../../../../../lib/rate-limit";

/**
 * Resends the signup verification code (Phase 2/3).
 *
 * POST { email } — issues a fresh code (superseding older unused ones) for
 * an existing UNVERIFIED account. Verified accounts get a generic ok.
 */
export async function POST(req: NextRequest) {
  const limits = rateLimitPresets();
  const ipCheck = checkRateLimit(`verify-resend:ip:${clientIp(req)}`, limits.signupPerIp);
  if (!ipCheck.allowed) return rateLimitExceeded(ipCheck.retryAfterSeconds);

  const body = (await req.json().catch(() => ({}))) as { email?: unknown };
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!email) {
    return NextResponse.json({ error: "Email is required." }, { status: 400 });
  }

  const store = getAuthStore();
  const user = await store.getUserByEmailAnyOrg(email);
  // Generic ok for unknown/verified — no enumeration oracle.
  if (!user || user.emailVerified) {
    return NextResponse.json({ ok: true });
  }

  const vc = await db.verificationCodes.issue(user.organizationId, email);
  await notifyVerificationCode(user.organizationId, email, vc.code);
  return NextResponse.json({
    ok: true,
    ...(process.env.NODE_ENV === "production" ? {} : { devCode: vc.code }),
  });
}
