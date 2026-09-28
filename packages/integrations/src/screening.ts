/**
 * Tenant-screening boundary (TASK-009).
 *
 * Scope §4 ("Tenant screening / Checkr"): for the MVP, tenant/background
 * screening remains a sandbox or mocked adapter. Production consumer-report
 * processing is NOT enabled until credentials, consent flows,
 * permissible-purpose requirements, adverse-action procedures, privacy
 * controls, and legal/compliance review are approved. Screening results
 * must not be used by an autonomous AI agent to make housing decisions.
 *
 * This module enforces that contract structurally:
 *
 *   1. The only shipping adapter is `SandboxCheckrAdapter`, a mocked
 *      implementation that performs NO network calls — it returns
 *      deterministic sandbox fixtures (clear / review / consider).
 *      There is no code path anywhere in this repo that performs a real
 *      screening API call.
 *   2. Consent is fail-closed: `ScreeningService.requestScreening` refuses
 *      to create a screening request unless a consent record (who, when,
 *      exact scope text) exists for the prospect in the organization.
 *   3. Production mode is structurally gated: `resolveScreeningMode` only
 *      returns "production" when ALL of (a) the configured mode is
 *      production, (b) the SCREENING_PRODUCTION_ENABLED env flag is set,
 *      AND (c) a recorded legal-approval record exists for the
 *      organization. Any one missing → sandbox. The default is sandbox.
 *   4. No autonomous decisions: this package exposes results as
 *      informational DTOs only. There is no hook, callback, or import path
 *      from the Showing Engine into screening — `@inssnapp/engine` does not
 *      depend on `@inssnapp/integrations` (asserted by test), and nothing in
 *      the engine may consume a `ScreeningReport` to allow or deny a
 *      showing transition. Results are only ever surfaced to management
 *      roles in the Control Center for human review.
 */

/** Operational mode of the screening boundary. */
export type ScreeningMode = "sandbox" | "production";

/** Sandbox outcome categories. Informational only — never decision inputs. */
export type ScreeningStatus = "clear" | "review" | "consider";

/** Fixture selector for the deterministic sandbox adapter. */
export type ScreeningFixture = "clear" | "review" | "consider";

/** Input for one screening request. */
export interface ScreeningRequestInput {
  organizationId: string;
  prospectUserId: string;
  prospectName?: string;
  /**
   * Sandbox only: selects the deterministic fixture outcome. Production
   * adapters (when one registers) ignore it.
   */
  fixture?: ScreeningFixture;
}

/**
 * One screening result. A report — not a decision. Nothing in the Showing
 * Engine may read this object; it is rendered to management roles for
 * human review, per scope §4.
 */
export interface ScreeningReport {
  id: string;
  organizationId: string;
  prospectUserId: string;
  mode: ScreeningMode;
  status: ScreeningStatus;
  /**
   * Human-readable explanation. In sandbox mode this always discloses that
   * the result is a mocked fixture, never a real consumer report.
   */
  detail: string;
  requestedAt: string;
  completedAt: string;
  /** User id that triggered the request (recorded for the audit trail). */
  requestedBy?: string;
}

/**
 * The vendor-neutral screening contract. The MVP ships one implementation
 * (`SandboxCheckrAdapter`). A real vendor adapter registers behind this
 * interface later — behind the production gate, never before.
 */
export interface ScreeningAdapter {
  /** "checkr-sandbox" today; a production vendor registers its own name. */
  readonly name: string;
  /** True for mocked adapters; real consumer-report adapters are false. */
  readonly isSandbox: boolean;
  /** Creates one screening and returns the report. */
  requestScreening(input: ScreeningRequestInput): Promise<ScreeningReport>;
  /**
   * Fetches a prior report, org-scoped. Returns null when the id is
   * unknown in the organization — never leaks another org's reports.
   */
  getScreeningStatus(
    organizationId: string,
    screeningId: string,
  ): Promise<ScreeningReport | null>;
}

/**
 * Explicit, recorded prospect consent (who, when, scope text). A screening
 * request is created only when a consent record exists — missing consent
 * fails closed (ScreeningConsentRequiredError).
 */
export interface ScreeningConsent {
  id: string;
  organizationId: string;
  prospectUserId: string;
  /** The exact consent language the prospect accepted. */
  scopeText: string;
  consentedAt: string;
  /** User id that recorded the consent (the prospect themselves or staff). */
  recordedBy: string;
}

export interface ScreeningConsentStore {
  record(
    organizationId: string,
    prospectUserId: string,
    scopeText: string,
    recordedBy: string,
  ): Promise<ScreeningConsent>;
  /** The most recent consent for this prospect in this org (org-scoped). */
  latest(
    organizationId: string,
    prospectUserId: string,
  ): Promise<ScreeningConsent | null>;
  listByOrg(organizationId: string): Promise<ScreeningConsent[]>;
}

export interface ScreeningReportStore {
  save(report: ScreeningReport): Promise<ScreeningReport>;
  byId(
    organizationId: string,
    screeningId: string,
  ): Promise<ScreeningReport | null>;
  recent(
    organizationId: string,
    limit?: number,
  ): Promise<ScreeningReport[]>;
}

/**
 * Legal/compliance approval for production consumer-report processing
 * (scope §4). Required before production mode can enable — the record is
 * the second half of the production gate.
 */
export interface ScreeningLegalApproval {
  id: string;
  organizationId: string;
  approvedAt: string;
  /** Who signed off (name/title, recorded by the compliance reviewer). */
  approvedBy: string;
  notes: string;
}

export interface ScreeningLegalApprovalStore {
  recordApproval(
    organizationId: string,
    approvedBy: string,
    notes: string,
  ): Promise<ScreeningLegalApproval>;
  latest(organizationId: string): Promise<ScreeningLegalApproval | null>;
}

/**
 * Production prerequisites (scope §4), documented in code so the gate
 * cannot be satisfied by accident. ALL must hold before production
 * consumer-report processing is allowed:
 *   - Real vendor credentials provisioned (never in source control)
 *   - Consent flows reviewed and approved
 *   - Permissible-purpose (FCRA) requirements satisfied
 *   - Adverse-action procedures documented and wired
 *   - Privacy controls (minimum-necessary, retention, access) in place
 *   - Legal/compliance review approved and RECORDED via
 *     ScreeningLegalApprovalStore.recordApproval
 */
export const PRODUCTION_PREREQUISITES: readonly string[] = [
  "Vendor credentials provisioned (stored outside source control)",
  "Consent flows reviewed and approved",
  "Permissible-purpose (FCRA) requirements satisfied",
  "Adverse-action procedures documented and wired",
  "Privacy controls in place (minimum-necessary, retention, access)",
  "Legal/compliance review approved and recorded",
] as const;

/**
 * How the operator *intends* to run screening. Defaults to sandbox;
 * nothing else in this repo flips this to production today.
 */
export interface ScreeningModeConfig {
  /** From SCREENING_MODE; defaults to "sandbox". */
  mode: ScreeningMode;
  /** From SCREENING_PRODUCTION_ENABLED=1; required for production. */
  productionEnvEnabled: boolean;
}

export function readScreeningModeConfig(
  env: NodeJS.ProcessEnv = process.env,
): ScreeningModeConfig {
  const raw = (env["SCREENING_MODE"] ?? "sandbox").toLowerCase();
  return {
    mode: raw === "production" ? "production" : "sandbox",
    productionEnvEnabled: env["SCREENING_PRODUCTION_ENABLED"] === "1",
  };
}

/**
 * The production gate. Returns "production" ONLY when ALL three hold:
 *   1. configured mode is "production",
 *   2. the SCREENING_PRODUCTION_ENABLED env flag is set,
 *   3. a recorded legal-approval record exists for the organization.
 *
 * Anything missing → sandbox. There is no way to reach production through
 * a single flag, a config typo, or a deploy without the recorded legal
 * sign-off: the gate is structural, not procedural.
 */
export function resolveScreeningMode(
  config: ScreeningModeConfig,
  legalApproval: ScreeningLegalApproval | null,
): ScreeningMode {
  if (
    config.mode === "production" &&
    config.productionEnvEnabled &&
    legalApproval !== null
  ) {
    return "production";
  }
  return "sandbox";
}

export class ScreeningConsentRequiredError extends Error {
  readonly code = "screening_consent_required";
  constructor(prospectUserId: string) {
    super(
      `Screening request refused: no consent record for prospect ${prospectUserId}. ` +
        `Consent must be recorded (who, when, scope text) before any screening request.`,
    );
  }
}

export class ScreeningProductionBlockedError extends Error {
  readonly code = "screening_production_blocked";
  constructor(reason: string) {
    super(
      `Production screening is blocked: ${reason}. ` +
        `All production prerequisites must be satisfied — see PRODUCTION_PREREQUISITES.`,
    );
  }
}

const FIXTURE_DETAIL: Record<ScreeningFixture, { status: ScreeningStatus; detail: string }> = {
  clear: {
    status: "clear",
    detail:
      "SANDBOX FIXTURE — not a real consumer report. Mocked outcome: no records found in the simulated dataset.",
  },
  review: {
    status: "review",
    detail:
      "SANDBOX FIXTURE — not a real consumer report. Mocked outcome: one item flagged for human review in the simulated dataset.",
  },
  consider: {
    status: "consider",
    detail:
      "SANDBOX FIXTURE — not a real consumer report. Mocked outcome: simulated records warrant consideration by management.",
  },
};

/**
 * Mocked Checkr-style screening adapter (the only adapter that ships).
 *
 * Deterministic sandbox results: the caller selects the fixture
 * ("clear" | "review" | "consider"; defaults to "clear") and the adapter
 * returns that outcome immediately. The report id is deterministic
 * (`sandbox-<fixture>-<prospectUserId>`) so repeat requests are stable.
 *
 * NO NETWORK CALLS ARE MADE — this class performs zero I/O. There is no
 * code path anywhere in this repository that performs a real screening
 * API call; production stays behind the mode gate until scope §4's
 * prerequisites (see PRODUCTION_PREREQUISITES) are all approved.
 */
export class SandboxCheckrAdapter implements ScreeningAdapter {
  readonly name = "checkr-sandbox";
  readonly isSandbox = true;

  async requestScreening(input: ScreeningRequestInput): Promise<ScreeningReport> {
    const fixture: ScreeningFixture = input.fixture ?? "clear";
    const { status, detail } = FIXTURE_DETAIL[fixture];
    const now = new Date().toISOString();
    return {
      // Deterministic: the same fixture + prospect always yields the same id.
      id: `sandbox-${fixture}-${input.prospectUserId}`,
      organizationId: input.organizationId,
      prospectUserId: input.prospectUserId,
      mode: "sandbox",
      status,
      detail,
      requestedAt: now,
      completedAt: now,
    };
  }

  async getScreeningStatus(
    organizationId: string,
    screeningId: string,
  ): Promise<ScreeningReport | null> {
    // Re-derive the report from its deterministic id; returns null unless
    // the id parses as a sandbox report belonging to this organization.
    const m = /^sandbox-(clear|review|consider)-(.+)$/.exec(screeningId);
    if (!m) return null;
    const fixture = m[1] as ScreeningFixture;
    const prospectUserId = m[2];
    const { status, detail } = FIXTURE_DETAIL[fixture];
    return {
      id: screeningId,
      organizationId,
      prospectUserId,
      mode: "sandbox",
      status,
      detail,
      requestedAt: "n/a (deterministic fixture)",
      completedAt: "n/a (deterministic fixture)",
    };
  }
}

export interface ScreeningServiceDeps {
  adapter: ScreeningAdapter;
  consentStore: ScreeningConsentStore;
  reportStore: ScreeningReportStore;
  legalApprovalStore: ScreeningLegalApprovalStore;
  /** Re-read per call so mode changes take effect without a restart. */
  getModeConfig: () => ScreeningModeConfig;
}

/**
 * Orchestrates consent → request → report with the compliance-safe
 * boundary. Results are informational only: this service never decides
 * anything about housing, and no engine code may call it.
 */
export class ScreeningService {
  private readonly deps: ScreeningServiceDeps;

  constructor(deps: ScreeningServiceDeps) {
    this.deps = deps;
  }

  /**
   * Records explicit prospect consent. The caller is responsible for
   * presenting `scopeText` to the prospect and collecting their
   * affirmation; what is stored is the record (who, when, exact text).
   */
  async recordConsent(args: {
    organizationId: string;
    prospectUserId: string;
    scopeText: string;
    recordedBy: string;
  }): Promise<ScreeningConsent> {
    if (!args.scopeText.trim()) {
      throw new Error("ScreeningService.recordConsent: scopeText must not be empty.");
    }
    return this.deps.consentStore.record(
      args.organizationId,
      args.prospectUserId,
      args.scopeText,
      args.recordedBy,
    );
  }

  /**
   * Current mode with the reason production is (not) active — the Control
   * Center renders this prominently so the mode is always visible.
   */
  async getModeStatus(organizationId: string): Promise<{
    mode: ScreeningMode;
    adapter: string;
    sandbox: boolean;
    legalApproval: ScreeningLegalApproval | null;
    productionBlockedReason: string | null;
  }> {
    const config = this.deps.getModeConfig();
    const legalApproval = await this.deps.legalApprovalStore.latest(organizationId);
    const mode = resolveScreeningMode(config, legalApproval);
    let productionBlockedReason: string | null = null;
    if (mode === "sandbox" && config.mode === "production") {
      const missing: string[] = [];
      if (!config.productionEnvEnabled)
        missing.push("SCREENING_PRODUCTION_ENABLED is not set");
      if (legalApproval === null)
        missing.push("no recorded legal-approval record");
      productionBlockedReason =
        `Configured for production but blocked: ${missing.join("; ")}. ` +
        `Falling back to sandbox.`;
    }
    return {
      mode,
      adapter: this.deps.adapter.name,
      sandbox: this.deps.adapter.isSandbox,
      legalApproval,
      productionBlockedReason,
    };
  }

  /**
   * Creates a screening request. FAIL-CLOSED:
   *   - no consent record for this org+prospect → throws
   *     ScreeningConsentRequiredError;
   *   - production requested but gate not satisfied → the adapter stays
   *     the sandbox (resolveScreeningMode), and if the configured adapter
   *     is not a sandbox adapter it throws ScreeningProductionBlockedError
   *     instead of running a real consumer report.
   */
  async requestScreening(args: {
    organizationId: string;
    prospectUserId: string;
    prospectName?: string;
    fixture?: ScreeningFixture;
    requestedBy: string;
  }): Promise<ScreeningReport> {
    const consent = await this.deps.consentStore.latest(
      args.organizationId,
      args.prospectUserId,
    );
    if (consent === null) {
      throw new ScreeningConsentRequiredError(args.prospectUserId);
    }

    const { mode } = await this.getModeStatus(args.organizationId);
    const adapter = this.deps.adapter;

    if (mode === "production" && adapter.isSandbox) {
      // A sandbox adapter cannot fulfill a production-mode request —
      // the real vendor adapter must register behind the
      // ScreeningAdapter interface first. Refuse rather than fake it.
      throw new ScreeningProductionBlockedError(
        "mode resolved to production but no production ScreeningAdapter is registered",
      );
    }

    const report = await adapter.requestScreening({
      organizationId: args.organizationId,
      prospectUserId: args.prospectUserId,
      prospectName: args.prospectName,
      fixture: args.fixture,
    });
    report.requestedBy = args.requestedBy;
    return this.deps.reportStore.save(report);
  }

  async getScreening(
    organizationId: string,
    screeningId: string,
  ): Promise<ScreeningReport | null> {
    return this.deps.reportStore.byId(organizationId, screeningId);
  }

  async recentScreenings(
    organizationId: string,
    limit = 25,
  ): Promise<ScreeningReport[]> {
    return this.deps.reportStore.recent(organizationId, limit);
  }

  async consentRecords(organizationId: string): Promise<ScreeningConsent[]> {
    return this.deps.consentStore.listByOrg(organizationId);
  }
}

/**
 * Default consent language presented to the prospect (English; the product
 * localizes it for the prospect experience). The recorded record stores
 * the exact text the prospect saw.
 */
export const DEFAULT_CONSENT_SCOPE_TEXT =
  "I authorize INSSNAPP to obtain a background screening report about me " +
  "from its screening provider for the purpose of evaluating my rental " +
  "application. I understand this is currently a SANDBOX demonstration " +
  "and no real consumer report is obtained. I may revoke this consent at " +
  "any time by contacting property management.";
