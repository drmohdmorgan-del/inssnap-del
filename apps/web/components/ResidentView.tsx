"use client";

import { useEffect, useState, useCallback } from "react";
import type { User } from "../lib/session";

type Showing = {
  id: string;
  unitId: string;
  state: string;
  prospectUserId: string | null;
  version: number;
};

const NEXT_ACTIONS: Record<string, { label: string; transition: string }[]> = {
  AVAILABLE: [],
  REQUESTED: [
    { label: "Accept", transition: "RESIDENT_ACCEPT" },
    { label: "Decline", transition: "RESIDENT_DECLINE" },
  ],
  RESIDENT_ACCEPTED: [],
  BROKER_GATE: [],
  CONFIRMED: [{ label: "Check In", transition: "CHECK_IN" }],
  IN_PROGRESS: [{ label: "Complete", transition: "COMPLETE" }],
  COMPLETED: [],
  OUTCOME: [],
};

const STATE_COLORS: Record<string, string> = {
  AVAILABLE: "bg-emerald-100 text-emerald-800",
  REQUESTED: "bg-amber-100 text-amber-800",
  RESIDENT_ACCEPTED: "bg-blue-100 text-blue-800",
  BROKER_GATE: "bg-purple-100 text-purple-800",
  CONFIRMED: "bg-brand-violet/10 text-brand-violet",
  IN_PROGRESS: "bg-cyan-100 text-cyan-800",
  COMPLETED: "bg-teal-100 text-teal-800",
  OUTCOME: "bg-slate-200 text-slate-800",
};

export function ResidentView({ user }: { user: User }) {
  const [showings, setShowings] = useState<Showing[]>([]);
  const [available, setAvailable] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch("/api/showings");
    if (res.ok) {
      const data = await res.json();
      setShowings(data.showings);
    }
  }, []);

  useEffect(() => {
    load();
    const interval = setInterval(load, 3000);
    return () => clearInterval(interval);
  }, [load]);

  async function act(showingId: string, transition: string) {
    setBusy(true);
    await fetch(`/api/showings/${showingId}/transition`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ transition, idempotencyKey: `${showingId}-${transition}` }),
    });
    setBusy(false);
    load();
  }

  const active = showings.filter((s) => s.state !== "OUTCOME");

  return (
    <div className="space-y-6">
      {/* Available NOW toggle */}
      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Available NOW</h2>
            <p className="text-sm text-slate-500">
              {available
                ? "Prospects can request a showing of your unit."
                : "You are not visible to prospects right now."}
            </p>
          </div>
          <button
            onClick={() => setAvailable(!available)}
            className={`relative h-8 w-14 rounded-full transition ${available ? "bg-emerald-500" : "bg-slate-300"}`}
          >
            <span
              className={`absolute top-1 h-6 w-6 rounded-full bg-white shadow transition ${available ? "left-7" : "left-1"}`}
            />
          </button>
        </div>
      </section>

      {/* Incoming requests & live status */}
      <section>
        <h2 className="mb-3 text-lg font-semibold text-slate-900">Showing Requests</h2>
        {active.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center">
            <p className="text-sm text-slate-500">No active showing requests.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {active.map((s) => (
              <div key={s.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="mb-2 flex items-center justify-between">
                  <div>
                    <p className="font-semibold text-slate-900">Unit {s.unitId}</p>
                    <p className="text-xs text-slate-500">v{s.version}</p>
                  </div>
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATE_COLORS[s.state] ?? "bg-slate-100 text-slate-600"}`}
                  >
                    {s.state.replace(/_/g, " ")}
                  </span>
                </div>
                {(NEXT_ACTIONS[s.state] ?? []).length > 0 && (
                  <div className="mt-3 flex gap-2">
                    {(NEXT_ACTIONS[s.state] ?? []).map((a) => (
                      <button
                        key={a.label}
                        disabled={busy}
                        onClick={() => act(s.id, a.transition)}
                        className="rounded-lg bg-brand-violet px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-violet-light disabled:opacity-50"
                      >
                        {a.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
