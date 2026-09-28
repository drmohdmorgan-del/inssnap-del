import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "../../../../lib/admin-guard";
import { db } from "../../../../lib/db";

/**
 * Cross-organization audit log viewer with filters:
 * orgId, transition, fromState, toState, since (ISO), limit (1–500).
 * Admin only.
 */
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if ("error" in auth) return auth.error;

  const params = req.nextUrl.searchParams;
  const orgId = params.get("orgId");
  const limitRaw = Number.parseInt(params.get("limit") ?? "100", 10);

  const orgIds = orgId ? [orgId] : (await db.orgs.list()).map((o: { id: string }) => o.id);

  const events = await db.showingEvents.listFiltered({
    organizationIds: orgIds,
    transition: params.get("transition") ?? undefined,
    fromState: params.get("fromState") ?? undefined,
    toState: params.get("toState") ?? undefined,
    since: params.get("since") ?? undefined,
    limit: Number.isFinite(limitRaw) ? limitRaw : 100,
  });
  return NextResponse.json({ events });
}
