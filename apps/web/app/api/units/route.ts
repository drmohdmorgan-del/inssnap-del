import { NextRequest, NextResponse } from "next/server";
import { getSessionUser, unauthorized, forbidden } from "../../../lib/auth-helpers";
import { db } from "../../../lib/db";
import { isPrivileged } from "@inssnapp/auth";

export async function GET(req: NextRequest) {
  const user = await getSessionUser(req);
  if (!user) return unauthorized();

  const units = await db.units.byOrg(user.organizationId);
  return NextResponse.json({ units });
}

/**
 * Create a unit under a property in the caller's organization.
 * Privileged roles only (management, inssnapp_admin).
 */
export async function POST(req: NextRequest) {
  const user = await getSessionUser(req);
  if (!user) return unauthorized();
  if (!isPrivileged(user.role)) return forbidden();

  const body = await req.json().catch(() => ({}));
  const { propertyId, label, eligible, residentAvailable, pmsExternalId } = body as {
    propertyId?: unknown;
    label?: unknown;
    eligible?: unknown;
    residentAvailable?: unknown;
    pmsExternalId?: unknown;
  };

  const property =
    typeof propertyId === "string" ? await db.properties.byId(propertyId) : null;
  if (!property || property.organizationId !== user.organizationId) {
    return NextResponse.json(
      { error: "propertyId must reference a property in your organization." },
      { status: 404 },
    );
  }
  if (typeof label !== "string" || !label.trim() || label.trim().length > 40) {
    return NextResponse.json({ error: "label (1–40 chars) is required." }, { status: 400 });
  }

  const unit = await db.units.create(user.organizationId, property.id, label.trim(), {
    eligible: typeof eligible === "boolean" ? eligible : true,
    residentAvailable: typeof residentAvailable === "boolean" ? residentAvailable : false,
    pmsExternalId:
      typeof pmsExternalId === "string" && pmsExternalId.trim()
        ? pmsExternalId.trim()
        : null,
  });
  return NextResponse.json({ unit }, { status: 201 });
}
