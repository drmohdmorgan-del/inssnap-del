/**
 * PMS integration wiring for the web app (TASK-008).
 *
 * - Adapter registry: resolves an organization's configured `pms_adapters`
 *   row to a vendor-neutral PmsAdapter instance. Only "sandbox" is
 *   implemented today; any other adapter_type resolves to null so the UI
 *   and API stay honest instead of claiming a connection that has no code.
 * - DbPmsSyncTarget: implements PmsSyncTarget against the unified data
 *   layer (org-scoped, in-memory or Postgres). This is the ONLY store-facing
 *   half of a sync — vendor modules never touch the database directly.
 * - runOrgPmsSync / runOrgPmsHealthCheck: entry points used by the
 *   integrations API routes.
 *
 * Notifications on sync completion/failure go through the NotificationAdapter
 * interface (fail-open) — a broken notifier never breaks the sync response.
 */

import {
  runPmsSync,
  SandboxPmsAdapter,
  SANDBOX_ADAPTER_TYPE,
  notifySafely,
  type PmsAdapter,
  type PmsProperty,
  type PmsResidentRosterEntry,
  type PmsSyncResult,
  type PmsSyncTarget,
  type PmsUnit,
} from "@inssnapp/integrations";
import { db, type PmsAdapterRow } from "./db";
import { getAuthStore } from "./auth-store";

export interface ResolvedAdapter {
  row: PmsAdapterRow;
  adapter: PmsAdapter;
}

/**
 * Resolves the organization's PMS adapter row to a working adapter.
 * Returns null when no adapter is configured OR when the configured
 * adapter_type has no implementation yet (honest "not connected").
 */
export async function resolvePmsAdapter(
  organizationId: string,
): Promise<ResolvedAdapter | null> {
  const rows = await db.pmsAdapters.byOrg(organizationId);
  if (rows.length === 0) return null;
  const row = rows[0];
  if (row.adapterType !== SANDBOX_ADAPTER_TYPE) {
    // Real vendors (yardi, entrata, …) register here as commercial/API
    // access permits. Until then: no code, no claimed connection.
    return null;
  }
  const adapter = new SandboxPmsAdapter();
  await adapter.connect(row.config ?? {});
  return { row, adapter };
}

/** Store-facing half of the sync, backed by the unified data layer. */
export class DbPmsSyncTarget implements PmsSyncTarget {
  async upsertProperty(
    organizationId: string,
    property: PmsProperty,
  ): Promise<{ id: string; created: boolean }> {
    const existing = await db.properties.byExternalId(organizationId, property.externalId);
    if (existing) {
      const needsUpdate =
        existing.name !== property.name || existing.address !== property.address;
      if (needsUpdate) {
        await db.properties.patch(existing.id, {
          name: property.name,
          address: property.address,
        });
      }
      return { id: existing.id, created: false };
    }
    const created = await db.properties.create(organizationId, property.name, property.address, {
      pmsExternalId: property.externalId,
    });
    return { id: created.id, created: true };
  }

  async upsertUnit(
    organizationId: string,
    propertyId: string,
    unit: PmsUnit,
  ): Promise<{ id: string; created: boolean }> {
    const existing = await db.units.byExternalId(organizationId, propertyId, unit.externalId);
    if (existing) {
      // The PMS is the system of record for label + eligibility; the
      // resident's "Available NOW" flag is owned by the resident and is
      // never overwritten by a sync.
      const needsUpdate =
        existing.label !== unit.label || existing.eligible !== unit.eligible;
      if (needsUpdate) {
        await db.units.patch(existing.id, { label: unit.label, eligible: unit.eligible });
      }
      return { id: existing.id, created: false };
    }
    const created = await db.units.create(organizationId, propertyId, unit.label, {
      pmsExternalId: unit.externalId,
      eligible: unit.eligible,
    });
    return { id: created.id, created: true };
  }

  async linkResident(
    organizationId: string,
    unitId: string,
    resident: PmsResidentRosterEntry,
  ): Promise<"linked" | "already_linked" | "no_user"> {
    const unit = await db.units.byId(unitId);
    // Tenant isolation: the unit must belong to the syncing organization.
    if (!unit || unit.organizationId !== organizationId) return "no_user";
    const user = await getAuthStore().getUserByEmail(resident.email, organizationId);
    // Roster sync NEVER creates users — unknown emails are skipped honestly.
    if (!user) return "no_user";
    const created = await db.residents.link(user.id, unitId);
    return created ? "linked" : "already_linked";
  }
}

async function recordHealth(
  row: PmsAdapterRow,
  ok: boolean,
  checkedAt: string,
): Promise<void> {
  await db.pmsAdapters.update(row.id, {
    lastHealthCheckAt: checkedAt,
    healthStatus: ok ? "ok" : "error",
    status: ok ? row.status : "error",
  });
}

function syncSummary(result: PmsSyncResult): string {
  const { properties, units, residents } = result;
  return (
    `PMS sync ${result.ok ? "completed" : "failed"} (${result.adapterType}): ` +
    `${properties.created + properties.updated} properties ` +
    `(${properties.created} new), ${units.created + units.updated} units ` +
    `(${units.created} new), ${residents.linked} residents linked` +
    (result.errors.length > 0 ? `, ${result.errors.length} row errors` : "")
  );
}

/**
 * Runs a health check for the organization's adapter and records it.
 * Throws when no adapter is configured or the adapter_type is unimplemented.
 */
export async function runOrgPmsHealthCheck(organizationId: string): Promise<{
  row: PmsAdapterRow;
  ok: boolean;
  checkedAt: string;
  detail?: string;
}> {
  const resolved = await resolvePmsAdapter(organizationId);
  if (!resolved) {
    throw new Error("No implemented PMS adapter is configured for this organization.");
  }
  const health = await resolved.adapter.healthCheck(organizationId);
  await recordHealth(resolved.row, health.ok, health.checkedAt);
  return {
    row: resolved.row,
    ok: health.ok,
    checkedAt: health.checkedAt,
    detail: health.detail,
  };
}

/**
 * Full sync for the organization's adapter: health check first (fail-closed),
 * then the idempotent fetch→apply run, then bookkeeping + a sync notification
 * (fail-open). Returns the sync result for the API response.
 */
export async function runOrgPmsSync(organizationId: string): Promise<PmsSyncResult> {
  const resolved = await resolvePmsAdapter(organizationId);
  if (!resolved) {
    throw new Error("No implemented PMS adapter is configured for this organization.");
  }

  // Fail closed: do not apply PMS data when the adapter is unhealthy.
  const health = await resolved.adapter.healthCheck(organizationId);
  await recordHealth(resolved.row, health.ok, health.checkedAt);
  if (!health.ok) {
    const result: PmsSyncResult = {
      ok: false,
      adapterType: resolved.adapter.adapterType,
      organizationId,
      startedAt: health.checkedAt,
      finishedAt: new Date().toISOString(),
      properties: { created: 0, updated: 0 },
      units: { created: 0, updated: 0 },
      residents: { linked: 0, skippedNoUnit: 0, skippedNoUser: 0 },
      errors: [`health check failed: ${health.detail ?? "no detail"}`],
    };
    await notifySafely({
      event: "pms.sync_failed",
      organizationId,
      at: result.finishedAt,
      recipients: [{ role: "management" }],
      summary: syncSummary(result),
    });
    return result;
  }

  const result = await runPmsSync(resolved.adapter, organizationId, new DbPmsSyncTarget());
  await db.pmsAdapters.update(resolved.row.id, {
    status: result.ok ? "sandbox" : "error",
    lastSyncAt: result.ok ? result.finishedAt : resolved.row.lastSyncAt,
  });

  await notifySafely({
    event: result.ok ? "pms.sync_completed" : "pms.sync_failed",
    organizationId,
    at: result.finishedAt,
    recipients: [{ role: "management" }],
    summary: syncSummary(result),
    meta: {
      properties: result.properties,
      units: result.units,
      residents: result.residents,
      errors: result.errors,
    },
  });

  return result;
}
