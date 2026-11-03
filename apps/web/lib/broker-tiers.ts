/**
 * Broker subscription tiers (Phase 7) + packages (2026-11-03).
 *
 * Single source of truth for tier names, lead limits, and trial rules.
 * Tier SELECTION is free self-serve in the pilot — no payment provider is
 * wired (left for DrMorgan's choice: Stripe or other).
 *
 * POSITIONING (DrMorgan 2026-11-03): "We are live lead, not cold leads."
 * INSSNAPP leads are real prospectives matched live in real time — never
 * cold, stale, or bought list leads, and no resold aged inventory. All
 * broker-facing package copy is built on that live-lead positioning;
 * it is what justifies the referral percentages below.
 */

export const BROKER_TIERS = {
  trial: {
    id: "trial",
    name: "Trial",
    blurb: "Live leads, not cold leads — try real-time matched prospectives free for 7 days.",
    trialDays: 7,
    /** Max leads assigned during the trial. */
    leadLimit: 5,
    windowDays: null as number | null, // all-time during trial
  },
  basic: {
    id: "basic",
    name: "Basic",
    blurb: "For brokers working a steady flow of live, real-time matched leads.",
    trialDays: null as number | null,
    leadLimit: 25,
    windowDays: 30,
  },
  pro: {
    id: "pro",
    name: "Pro",
    blurb: "Unlimited live leads for high-volume brokers.",
    trialDays: null as number | null,
    leadLimit: null as number | null, // unlimited
    windowDays: null as number | null,
  },
} as const;

export type BrokerTierId = keyof typeof BROKER_TIERS;

export const BROKER_TIER_IDS = Object.keys(BROKER_TIERS) as BrokerTierId[];

export function isBrokerTierId(v: unknown): v is BrokerTierId {
  return typeof v === "string" && (BROKER_TIER_IDS as string[]).includes(v);
}

export interface BrokerUsage {
  tier: BrokerTierId;
  tierStartedAt: string;
  trialEndsAt: string | null;
  trialExpired: boolean;
  /** License vetting (2026-11-03): status + the derived operating gate. */
  licenseStatus: "none" | "pending" | "verified" | "rejected";
  licenseState: string | null;
  /** True only when the license is verified active — brokers may not
   *  receive lead assignments before that (gate in showing-api.ts). */
  licenseVerified: boolean;
  /** Leads assigned in the tier's window (all-time for trial). */
  used: number;
  /** Null = unlimited. */
  limit: number | null;
  /** True when the broker may receive another lead right now. */
  canAcceptMore: boolean;
}

/**
 * Computes a broker's lead usage against their tier (Phase 7).
 * Get-or-creates the profile (new brokers start on trial).
 */
export async function brokerUsage(
  db: {
    brokerProfiles: {
      getOrCreate(userId: string, organizationId: string): Promise<{
        tier: BrokerTierId;
        tierStartedAt: string;
        trialEndsAt: string | null;
        licenseStatus: "none" | "pending" | "verified" | "rejected";
        licenseState: string | null;
      }>;
    };
    showings: { list(organizationId: string): Promise<{ brokerUserId: string | null; createdAt: string }[]> };
  },
  organizationId: string,
  brokerUserId: string,
): Promise<BrokerUsage> {
  const profile = await db.brokerProfiles.getOrCreate(brokerUserId, organizationId);
  const tier = BROKER_TIERS[profile.tier];
  const showings = await db.showings.list(organizationId);
  const assigned = showings.filter((s) => s.brokerUserId === brokerUserId);
  let relevant = assigned;
  if (tier.windowDays) {
    const cutoff = Date.now() - tier.windowDays * 24 * 3600_000;
    relevant = assigned.filter((s) => new Date(s.createdAt).getTime() >= cutoff);
  }
  const trialExpired =
    profile.tier === "trial" &&
    !!profile.trialEndsAt &&
    new Date(profile.trialEndsAt).getTime() <= Date.now();
  const used = relevant.length;
  const overLimit = tier.leadLimit !== null && used >= tier.leadLimit;
  return {
    tier: profile.tier,
    tierStartedAt: profile.tierStartedAt,
    trialEndsAt: profile.trialEndsAt,
    trialExpired,
    licenseStatus: profile.licenseStatus,
    licenseState: profile.licenseState,
    licenseVerified: profile.licenseStatus === "verified",
    used,
    limit: tier.leadLimit,
    canAcceptMore: !trialExpired && !overLimit,
  };
}


/**
 * Broker PACKAGES — subscription + referral % (DrMorgan 2026-11-03:
 * "Same as Zillow Redfin").
 *
 * The referral % is a share of the BROKER'S COMMISSION on
 * platform-sourced CLOSED deals (never of the sale price), tiered by
 * deal price band. Rentals: the same % ladder applies to the broker's
 * rental commission/placement fee on platform-sourced leases.
 *
 * WORKING DRAFT — benchmark structure only (Zillow Preferred ~35% of
 * commission at closing, up to 40%, no upfront fee; Redfin Partner 30%
 * advertised, 30-35%, up to 40% on high-price homes). Exact per-tier
 * numbers are DrMorgan's to dictate; change them HERE, in config, with
 * no code changes. These numbers are NOT presented as final anywhere
 * user-facing, and no payment provider is wired yet.
 */
export const BROKER_PACKAGES = {
  /** Referral % of the broker's commission, by closed-deal price band. */
  referralBands: [
    { maxPrice: 350_000, pct: 30 },
    { maxPrice: 750_000, pct: 35 },
    { maxPrice: null as number | null, pct: 40 }, // above the top band
  ],
  /** Monthly subscription per tier (entry price). Draft — see note above. */
  subscriptionMonthly: {
    trial: 0,
    basic: 29.99,
    pro: 49.99,
  } as Record<BrokerTierId, number>,
  /** Rentals use the same referral ladder against the broker's rental fee. */
  rentalsUseSameReferralLadder: true,
} as const;

/** Referral % owed on a platform-sourced closing at the given price. */
export function referralPctForPrice(price: number): number {
  for (const band of BROKER_PACKAGES.referralBands) {
    if (band.maxPrice === null || price <= band.maxPrice) return band.pct;
  }
  return BROKER_PACKAGES.referralBands[BROKER_PACKAGES.referralBands.length - 1].pct;
}
