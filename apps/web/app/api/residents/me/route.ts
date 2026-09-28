import { NextRequest, NextResponse } from "next/server";
import { getSessionUser, unauthorized, forbidden } from "../../../../lib/auth-helpers";
import { db } from "../../../../lib/db";

/**
 * The caller's own resident enrollment (TASK-004).
 *
 * Returns the linked unit(s) with verification and availability status —
 * the "verified resident/unit status" the Resident Mobile experience
 * displays. Resident role only; tenant-scoped by the caller's own
 * organization so no other org's links can leak through.
 */
export async function GET(req: NextRequest) {
  const user = await getSessionUser(req);
  if (!user) return unauthorized();
  if (user.role !== "resident") return forbidden();

  const enrollments = await db.residents.byUserDetailed(user.userId, user.organizationId);
  return NextResponse.json({ enrollments });
}
