/**
 * @inssnapp/integrations — vendor-neutral integration boundaries (TASK-008).
 *
 * PMS adapters: vendor-neutral PmsAdapter interface + idempotent sync runner
 * + SandboxPmsAdapter fixture implementation. The Showing Engine never
 * imports this package; real vendors (Yardi, Entrata, RealPage, MRI,
 * AppFolio, Buildium) plug in behind the same interface as commercial/API
 * access permits (scope §4).
 *
 * Notifications: NotificationAdapter interface + dev ConsoleNotificationAdapter
 * + fail-open notifySafely. A real SMS/email provider registers through the
 * module registry without engine changes.
 *
 * Screening (TASK-009): vendor-neutral ScreeningAdapter + mocked
 * SandboxCheckrAdapter + consent fail-closed + structural production gate.
 */
export type {
  PmsProperty,
  PmsUnit,
  PmsResidentRosterEntry,
  PmsHealthResult,
  PmsSyncEntityCounts,
  PmsSyncResidentCounts,
  PmsSyncResult,
  PmsAdapter,
  PmsSyncTarget,
} from "./pms";
export { runPmsSync } from "./pms";
export {
  SandboxPmsAdapter,
  SANDBOX_ADAPTER_TYPE,
  SANDBOX_DATASET,
} from "./sandbox";
export type {
  ScreeningMode,
  ScreeningStatus,
  ScreeningFixture,
  ScreeningRequestInput,
  ScreeningReport,
  ScreeningAdapter,
  ScreeningConsent,
  ScreeningConsentStore,
  ScreeningReportStore,
  ScreeningLegalApproval,
  ScreeningLegalApprovalStore,
  ScreeningModeConfig,
  ScreeningServiceDeps,
} from "./screening";
export {
  PRODUCTION_PREREQUISITES,
  DEFAULT_CONSENT_SCOPE_TEXT,
  readScreeningModeConfig,
  resolveScreeningMode,
  ScreeningConsentRequiredError,
  ScreeningProductionBlockedError,
  SandboxCheckrAdapter,
  ScreeningService,
} from "./screening";
export type {
  NotificationEventName,
  NotificationRecipient,
  NotificationPayload,
  NotificationResult,
  NotificationAdapter,
} from "./notifications";
export {
  ConsoleNotificationAdapter,
  setNotificationAdapter,
  resetNotificationAdapter,
  getNotificationAdapter,
  notifySafely,
} from "./notifications";
