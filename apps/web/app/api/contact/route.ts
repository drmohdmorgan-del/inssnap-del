/**
 * Public contact-us endpoint (no auth).
 *
 * Accepts submissions from the /contact landing page, validates them, and
 * stores them via db.contact (PostgreSQL when DATABASE_URL is set, the
 * in-memory store for local dev). Rate-limited per IP to deter spam.
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "../../../lib/db";
import {
  checkRateLimit,
  clientIp,
  rateLimitExceeded,
  rateLimitPresets,
} from "../../../lib/rate-limit";

const CONTACT_ROLES = ["property_manager", "resident", "prospect", "broker", "other"] as const;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const { name, email, company, role, message } = body as {
    name?: unknown;
    email?: unknown;
    company?: unknown;
    role?: unknown;
    message?: unknown;
  };

  if (typeof name !== "string" || name.trim().length < 2 || name.trim().length > 100) {
    return NextResponse.json({ error: "Please provide your name." }, { status: 400 });
  }
  if (
    typeof email !== "string" ||
    email.length > 254 ||
    !EMAIL_RE.test(email.trim())
  ) {
    return NextResponse.json({ error: "Please provide a valid email address." }, { status: 400 });
  }
  if (
    typeof message !== "string" ||
    message.trim().length < 10 ||
    message.trim().length > 5000
  ) {
    return NextResponse.json(
      { error: "Please write a message between 10 and 5000 characters." },
      { status: 400 }
    );
  }
  if (company !== undefined && company !== null && typeof company !== "string") {
    return NextResponse.json({ error: "Invalid company value." }, { status: 400 });
  }
  if (
    role !== undefined &&
    role !== null &&
    !(typeof role === "string" && (CONTACT_ROLES as readonly string[]).includes(role))
  ) {
    return NextResponse.json({ error: "Invalid role selection." }, { status: 400 });
  }

  const limits = rateLimitPresets();
  const ipCheck = checkRateLimit(`contact:ip:${clientIp(req)}`, limits.contactPerIp);
  if (!ipCheck.allowed) return rateLimitExceeded(ipCheck.retryAfterSeconds);

  await db.contact.insert({
    name: name.trim(),
    email: email.trim().toLowerCase(),
    company: typeof company === "string" && company.trim() ? company.trim().slice(0, 200) : null,
    role: typeof role === "string" ? role : null,
    message: message.trim(),
  });

  return NextResponse.json({ ok: true });
}
