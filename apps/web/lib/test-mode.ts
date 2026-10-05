/**
 * Test mode (pilot testing) — one-click role sign-in, no credentials.
 *
 * DEFAULT OFF. Enable explicitly and only for local/dev pilot testing with
 *   INSSNAPP_TEST_MODE=1
 * Never enable in production. This is a PARALLEL test path — production auth
 * (password + MFA + sessions) is untouched.
 *
 * Fail-closed: test sign-in only succeeds when (a) test mode is explicitly
 * enabled AND (b) the seeded demo accounts exist AND (c) no non-demo
 * organization exists. There is no just-in-time provisioning — demo accounts
 * are never created on demand.
 */

/** Demo accounts backing test-mode sign-in (password `pw` convention). */
export const TEST_MODE_ACCOUNTS = [
  { role: "management", label: "Management", email: "manager@inssnapp.demo", home: "/admin" },
  { role: "resident", label: "Current Tenant", email: "resident@inssnapp.demo", home: "/m/resident" },
  { role: "prospect", label: "Prospect", email: "prospect@inssnapp.demo", home: "/m/prospect" },
  { role: "broker", label: "Broker", email: "broker@inssnapp.demo", home: "/m/broker" },
] as const;

export type TestModeRole = (typeof TEST_MODE_ACCOUNTS)[number]["role"];

export function isTestModeEnabled(): boolean {
  // Explicit opt-in only. Absent/misconfigured env can never enable it.
  return process.env.INSSNAPP_TEST_MODE === "1";
}
