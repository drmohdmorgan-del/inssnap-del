/**
 * Test mode (pilot testing) — one-click role sign-in, no credentials.
 *
 * Enabled by default while the platform is in pilot testing; disable with
 *   INSSNAPP_TEST_MODE=0
 * before real launch. This is a PARALLEL test path — production auth
 * (password + MFA + sessions) is untouched.
 *
 * Fail-closed: test sign-in only succeeds when the seeded demo accounts
 * exist. Production instances (bootstrap admin only, no demo users) reject
 * every test sign-in attempt.
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
  return process.env.INSSNAPP_TEST_MODE !== "0";
}
