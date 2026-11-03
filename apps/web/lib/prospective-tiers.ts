/**
 * Prospective tiers (DrMorgan 2026-11-03): free base + premium "Ready".
 *
 * The free base is complete on its own — browse, inquire, and apply
 * per-unit the slow way. Lead supply is NEVER gated.
 *
 * The premium product is TIME. A "Ready" prospective carries a
 * PRE-ASSEMBLED packet — Checkr screening completed once, financials
 * and document records loaded, application complete — so the moment a
 * unit appears they can submit instantly instead of risking losing the
 * apartment while assembling an application.
 *
 * IMPORTANT (DrMorgan 2026-11-03): pre-assembled is NOT pre-approved.
 * Management vets EVERYTHING on every file — credit, financials,
 * background, the complete packet — and decides each application,
 * premium or free. The Ready tier buys speed, never an outcome.
 *
 * Market anchor: Zillow charges renters ~$49 for a reusable application
 * including screening — readiness is a proven paid product. The price
 * below is a CONFIG value (draft at the anchor); DrMorgan dictates the
 * final number. No payment provider is wired yet — tier selection is
 * free during the pilot, exactly like broker tiers.
 */

export const PROSPECTIVE_TIERS = {
  base: {
    id: "base",
    name: "Base",
    blurb: "Browse, inquire, and apply per unit — free forever.",
    /** Config price (USD). DrMorgan dictates the final number. */
    priceUsd: 0,
  },
  ready: {
    id: "ready",
    name: "Ready",
    blurb:
      "Your full packet, pre-assembled: screening done once, financials and documents loaded, application complete — submit instantly when a unit drops.",
    /** Config price (USD) — DRAFT at the Zillow reusable-application anchor. */
    priceUsd: 49,
  },
} as const;

export type ProspectiveTierId = keyof typeof PROSPECTIVE_TIERS;

/** The document records a complete packet carries. */
export const REQUIRED_DOCUMENT_TYPES = [
  "government_id",
  "proof_of_income",
  "rental_history",
] as const;

export interface PacketReadiness {
  /** Every application field Management reviews is present. */
  applicationComplete: boolean;
  /**
   * All required document records are loaded. Records are the
   * applicant's own attestations — a record of the case, NEVER the
   * evidence for a decision (Management reviews verified sources:
   * the Checkr report, the credit pull, the registry result, verified
   * income data — DrMorgan 2026-11-03).
   */
  documentsLoaded: boolean;
  /** A completed Checkr screening report exists for this prospective. */
  screeningCompleted: boolean;
  /** The prospective's latest screening outcome, when one exists. */
  screeningStatus: string | null;
  /**
   * True when the packet is fully pre-assembled. This is a SPEED state,
   * never an approval — Management still vets and decides every file.
   */
  packetAssembled: boolean;
}

interface ProfileShape {
  moveInDate: string | null;
  occupants: number | null;
  hasPets: boolean | null;
  employmentStatus: string | null;
  incomeRange: string | null;
  documents: { type: string }[];
}

export function computePacketReadiness(
  profile: ProfileShape,
  latestScreening: { status: string } | null,
): PacketReadiness {
  const applicationComplete = Boolean(
    profile.moveInDate &&
      profile.occupants !== null &&
      profile.occupants >= 1 &&
      profile.hasPets !== null &&
      profile.employmentStatus &&
      profile.incomeRange,
  );
  const loaded = new Set(profile.documents.map((d) => d.type));
  const documentsLoaded = REQUIRED_DOCUMENT_TYPES.every((t) => loaded.has(t));
  const screeningCompleted = latestScreening !== null;
  return {
    applicationComplete,
    documentsLoaded,
    screeningCompleted,
    screeningStatus: latestScreening?.status ?? null,
    packetAssembled: applicationComplete && documentsLoaded && screeningCompleted,
  };
}
