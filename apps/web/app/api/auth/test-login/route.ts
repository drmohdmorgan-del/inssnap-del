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
 * Test-mode one-click sign-in (explicit local/dev opt-in only).
 *
 * POST { role: "management" | "resident" | "prospect" | "broker" }
 *
 * No password, no MFA. This is a PARALLEL test path — the real login
 * (password + MFA) is untouched. Opt-in: INSSNAPP_TEST_MODE=1 (default off).
 *
 * Fail-closed:
 * - Only the pre-seeded @inssnapp.demo accounts can sign in here. There is
 *   NO just-in-time provisioning — unknown demo accounts are rejected, never
 *   created.
 * - Refuses whenever ANY non-demo organization exists (an org with at least
 *   one user whose email is not @inssnapp.demo), so the backdoor can never be
 *   used against real customer data even if the flag is misconfigured.
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

  // N3: never serve test sign-in alongside real customer data.
  if (await hasNonDemoOrg()) {
    return NextResponse.json({ error: "Test mode is disabled." }, { status: 403 });
  }

  const store = getAuthStore();
  const user = await store.getUserByEmailAnyOrg(account.email);
  if (!user) {
    // No just-in-time provisioning: demo accounts must be pre-seeded.
    return NextResponse.json({ error: "Test mode is disabled." }, { status: 403 });
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

/**
 * True when any organization holds at least one non-demo user.
 * Demo users are the seeded @inssnapp.demo accounts; anything else marks the
 * org as real and test sign-in is refused.
 */
async function hasNonDemoOrg(): Promise<boolean> {
  const orgs = await db.orgs.list();
  for (const org of orgs) {
    const users = await db.users.byOrg(org.id);
    if (users.some((u) => !u.email.toLowerCase().endsWith("@inssnapp.demo"))) {
      return true;
    }
  }
  return false;
}
