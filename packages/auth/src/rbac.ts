import type { Role } from "@inssnapp/engine";
import type { SessionUser } from "./session.ts";

/**
 * Role-based authorization guards.
 *
 * Management and inssnapp_admin are privileged for oversight operations;
 * resident/prospect/broker are scoped to their own workflow participation.
 */

export function isPrivileged(role: Role): boolean {
  return role === "management" || role === "inssnapp_admin";
}

export function canViewControlCenter(role: Role): boolean {
  return isPrivileged(role);
}

export function canViewOrgData(role: Role): boolean {
  return isPrivileged(role);
}

/** Extracts the bearer/cookie session from a Fetch API request. */
export function getSessionToken(req: Request): string | null {
  const cookie = req.headers.get("cookie") || "";
  for (const part of cookie.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === "inssnapp_session" && v.length) return decodeURIComponent(v.join("="));
  }
  return null;
}

export class ForbiddenError extends Error {
  constructor(message = "Forbidden") {
    super(message);
    this.name = "ForbiddenError";
  }
}

export function requireRole(
  user: SessionUser | null,
  ...allowed: Role[]
): asserts user is SessionUser {
  if (!user) throw new ForbiddenError("Not authenticated");
  if (!allowed.includes(user.role)) {
    throw new ForbiddenError(`Role '${user.role}' is not permitted`);
  }
}

/**
 * Tenant-isolation guard: the user may only touch records in their own
 * organization. Throws ForbiddenError on mismatch (callers map to 403,
 * or to 404 when they must not reveal that the record exists).
 */
export function assertSameOrg(
  user: SessionUser | null,
  organizationId: string,
): asserts user is SessionUser {
  if (!user) throw new ForbiddenError("Not authenticated");
  if (user.organizationId !== organizationId) {
    throw new ForbiddenError("Cross-organization access denied");
  }
}
