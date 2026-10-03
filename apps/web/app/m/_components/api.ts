/**
 * Mobile web (/m) API client.
 *
 * Calls the same backend routes as the desktop Control Center
 * (apps/web/app/api/*) — no new backend work. The browser maintains the
 * `inssnapp_session` cookie jar, so plain fetch is sufficient.
 */

import type { Rating, ResidentEnrollment, Showing, ShowingOutcome, Unit } from "./types";

export class MobileApiError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "MobileApiError";
    this.status = status;
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, init);
  } catch {
    throw new MobileApiError(0, "Could not reach the INSSNAPP server. Check your connection and retry.");
  }
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
    const b = body as { error?: string } | null;
    throw new MobileApiError(res.status, (b && b.error) || `Request failed (${res.status}).`);
  }
  return body as T;
}

function post<T>(path: string, json?: unknown): Promise<T> {
  return request<T>(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: json === undefined ? undefined : JSON.stringify(json),
  });
}

const idempotencyKey = () => crypto.randomUUID();

export const mobileApi = {
  async listUnits(): Promise<Unit[]> {
    const { units } = await request<{ units: Unit[] }>("/api/units");
    return units;
  },

  async listShowings(): Promise<Showing[]> {
    const { showings } = await request<{ showings: Showing[] }>("/api/showings");
    return showings;
  },

  async requestShowing(unitId: string): Promise<{ showing: Showing; replayed: boolean }> {
    return post("/api/showings/request", { unitId, idempotencyKey: idempotencyKey() });
  },

  async recordOutcome(
    showingId: string,
    outcome: ShowingOutcome,
  ): Promise<{ showing: Showing }> {
    return post(`/api/showings/${encodeURIComponent(showingId)}/outcome`, {
      outcome,
      idempotencyKey: idempotencyKey(),
    });
  },

  async brokerAccept(showingId: string): Promise<{ showing: Showing }> {
    return post(`/api/showings/${encodeURIComponent(showingId)}/broker/accept`, {
      idempotencyKey: idempotencyKey(),
    });
  },

  async brokerDecline(showingId: string): Promise<{ showing: Showing }> {
    return post(`/api/showings/${encodeURIComponent(showingId)}/broker/decline`, {
      idempotencyKey: idempotencyKey(),
    });
  },

  async checkIn(showingId: string): Promise<{ showing: Showing }> {
    return post(`/api/showings/${encodeURIComponent(showingId)}/check-in`, {
      idempotencyKey: idempotencyKey(),
    });
  },

  async complete(showingId: string): Promise<{ showing: Showing }> {
    return post(`/api/showings/${encodeURIComponent(showingId)}/complete`, {
      idempotencyKey: idempotencyKey(),
    });
  },

  async rateShowing(
    showingId: string,
    stars: number,
    comment?: string,
  ): Promise<{ rating: Rating }> {
    return post(`/api/showings/${encodeURIComponent(showingId)}/rating`, { stars, comment });
  },

  async residentAccept(showingId: string): Promise<{ showing: Showing }> {
    return post(`/api/showings/${encodeURIComponent(showingId)}/resident/accept`, {
      idempotencyKey: idempotencyKey(),
    });
  },

  async residentDecline(showingId: string): Promise<{ showing: Showing }> {
    return post(`/api/showings/${encodeURIComponent(showingId)}/resident/decline`, {
      idempotencyKey: idempotencyKey(),
    });
  },

  async myEnrollments(): Promise<ResidentEnrollment[]> {
    const { enrollments } = await request<{ enrollments: ResidentEnrollment[] }>(
      "/api/residents/me",
    );
    return enrollments;
  },

  async setAvailability(unitId: string, available: boolean): Promise<Unit> {
    const { unit } = await post<{ unit: Unit }>("/api/residents/me/availability", {
      unitId,
      available,
    });
    return unit;
  },

  async signOut(): Promise<void> {
    try {
      await post("/api/auth/logout");
    } catch {
      // Best-effort: navigation clears the client state regardless.
    }
  },
};
