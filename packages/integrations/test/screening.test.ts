/**
 * TASK-009 — Checkr sandbox workflow tests.
 *
 * Proves the compliance-safe boundary:
 *   - consent fail-closed: no consent record → screening request refuses
 *   - sandbox fixtures are deterministic (clear / review / consider)
 *   - production mode is structurally gated: impossible without BOTH the
 *     env flag AND a recorded legal-approval record; the adapter stays
 *     the sandbox and the Control Center sees the fallback
 *   - org-scoping: consent in org A never authorizes a request in org B
 *   - no real screening call path exists (adapter is synchronous-in-memory,
 *     zero I/O)
 *   - engine independence: @inssnapp/engine has no dependency on
 *     @inssnapp/integrations and no screening reference in its sources
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  SandboxCheckrAdapter,
  ScreeningService,
  ScreeningConsentRequiredError,
  ScreeningProductionBlockedError,
  resolveScreeningMode,
  readScreeningModeConfig,
  PRODUCTION_PREREQUISITES,
  DEFAULT_CONSENT_SCOPE_TEXT,
  type ScreeningConsent,
  type ScreeningConsentStore,
  type ScreeningReport,
  type ScreeningReportStore,
  type ScreeningLegalApproval,
  type ScreeningLegalApprovalStore,
  type ScreeningModeConfig,
} from "../src/index";

/** In-memory store implementations shared by the tests below. */
function makeStores() {
  const consents: ScreeningConsent[] = [];
  const reports = new Map<string, ScreeningReport>();
  const approvals: ScreeningLegalApproval[] = [];
  let seq = 0;
  const now = () => new Date().toISOString();

  const consentStore: ScreeningConsentStore = {
    async record(organizationId, prospectUserId, scopeText, recordedBy) {
      const c: ScreeningConsent = {
        id: `consent_${++seq}`,
        organizationId,
        prospectUserId,
        scopeText,
        consentedAt: now(),
        recordedBy,
      };
      consents.push(c);
      return c;
    },
    async latest(organizationId, prospectUserId) {
      const mine = consents.filter(
        (c) => c.organizationId === organizationId && c.prospectUserId === prospectUserId,
      );
      return mine.length ? mine[mine.length - 1] : null;
    },
    async listByOrg(organizationId) {
      return consents.filter((c) => c.organizationId === organizationId);
    },
  };

  const reportStore: ScreeningReportStore = {
    async save(report) {
      reports.set(report.id, report);
      return report;
    },
    async byId(organizationId, screeningId) {
      const r = reports.get(screeningId) ?? null;
      return r && r.organizationId === organizationId ? r : null;
    },
    async recent(organizationId, limit = 25) {
      return [...reports.values()]
        .filter((r) => r.organizationId === organizationId)
        .slice(0, limit);
    },
  };

  const legalApprovalStore: ScreeningLegalApprovalStore = {
    async recordApproval(organizationId, approvedBy, notes) {
      const a: ScreeningLegalApproval = {
        id: `approval_${++seq}`,
        organizationId,
        approvedAt: now(),
        approvedBy,
        notes,
      };
      approvals.push(a);
      return a;
    },
    async latest(organizationId) {
      const mine = approvals.filter((a) => a.organizationId === organizationId);
      return mine.length ? mine[mine.length - 1] : null;
    },
  };

  return { consentStore, reportStore, legalApprovalStore };
}

function makeService(modeConfig: ScreeningModeConfig = { mode: "sandbox", productionEnvEnabled: false }) {
  const { consentStore, reportStore, legalApprovalStore } = makeStores();
  const service = new ScreeningService({
    adapter: new SandboxCheckrAdapter(),
    consentStore,
    reportStore,
    legalApprovalStore,
    getModeConfig: () => modeConfig,
  });
  return { service, consentStore, reportStore, legalApprovalStore };
}

describe("sandbox adapter determinism", () => {
  it("returns the selected fixture outcome with no I/O", async () => {
    const adapter = new SandboxCheckrAdapter();
    for (const fixture of ["clear", "review", "consider"] as const) {
      const report = await adapter.requestScreening({
        organizationId: "org_1",
        prospectUserId: "u_prospect",
        fixture,
      });
      expect(report.mode).toBe("sandbox");
      expect(report.status).toBe(fixture);
      expect(report.detail).toContain("SANDBOX FIXTURE");
      expect(report.detail).toContain("not a real consumer report");
    }
  });

  it("defaults to the clear fixture and is deterministic per fixture+prospect", async () => {
    const adapter = new SandboxCheckrAdapter();
    const a = await adapter.requestScreening({ organizationId: "org_1", prospectUserId: "u_p" });
    const b = await adapter.requestScreening({ organizationId: "org_1", prospectUserId: "u_p" });
    expect(a.status).toBe("clear");
    expect(a.id).toBe(b.id); // deterministic — repeat requests are stable
  });

  it("getScreeningStatus is org-scoped and re-derives from the deterministic id", async () => {
    const adapter = new SandboxCheckrAdapter();
    const r = await adapter.requestScreening({
      organizationId: "org_1",
      prospectUserId: "u_p",
      fixture: "review",
    });
    const same = await adapter.getScreeningStatus("org_1", r.id);
    expect(same?.status).toBe("review");
    expect(await adapter.getScreeningStatus("org_1", "bogus-id")).toBeNull();
  });
});

describe("consent fail-closed", () => {
  it("refuses a screening request when no consent record exists", async () => {
    const { service } = makeService();
    await expect(
      service.requestScreening({
        organizationId: "org_1",
        prospectUserId: "u_prospect",
        requestedBy: "u_mgmt",
      }),
    ).rejects.toBeInstanceOf(ScreeningConsentRequiredError);
  });

  it("creates the screening once consent is recorded (who, when, scope text)", async () => {
    const { service, consentStore } = makeService();
    const consent = await service.recordConsent({
      organizationId: "org_1",
      prospectUserId: "u_prospect",
      scopeText: DEFAULT_CONSENT_SCOPE_TEXT,
      recordedBy: "u_prospect",
    });
    expect(consent.consentedAt).toBeTruthy();
    expect(consent.recordedBy).toBe("u_prospect");
    expect(consent.scopeText).toBe(DEFAULT_CONSENT_SCOPE_TEXT);

    const report = await service.requestScreening({
      organizationId: "org_1",
      prospectUserId: "u_prospect",
      fixture: "consider",
      requestedBy: "u_mgmt",
    });
    expect(report.mode).toBe("sandbox");
    expect(report.status).toBe("consider");

    // persisted and readable through the store, org-scoped
    expect(await consentStore.latest("org_1", "u_prospect")).not.toBeNull();
    expect(await service.getScreening("org_1", report.id)).toMatchObject({
      prospectUserId: "u_prospect",
    });
    expect(await service.getScreening("org_2", report.id)).toBeNull();
  });

  it("rejects empty consent scope text", async () => {
    const { service } = makeService();
    await expect(
      service.recordConsent({
        organizationId: "org_1",
        prospectUserId: "u_prospect",
        scopeText: "   ",
        recordedBy: "u_prospect",
      }),
    ).rejects.toThrow(/scopeText/);
  });
});

describe("org-scoping", () => {
  it("consent in org A does not authorize a request in org B", async () => {
    const { service } = makeService();
    await service.recordConsent({
      organizationId: "org_1",
      prospectUserId: "u_prospect",
      scopeText: DEFAULT_CONSENT_SCOPE_TEXT,
      recordedBy: "u_prospect",
    });
    await expect(
      service.requestScreening({
        organizationId: "org_2",
        prospectUserId: "u_prospect",
        requestedBy: "u_mgmt2",
      }),
    ).rejects.toBeInstanceOf(ScreeningConsentRequiredError);
  });
});

describe("production gate (structural)", () => {
  it("defaults to sandbox and stays sandbox when configured for production without approval", async () => {
    const { service } = makeService({
      mode: "production",
      productionEnvEnabled: true,
    });
    const status = await service.getModeStatus("org_1");
    expect(status.mode).toBe("sandbox");
    expect(status.sandbox).toBe(true);
    expect(status.productionBlockedReason).toContain("no recorded legal-approval");
  });

  it("stays sandbox when the env flag is missing, even with legal approval recorded", async () => {
    const { service, legalApprovalStore } = makeService({
      mode: "production",
      productionEnvEnabled: false,
    });
    await legalApprovalStore.recordApproval("org_1", "General Counsel", "all checks done");
    const status = await service.getModeStatus("org_1");
    expect(status.mode).toBe("sandbox");
    expect(status.productionBlockedReason).toContain("SCREENING_PRODUCTION_ENABLED");
  });

  it("resolveScreeningMode requires all three: config, env flag, AND approval record", () => {
    const approval = {
      id: "a1",
      organizationId: "org_1",
      approvedAt: new Date().toISOString(),
      approvedBy: "GC",
      notes: "ok",
    };
    expect(
      resolveScreeningMode({ mode: "production", productionEnvEnabled: true }, approval),
    ).toBe("production");
    expect(
      resolveScreeningMode({ mode: "production", productionEnvEnabled: false }, approval),
    ).toBe("sandbox");
    expect(
      resolveScreeningMode({ mode: "production", productionEnvEnabled: true }, null),
    ).toBe("sandbox");
    expect(
      resolveScreeningMode({ mode: "sandbox", productionEnvEnabled: true }, approval),
    ).toBe("sandbox");
  });

  it("readScreeningModeConfig defaults to sandbox", () => {
    expect(readScreeningModeConfig({})).toEqual({
      mode: "sandbox",
      productionEnvEnabled: false,
    });
  });

  it("refuses to run a production-mode request through the sandbox adapter", async () => {
    const { service, legalApprovalStore } = makeService({
      mode: "production",
      productionEnvEnabled: true,
    });
    await legalApprovalStore.recordApproval("org_1", "GC", "ok");
    await service.recordConsent({
      organizationId: "org_1",
      prospectUserId: "u_prospect",
      scopeText: DEFAULT_CONSENT_SCOPE_TEXT,
      recordedBy: "u_prospect",
    });
    // Mode resolves to production, but only the sandbox adapter is
    // registered — the service refuses rather than faking production.
    await expect(
      service.requestScreening({
        organizationId: "org_1",
        prospectUserId: "u_prospect",
        requestedBy: "u_mgmt",
      }),
    ).rejects.toBeInstanceOf(ScreeningProductionBlockedError);
  });
});

describe("production prerequisites documentation", () => {
  it("lists the scope §4 prerequisites", () => {
    expect(PRODUCTION_PREREQUISITES).toContain(
      "Consent flows reviewed and approved",
    );
    expect(PRODUCTION_PREREQUISITES).toContain(
      "Permissible-purpose (FCRA) requirements satisfied",
    );
    expect(PRODUCTION_PREREQUISITES).toContain(
      "Legal/compliance review approved and recorded",
    );
  });
});

describe("engine independence (no autonomous decisions)", () => {
  const here = dirname(fileURLToPath(import.meta.url));
  const enginePkgPath = join(here, "..", "..", "engine", "package.json");
  const engineSrc = join(here, "..", "..", "engine", "src");

  it("@inssnapp/engine does not depend on @inssnapp/integrations", () => {
    const pkg = JSON.parse(readFileSync(enginePkgPath, "utf8"));
    const allDeps = {
      ...(pkg.dependencies ?? {}),
      ...(pkg.devDependencies ?? {}),
      ...(pkg.peerDependencies ?? {}),
    };
    expect(allDeps).not.toHaveProperty("@inssnapp/integrations");
  });

  it("engine sources contain no screening import or reference", () => {
    const files = ["engine.ts", "transitions.ts", "types.ts", "index.ts"];
    for (const f of files) {
      const src = readFileSync(join(engineSrc, f), "utf8").toLowerCase();
      expect(src, `${f} must not reference screening`).not.toContain("screening");
      expect(src, `${f} must not reference checkr`).not.toContain("checkr");
      expect(src, `${f} must not import integrations`).not.toContain("integrations");
    }
  });
});
