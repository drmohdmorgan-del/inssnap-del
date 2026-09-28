import { NextRequest, NextResponse } from "next/server";
import { getSessionUser, unauthorized, forbidden } from "../../../../../lib/auth-helpers";
import { db } from "../../../../../lib/db";

/**
 * Resident "Available NOW" toggle (TASK-004).
 *
 * Lets a resident flip `residentAvailable` on their OWN linked unit —
 * the one control the scope gives the resident over prospect discovery.
 * The caller must hold a resident ↔ unit link for the target unit in
 * their own organization; management keeps the privileged PATCH
 * /api/units/[id] path for eligibility and labeling.
 */
export async function POST(req: NextRequest) {
  const user = await getSessionUser(req);
  if (!user) return unauthorized();
  if (user.role !== "resident") return forbidden();

  const body = (await req.json().catch(() => ({}))) as {
    unitId?: unknown;
    available?: unknown;
  };
  const { unitId, available } = body;
  if (typeof unitId !== "string" || !unitId) {
    return NextResponse.json({ error: "unitId is required." }, { status: 400 });
  }
  if (typeof available !== "boolean") {
    return NextResponse.json({ error: "available must be a boolean." }, { status: 400 });
  }

  const links = await db.residents.byUser(user.userId);
  const link = links.find((l: { unitId: string }) => l.unitId === unitId);
  if (!link) {
    // 404 — not 403 — so callers cannot probe other organizations' units.
    return NextResponse.json({ error: "Unit not found." }, { status: 404 });
  }

  const unit = await db.units.byId(unitId);
  if (!unit || unit.organizationId !== user.organizationId) {
    return NextResponse.json({ error: "Unit not found." }, { status: 404 });
  }

  const updated = await db.units.patch(unitId, { residentAvailable: available });
  return NextResponse.json({ unit: updated });
}
