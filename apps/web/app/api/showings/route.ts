import { NextRequest, NextResponse } from "next/server";
import { getSessionUser, unauthorized, forbidden } from "../../../lib/auth-helpers";
import { db } from "../../../lib/db";
import { isPrivileged } from "@inssnapp/auth";

export async function GET(req: NextRequest) {
  const user = await getSessionUser(req);
  if (!user) return unauthorized();

  const showings = await db.showings.list(user.organizationId);
  return NextResponse.json({ showings });
}

export async function POST(req: NextRequest) {
  const user = await getSessionUser(req);
  if (!user) return unauthorized();
  if (!isPrivileged(user.role)) return forbidden();

  const body = await req.json().catch(() => ({}));
  const { unitId, residentUserId, brokerRequired } = body as {
    unitId?: string;
    residentUserId?: string;
    brokerRequired?: boolean;
  };
  if (!unitId || !residentUserId) {
    return NextResponse.json({ error: "unitId and residentUserId are required." }, { status: 400 });
  }

  const unit = await db.units.byId(unitId);
  if (!unit || unit.organizationId !== user.organizationId) {
    return NextResponse.json({ error: "Unit not found in your organization." }, { status: 404 });
  }
  if (!unit.eligible) {
    return NextResponse.json({ error: "Unit is not eligible for participation." }, { status: 400 });
  }
  // F8 (2026-10-25, found in Stage 4 execution): the resident must exist in
  // the caller's org and hold the resident role. Without this, a showing
  // could be created naming a nonexistent resident (observed: "null").
  const resident = await db.users.byId(residentUserId);
  if (!resident || resident.organizationId !== user.organizationId || resident.role !== "resident") {
    return NextResponse.json(
      { error: "residentUserId must reference a resident in your organization." },
      { status: 400 },
    );
  }

  const showing = await db.showings.create(unitId, residentUserId, user.organizationId, brokerRequired ?? false);
  return NextResponse.json({ showing }, { status: 201 });
}
