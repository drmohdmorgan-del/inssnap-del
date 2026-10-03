import { NextRequest, NextResponse } from "next/server";
import { getSessionUser, unauthorized, forbidden } from "../../../lib/auth-helpers";
import { db } from "../../../lib/db";
import { isPrivileged } from "@inssnapp/auth";

export async function GET(req: NextRequest) {
  const user = await getSessionUser(req);
  if (!user) return unauthorized();

  const properties = await db.properties.byOrg(user.organizationId);
  return NextResponse.json({ properties });
}

function validName(value: unknown, max: number): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.trim().length <= max;
}

/**
 * Create a property in the caller's organization.
 * Privileged roles only (management, inssnapp_admin).
 */
export async function POST(req: NextRequest) {
  const user = await getSessionUser(req);
  if (!user) return unauthorized();
  if (!isPrivileged(user.role)) return forbidden();

  const body = await req.json().catch(() => ({}));
  const { name, address, latitude, longitude } = body as {
    name?: unknown;
    address?: unknown;
    latitude?: unknown;
    longitude?: unknown;
  };
  if (!validName(name, 120) || !validName(address, 240)) {
    return NextResponse.json(
      { error: "name (1–120 chars) and address (1–240 chars) are required." },
      { status: 400 },
    );
  }
  for (const [key, value] of [
    ["latitude", latitude],
    ["longitude", longitude],
  ] as const) {
    if (value !== undefined && value !== null && (typeof value !== "number" || !Number.isFinite(value))) {
      return NextResponse.json({ error: `${key} must be a number or null.` }, { status: 400 });
    }
  }

  const property = await db.properties.create(
    user.organizationId,
    name.trim(),
    (address as string).trim(),
    {
      latitude: typeof latitude === "number" ? latitude : null,
      longitude: typeof longitude === "number" ? longitude : null,
    },
  );
  return NextResponse.json({ property }, { status: 201 });
}
