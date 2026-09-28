import { NextRequest, NextResponse } from "next/server";
import { getSessionUser, unauthorized, forbidden } from "../../../../lib/auth-helpers";
import { getScreeningService } from "../../../../lib/screening";
import { DEFAULT_CONSENT_SCOPE_TEXT } from "@inssnapp/integrations";
import { isPrivileged } from "@inssnapp/auth";
import { db } from "../../../../lib/db";

/**
 * Screening consent records (TASK-009, scope §4 "identity/screening
 * consent where applicable").
 *
 * POST records explicit prospect consent (who, when, exact scope text).
 * Allowed for:
 *   - the prospect themselves (their own user id), or
 *   - privileged roles (management, inssnapp_admin) recording on behalf of
 *     a prospect in their own organization (e.g. in-person consent).
 * A screening request cannot be created without one of these records —
 * the service fails closed.
 *
 * GET lists the org's consent records (privileged roles only).
 */
export async function POST(req: NextRequest) {
  const user = await getSessionUser(req);
  if (!user) return unauthorized();

  let body: { prospectUserId?: string; scopeText?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const prospectUserId = body.prospectUserId;
  if (!prospectUserId) {
    return NextResponse.json({ error: "prospectUserId is required" }, { status: 400 });
  }

  // Org scoping: the prospect must be a user in the caller's organization.
  const prospect = await db.users.byId(prospectUserId);
  if (!prospect || prospect.organizationId !== user.organizationId) {
    return NextResponse.json({ error: "Prospect not found in this organization" }, { status: 404 });
  }

  const selfRecording = user.userId === prospectUserId;
  if (!selfRecording && !isPrivileged(user.role)) {
    return forbidden();
  }

  const scopeText = body.scopeText?.trim() || DEFAULT_CONSENT_SCOPE_TEXT;
  // TASK-010: cap free-text length — the consent text is rendered in the
  // Control Center and stored verbatim.
  if (scopeText.length > 2000) {
    return NextResponse.json(
      { error: "scopeText must be at most 2000 characters." },
      { status: 400 },
    );
  }

  const consent = await getScreeningService().recordConsent({
    organizationId: user.organizationId,
    prospectUserId,
    scopeText,
    recordedBy: user.userId,
  });
  return NextResponse.json({ consent }, { status: 201 });
}

export async function GET(req: NextRequest) {
  const user = await getSessionUser(req);
  if (!user) return unauthorized();
  if (!isPrivileged(user.role)) return forbidden();

  const consents = await getScreeningService().consentRecords(user.organizationId);
  return NextResponse.json({ consentRecords: consents });
}
