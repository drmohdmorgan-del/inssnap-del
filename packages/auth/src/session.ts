/**
 * Session cookies bound to server-side sessions — TASK-002.
 *
 * The cookie carries an HMAC-signed opaque session token
 * (`base64url({v:1,tok}) . signature`). The token itself is meaningless
 * without the server-side session record: on every request the token's
 * SHA-256 hash is looked up in the AuthStore, where expiry and revocation
 * are enforced. Stealing the cookie gains nothing once the session is
 * revoked, and tampering with the payload fails HMAC verification.
 *
 * Replaces the old stateless design (identity claims in the cookie, plus a
 * server-side token that was created and then discarded — dead code removed
 * in TASK-002).
 */

import { createHash, randomBytes } from "node:crypto";
import type { Role } from "@inssnapp/engine";
import type { AuthStore, SessionRecord } from "./types.ts";

/** Authenticated identity carried by a session. */
export interface SessionUser {
  userId: string;
  organizationId: string;
  email: string;
  fullName: string;
  role: Role;
}

const encoder = new TextEncoder();

/** URL-safe base64 of raw bytes. */
function b64url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromB64url(s: string): Uint8Array {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function secretKey(): string {
  return process.env.INSSNAPP_AUTH_SECRET || "inssnapp-dev-secret-change-in-production";
}

async function hmac(data: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secretKey()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(data));
  return b64url(new Uint8Array(sig));
}

/** Default session lifetime: 7 days. */
export const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** Generates a 256-bit opaque session token (base64url). */
export function createSessionToken(): string {
  return b64url(randomBytes(32));
}

/** SHA-256 hex of the token — this is what is stored server-side. */
export function hashSessionToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

interface CookiePayload {
  v: 1;
  tok: string;
}

/** Signs an opaque session token into a cookie value. */
export async function signSessionToken(token: string): Promise<string> {
  const payload = b64url(encoder.encode(JSON.stringify({ v: 1, tok: token } satisfies CookiePayload)));
  const sig = await hmac(payload);
  return `${payload}.${sig}`;
}

/** Verifies a cookie value and returns the opaque session token, or null. */
export async function verifySessionToken(cookieValue: string | undefined | null): Promise<string | null> {
  if (!cookieValue) return null;
  const dot = cookieValue.lastIndexOf(".");
  if (dot <= 0) return null;
  const payload = cookieValue.slice(0, dot);
  const sig = cookieValue.slice(dot + 1);
  const expected = await hmac(payload);
  if (sig.length !== expected.length) return null;
  let equal = 0;
  for (let i = 0; i < sig.length; i++) equal |= sig.charCodeAt(i) ^ expected.charCodeAt(i);
  if (equal !== 0) return null;
  try {
    const parsed = JSON.parse(new TextDecoder().decode(fromB64url(payload))) as CookiePayload;
    if (parsed.v !== 1 || typeof parsed.tok !== "string" || !parsed.tok) return null;
    return parsed.tok;
  } catch {
    return null;
  }
}

/**
 * Creates a server-side session record and returns the cookie value to set.
 * The raw token is never stored — only its SHA-256 hash.
 */
export async function issueSession(
  store: AuthStore,
  user: { id: string; organizationId: string },
  ttlMs = SESSION_TTL_MS,
): Promise<{ token: string; cookieValue: string; record: SessionRecord }> {
  const token = createSessionToken();
  const record = await store.createSession({
    tokenHash: hashSessionToken(token),
    userId: user.id,
    organizationId: user.organizationId,
    expiresAt: new Date(Date.now() + ttlMs),
  });
  const cookieValue = await signSessionToken(token);
  return { token, cookieValue, record };
}

/**
 * Resolves a session cookie to the authenticated user.
 *
 * Order: HMAC integrity → server-side record → expiry → user lookup →
 * organization binding. Any failure returns null. Expired records are
 * revoked on sight.
 */
export async function resolveSession(
  store: AuthStore,
  cookieValue: string | undefined | null,
): Promise<SessionUser | null> {
  const token = await verifySessionToken(cookieValue);
  if (!token) return null;
  const record = await store.getSessionByTokenHash(hashSessionToken(token));
  if (!record) return null;
  if (new Date(record.expiresAt).getTime() < Date.now()) {
    await store.revokeSession(record.tokenHash);
    return null;
  }
  const user = await store.getUserById(record.userId);
  if (!user) {
    await store.revokeSession(record.tokenHash);
    return null;
  }
  if (user.organizationId !== record.organizationId) {
    await store.revokeSession(record.tokenHash);
    return null;
  }
  return {
    userId: user.id,
    organizationId: user.organizationId,
    email: user.email,
    fullName: user.fullName,
    role: user.role,
  };
}

/** Cookie value for a logged-in session. */
export const SESSION_COOKIE = "inssnapp_session";

export function sessionCookie(cookieValue: string, maxAgeSeconds = SESSION_TTL_MS / 1000): string {
  const parts = [
    `${SESSION_COOKIE}=${cookieValue}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${Math.floor(maxAgeSeconds)}`,
  ];
  if (process.env.NODE_ENV === "production") parts.push("Secure");
  return parts.join("; ");
}

export function clearSessionCookie(): string {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}
