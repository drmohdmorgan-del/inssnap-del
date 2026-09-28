import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "../../../../lib/admin-guard";
import { db } from "../../../../lib/db";

const VALID_TYPES = ["login_failed", "login_succeeded", "mfa_failed", "session_revoked"];

/**
 * Security events view: authentication-relevant activity across
 * organizations (login failures, MFA failures, session revocations).
 * Filters: orgId, type, since (ISO), limit (1–500).
 * Admin only.
 */
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if ("error" in auth) return auth.error;

  const params = req.nextUrl.searchParams;
  const orgId = params.get("orgId");
  const type = params.get("type");
  if (type && !VALID_TYPES.includes(type)) {
    return NextResponse.json(
      { error: `type must be one of: ${VALID_TYPES.join(", ")}` },
      { status: 400 },
    );
  }
  const limitRaw = Number.parseInt(params.get("limit") ?? "100", 10);

  const events = await db.securityEvents.list({
    organizationIds: orgId ? [orgId] : undefined,
    type: type ?? undefined,
    since: params.get("since") ?? undefined,
    limit: Number.isFinite(limitRaw) ? limitRaw : 100,
  });
  return NextResponse.json({ events });
}
