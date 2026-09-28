import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "../../../../lib/admin-guard";
import { db } from "../../../../lib/db";

const ACTIVE_STATES = ["REQUESTED", "RESIDENT_ACCEPTED", "BROKER_GATE", "CONFIRMED", "IN_PROGRESS", "COMPLETED"];

/** Organization overview: every org with portfolio and activity counts. Admin only. */
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if ("error" in auth) return auth.error;

  const orgs = await db.orgs.list();
  const result = await Promise.all(
    orgs.map(async (org: { id: string; name: string }) => {
      const [users, properties, units, showings] = await Promise.all([
        db.users.byOrg(org.id),
        db.properties.byOrg(org.id),
        db.units.byOrg(org.id),
        db.showings.list(org.id),
      ]);
      return {
        id: org.id,
        name: org.name,
        counts: {
          users: users.length,
          properties: properties.length,
          units: units.length,
          eligibleUnits: units.filter((u: { eligible: boolean }) => u.eligible).length,
          showings: showings.length,
          activeShowings: showings.filter((s: { state: string }) =>
            ACTIVE_STATES.includes(s.state),
          ).length,
        },
      };
    }),
  );
  return NextResponse.json({ orgs: result });
}
