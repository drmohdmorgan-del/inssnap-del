/**
 * DEV-ONLY demo constants (TASK-002).
 *
 * Never use in production. The TOTP secret below is a fixed demo value so
 * the seeded admin account (admin@inssnapp.demo) can complete MFA in
 * local development. It must match DEMO_TOTP_SECRET in
 * packages/db/src/seed.ts.
 */

export const DEMO_TOTP_SECRET = "FWAMPWRLJSMTZFD7VBDECWXPZRDEIUZC";
