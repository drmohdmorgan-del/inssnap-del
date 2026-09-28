/**
 * Server-side auth helpers — TASK-002.
 *
 * Sessions are resolved against the AuthStore (in-memory seed for local
 * dev, PostgreSQL when DATABASE_URL is set): HMAC integrity of the cookie,
 * then server-side record lookup, expiry, and revocation.
 */

import { NextRequest, NextResponse } from "next/server";
import {
  resolveSession,
  issueSession,
  sessionCookie,
  SESSION_COOKIE,
  clearSessionCookie,
  SESSION_TTL_MS,
  type SessionUser,
  type UserRecord,
} from "@inssnapp/auth";
import { getAuthStore } from "./auth-store";

/** Resolves the authenticated user from the request session cookie. */
export async function getSessionUser(req: NextRequest): Promise<SessionUser | null> {
  const cookie = req.cookies.get(SESSION_COOKIE)?.value;
  return resolveSession(getAuthStore(), cookie);
}

/**
 * Issues a server-side session for the user and returns a JSON response
 * with the session cookie set. The raw token is never stored — only its
 * SHA-256 hash lives in the session record.
 */
export async function issueSessionResponse(
  user: Pick<UserRecord, "id" | "organizationId" | "email" | "fullName" | "role">,
) {
  const { cookieValue } = await issueSession(
    getAuthStore(),
    { id: user.id, organizationId: user.organizationId },
    SESSION_TTL_MS,
  );
  const res = NextResponse.json({
    user: {
      userId: user.id,
      organizationId: user.organizationId,
      email: user.email,
      fullName: user.fullName,
      role: user.role,
    },
  });
  res.headers.append("Set-Cookie", sessionCookie(cookieValue, SESSION_TTL_MS / 1000));
  return res;
}

export function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

export function forbidden() {
  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}

export function logoutResponse() {
  const res = NextResponse.json({ ok: true });
  res.headers.set("Set-Cookie", clearSessionCookie());
  return res;
}
