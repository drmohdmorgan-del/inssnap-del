import { NextRequest, NextResponse } from "next/server";
import { hashPassword, DuplicateUserError } from "@inssnapp/auth";
import { getAuthStore } from "../../../../lib/auth-store";
import { db } from "../../../../lib/db";
import { notifyVerificationCode } from "../../../../lib/notifications";
import {
  checkRateLimit,
  clientIp,
  rateLimitExceeded,
  rateLimitPresets,
} from "../../../../lib/rate-limit";

/**
 * Public signup (Phase 2/3).
 *
 * Body: { email, password, fullName, role: "resident" | "prospect" | "broker",
 *         inviteCode?: string }
 *
 * - resident REQUIRES an invite code (management invites the current tenant);
 *   the new account is linked to the invite's unit after verification.
 * - prospect/broker may sign up with or without an invite; without one they
 *   join the platform's first organization (pilot simplification — the
 *   invite's organization wins when a code is given).
 * - management / inssnapp_admin can NEVER self-register (fail closed).
 *
 * The account is created UNVERIFIED; a 6-digit email code is issued
 * (15-min TTL, free — no SMS). POST /api/auth/verify completes signup and
 * issues the session.
 */

const SIGNUP_ROLES = ["resident", "prospect", "broker"] as const;

function validEmail(v: unknown): v is string {
  return typeof v === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim()) && v.trim().length <= 254;
}

export async function POST(req: NextRequest) {
  const limits = rateLimitPresets();
  const ipCheck = checkRateLimit(`signup:ip:${clientIp(req)}`, limits.signupPerIp);
  if (!ipCheck.allowed) return rateLimitExceeded(ipCheck.retryAfterSeconds);

  const body = (await req.json().catch(() => ({}))) as {
    email?: unknown;
    password?: unknown;
    fullName?: unknown;
    role?: unknown;
    inviteCode?: unknown;
  };

  if (!validEmail(body.email)) {
    return NextResponse.json({ error: "A valid email address is required." }, { status: 400 });
  }
  if (typeof body.password !== "string" || body.password.length < 8 || body.password.length > 128) {
    return NextResponse.json(
      { error: "Password must be 8–128 characters." },
      { status: 400 },
    );
  }
  if (typeof body.fullName !== "string" || !body.fullName.trim() || body.fullName.trim().length > 120) {
    return NextResponse.json({ error: "Full name (1–120 chars) is required." }, { status: 400 });
  }
  if (!SIGNUP_ROLES.includes(body.role as (typeof SIGNUP_ROLES)[number])) {
    return NextResponse.json(
      { error: "role must be resident, prospect or broker." },
      { status: 400 },
    );
  }
  const role = body.role as (typeof SIGNUP_ROLES)[number];
  const email = body.email.trim().toLowerCase();

  // Resolve the organization + optional unit binding from the invite.
  let organizationId: string | null = null;
  const inviteCode =
    typeof body.inviteCode === "string" && body.inviteCode.trim()
      ? body.inviteCode.trim()
      : null;

  if (inviteCode) {
    const invite = await db.invites.byCodeAnyOrg(inviteCode);
    if (!invite || invite.usedAt || new Date(invite.expiresAt).getTime() <= Date.now()) {
      return NextResponse.json({ error: "That invite code is invalid or expired." }, { status: 400 });
    }
    if (invite.role !== role) {
      return NextResponse.json(
        { error: `That invite code is for a ${invite.role} account.` },
        { status: 400 },
      );
    }
    organizationId = invite.organizationId;
  } else if (role === "resident") {
    return NextResponse.json(
      { error: "A resident account needs an invite code from your property manager." },
      { status: 400 },
    );
  }

  if (!organizationId) {
    // Pilot simplification: invite-less prospect/broker signups join the
    // first organization. Documented in the audit; revisit with real org
    // selection before launch.
    const orgs = await db.orgs.list();
    if (orgs.length === 0) {
      return NextResponse.json({ error: "No organization is accepting signups." }, { status: 503 });
    }
    organizationId = orgs[0].id;
  }

  const store = getAuthStore();
  const existing = await store.getUserByEmail(email, organizationId);
  if (existing) {
    // Same response shape as login: no account-enumeration oracle beyond
    // "this email is taken here" (needed for usable signup UX).
    return NextResponse.json(
      { error: "An account with that email already exists. Try signing in." },
      { status: 409 },
    );
  }

  let user;
  try {
    user = await store.createUser({
      organizationId,
      email,
      fullName: (body.fullName as string).trim(),
      passwordHash: await hashPassword(body.password as string),
      role,
      emailVerified: false,
    });
  } catch (err) {
    if (err instanceof DuplicateUserError) {
      return NextResponse.json(
        { error: "An account with that email already exists. Try signing in." },
        { status: 409 },
      );
    }
    throw err;
  }

  // The invite is validated again and consumed at the verify step, where
  // the resident ↔ unit link is created. (Validated here so the user gets
  // immediate feedback on a bad code.)

  const vc = await db.verificationCodes.issue(organizationId, email);
  await notifyVerificationCode(organizationId, email, vc.code);

  return NextResponse.json(
    {
      verificationRequired: true,
      email,
      role,
      organizationId,
      inviteCode,
      // Dev/pilot convenience: without an email provider configured the
      // code would otherwise be unreachable. Never in production.
      ...(process.env.NODE_ENV === "production" ? {} : { devCode: vc.code }),
    },
    { status: 201 },
  );
}
