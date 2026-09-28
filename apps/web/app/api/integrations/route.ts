import { NextRequest, NextResponse } from "next/server";
import { getSessionUser, unauthorized, forbidden } from "../../../lib/auth-helpers";
import { db } from "../../../lib/db";
import { getNotificationAdapter } from "@inssnapp/integrations";
import { isPrivileged } from "@inssnapp/auth";

/**
 * Truthful integration status for the caller's organization (TASK-007/008).
 *
 * Every entry reflects actual state — adapter rows in the database (type,
 * last sync, last health check), or the honest absence of one. There are no
 * hardcoded "connected" badges here: the sandbox PMS adapter reports real
 * sync/health bookkeeping, and notifications report the actually-registered
 * provider (the dev console logger until a real SMS/email provider is
 * registered behind the NotificationAdapter interface).
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
    adapterType?: string;
    lastSyncAt?: string | null;
    lastHealthCheckAt?: string | null;
    healthStatus?: string | null;
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
      const health =
        a.lastHealthCheckAt != null
          ? ` Last health check ${a.lastHealthCheckAt}${a.healthStatus ? ` (${a.healthStatus})` : ""}.`
          : " No health check recorded yet.";
      integrations.push({
        name: `${provider} PMS`,
        status: a.status === "sandbox" || a.status === "connected" || a.status === "error"
          ? a.status
          : "not_connected",
        detail:
          a.status === "sandbox"
            ? `Sandbox adapter active (${a.adapterType}).` +
              (a.lastSyncAt ? ` Last sync ${a.lastSyncAt}.` : " No sync run yet.") +
              health
            : a.status === "connected"
              ? "Connected." + health
              : (a.lastSyncAt ? `Last sync ${a.lastSyncAt}.` : "Adapter configured; no sync recorded yet.") +
                health,
        adapterType: a.adapterType,
        lastSyncAt: a.lastSyncAt,
        lastHealthCheckAt: a.lastHealthCheckAt,
        healthStatus: a.healthStatus,
      });
    }
  }

  const notifier = getNotificationAdapter();
  integrations.push(
    {
      name: "Notifications",
      status: notifier.name === "console" ? "sandbox" : "connected",
      detail:
        notifier.name === "console"
          ? "ConsoleNotificationAdapter — dev logging only; no real SMS or email is sent. " +
            "A real provider registers behind the NotificationAdapter interface without engine changes."
          : `Provider "${notifier.name}" registered behind the NotificationAdapter interface.`,
    },
    {
      name: "Screening",
      status: "not_configured",
      detail: "Screening is a boundary only — no adapter or sandbox workflow exists yet (TASK-009).",
    },
  );

  return NextResponse.json({ integrations });
}
