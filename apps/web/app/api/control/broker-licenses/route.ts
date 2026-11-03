import { NextRequest, NextResponse } from "next/server";
import { getSessionUser, unauthorized, forbidden } from "../../../../lib/auth-helpers";
import { db } from "../../../../lib/db";
import { isPrivileged } from "@inssnapp/auth";
import { registryFor } from "../../../../lib/license-registries";

/**
 * Broker license vetting queue (DrMorgan 2026-11-03).
 *
 * GET  /api/control/broker-licenses — privileged (management,
 *   inssnapp_admin), own organization: every broker who has submitted a
 *   license, with the registry to verify it against. Verification is a
 *   manual registry check (most state registries have no public API):
 *   open the registry lookup, confirm the license is active/valid, then
 *   record the outcome with POST.
 * POST /api/control/broker-licenses { brokerUserId, decision, note? }
 *   decision: "verified" | "rejected". Only a broker whose CURRENT
 *   submission is pending can be reviewed. A verified broker may
 *   receive lead assignments; any other status may not (gate in
 *   showing-api.ts).
 */
export async function GET(req: NextRequest) {
  const user = await getSessionUser(req);
  if (!user) return unauthorized();
  if (!isPrivileged(user.role)) return forbidden();

  const [profiles, users] = await Promise.all([
    db.brokerProfiles.listLicenseQueue(user.organizationId),
    db.users.byOrg(user.organizationId),
  ]);
  const byId = new Map(users.map((u) => [u.id, u]));
  return NextResponse.json({
    queue: profiles.map((pr) => {
      const broker = byId.get(pr.userId);
      return {
        brokerUserId: pr.userId,
        brokerName: broker?.fullName ?? null,
        brokerEmail: broker?.email ?? null,
        licenseNumber: pr.licenseNumber,
        licenseState: pr.licenseState,
        licenseStatus: pr.licenseStatus,
        licenseSubmittedAt: pr.licenseSubmittedAt,
        licenseReviewedAt: pr.licenseReviewedAt,
        licenseReviewNote: pr.licenseReviewNote,
        registry: pr.licenseState ? registryFor(pr.licenseState) : null,
      };
    }),
  });
}

export async function POST(req: NextRequest) {
  const user = await getSessionUser(req);
  if (!user) return unauthorized();
  if (!isPrivileged(user.role)) return forbidden();

  const body = (await req.json().catch(() => ({}))) as {
    brokerUserId?: unknown;
    decision?: unknown;
    note?: unknown;
  };
  if (typeof body.brokerUserId !== "string" || !body.brokerUserId) {
    return NextResponse.json({ error: "brokerUserId is required." }, { status: 400 });
  }
  if (body.decision !== "verified" && body.decision !== "rejected") {
    return NextResponse.json(
      { error: 'decision must be "verified" or "rejected".' },
      { status: 400 },
    );
  }
  const note =
    typeof body.note === "string" && body.note.trim() ? body.note.trim().slice(0, 500) : null;

  const orgUsers = await db.users.byOrg(user.organizationId);
  const broker = orgUsers.find((u) => u.id === body.brokerUserId);
  if (!broker || broker.role !== "broker") {
    return NextResponse.json({ error: "Broker not found in your organization." }, { status: 404 });
  }
  const profile = await db.brokerProfiles.get(body.brokerUserId);
  if (!profile || profile.licenseStatus !== "pending") {
    return NextResponse.json(
      { error: "This broker has no license submission awaiting review." },
      { status: 409 },
    );
  }

  const updated = await db.brokerProfiles.reviewLicense(
    body.brokerUserId,
    body.decision,
    user.userId,
    note,
  );
  return NextResponse.json({
    brokerUserId: body.brokerUserId,
    licenseStatus: updated?.licenseStatus,
    licenseReviewedAt: updated?.licenseReviewedAt,
    licenseReviewNote: updated?.licenseReviewNote,
  });
}
