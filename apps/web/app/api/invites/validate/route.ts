import { NextRequest, NextResponse } from "next/server";
import { db } from "../../../../lib/db";

/**
 * Public invite validation for the signup page (Phase 1/2).
 *
 * GET /api/invites/validate?code=XXXXXX
 *
 * The code is unguessable (6 chars from a 32-symbol alphabet ≈ 1B
 * combinations) and reveals only non-sensitive facts: organization name,
 * property/unit labels, and the invited role. Usable (not expired/used)
 * invites only.
 */
export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code")?.trim() ?? "";
  if (!code) {
    return NextResponse.json({ valid: false, error: "code is required." }, { status: 400 });
  }
  const invite = await db.invites.byCodeAnyOrg(code);
  if (!invite || invite.usedAt || new Date(invite.expiresAt).getTime() <= Date.now()) {
    return NextResponse.json({ valid: false });
  }
  const orgs = await db.orgs.list();
  const org = orgs.find((o) => o.id === invite.organizationId);
  let unitLabel: string | null = null;
  let propertyName: string | null = null;
  if (invite.unitId) {
    const unit = await db.units.byId(invite.unitId);
    if (unit) {
      unitLabel = unit.label;
      const property = await db.properties.byId(unit.propertyId);
      propertyName = property?.name ?? null;
    }
  }
  return NextResponse.json({
    valid: true,
    role: invite.role,
    organizationId: invite.organizationId,
    organizationName: org?.name ?? null,
    unitLabel,
    propertyName,
  });
}
