import { NextRequest, NextResponse } from "next/server";
import { getSessionUser, unauthorized, forbidden } from "../../../../lib/auth-helpers";
import { db } from "../../../../lib/db";
import { isPrivileged } from "@inssnapp/auth";

type Ctx = { params: Promise<{ id: string }> };

async function getOrgProperty(id: string, organizationId: string) {
  const property = await db.properties.byId(id);
  // Cross-org reads return 404 so one organization cannot probe another's records.
  if (!property || property.organizationId !== organizationId) return null;
  return property;
}

function validName(value: unknown, max: number): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.trim().length <= max;
}

/** Rename / re-address a property in the caller's organization. */
export async function PATCH(req: NextRequest, ctx: Ctx) {
  const user = await getSessionUser(req);
  if (!user) return unauthorized();
  if (!isPrivileged(user.role)) return forbidden();

  const { id } = await ctx.params;
  const property = await getOrgProperty(id, user.organizationId);
  if (!property) {
    return NextResponse.json({ error: "Property not found." }, { status: 404 });
  }

  const body = await req.json().catch(() => ({}));
  const { name, address, latitude, longitude } = body as {
    name?: unknown;
    address?: unknown;
    latitude?: unknown;
    longitude?: unknown;
  };
  if (name !== undefined && !validName(name, 120)) {
    return NextResponse.json({ error: "name must be 1–120 chars." }, { status: 400 });
  }
  if (address !== undefined && !validName(address, 240)) {
    return NextResponse.json({ error: "address must be 1–240 chars." }, { status: 400 });
  }
  for (const [key, value] of [
    ["latitude", latitude],
    ["longitude", longitude],
  ] as const) {
    if (
      value !== undefined &&
      value !== null &&
      (typeof value !== "number" || !Number.isFinite(value))
    ) {
      return NextResponse.json({ error: `${key} must be a number or null.` }, { status: 400 });
    }
  }
  const lat = latitude === undefined || latitude === null ? null : (latitude as number);
  const lng = longitude === undefined || longitude === null ? null : (longitude as number);
  if (lat !== null && (lat < -90 || lat > 90)) {
    return NextResponse.json({ error: "latitude must be between -90 and 90." }, { status: 400 });
  }
  if (lng !== null && (lng < -180 || lng > 180)) {
    return NextResponse.json({ error: "longitude must be between -180 and 180." }, { status: 400 });
  }

  const patch: { name?: string; address?: string; latitude?: number | null; longitude?: number | null } = {};
  if (name !== undefined) patch.name = (name as string).trim();
  if (address !== undefined) patch.address = (address as string).trim();
  if (latitude !== undefined) patch.latitude = lat;
  if (longitude !== undefined) patch.longitude = lng;
  const updated = await db.properties.patch(id, patch);
  return NextResponse.json({ property: updated });
}

/** Delete a property (and its units) in the caller's organization. */
export async function DELETE(req: NextRequest, ctx: Ctx) {
  const user = await getSessionUser(req);
  if (!user) return unauthorized();
  if (!isPrivileged(user.role)) return forbidden();

  const { id } = await ctx.params;
  const property = await getOrgProperty(id, user.organizationId);
  if (!property) {
    return NextResponse.json({ error: "Property not found." }, { status: 404 });
  }

  await db.properties.remove(id);
  return NextResponse.json({ ok: true });
}
