import { NextRequest, NextResponse } from "next/server";
import { verifySessionToken, hashSessionToken, SESSION_COOKIE } from "@inssnapp/auth";
import { getAuthStore } from "../../../../lib/auth-store";
import { logoutResponse } from "../../../../lib/auth-helpers";

export async function POST(req: NextRequest) {
  // Revoke the server-side session so the cookie cannot be reused.
  const cookie = req.cookies.get(SESSION_COOKIE)?.value;
  const token = await verifySessionToken(cookie);
  if (token) {
    await getAuthStore().revokeSession(hashSessionToken(token));
  }
  return logoutResponse();
}
