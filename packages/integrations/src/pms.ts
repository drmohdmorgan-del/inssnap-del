/**
 * Vendor-neutral PMS adapter boundary (TASK-008).
 *
 * Scope §4 ("PMS integration boundary"): the production architecture must
 * remain PMS-agnostic. The target vendor adapters (Yardi, Entrata, RealPage,
 * MRI, AppFolio, Buildium) are added behind THIS interface as commercial/API
 * access permits. Core Showing Engine logic must never depend directly on one
 * PMS vendor — and the engine package does not import this package at all.
 *
 * The three operations the engine needs:
 *   1. list/sync eligible properties + units,
 *   2. sync the resident enrollment roster,
 *   3. connection health check.
 *
 * Data application is intentionally separate from data fetching: the adapter
 * returns plain DTOs and the idempotent apply logic lives in `runPmsSync`,
 * which writes through a `PmsSyncTarget`. The target is the ONLY piece that
 * touches the store, so a vendor module can never write to the database
 * directly or leak another organization's data.
 */

/** One property as reported by the PMS. */
export interface PmsProperty {
  /** Vendor-stable external id (e.g. "YRD-P-9001"). */
  externalId: string;
  name: string;
  address: string;
}

/** One unit as reported by the PMS. */
export interface PmsUnit {
  /** Vendor-stable external id (e.g. "YRD-U-90011"). */
  externalId: string;
  /** externalId of the parent property. */
  propertyExternalId: string;
  label: string;
  /** Management-authorized for INSSNAPP participation. */
  eligible: boolean;
}

/** One resident enrollment as reported by the PMS. */
export interface PmsResidentRosterEntry {
  /** externalId of the unit this resident occupies. */
  unitExternalId: string;
  /** Matched to an INSSNAPP user by email within the organization. */
  email: string;
  fullName?: string;
  verified: boolean;
}

/** Result of an adapter health check. */
export interface PmsHealthResult {
  ok: boolean;
  latencyMs: number;
  checkedAt: string;
  detail?: string;
}

export interface PmsSyncEntityCounts {
  created: number;
  updated: number;
}

/** Resident-roster link outcomes for one sync run. */
export interface PmsSyncResidentCounts {
  /** New resident ↔ unit links created. */
  linked: number;
  /** Roster rows whose unit was not found in this org. */
  skippedNoUnit: number;
  /** Roster rows whose email matched no user in this org. */
  skippedNoUser: number;
}

/** Summary of one sync run. Idempotent: re-running changes nothing. */
export interface PmsSyncResult {
  ok: boolean;
  adapterType: string;
  organizationId: string;
  startedAt: string;
  finishedAt: string;
  properties: PmsSyncEntityCounts;
  units: PmsSyncEntityCounts;
  residents: PmsSyncResidentCounts;
  /** Non-fatal per-row problems; the sync still commits what it could. */
  errors: string[];
}

/**
 * The vendor-neutral PMS adapter contract. Every vendor implementation —
 * sandbox today, real vendors later — speaks this shape and nothing else.
 */
export interface PmsAdapter {
  /**
   * Adapter discriminator: "sandbox" | "yardi" | "entrata" | "realpage" |
   * "mri" | "appfolio" | "buildium". Real vendors register only when
   * commercial/API access exists.
   */
  readonly adapterType: string;

  /**
   * Stores connection configuration (endpoint, credentials handle, dataset).
   * Implementations MUST NOT log or persist raw secrets — keep only
   * references. May throw on invalid config; the caller treats that as a
   * configuration error, never a sync.
   */
  connect(config: Record<string, unknown>): Promise<void>;

  /** Lightweight liveness probe. Must not mutate anything. */
  healthCheck(organizationId: string): Promise<PmsHealthResult>;

  /** Properties the PMS reports for the organization. */
  listProperties(organizationId: string): Promise<PmsProperty[]>;

  /** Units of one property (by vendor external id). */
  listUnits(organizationId: string, propertyExternalId: string): Promise<PmsUnit[]>;

  /** Resident enrollment roster for the organization. */
  listResidentRoster(organizationId: string): Promise<PmsResidentRosterEntry[]>;
}

/**
 * The store-facing half of a sync. Implemented by the application (not by
 * vendors) against its own organization-scoped data layer. Every method is
 * org-scoped: a target must never write outside `organizationId`.
 */
export interface PmsSyncTarget {
  /**
   * Idempotent property upsert keyed on vendor external id.
   * Returns the internal id and whether the row was created by this call
   * (false = it already existed and was updated in place).
   */
  upsertProperty(
    organizationId: string,
    property: PmsProperty,
  ): Promise<{ id: string; created: boolean }>;
  /**
   * Idempotent unit upsert keyed on (property, vendor external id).
   * Returns the internal id and whether the row was created by this call.
   */
  upsertUnit(
    organizationId: string,
    propertyId: string,
    unit: PmsUnit,
  ): Promise<{ id: string; created: boolean }>;
  /**
   * Idempotent resident ↔ unit link. Links only when the roster email
   * matches an existing user in the organization; NEVER creates users.
   */
  linkResident(
    organizationId: string,
    unitId: string,
    resident: PmsResidentRosterEntry,
  ): Promise<"linked" | "already_linked" | "no_user">;
}

/**
 * Runs one full adapter sync: fetch (adapter) → apply (target), idempotently.
 *
 * Idempotency comes from external-id-keyed upserts in the target: a second
 * run with the same vendor data creates nothing new. Per-row failures are
 * collected into `errors` and do not abort the run; a failure in the fetch
 * phase fails the whole sync (ok: false).
 */
export async function runPmsSync(
  adapter: PmsAdapter,
  organizationId: string,
  target: PmsSyncTarget,
): Promise<PmsSyncResult> {
  const startedAt = new Date().toISOString();
  const result: PmsSyncResult = {
    ok: false,
    adapterType: adapter.adapterType,
    organizationId,
    startedAt,
    finishedAt: startedAt,
    properties: { created: 0, updated: 0 },
    units: { created: 0, updated: 0 },
    residents: { linked: 0, skippedNoUnit: 0, skippedNoUser: 0 },
    errors: [],
  };
  const finish = (ok: boolean): PmsSyncResult => {
    result.ok = ok;
    result.finishedAt = new Date().toISOString();
    return result;
  };

  let properties: PmsProperty[];
  let roster: PmsResidentRosterEntry[];
  try {
    properties = await adapter.listProperties(organizationId);
    roster = await adapter.listResidentRoster(organizationId);
  } catch (err) {
    result.errors.push(
      `PMS fetch failed: ${err instanceof Error ? err.message : String(err)}`,
    );
    return finish(false);
  }

  const propertyIdByExternal = new Map<string, string>();
  for (const p of properties) {
    try {
      const { id, created } = await target.upsertProperty(organizationId, p);
      propertyIdByExternal.set(p.externalId, id);
      if (created) result.properties.created += 1;
      else result.properties.updated += 1;
    } catch (err) {
      result.errors.push(
        `property ${p.externalId}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  const unitIdByExternal = new Map<string, string>();
  for (const p of properties) {
    const propertyId = propertyIdByExternal.get(p.externalId);
    if (!propertyId) continue; // property row failed above; unit fetch would be orphaned
    let units: PmsUnit[];
    try {
      units = await adapter.listUnits(organizationId, p.externalId);
    } catch (err) {
      result.errors.push(
        `units for property ${p.externalId}: ${err instanceof Error ? err.message : String(err)}`,
      );
      continue;
    }
    for (const u of units) {
      if (u.propertyExternalId !== p.externalId) {
        result.errors.push(
          `unit ${u.externalId}: propertyExternalId mismatch (${u.propertyExternalId} != ${p.externalId}); skipped`,
        );
        continue;
      }
      try {
        const { id, created } = await target.upsertUnit(organizationId, propertyId, u);
        unitIdByExternal.set(u.externalId, id);
        if (created) result.units.created += 1;
        else result.units.updated += 1;
      } catch (err) {
        result.errors.push(
          `unit ${u.externalId}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
  }

  for (const r of roster) {
    const unitId = unitIdByExternal.get(r.unitExternalId);
    if (!unitId) {
      result.residents.skippedNoUnit += 1;
      continue;
    }
    try {
      const outcome = await target.linkResident(organizationId, unitId, r);
      if (outcome === "linked") result.residents.linked += 1;
      else if (outcome === "no_user") result.residents.skippedNoUser += 1;
      // "already_linked" is the idempotent steady state — not an error.
    } catch (err) {
      result.errors.push(
        `roster ${r.email}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  return finish(true);
}
