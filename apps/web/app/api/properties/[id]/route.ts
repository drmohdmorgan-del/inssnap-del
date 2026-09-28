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
  const { name, address } = body as { name?: unknown; address?: unknown };
  if (name !== undefined && !validName(name, 120)) {
    return NextResponse.json({ error: "name must be 1–120 chars." }, { status: 400 });
  }
  if (address !== undefined && !validName(address, 240)) {
    return NextResponse.json({ error: "address must be 1–240 chars." }, { status: 400 });
  }

  const patch: { name?: string; address?: string } = {};
  if (name !== undefined) patch.name = (name as string).trim();
  if (address !== undefined) patch.address = (address as string).trim();
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
