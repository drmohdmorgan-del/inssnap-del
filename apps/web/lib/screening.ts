/**
 * Screening service wiring for the web app (TASK-009).
 *
 * Binds the vendor-neutral ScreeningService from @inssnapp/integrations to
 * the app's data layer. The service is a process-level singleton backed by
 * the unified `db` store (in-memory for local dev, PostgreSQL when
 * DATABASE_URL is set).
 *
 * Only this module (and the screening API routes) touches screening. The
 * Showing Engine never imports it — screening results are informational
 * and rendered only to management roles in the Control Center.
 */

import {
  SandboxCheckrAdapter,
  ScreeningService,
  readScreeningModeConfig,
  type ScreeningAdapter,
  type ScreeningConsentStore,
  type ScreeningReportStore,
  type ScreeningLegalApprovalStore,
  type ScreeningReport,
} from "@inssnapp/integrations";
import { db, type ScreeningReportRow } from "./db";

function toReport(row: ScreeningReportRow) {
  return {
    id: row.id,
    organizationId: row.organizationId,
    prospectUserId: row.prospectUserId,
    mode: row.mode,
    status: row.status,
    detail: row.detail,
    requestedAt: row.requestedAt,
    completedAt: row.completedAt,
    requestedBy: row.requestedBy ?? undefined,
  };
}

const consentStore: ScreeningConsentStore = {
  record: (organizationId, prospectUserId, scopeText, recordedBy) =>
    db.screening.recordConsent(organizationId, prospectUserId, scopeText, recordedBy),
  latest: (organizationId, prospectUserId) =>
    db.screening.latestConsent(organizationId, prospectUserId),
  listByOrg: (organizationId) => db.screening.consentsByOrg(organizationId),
};

const reportStore: ScreeningReportStore = {
  save: async (report: ScreeningReport) => {
    const row = await db.screening.saveReport({
      id: report.id,
      organizationId: report.organizationId,
      prospectUserId: report.prospectUserId,
      mode: report.mode,
      status: report.status,
      detail: report.detail,
      requestedAt: report.requestedAt,
      completedAt: report.completedAt,
      requestedBy: report.requestedBy ?? null,
    });
    return {
      id: row.id,
      organizationId: row.organizationId,
      prospectUserId: row.prospectUserId,
      mode: row.mode,
      status: row.status,
      detail: row.detail,
      requestedAt: row.requestedAt,
      completedAt: row.completedAt,
      requestedBy: row.requestedBy ?? undefined,
    };
  },
  byId: async (organizationId, screeningId) => {
    const row = await db.screening.reportById(organizationId, screeningId);
    return row ? toReport(row) : null;
  },
  recent: async (organizationId, limit) => {
    const rows = await db.screening.recentReports(organizationId, limit);
    return rows.map(toReport);
  },
};

const legalApprovalStore: ScreeningLegalApprovalStore = {
  recordApproval: (organizationId, approvedBy, notes) =>
    db.screening.recordLegalApproval(organizationId, approvedBy, notes),
  latest: (organizationId) => db.screening.latestLegalApproval(organizationId),
};

let service: ScreeningService | null = null;

/**
 * The screening service for this process. The adapter registry is the seam
 * where a production ScreeningAdapter registers later — today only the
 * mocked sandbox adapter is installed, and only after the production gate
 * opens (mode config + env flag + recorded legal approval) could a real
 * one be swapped in.
 */
export function getScreeningService(
  adapter: ScreeningAdapter = new SandboxCheckrAdapter(),
): ScreeningService {
  if (!service) {
    service = new ScreeningService({
      adapter,
      consentStore,
      reportStore,
      legalApprovalStore,
      getModeConfig: readScreeningModeConfig,
    });
  }
  return service;
}

/** Test/dev helper: drop the cached service so a fresh one is built. */
export function resetScreeningService(): void {
  service = null;
}
