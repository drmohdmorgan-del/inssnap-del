import { NextRequest, NextResponse } from "next/server";
import { getSessionUser, unauthorized, forbidden } from "../../../../../lib/auth-helpers";
import { db } from "../../../../../lib/db";
import { isStateCode, registryFor } from "../../../../../lib/license-registries";

/**
 * Broker license submission (DrMorgan 2026-11-03).
 *
 * GET  /api/brokers/me/license — the broker's own license record + status.
 * POST /api/brokers/me/license { licenseNumber, licenseState }
 *   Submits (or resubmits after rejection) the license for vetting.
 *   Status becomes "pending"; Management/Admin verifies it against the
 *   state registry (see /api/control/broker-licenses). The broker cannot
 *   receive lead assignments until the status is "verified".
 */
export async function GET(req: NextRequest) {
  const user = await getSessionUser(req);
  if (!user) return unauthorized();
  if (user.role !== "broker") return forbidden();

  const profile = await db.brokerProfiles.getOrCreate(user.userId, user.organizationId);
  return NextResponse.json({
    licenseNumber: profile.licenseNumber,
    licenseState: profile.licenseState,
    licenseStatus: profile.licenseStatus,
    licenseSubmittedAt: profile.licenseSubmittedAt,
    licenseReviewedAt: profile.licenseReviewedAt,
    licenseReviewNote: profile.licenseReviewNote,
    registry: profile.licenseState ? registryFor(profile.licenseState) : null,
  });
}

export async function POST(req: NextRequest) {
  const user = await getSessionUser(req);
  if (!user) return unauthorized();
  if (user.role !== "broker") return forbidden();

  const body = (await req.json().catch(() => ({}))) as {
    licenseNumber?: unknown;
    licenseState?: unknown;
  };
  const licenseNumber =
    typeof body.licenseNumber === "string" ? body.licenseNumber.trim() : "";
  if (!licenseNumber || licenseNumber.length > 64) {
    return NextResponse.json(
      { error: "licenseNumber is required (max 64 characters)." },
      { status: 400 },
    );
  }
  if (!isStateCode(body.licenseState)) {
    return NextResponse.json(
      { error: "licenseState must be a US state code (e.g. MA)." },
      { status: 400 },
    );
  }

  const profile = await db.brokerProfiles.submitLicense(
    user.userId,
    user.organizationId,
    licenseNumber,
    body.licenseState,
  );
  return NextResponse.json({
    licenseNumber: profile.licenseNumber,
    licenseState: profile.licenseState,
    licenseStatus: profile.licenseStatus,
    licenseSubmittedAt: profile.licenseSubmittedAt,
    registry: registryFor(body.licenseState),
  });
}
