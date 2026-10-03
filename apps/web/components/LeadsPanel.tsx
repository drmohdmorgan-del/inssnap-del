"use client";

import { useEffect, useState, useCallback } from "react";

type Lead = {
  showingId: string;
  organizationId: string;
  organizationName: string;
  unitLabel: string | null;
  propertyName: string | null;
  prospectName: string | null;
  outcome: string | null;
  disposition: string;
  decidedAt: string | null;
  brokerAssigned: boolean;
  avgStars: number | null;
  completedAt: string;
};

type Broker = { id: string; fullName: string; emailVerified: boolean };

const OUTCOME_LABEL: Record<string, string> = {
  APPLY: "Accept",
  WATCH: "Watching",
  DECLINE: "Declined",
};

/**
 * Management lead pool (Phase 6/7).
 *
 * Shows the leads Control pushed to this organization (disposition =
 * management). Management pushes a lead to a broker via the existing
 * BROKER_ASSIGN transition — the broker sees it in their mobile queue.
 */
export function LeadsPanel() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [brokers, setBrokers] = useState<Broker[]>([]);
  const [loading, setLoading] = useState(true);
  const [assignFor, setAssignFor] = useState<string | null>(null);
  const [brokerId, setBrokerId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [lRes, bRes] = await Promise.all([
      fetch("/api/leads"),
      fetch("/api/users?role=broker"),
    ]);
    if (lRes.ok) setLeads((await lRes.json()).leads ?? []);
    if (bRes.ok) setBrokers((await bRes.json()).users ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function assignBroker(lead: Lead) {
    if (!brokerId) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/showings/${lead.showingId}/broker/assign`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          brokerUserId: brokerId,
          idempotencyKey: crypto.randomUUID(),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Could not assign the broker.");
        return;
      }
      setAssignFor(null);
      setBrokerId("");
      await load();
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <h2 className="mb-1 text-lg font-semibold text-slate-900">Lead pool</h2>
      <p className="mb-4 text-sm text-slate-500">
        Leads the Control Center sent to you. Push a lead to a broker — it
        lands in their mobile assignment queue instantly.
      </p>

      {error && (
        <p className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      {loading ? (
        <p className="text-sm text-slate-400">Loading…</p>
      ) : leads.length === 0 ? (
        <p className="text-sm text-slate-500">
          No leads in your pool yet. The Control Center routes decided showings here.
        </p>
      ) : (
        <div className="space-y-2">
          {leads.map((l) => (
            <div
              key={l.showingId}
              className="rounded-lg bg-slate-50 px-3 py-2"
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-slate-700">
                    {l.prospectName ?? "Prospect"} · {OUTCOME_LABEL[l.outcome ?? ""] ?? l.outcome}
                    {l.unitLabel && ` · unit ${l.unitLabel}`}
                    {l.propertyName && ` — ${l.propertyName}`}
                  </p>
                  <p className="truncate text-xs text-slate-500">
                    {l.avgStars !== null ? `★ ${l.avgStars}` : "No ratings yet"}
                    {l.brokerAssigned && " · broker assigned"}
                  </p>
                </div>
                {l.brokerAssigned ? (
                  <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-800">
                    With broker
                  </span>
                ) : assignFor === l.showingId ? (
                  <div className="flex items-center gap-2">
                    <select
                      value={brokerId}
                      onChange={(e) => setBrokerId(e.target.value)}
                      className="rounded-lg border border-slate-300 px-2 py-1.5 text-xs focus:border-brand-violet focus:outline-none"
                    >
                      <option value="">Select broker…</option>
                      {brokers.map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.fullName}{b.emailVerified ? "" : " (unverified)"}
                        </option>
                      ))}
                    </select>
                    <button
                      onClick={() => assignBroker(l)}
                      disabled={!brokerId || busy}
                      className="rounded-lg bg-brand-violet px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                    >
                      {busy ? "…" : "Push"}
                    </button>
                    <button
                      onClick={() => {
                        setAssignFor(null);
                        setBrokerId("");
                      }}
                      className="rounded-lg px-2 py-1.5 text-xs text-slate-500 hover:text-slate-800"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setAssignFor(l.showingId)}
                    disabled={brokers.length === 0}
                    title={brokers.length === 0 ? "No brokers registered yet" : undefined}
                    className="rounded-lg bg-brand-violet px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-brand-violet-light disabled:opacity-40"
                  >
                    Push to broker
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
