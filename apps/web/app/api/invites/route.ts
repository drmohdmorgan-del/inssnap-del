import { NextRequest, NextResponse } from "next/server";
import { getSessionUser, unauthorized, forbidden } from "../../../lib/auth-helpers";
import { db } from "../../../lib/db";
import { isPrivileged } from "@inssnapp/auth";

/**
 * Tenant invitations (Phase 1).
 *
 * GET  — list this organization's invites (management only).
 * POST — create an invite (management only).
 *   Body: { unitId: string | null, role?: "resident" | "prospect" | "broker",
 *           email?: string, ttlHours?: number }
 *   Resident invites should bind a unit; the new account is linked to it on
 *   signup. Returns the invite plus a shareable signup link — management can
 *   send it manually when no email provider is configured (free tier).
 */
export async function GET(req: NextRequest) {
  const user = await getSessionUser(req);
  if (!user) return unauthorized();
  if (!isPrivileged(user.role)) return forbidden();

  const invites = await db.invites.byOrg(user.organizationId);
  const now = Date.now();
  return NextResponse.json({
    invites: invites.map((inv) => ({
      ...inv,
      usable: !inv.usedAt && new Date(inv.expiresAt).getTime() > now,
      link: `/signup?invite=${inv.code}`,
    })),
  });
}

export async function POST(req: NextRequest) {
  const user = await getSessionUser(req);
  if (!user) return unauthorized();
  if (!isPrivileged(user.role)) return forbidden();

  const body = (await req.json().catch(() => ({}))) as {
    unitId?: unknown;
    role?: unknown;
    email?: unknown;
    ttlHours?: unknown;
  };

  const role = body.role ?? "resident";
  if (role !== "resident" && role !== "prospect" && role !== "broker") {
    return NextResponse.json({ error: "role must be resident, prospect or broker." }, { status: 400 });
  }
  const unitId = body.unitId ?? null;
  if (unitId !== null && typeof unitId !== "string") {
    return NextResponse.json({ error: "unitId must be a string or null." }, { status: 400 });
  }
  if (unitId) {
    const unit = await db.units.byId(unitId);
    if (!unit || unit.organizationId !== user.organizationId) {
      return NextResponse.json({ error: "Unit not found." }, { status: 404 });
    }
  }
  if (body.email !== undefined && body.email !== null && typeof body.email !== "string") {
    return NextResponse.json({ error: "email must be a string." }, { status: 400 });
  }
  const ttlHours =
    body.ttlHours === undefined ? 72 : Number(body.ttlHours);
  if (!Number.isFinite(ttlHours) || ttlHours < 1 || ttlHours > 24 * 30) {
    return NextResponse.json({ error: "ttlHours must be between 1 and 720." }, { status: 400 });
  }

  const invite = await db.invites.create({
    organizationId: user.organizationId,
    unitId,
    role,
    email: typeof body.email === "string" ? body.email : null,
    createdByUserId: user.userId,
    ttlHours,
  });
  return NextResponse.json(
    { invite, link: `/signup?invite=${invite.code}` },
    { status: 201 },
  );
}
