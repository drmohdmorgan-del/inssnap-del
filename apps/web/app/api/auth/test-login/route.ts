import { NextRequest, NextResponse } from "next/server";
import { getAuthStore } from "../../../../lib/auth-store";
import { issueSessionResponse } from "../../../../lib/auth-helpers";
import { db } from "../../../../lib/db";
import { isTestModeEnabled, TEST_MODE_ACCOUNTS, type TestModeRole } from "../../../../lib/test-mode";
import {
  checkRateLimit,
  clientIp,
  rateLimitExceeded,
  rateLimitPresets,
} from "../../../../lib/rate-limit";

/**
 * Test-mode one-click sign-in (pilot testing only).
 *
 * POST { role: "management" | "resident" | "prospect" | "broker" }
 *
 * No password, no MFA. This is a PARALLEL test path — the real login
 * (password + MFA) is untouched. Kill-switch: INSSNAPP_TEST_MODE=0.
 *
 * Fail-closed: the seeded demo accounts must exist (dev/pilot seed). A
 * production instance with only the bootstrap admin rejects every call
 * with 404 — there is no demo user to sign in as.
 */
export async function POST(req: NextRequest) {
  if (!isTestModeEnabled()) {
    return NextResponse.json({ error: "Test mode is disabled." }, { status: 403 });
  }

  const limits = rateLimitPresets();
  const ipCheck = checkRateLimit(`test-login:ip:${clientIp(req)}`, limits.loginPerIp);
  if (!ipCheck.allowed) return rateLimitExceeded(ipCheck.retryAfterSeconds);

  const body = (await req.json().catch(() => ({}))) as { role?: unknown };
  const account = TEST_MODE_ACCOUNTS.find((a) => a.role === (body.role as TestModeRole));
  if (!account) {
    return NextResponse.json(
      { error: "role must be one of: management, resident, prospect, broker." },
      { status: 400 },
    );
  }

  const store = getAuthStore();
  const user = await store.getUserByEmailAnyOrg(account.email);
  if (!user) {
    // No demo seed (e.g. production) — fail closed, no oracle beyond this.
    await db.securityEvents.insert({
      organizationId: null,
      type: "login_failed",
      actorUserId: null,
      actorEmail: account.email,
      detail: "test-mode sign-in with no demo account present",
    });
    return NextResponse.json({ error: "Test sign-in is not available here." }, { status: 404 });
  }

  await db.securityEvents.insert({
    organizationId: user.organizationId,
    type: "login_succeeded",
    actorUserId: user.id,
    actorEmail: user.email,
    detail: "test-mode sign-in",
  });
  const res = await issueSessionResponse(user);
  const data = await res.json();
  return NextResponse.json({ ...data, home: account.home }, { headers: res.headers });
}
