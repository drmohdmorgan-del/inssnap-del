import { NextRequest, NextResponse } from "next/server";
import { getSessionUser, unauthorized, forbidden } from "../../../lib/auth-helpers";
import { getScreeningService } from "../../../lib/screening";
import { PRODUCTION_PREREQUISITES } from "@inssnapp/integrations";
import { isPrivileged } from "@inssnapp/auth";

/**
 * Checkr sandbox status for the Control Center (TASK-009).
 *
 * GET returns, for the caller's organization:
 *   - the current screening mode (sandbox / production), rendered
 *     prominently so the mode is always visible,
 *   - why production is blocked (when configured but gated),
 *   - recent sandbox screening reports,
 *   - recorded consent records,
 *   - the production prerequisites (scope §4) so the Control Center can
 *     show what is still required before production is possible.
 *
 * Privileged roles only (management, inssnapp_admin). Screening results
 * are informational and visible to management roles only — nothing in the
 * Showing Engine consumes them (scope §4: no autonomous housing
 * decisions by an AI agent).
 */
export async function GET(req: NextRequest) {
  const user = await getSessionUser(req);
  if (!user) return unauthorized();
  if (!isPrivileged(user.role)) return forbidden();

  const service = getScreeningService();
  const modeStatus = await service.getModeStatus(user.organizationId);
  const recent = await service.recentScreenings(user.organizationId, 25);
  const consents = await service.consentRecords(user.organizationId);

  return NextResponse.json({
    mode: modeStatus.mode,
    adapter: modeStatus.adapter,
    sandbox: modeStatus.sandbox,
    legalApproval: modeStatus.legalApproval,
    productionBlockedReason: modeStatus.productionBlockedReason,
    productionPrerequisites: [...PRODUCTION_PREREQUISITES],
    recentScreenings: recent,
    consentRecords: consents,
  });
}
