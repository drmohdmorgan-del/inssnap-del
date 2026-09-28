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

/**
 * Extracts the opaque session credential from the request.
 *
 * Prefers `Authorization: Bearer <credential>` (native mobile clients),
 * falling back to the session cookie (web browsers). Both carry the same
 * signed session value and resolve through the identical verification
 * path in `resolveSession` — the web cookie flow is completely unchanged.
 */
export function sessionCredentialFromRequest(req: NextRequest): string | undefined {
  const auth = req.headers.get("authorization");
  if (auth) {
    const m = /^Bearer\s+(\S+)$/i.exec(auth.trim());
    if (m) return m[1];
  }
  return req.cookies.get(SESSION_COOKIE)?.value;
}

/** Resolves the authenticated user from the Bearer credential or session cookie. */
export async function getSessionUser(req: NextRequest): Promise<SessionUser | null> {
  return resolveSession(getAuthStore(), sessionCredentialFromRequest(req));
}

/**
 * Issues a server-side session for the user and returns a JSON response
 * with the session cookie set. The raw token is never stored — only its
 * SHA-256 hash lives in the session record.
 *
 * When `opts.includeToken` is true, the opaque session credential is also
 * returned in the JSON body so a native client can persist it (SecureStore)
 * and send it as `Authorization: Bearer` on later requests. Web browsers
 * never request this and keep the HttpOnly-cookie-only flow, so the web
 * threat model is unchanged.
 */
export async function issueSessionResponse(
  user: Pick<UserRecord, "id" | "organizationId" | "email" | "fullName" | "role">,
  opts: { includeToken?: boolean } = {},
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
    ...(opts.includeToken ? { token: cookieValue } : {}),
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
