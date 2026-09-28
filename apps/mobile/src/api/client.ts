/**
 * HTTP client for the INSSNAPP web backend.
 *
 * Pure TypeScript — no React Native imports — so it is unit-testable with
 * a stubbed fetch.
 *
 * Auth: the client requests the opaque session credential in the login
 * response body (`issueToken: true`) and sends it back as
 * `Authorization: Bearer` on every request — the same signed value the web
 * session cookie carries, resolved server-side through the identical
 * verification path. A `Cookie` header with the same value is also sent
 * for backward compatibility with servers that predate Bearer support.
 * The credential is persisted by the app in SecureStore, never in logs.
 *
 * Every workflow action here calls a REAL backend route. Network
 * failures surface as status-0 ApiErrors so the UI can show an honest
 * "server unreachable" state instead of fake data.
 */

import type {
  Rating,
  ResidentEnrollment,
  SessionUser,
  Showing,
  ShowingOutcome,
  Unit,
} from "./types";

export const SESSION_COOKIE_NAME = "inssnapp_session";

export type FetchImpl = (url: string, init?: RequestInit) => Promise<Response>;

export class ApiError extends Error {
  /** HTTP status, or 0 when the server could not be reached at all. */
  readonly status: number;
  readonly code?: string;
  readonly body?: unknown;

  constructor(status: number, message: string, code?: string, body?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.body = body;
  }

  /** True when the request never reached the server (offline / wrong URL). */
  get isNetworkError(): boolean {
    return this.status === 0;
  }
}

/** Client-generated idempotency key (not security-sensitive). */
export function newIdempotencyKey(): string {
  const rand = () =>
    Math.floor(Math.random() * 0xffffffff)
      .toString(16)
      .padStart(8, "0");
  return `${Date.now().toString(16)}-${rand()}-${rand()}`;
}

export interface ClientOptions {
  baseUrl: string;
  fetchImpl?: FetchImpl;
  /** Seed a previously persisted session value (e.g. from SecureStore). */
  sessionValue?: string | null;
}

export class InssnappClient {
  readonly baseUrl: string;
  private readonly fetchImpl: FetchImpl;
  private sessionValue: string | null;

  constructor(opts: ClientOptions) {
    this.baseUrl = opts.baseUrl.replace(/\/+$/, "");
    this.fetchImpl =
      opts.fetchImpl ??
      ((url, init) => fetch(url, init));
    this.sessionValue = opts.sessionValue ?? null;
  }

  getSessionValue(): string | null {
    return this.sessionValue;
  }

  setSessionValue(value: string | null): void {
    this.sessionValue = value;
  }

  clearSession(): void {
    this.sessionValue = null;
  }

  get authenticated(): boolean {
    return this.sessionValue !== null;
  }

  private captureSessionValue(res: Response): void {
    const setCookie = res.headers.get("set-cookie");
    if (!setCookie) return;
    // The header may carry attributes ("...; Path=/; HttpOnly") — the
    // session value is the first name=value pair.
    for (const part of setCookie.split(",")) {
      const first = part.split(";")[0].trim();
      const eq = first.indexOf("=");
      if (eq > 0 && first.slice(0, eq).trim() === SESSION_COOKIE_NAME) {
        const value = first.slice(eq + 1).trim();
        // A cleared cookie ("...=; Max-Age=0") ends the session.
        this.sessionValue = value ? value : null;
        return;
      }
    }
  }

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const headers: Record<string, string> = {
      ...(init.headers as Record<string, string> | undefined),
    };
    if (this.sessionValue) {
      // Primary credential: Bearer token (supported by current servers).
      headers["Authorization"] = `Bearer ${this.sessionValue}`;
      // Backward compatibility: servers that predate Bearer support read
      // the session cookie. Same opaque value, no security difference.
      headers["Cookie"] = `${SESSION_COOKIE_NAME}=${this.sessionValue}`;
    }
    let res: Response;
    try {
      res = await this.fetchImpl(`${this.baseUrl}${path}`, { ...init, headers });
    } catch (err) {
      throw new ApiError(
        0,
        "Could not reach the INSSNAPP server. Check the API URL and your connection, then retry.",
        "NETWORK",
        err,
      );
    }
    this.captureSessionValue(res);

    let body: unknown = null;
    const text = await res.text().catch(() => "");
    if (text) {
      try {
        body = JSON.parse(text);
      } catch {
        body = text;
      }
    }
    if (!res.ok) {
      const b = body as { error?: string; code?: string } | null;
      throw new ApiError(
        res.status,
        (b && b.error) || `Request failed with status ${res.status}.`,
        b?.code,
        body,
      );
    }
    return body as T;
  }

  private post<T>(path: string, json?: unknown): Promise<T> {
    return this.request<T>(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: json === undefined ? undefined : JSON.stringify(json),
    });
  }

  private get<T>(path: string): Promise<T> {
    return this.request<T>(path, { method: "GET" });
  }

  // ---- Auth ---------------------------------------------------------------

  /**
   * Step 1 of login. Resolves to an MFA challenge (HTTP 202) for
   * privileged roles, or to the signed-in user otherwise.
   *
   * Requests the session credential in the response body (`issueToken`)
   * for Bearer auth; falls back to the Set-Cookie capture on older
   * servers.
   */
  async login(
    email: string,
    password: string,
  ): Promise<{ mfaRequired: true; challengeId: string } | { user: SessionUser }> {
    const res = await this.fetchImpl(`${this.baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, issueToken: true }),
    }).catch((err) => {
      throw new ApiError(
        0,
        "Could not reach the INSSNAPP server. Check the API URL and your connection, then retry.",
        "NETWORK",
        err,
      );
    });
    this.captureSessionValue(res);
    const body = (await res.json().catch(() => null)) as {
      mfaRequired?: boolean;
      challengeId?: string;
      user?: SessionUser;
      token?: string;
      error?: string;
      code?: string;
    } | null;
    // The body token is authoritative when the server supports it; the
    // Set-Cookie capture above covers older servers.
    if (typeof body?.token === "string" && body.token) {
      this.sessionValue = body.token;
    }
    if (res.status === 202 && body?.mfaRequired && body.challengeId) {
      return { mfaRequired: true as const, challengeId: body.challengeId };
    }
    if (!res.ok) {
      throw new ApiError(res.status, body?.error || "Sign-in failed.", body?.code, body);
    }
    if (!body?.user) throw new ApiError(res.status, "Sign-in failed.", undefined, body);
    return { user: body.user };
  }

  /** Step 2 of login: consume the MFA challenge with a TOTP code. */
  async verifyMfa(challengeId: string, code: string): Promise<{ user: SessionUser }> {
    const res = await this.post<{ user: SessionUser; token?: string }>("/api/auth/mfa/verify", {
      challengeId,
      code,
      issueToken: true,
    });
    if (typeof res.token === "string" && res.token) {
      this.sessionValue = res.token;
    }
    return { user: res.user };
  }

  async logout(): Promise<void> {
    try {
      await this.post("/api/auth/logout");
    } catch {
      // Best-effort: the local session is cleared regardless so a
      // failing server never traps the user in a signed-in state.
    }
    this.clearSession();
  }

  async me(): Promise<SessionUser> {
    const { user } = await this.get<{ user: SessionUser }>("/api/auth/me");
    return user;
  }

  // ---- Showings ------------------------------------------------------------

  async listShowings(): Promise<Showing[]> {
    const { showings } = await this.get<{ showings: Showing[] }>("/api/showings");
    return showings;
  }

  async requestShowing(
    unitId: string,
    idempotencyKey: string = newIdempotencyKey(),
  ): Promise<{ showing: Showing; replayed: boolean }> {
    return this.post("/api/showings/request", { unitId, idempotencyKey });
  }

  private transition<T = { showing: Showing }>(
    showingId: string,
    action: string,
    body: unknown = {},
    idempotencyKey: string = newIdempotencyKey(),
  ): Promise<T> {
    return this.post<T>(`/api/showings/${encodeURIComponent(showingId)}/${action}`, {
      ...(body as Record<string, unknown>),
      idempotencyKey,
    });
  }

  residentAccept(showingId: string): Promise<{ showing: Showing }> {
    return this.transition(showingId, "resident/accept");
  }

  residentDecline(showingId: string): Promise<{ showing: Showing }> {
    return this.transition(showingId, "resident/decline");
  }

  brokerAccept(showingId: string): Promise<{ showing: Showing }> {
    return this.transition(showingId, "broker/accept");
  }

  brokerDecline(showingId: string): Promise<{ showing: Showing }> {
    return this.transition(showingId, "broker/decline");
  }

  checkIn(showingId: string): Promise<{ showing: Showing }> {
    return this.transition(showingId, "check-in");
  }

  complete(showingId: string): Promise<{ showing: Showing }> {
    return this.transition(showingId, "complete");
  }

  recordOutcome(showingId: string, outcome: ShowingOutcome): Promise<{ showing: Showing }> {
    return this.transition(showingId, "outcome", { outcome });
  }

  rateShowing(showingId: string, stars: number, comment?: string): Promise<{ rating: Rating }> {
    return this.post(`/api/showings/${encodeURIComponent(showingId)}/rating`, {
      stars,
      comment,
    });
  }

  // ---- Units & resident self-service ---------------------------------------

  async listUnits(): Promise<Unit[]> {
    const { units } = await this.get<{ units: Unit[] }>("/api/units");
    return units;
  }

  /** The signed-in resident's own enrollments (verified unit status). */
  async myEnrollments(): Promise<ResidentEnrollment[]> {
    const { enrollments } = await this.get<{ enrollments: ResidentEnrollment[] }>(
      "/api/residents/me",
    );
    return enrollments;
  }

  /** Resident "Available NOW" toggle for one of their own units. */
  async setAvailability(unitId: string, available: boolean): Promise<Unit> {
    const { unit } = await this.post<{ unit: Unit }>("/api/residents/me/availability", {
      unitId,
      available,
    });
    return unit;
  }
}
