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
 * Just-in-time provisioning: if the demo account doesn't exist yet (e.g.
 * a fresh production instance), it is created on demand in a "Demo Test
 * Org" — so testing works with zero setup. Demo accounts are fake
 * @inssnapp.demo users; their password hash is unusable ("!").
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
  let user = await store.getUserByEmailAnyOrg(account.email);
  if (!user) {
    // Just-in-time demo provisioning (pilot testing, no setup needed).
    const orgs = await db.orgs.list();
    const orgId = orgs[0]?.id ?? (await db.orgs.create("Demo Test Org")).id;
    user = await store.createUser({
      organizationId: orgId,
      email: account.email,
      fullName: account.label,
      passwordHash: "!",
      role: account.role,
      emailVerified: true,
    });
    await db.securityEvents.insert({
      organizationId: user.organizationId,
      type: "login_succeeded",
      actorUserId: user.id,
      actorEmail: user.email,
      detail: "test-mode sign-in (demo account provisioned just-in-time)",
    });
  } else {
    await db.securityEvents.insert({
      organizationId: user.organizationId,
      type: "login_succeeded",
      actorUserId: user.id,
      actorEmail: user.email,
      detail: "test-mode sign-in",
    });
  }
  const res = await issueSessionResponse(user);
  const data = await res.json();
  return NextResponse.json({ ...data, home: account.home }, { headers: res.headers });
}
