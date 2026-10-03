/**
 * Mobile web (/m) DTO types.
 *
 * Local copies of the backend shapes (mirroring apps/mobile/src/api/types.ts).
 * The mobile web bundle must not import from apps/mobile — see CLAUDE.md.
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

/** One of the signed-in resident's own enrollments (GET /api/residents/me). */
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

/** Privacy-safe prospect profile (GET /api/prospects/[id]/profile). */
export interface ProspectProfile {
  fullName: string;
  emailVerified: boolean;
  stats: {
    totalShowings: number;
    completedShowings: number;
    outcomes: { APPLY: number; WATCH: number; DECLINE: number };
  };
  ratingsReceived: {
    count: number;
    avgStars: number | null;
    recent: { stars: number; comment: string | null; at: string }[];
  };
}
