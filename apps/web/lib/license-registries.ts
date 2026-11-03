/**
 * Broker license verification — per-state registry config (2026-11-03).
 *
 * DrMorgan's rule: a broker's license number + state are vetted at
 * onboarding against that state's licensing registry, and the broker
 * cannot operate (receive lead assignments) until the license verifies
 * as active/valid. Management/Admin holds the approval gate.
 *
 * Most state registries have NO public API, so verification is a
 * manual-review queue: Management opens the registry lookup for the
 * broker's state, checks the license, and records verified/rejected.
 * States with a known lookup are linked; adding a state's deep link is
 * a config edit here, never a code change.
 */

export interface LicenseRegistry {
  /** Licensing authority name. */
  authority: string;
  /** Public lookup URL, when one is known. Null = look up via the authority. */
  lookupUrl: string | null;
  /** How verification happens for this state. */
  method: "manual";
}

export const LICENSE_REGISTRIES: Record<string, LicenseRegistry> = {
  MA: {
    authority: "Massachusetts Division of Professional Licensure (DPL)",
    lookupUrl: "https://www.mass.gov/orgs/division-of-professional-licensure",
    method: "manual",
  },
};

/** Fallback for states without a configured registry entry. */
export function registryFor(state: string): LicenseRegistry {
  return (
    LICENSE_REGISTRIES[state] ?? {
      authority: `${state} state licensing authority`,
      lookupUrl: null,
      method: "manual",
    }
  );
}

/** US state codes for the license state picker (choose-your-state pattern). */
export const US_STATES = [
  "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA",
  "KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ",
  "NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT",
  "VA","WA","WV","WI","WY","DC",
] as const;

export function isStateCode(v: unknown): v is string {
  return typeof v === "string" && (US_STATES as readonly string[]).includes(v);
}
