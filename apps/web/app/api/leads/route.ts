import { NextRequest, NextResponse } from "next/server";
import { getSessionUser, unauthorized, forbidden } from "../../../lib/auth-helpers";
import { db } from "../../../lib/db";
import { isPrivileged } from "@inssnapp/auth";
import type { Showing } from "@inssnapp/engine";

/**
 * Lead pool (Phase 6).
 *
 * GET /api/leads — privileged only.
 * A "lead" is a showing in OUTCOME state.
 * - inssnapp_admin (Control): every OUTCOME showing across organizations,
 *   with its current disposition (pending/inhouse/management).
 * - management: only leads Control pushed to them (disposition=management)
 *   in their own organization — their actionable lead pool.
 */
export async function GET(req: NextRequest) {
  const user = await getSessionUser(req);
  if (!user) return unauthorized();
  if (!isPrivileged(user.role)) return forbidden();

  const orgIds =
    user.role === "inssnapp_admin"
      ? (await db.orgs.list()).map((o) => o.id)
      : [user.organizationId];

  const orgNames = new Map((await db.orgs.list()).map((o) => [o.id, o.name]));
  const leads: Array<{
    showingId: string;
    organizationId: string;
    organizationName: string;
    unitLabel: string | null;
    propertyName: string | null;
    prospectName: string | null;
    outcome: string | null;
    state: string;
    disposition: string;
    decidedAt: string | null;
    brokerAssigned: boolean;
    avgStars: number | null;
    completedAt: string;
  }> = [];

  for (const orgId of orgIds) {
    const showings: Showing[] = await db.showings.list(orgId);
    const dispositions = new Map(
      (await db.leadDispositions.byOrg(orgId)).map((d) => [d.showingId, d]),
    );
    for (const s of showings) {
      if (s.state !== "OUTCOME") continue;
      const disp = dispositions.get(s.id);
      if (user.role === "management" && disp?.disposition !== "management") continue;

      const unit = await db.units.byId(s.unitId);
      const property = unit ? await db.properties.byId(unit.propertyId) : null;
      const prospect = s.prospectUserId ? await db.users.byId(s.prospectUserId) : null;
      const ratings = await db.ratings.byShowing(s.id);
      const avg =
        ratings.length > 0
          ? Math.round((ratings.reduce((sum, r) => sum + r.stars, 0) / ratings.length) * 10) / 10
          : null;

      leads.push({
        showingId: s.id,
        organizationId: s.organizationId,
        organizationName: orgNames.get(s.organizationId) ?? "—",
        unitLabel: unit?.label ?? null,
        propertyName: property?.name ?? null,
        prospectName: prospect?.fullName ?? null,
        outcome: s.outcome,
        state: s.state,
        disposition: disp?.disposition ?? "pending",
        decidedAt: disp?.decidedAt ?? null,
        brokerAssigned: !!s.brokerUserId,
        avgStars: avg,
        completedAt: s.updatedAt,
      });
    }
  }

  leads.sort((a, b) => (a.completedAt < b.completedAt ? 1 : -1));
  return NextResponse.json({ leads });
}
