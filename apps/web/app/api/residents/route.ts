import { NextRequest, NextResponse } from "next/server";
import { getSessionUser, unauthorized, forbidden } from "../../../lib/auth-helpers";
import { db } from "../../../lib/db";
import { isPrivileged } from "@inssnapp/auth";

/**
 * Enrolled residents in the caller's organization with participation status.
 *
 * Participation is derived from the linked unit:
 * - available_now: unit is eligible AND the resident's "Available NOW" flag is on
 * - enrolled: linked but not currently available
 *
 * Privileged roles only (management, inssnapp_admin).
 */
export async function GET(req: NextRequest) {
  const user = await getSessionUser(req);
  if (!user) return unauthorized();
  if (!isPrivileged(user.role)) return forbidden();

  const rows = await db.residents.byOrgDetailed(user.organizationId);
  const residents = rows.map((r) => ({
    ...r,
    participation:
      r.eligible && r.residentAvailable ? "available_now" : "enrolled",
  }));
  return NextResponse.json({ residents });
}
