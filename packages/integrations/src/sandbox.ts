/**
 * Sandbox PMS adapter (TASK-008).
 *
 * A working in-repo PmsAdapter backed by fixture data shaped like a Yardi
 * sandbox export. It implements the vendor-neutral PmsAdapter interface —
 * nothing in the Showing Engine or the sync runner knows this is a fixture.
 *
 * Registered per-organization via the `pms_adapters` table with
 * adapter_type "sandbox" and a config JSON such as:
 *   { "vendor": "yardi", "dataset": "sandbox-default" }
 *
 * Config knobs (dev/test only, never secrets):
 *   dataset:    "sandbox-default" (only supported dataset; anything else → connect throws)
 *   failHealth: true → healthCheck reports ok:false (exercises the error path)
 */

import type {
  PmsAdapter,
  PmsHealthResult,
  PmsProperty,
  PmsResidentRosterEntry,
  PmsUnit,
} from "./pms";

export const SANDBOX_ADAPTER_TYPE = "sandbox";
export const SANDBOX_DATASET = "sandbox-default";

interface SandboxFixture {
  properties: PmsProperty[];
  units: PmsUnit[];
  roster: PmsResidentRosterEntry[];
}

/**
 * Yardi-like sandbox dataset. External ids are deliberately in a range that
 * never collides with the seeded demo data (which uses YRD-100xx / ENT-200xx
 * / APP-300xx), so syncs are additive and idempotent.
 *
 * The roster links the demo resident account (resident@inssnapp.demo) to one
 * synced unit so the full showing flow can be exercised on synced data; the
 * second roster row targets a nonexistent user to exercise the skip path.
 */
const DEFAULT_FIXTURE: SandboxFixture = {
  properties: [
    { externalId: "YRD-P-9001", name: "Cedar Grove", address: "410 Cedar Ave, Seattle, WA" },
    { externalId: "YRD-P-9002", name: "Birch Landing", address: "77 Birch Way, Bellevue, WA" },
  ],
  units: [
    { externalId: "YRD-U-90011", propertyExternalId: "YRD-P-9001", label: "1A", eligible: true },
    { externalId: "YRD-U-90012", propertyExternalId: "YRD-P-9001", label: "2B", eligible: true },
    { externalId: "YRD-U-90021", propertyExternalId: "YRD-P-9002", label: "3C", eligible: true },
  ],
  roster: [
    {
      unitExternalId: "YRD-U-90011",
      email: "resident@inssnapp.demo",
      fullName: "Jordan Lee",
      verified: true,
    },
    {
      unitExternalId: "YRD-U-90021",
      email: "ghost-resident@inssnapp.demo",
      fullName: "Nobody Here",
      verified: false,
    },
  ],
};

export class SandboxPmsAdapter implements PmsAdapter {
  readonly adapterType = SANDBOX_ADAPTER_TYPE;

  private config: Record<string, unknown> = {};
  private connected = false;

  async connect(config: Record<string, unknown>): Promise<void> {
    const dataset = (config["dataset"] as string | undefined) ?? SANDBOX_DATASET;
    if (dataset !== SANDBOX_DATASET) {
      throw new Error(
        `SandboxPmsAdapter: unknown dataset "${dataset}" (only "${SANDBOX_DATASET}" is supported).`,
      );
    }
    // Store only non-secret config. A real vendor adapter would keep a
    // credential *reference* here, never the secret itself.
    this.config = { vendor: config["vendor"] ?? "yardi", dataset, failHealth: config["failHealth"] === true };
    this.connected = true;
  }

  private requireConnected(): void {
    if (!this.connected) {
      throw new Error("SandboxPmsAdapter: connect() must be called before use.");
    }
  }

  async healthCheck(_organizationId: string): Promise<PmsHealthResult> {
    this.requireConnected();
    const started = Date.now();
    // No I/O in the sandbox — the probe is the fixture read itself.
    const units = DEFAULT_FIXTURE.units.length;
    const failing = this.config["failHealth"] === true;
    return {
      ok: !failing,
      latencyMs: Date.now() - started,
      checkedAt: new Date().toISOString(),
      detail: failing
        ? "Simulated failure (config.failHealth=true)."
        : `Sandbox dataset "${SANDBOX_DATASET}" readable · ${units} units.`,
    };
  }

  async listProperties(_organizationId: string): Promise<PmsProperty[]> {
    this.requireConnected();
    return structuredClone(DEFAULT_FIXTURE.properties);
  }

  async listUnits(_organizationId: string, propertyExternalId: string): Promise<PmsUnit[]> {
    this.requireConnected();
    return structuredClone(
      DEFAULT_FIXTURE.units.filter((u) => u.propertyExternalId === propertyExternalId),
    );
  }

  async listResidentRoster(_organizationId: string): Promise<PmsResidentRosterEntry[]> {
    this.requireConnected();
    return structuredClone(DEFAULT_FIXTURE.roster);
  }
}
