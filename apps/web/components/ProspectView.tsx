"use client";

import { useEffect, useState, useCallback } from "react";
import type { User } from "../lib/session";

type Unit = {
  id: string;
  propertyId: string;
  label: string;
  eligible: boolean;
  residentAvailable: boolean;
};

type Showing = {
  id: string;
  unitId: string;
  state: string;
  outcome: string | null;
  prospectUserId: string | null;
  version: number;
};

export function ProspectView({ user }: { user: User }) {
  const [units, setUnits] = useState<Unit[]>([]);
  const [showings, setShowings] = useState<Showing[]>([]);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const [uRes, sRes] = await Promise.all([fetch("/api/units"), fetch("/api/showings")]);
    if (uRes.ok) setUnits((await uRes.json()).units);
    if (sRes.ok) setShowings((await sRes.json()).showings);
  }, []);

  useEffect(() => {
    load();
    const interval = setInterval(load, 3000);
    return () => clearInterval(interval);
  }, [load]);

  async function request(unitId: string) {
    setBusy(true);
    // Prospects request via the showing engine — no contact info exposed
    const res = await fetch("/api/showings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ unitId, residentUserId: "u_resident" }),
    });
    if (res.ok) {
      const data = await res.json();
      const showingId = data.showing.id;
      await fetch(`/api/showings/${showingId}/transition`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transition: "PROSPECT_REQUEST", idempotencyKey: `${showingId}-req` }),
      });
    }
    setBusy(false);
    load();
  }

  async function recordOutcome(showingId: string, outcome: string) {
    setBusy(true);
    await fetch(`/api/showings/${showingId}/transition`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ transition: "RECORD_OUTCOME", outcome, idempotencyKey: `${showingId}-${outcome}` }),
    });
    setBusy(false);
    load();
  }

  const myShowings = showings.filter((s) => s.prospectUserId === user.userId);
  const completed = myShowings.filter((s) => s.state === "COMPLETED");
  const eligible = units.filter((u) => u.eligible && u.residentAvailable);

  return (
    <div className="space-y-6">
      {/* Eligible units */}
      <section>
        <h2 className="mb-3 text-lg font-semibold text-slate-900">Eligible Units</h2>
        {eligible.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center">
            <p className="text-sm text-slate-500">No eligible units available right now.</p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {eligible.map((u) => (
              <div key={u.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <p className="font-semibold text-slate-900">Unit {u.label}</p>
                <p className="text-xs text-slate-500">Property {u.propertyId}</p>
                <button
                  disabled={busy}
                  onClick={() => request(u.id)}
                  className="mt-3 w-full rounded-lg bg-brand-violet px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-violet-light disabled:opacity-50"
                >
                  Request Showing
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* My requests */}
      <section>
        <h2 className="mb-3 text-lg font-semibold text-slate-900">My Requests</h2>
        {myShowings.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center">
            <p className="text-sm text-slate-500">You haven't requested any showings yet.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {myShowings.map((s) => (
              <div key={s.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="mb-2 flex items-center justify-between">
                  <p className="font-semibold text-slate-900">Unit {s.unitId}</p>
                  <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-700">
                    {s.state.replace(/_/g, " ")}
                  </span>
                </div>
                {s.state === "COMPLETED" && (
                  <div className="mt-3 flex gap-2">
                    {["APPLY", "WATCH", "DECLINE"].map((o) => (
                      <button
                        key={o}
                        disabled={busy}
                        onClick={() => recordOutcome(s.id, o)}
                        className={`rounded-lg px-4 py-2 text-sm font-semibold text-white transition disabled:opacity-50 ${
                          o === "APPLY"
                            ? "bg-emerald-600 hover:bg-emerald-700"
                            : o === "WATCH"
                            ? "bg-amber-500 hover:bg-amber-600"
                            : "bg-slate-500 hover:bg-slate-600"
                        }`}
                      >
                        {o}
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
