import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "../../../../lib/admin-guard";
import { db } from "../../../../lib/db";

/**
 * Workflow health across organizations: per-org engine state distribution,
 * active counts, and recent transition volume (last 24h).
 * Admin only.
 */
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if ("error" in auth) return auth.error;

  const orgs = await db.orgs.list();
  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const result = await Promise.all(
    orgs.map(async (org: { id: string; name: string }) => {
      const [showings, recentEvents] = await Promise.all([
        db.showings.list(org.id),
        db.showingEvents.listFiltered({ organizationIds: [org.id], since: dayAgo, limit: 500 }),
      ]);
      const byState: Record<string, number> = {};
      for (const s of showings) byState[s.state] = (byState[s.state] ?? 0) + 1;
      return {
        orgId: org.id,
        orgName: org.name,
        totalShowings: showings.length,
        transitions24h: recentEvents.length,
        byState,
      };
    }),
  );

  const totals = result.reduce(
    (acc, r) => {
      acc.totalShowings += r.totalShowings;
      acc.transitions24h += r.transitions24h;
      for (const [state, n] of Object.entries(r.byState)) {
        acc.byState[state] = (acc.byState[state] ?? 0) + n;
      }
      return acc;
    },
    { totalShowings: 0, transitions24h: 0, byState: {} as Record<string, number> },
  );

  return NextResponse.json({ orgs: result, totals });
}
