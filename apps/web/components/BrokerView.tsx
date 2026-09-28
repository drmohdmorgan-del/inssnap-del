"use client";

import { useEffect, useState, useCallback } from "react";
import type { User } from "../lib/session";

type Showing = {
  id: string;
  unitId: string;
  state: string;
  brokerUserId: string | null;
  version: number;
};

const NEXT_ACTIONS: Record<string, { label: string; transition: string }[]> = {
  AVAILABLE: [],
  REQUESTED: [],
  RESIDENT_ACCEPTED: [],
  BROKER_GATE: [
    { label: "Accept", transition: "BROKER_ACCEPT" },
    { label: "Decline", transition: "BROKER_DECLINE" },
  ],
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

export function BrokerView({ user }: { user: User }) {
  const [showings, setShowings] = useState<Showing[]>([]);
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

  const assigned = showings.filter((s) => s.brokerUserId === user.userId);
  const pending = assigned.filter((s) => s.state === "BROKER_GATE");
  const active = assigned.filter((s) => ["CONFIRMED", "IN_PROGRESS"].includes(s.state));
  const completed = assigned.filter((s) => ["COMPLETED", "OUTCOME"].includes(s.state));

  return (
    <div className="space-y-6">
      {/* Pending assignments */}
      <section>
        <h2 className="mb-3 text-lg font-semibold text-slate-900">Pending Assignments</h2>
        {pending.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center">
            <p className="text-sm text-slate-500">No pending assignments.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {pending.map((s) => (
              <div key={s.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="mb-2 flex items-center justify-between">
                  <p className="font-semibold text-slate-900">Unit {s.unitId}</p>
                  <span className="rounded-full bg-purple-100 px-2.5 py-0.5 text-xs font-semibold text-purple-800">
                    Broker Gate
                  </span>
                </div>
                <div className="flex gap-2">
                  <button
                    disabled={busy}
                    onClick={() => act(s.id, "BROKER_ACCEPT")}
                    className="rounded-lg bg-brand-violet px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-violet-light disabled:opacity-50"
                  >
                    Accept
                  </button>
                  <button
                    disabled={busy}
                    onClick={() => act(s.id, "BROKER_DECLINE")}
                    className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 disabled:opacity-50"
                  >
                    Decline
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Active showings */}
      <section>
        <h2 className="mb-3 text-lg font-semibold text-slate-900">Active Showings</h2>
        {active.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center">
            <p className="text-sm text-slate-500">No active showings.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {active.map((s) => (
              <div key={s.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="mb-2 flex items-center justify-between">
                  <p className="font-semibold text-slate-900">Unit {s.unitId}</p>
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATE_COLORS[s.state] ?? "bg-slate-100 text-slate-600"}`}
                  >
                    {s.state.replace(/_/g, " ")}
                  </span>
                </div>
                {(NEXT_ACTIONS[s.state] ?? []).length > 0 && (
                  <div className="flex gap-2">
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
