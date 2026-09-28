import { NextRequest, NextResponse } from "next/server";
import { getSessionUser, unauthorized, forbidden } from "../../../../lib/auth-helpers";
import { db } from "../../../../lib/db";
import { isPrivileged } from "@inssnapp/auth";

type Ctx = { params: Promise<{ id: string }> };

async function getOrgUnit(id: string, organizationId: string) {
  const unit = await db.units.byId(id);
  // Cross-org reads return 404 so one organization cannot probe another's records.
  if (!unit || unit.organizationId !== organizationId) return null;
  return unit;
}

/**
 * Update a unit: label, eligibility for resident participation, the
 * resident "Available NOW" flag, or the PMS external id.
 * Privileged roles only (management, inssnapp_admin).
 */
export async function PATCH(req: NextRequest, ctx: Ctx) {
  const user = await getSessionUser(req);
  if (!user) return unauthorized();
  if (!isPrivileged(user.role)) return forbidden();

  const { id } = await ctx.params;
  const unit = await getOrgUnit(id, user.organizationId);
  if (!unit) {
    return NextResponse.json({ error: "Unit not found." }, { status: 404 });
  }

  const body = await req.json().catch(() => ({}));
  const { label, eligible, residentAvailable, pmsExternalId } = body as {
    label?: unknown;
    eligible?: unknown;
    residentAvailable?: unknown;
    pmsExternalId?: unknown;
  };

  const patch: {
    label?: string;
    eligible?: boolean;
    residentAvailable?: boolean;
    pmsExternalId?: string;
  } = {};
  if (label !== undefined) {
    if (typeof label !== "string" || !label.trim() || label.trim().length > 40) {
      return NextResponse.json({ error: "label must be 1–40 chars." }, { status: 400 });
    }
    patch.label = label.trim();
  }
  if (eligible !== undefined) {
    if (typeof eligible !== "boolean") {
      return NextResponse.json({ error: "eligible must be a boolean." }, { status: 400 });
    }
    patch.eligible = eligible;
  }
  if (residentAvailable !== undefined) {
    if (typeof residentAvailable !== "boolean") {
      return NextResponse.json({ error: "residentAvailable must be a boolean." }, { status: 400 });
    }
    patch.residentAvailable = residentAvailable;
  }
  if (pmsExternalId !== undefined && pmsExternalId !== null) {
    if (typeof pmsExternalId !== "string" || pmsExternalId.trim().length > 80) {
      return NextResponse.json(
        { error: "pmsExternalId must be 0–80 chars." },
        { status: 400 },
      );
    }
    if (pmsExternalId.trim()) patch.pmsExternalId = pmsExternalId.trim();
  }

  const updated = await db.units.patch(id, patch);
  return NextResponse.json({ unit: updated });
}

/** Delete a unit in the caller's organization. */
export async function DELETE(req: NextRequest, ctx: Ctx) {
  const user = await getSessionUser(req);
  if (!user) return unauthorized();
  if (!isPrivileged(user.role)) return forbidden();

  const { id } = await ctx.params;
  const unit = await getOrgUnit(id, user.organizationId);
  if (!unit) {
    return NextResponse.json({ error: "Unit not found." }, { status: 404 });
  }

  await db.units.remove(id);
  return NextResponse.json({ ok: true });
}
