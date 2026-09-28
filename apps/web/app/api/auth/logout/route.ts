import { NextRequest, NextResponse } from "next/server";
import { verifySessionToken, hashSessionToken, SESSION_COOKIE } from "@inssnapp/auth";
import { getAuthStore } from "../../../../lib/auth-store";
import { logoutResponse } from "../../../../lib/auth-helpers";
import { db } from "../../../../lib/db";

export async function POST(req: NextRequest) {
  // Revoke the server-side session so the cookie cannot be reused.
  const cookie = req.cookies.get(SESSION_COOKIE)?.value;
  const token = await verifySessionToken(cookie);
  if (token) {
    const store = getAuthStore();
    // Attribute the revocation event before deleting the record.
    const session = await store.getSessionByTokenHash(hashSessionToken(token));
    await store.revokeSession(hashSessionToken(token));
    if (session) {
      const user = await store.getUserById(session.userId);
      await db.securityEvents.insert({
        organizationId: session.organizationId,
        type: "session_revoked",
        actorUserId: session.userId,
        actorEmail: user?.email ?? null,
        detail: "logout",
      });
    }
  }
  return logoutResponse();
}
