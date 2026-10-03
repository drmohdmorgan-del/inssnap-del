import { NextRequest, NextResponse } from "next/server";
import { getSessionUser, unauthorized, forbidden } from "../../../lib/auth-helpers";
import { db } from "../../../lib/db";
import { isPrivileged } from "@inssnapp/auth";

/**
 * Organization user directory (safe fields only — Phase 7).
 *
 * GET /api/users?role=broker — privileged only, own organization.
 * Used by management to pick a broker when pushing a lead.
 */
export async function GET(req: NextRequest) {
  const user = await getSessionUser(req);
  if (!user) return unauthorized();
  if (!isPrivileged(user.role)) return forbidden();

  const role = req.nextUrl.searchParams.get("role");
  const users = await db.users.byOrg(user.organizationId);
  const filtered = role ? users.filter((u) => u.role === role) : users;
  return NextResponse.json({
    users: filtered.map((u) => ({
      id: u.id,
      fullName: u.fullName,
      role: u.role,
      emailVerified: u.emailVerified,
    })),
  });
}
