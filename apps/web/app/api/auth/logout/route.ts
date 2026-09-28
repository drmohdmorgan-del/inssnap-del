import { NextRequest, NextResponse } from "next/server";
import { verifySessionToken, hashSessionToken } from "@inssnapp/auth";
import { getAuthStore } from "../../../../lib/auth-store";
import { logoutResponse, sessionCredentialFromRequest } from "../../../../lib/auth-helpers";
import { db } from "../../../../lib/db";

export async function POST(req: NextRequest) {
  // Revoke the server-side session so the credential cannot be reused —
  // works for both the web session cookie and a mobile Bearer credential.
  const credential = sessionCredentialFromRequest(req);
  const token = await verifySessionToken(credential);
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
