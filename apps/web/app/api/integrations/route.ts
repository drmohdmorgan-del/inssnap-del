import { NextRequest, NextResponse } from "next/server";
import { getSessionUser, unauthorized, forbidden } from "../../../lib/auth-helpers";
import { db } from "../../../lib/db";
import { isPrivileged } from "@inssnapp/auth";

/**
 * Truthful integration status for the caller's organization.
 *
 * Every entry reflects actual state — adapter rows in the database, or the
 * honest absence of one. There are no hardcoded "connected" badges here:
 * PMS adapters only exist as sandbox-boundary rows (real adapters are
 * TASK-008), and no notification or screening adapter code exists at all
 * (TASK-008 / TASK-009).
 *
 * Privileged roles only (management, inssnapp_admin).
 */
export async function GET(req: NextRequest) {
  const user = await getSessionUser(req);
  if (!user) return unauthorized();
  if (!isPrivileged(user.role)) return forbidden();

  const adapters = await db.pmsAdapters.byOrg(user.organizationId);

  const integrations: {
    name: string;
    status: "connected" | "sandbox" | "not_connected" | "not_configured" | "error";
    detail: string;
  }[] = [];

  if (adapters.length === 0) {
    integrations.push({
      name: "PMS",
      status: "not_connected",
      detail: "No PMS adapter is configured for this organization.",
    });
  } else {
    for (const a of adapters) {
      const provider = a.provider.charAt(0).toUpperCase() + a.provider.slice(1);
      integrations.push({
        name: `${provider} PMS`,
        status: a.status === "sandbox" || a.status === "connected" || a.status === "error"
          ? a.status
          : "not_connected",
        detail:
          a.status === "sandbox"
            ? "Adapter boundary configured · sandbox mode only — no live PMS sync (TASK-008)."
            : a.status === "connected"
              ? "Connected."
              : a.lastSyncAt
                ? `Last sync ${a.lastSyncAt}.`
                : "Adapter configured; no sync recorded yet.",
      });
    }
  }

  integrations.push(
    {
      name: "Notifications",
      status: "not_configured",
      detail: "No notification adapter is implemented yet — notifications are planned for TASK-008.",
    },
    {
      name: "Screening",
      status: "not_configured",
      detail: "Screening is a boundary only — no adapter or sandbox workflow exists yet (TASK-009).",
    },
  );

  return NextResponse.json({ integrations });
}
