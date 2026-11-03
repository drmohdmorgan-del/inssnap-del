"use client";

import { useEffect, useState, useCallback } from "react";
import { StatCard } from "./StatCard";

type Showing = {
  id: string;
  unitId: string;
  state: string;
  outcome: string | null;
  brokerRequired: boolean;
  version: number;
  updatedAt: string;
};

type Unit = {
  id: string;
  propertyId: string;
  label: string;
  eligible: boolean;
  residentAvailable: boolean;
};

type Broker = {
  id: string;
  fullName: string;
  emailVerified: boolean;
};

const STATES = [
  "ALL",
  "AVAILABLE",
  "REQUESTED",
  "RESIDENT_ACCEPTED",
  "BROKER_GATE",
  "CONFIRMED",
  "IN_PROGRESS",
  "COMPLETED",
  "OUTCOME",
] as const;

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

export function ShowingsMonitor() {
  const [showings, setShowings] = useState<Showing[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [brokers, setBrokers] = useState<Broker[]>([]);
  const [filter, setFilter] = useState<string>("ALL");
  const [loading, setLoading] = useState(true);
  // F1 (2026-10-25): management actions on resident-accepted showings.
  const [assignFor, setAssignFor] = useState<string | null>(null);
  const [brokerId, setBrokerId] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [sRes, uRes, bRes] = await Promise.all([
      fetch("/api/showings"),
      fetch("/api/units"),
      fetch("/api/users?role=broker"),
    ]);
    if (sRes.ok) setShowings((await sRes.json()).showings);
    if (uRes.ok) setUnits((await uRes.json()).units);
    if (bRes.ok) setBrokers((await bRes.json()).users ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
    const interval = setInterval(load, 3000); // live monitor poll
    return () => clearInterval(interval);
  }, [load]);

  async function confirmShowing(showingId: string) {
    setBusy(`confirm-${showingId}`);
    setActionError(null);
    try {
      const res = await fetch(`/api/showings/${showingId}/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idempotencyKey: crypto.randomUUID() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setActionError(data.error || "Could not confirm the showing.");
        return;
      }
      await load();
    } finally {
      setBusy(null);
    }
  }

  async function assignBroker(showingId: string) {
    if (!brokerId) return;
    setBusy(`assign-${showingId}`);
    setActionError(null);
    try {
      const res = await fetch(`/api/showings/${showingId}/broker/assign`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brokerUserId: brokerId, idempotencyKey: crypto.randomUUID() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setActionError(data.error || "Could not assign the broker.");
        return;
      }
      setAssignFor(null);
      setBrokerId("");
      await load();
    } finally {
      setBusy(null);
    }
  }

  const unitLabel = (unitId: string) =>
    units.find((u) => u.id === unitId)?.label ?? unitId.slice(0, 8);

  const active = showings.filter((s) => s.state !== "OUTCOME");
  const visible =
    filter === "ALL" ? showings : showings.filter((s) => s.state === filter);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Active Showings" value={active.length} accent="text-brand-violet" />
        <StatCard
          label="Completed"
          value={showings.filter((s) => s.state === "OUTCOME").length}
          accent="text-emerald-600"
        />
        <StatCard
          label="Eligible Units"
          value={units.filter((u) => u.eligible).length}
          accent="text-blue-600"
        />
        <StatCard
          label="Broker-Gated"
          value={showings.filter((s) => s.state === "BROKER_GATE").length}
          accent="text-purple-600"
        />
      </div>

      <section>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold text-slate-900">Live Showings</h2>
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700"
            aria-label="Filter showings by state"
          >
            {STATES.map((s) => (
              <option key={s} value={s}>
                {s === "ALL" ? "All states" : s.replace(/_/g, " ")}
              </option>
            ))}
          </select>
        </div>

        {actionError && (
          <p className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {actionError}
          </p>
        )}

        {loading ? (
          <p className="text-sm text-slate-400">Loading…</p>
        ) : visible.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center">
            <p className="text-sm text-slate-500">
              {filter === "ALL"
                ? "No showings yet."
                : `No showings in state ${filter.replace(/_/g, " ")}.`}
            </p>
            <p className="mt-1 text-xs text-slate-400">
              Showings appear here as prospects request eligible units.
            </p>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {visible.map((s) => (
              <div
                key={s.id}
                className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">
                      Unit {unitLabel(s.unitId)}
                    </p>
                    <p className="mt-0.5 font-mono text-xs text-slate-400">
                      {s.id.slice(0, 8)} · v{s.version}
                    </p>
                  </div>
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                      STATE_COLORS[s.state] ?? "bg-slate-100 text-slate-600"
                    }`}
                  >
                    {s.state.replace(/_/g, " ")}
                  </span>
                </div>
                <div className="mt-3 flex items-center justify-between text-xs text-slate-500">
                  <span>{s.brokerRequired ? "Broker required" : "No broker"}</span>
                  <span>{new Date(s.updatedAt).toLocaleString()}</span>
                </div>
                {s.outcome && (
                  <p className="mt-2 text-xs text-slate-600">
                    Outcome: <span className="font-medium">{s.outcome}</span>
                  </p>
                )}
                {s.state === "RESIDENT_ACCEPTED" && (
                  <div className="mt-3 space-y-2 border-t border-slate-100 pt-3">
                    <div className="flex flex-wrap gap-2">
                      <button
                        onClick={() => confirmShowing(s.id)}
                        disabled={busy !== null}
                        className="rounded-lg bg-brand-violet px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                      >
                        {busy === `confirm-${s.id}` ? "…" : "Confirm showing"}
                      </button>
                      {assignFor === s.id ? (
                        <button
                          onClick={() => {
                            setAssignFor(null);
                            setBrokerId("");
                          }}
                          className="rounded-lg px-2 py-1.5 text-xs text-slate-500 hover:text-slate-800"
                        >
                          Cancel
                        </button>
                      ) : (
                        <button
                          onClick={() => setAssignFor(s.id)}
                          disabled={brokers.length === 0 || busy !== null}
                          title={brokers.length === 0 ? "No brokers registered yet" : undefined}
                          className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 disabled:opacity-40"
                        >
                          Assign broker
                        </button>
                      )}
                    </div>
                    {assignFor === s.id && (
                      <div className="flex items-center gap-2">
                        <select
                          value={brokerId}
                          onChange={(e) => setBrokerId(e.target.value)}
                          aria-label="Select broker"
                          className="rounded-lg border border-slate-300 px-2 py-1.5 text-xs focus:border-brand-violet focus:outline-none"
                        >
                          <option value="">Select broker…</option>
                          {brokers.map((b) => (
                            <option key={b.id} value={b.id}>
                              {b.fullName}
                              {b.emailVerified ? "" : " (unverified)"}
                            </option>
                          ))}
                        </select>
                        <button
                          onClick={() => assignBroker(s.id)}
                          disabled={!brokerId || busy !== null}
                          className="rounded-lg bg-brand-violet px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                        >
                          {busy === `assign-${s.id}` ? "…" : "Assign"}
                        </button>
                      </div>
                    )}
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
