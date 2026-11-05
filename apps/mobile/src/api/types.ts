/**
 * DTO types mirroring the web backend (apps/web). The mobile app never
 * invents workflow rules — these shapes only describe what the API
 * returns; every state change is performed by the Showing Engine
 * server-side.
 */

export type Role = "management" | "resident" | "prospect" | "broker" | "inssnapp_admin";

export interface SessionUser {
  userId: string;
  organizationId: string;
  email: string;
  fullName: string;
  role: Role;
}

export type ShowingState =
  | "AVAILABLE"
  | "REQUESTED"
  | "RESIDENT_ACCEPTED"
  | "BROKER_GATE"
  | "CONFIRMED"
  | "IN_PROGRESS"
  | "COMPLETED"
  | "OUTCOME";

export type ShowingOutcome = "APPLY" | "WATCH" | "DECLINE";

export interface Showing {
  id: string;
  organizationId: string;
  unitId: string;
  residentUserId: string;
  prospectUserId: string | null;
  brokerUserId: string | null;
  brokerRequired: boolean;
  state: ShowingState;
  outcome: ShowingOutcome | null;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface Unit {
  id: string;
  organizationId: string;
  propertyId: string;
  label: string;
  pmsExternalId: string | null;
  eligible: boolean;
  residentAvailable: boolean;
}

/** One of the caller's own resident enrollments (GET /api/residents/me). */
export interface ResidentEnrollment {
  userId: string;
  email: string;
  fullName: string;
  unitId: string;
  unitLabel: string;
  propertyName: string;
  eligible: boolean;
  residentAvailable: boolean;
  verified: boolean;
}

export interface Rating {
  id: string;
  organizationId: string;
  showingId: string;
  raterUserId: string;
  raterRole: string;
  stars: number;
  comment: string | null;
  createdAt: string;
}

/** Terminal states — nothing left to do for any role. */
export const TERMINAL_STATES: ShowingState[] = ["OUTCOME"];

export function isTerminal(state: ShowingState): boolean {
  return TERMINAL_STATES.includes(state);
}

/**
 * Prospective "Ready" packet (GET/POST /api/prospects/me) — mirrors the
 * web /m/prospect Ready card. Pre-assembled is NOT pre-approved:
 * management vets and decides every application.
 */
export interface ProspectPacket {
  tier: "base" | "ready";
  application: {
    moveInDate: string | null;
    occupants: number | null;
    hasPets: boolean | null;
    employmentStatus: string | null;
    incomeRange: string | null;
    statement: string | null;
  };
  documents: { type: string; recordedAt: string }[];
  readiness: {
    applicationComplete: boolean;
    documentsLoaded: boolean;
    screeningCompleted: boolean;
    screeningStatus: string | null;
    packetAssembled: boolean;
  };
}

export interface ProspectPacketPatch {
  tier?: "base" | "ready";
  moveInDate?: string;
  occupants?: number;
  employmentStatus?: string;
  incomeRange?: string;
  documents?: string[];
}

/** One broker subscription tier option (from GET /api/brokers/me/tier). */
export interface BrokerTierOption {
  id: string;
  name: string;
  blurb: string;
  leadLimit: number | null;
  trialDays: number | null;
  windowDays: number | null;
}

/** The broker's own subscription + usage (GET /api/brokers/me/tier). */
export interface BrokerTierInfo {
  tier: string;
  tierStartedAt: string;
  trialEndsAt: string | null;
  trialExpired: boolean;
  used: number;
  limit: number | null;
  canAcceptMore: boolean;
  licenseStatus: LicenseStatus;
  tiers: Record<string, BrokerTierOption>;
}

export type LicenseStatus = "none" | "pending" | "verified" | "rejected";

/** The broker's own license-vetting state (GET /api/brokers/me/license). */
export interface BrokerLicenseInfo {
  licenseNumber: string | null;
  licenseState: string | null;
  licenseStatus: LicenseStatus;
  licenseReviewNote: string | null;
  registry: { authority: string; lookupUrl: string | null } | null;
}
