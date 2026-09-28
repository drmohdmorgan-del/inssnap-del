import { NextRequest, NextResponse } from "next/server";
import { getSessionUser, unauthorized, forbidden } from "../../../../lib/auth-helpers";
import { runOrgPmsSync } from "../../../../lib/pms";
import { isPrivileged } from "@inssnapp/auth";

/**
 * Runs a PMS sync for the caller's organization (TASK-008).
 *
 * Health check first (fail-closed: an unhealthy adapter does not apply
 * data), then the idempotent fetch→apply run, then bookkeeping. The result
 * reports honest per-entity counts — a re-sync creates nothing new.
 *
 * Privileged roles only (management, inssnapp_admin).
 */
export async function POST(req: NextRequest) {
  const user = await getSessionUser(req);
  if (!user) return unauthorized();
  if (!isPrivileged(user.role)) return forbidden();

  try {
    const result = await runOrgPmsSync(user.organizationId);
    return NextResponse.json({ ok: result.ok, sync: result });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // No implemented adapter configured for this organization.
    return NextResponse.json({ error: message }, { status: 404 });
  }
}
