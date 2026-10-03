/**
 * Broker subscription tiers (Phase 7).
 *
 * Single source of truth for tier names, lead limits, and trial rules.
 * Tier SELECTION is free self-serve in the pilot — no payment provider is
 * wired (left for DrMorgan's choice: Stripe or other). Prices are
 * intentionally absent; they get set when payments are.
 */

export const BROKER_TIERS = {
  trial: {
    id: "trial",
    name: "Trial",
    blurb: "Try broker assignments free for 7 days.",
    trialDays: 7,
    /** Max leads assigned during the trial. */
    leadLimit: 5,
    windowDays: null as number | null, // all-time during trial
  },
  basic: {
    id: "basic",
    name: "Basic",
    blurb: "For brokers working a steady lead flow.",
    trialDays: null as number | null,
    leadLimit: 25,
    windowDays: 30,
  },
  pro: {
    id: "pro",
    name: "Pro",
    blurb: "Unlimited leads for high-volume brokers.",
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
    used,
    limit: tier.leadLimit,
    canAcceptMore: !trialExpired && !overLimit,
  };
}
