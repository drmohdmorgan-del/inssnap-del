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

const OUTCOME_LABEL: Record<string, string> = {
  APPLY: "Accept",
  WATCH: "Watching",
  DECLINE: "Declined",
};

const DISPOSITION_LABEL: Record<string, string> = {
  pending: "Awaiting decision",
  inhouse: "Kept in-house",
  management: "Sent to management",
};

const DISPOSITION_STYLES: Record<string, string> = {
  pending: "bg-amber-100 text-amber-800",
  inhouse: "bg-sky-100 text-sky-800",
  management: "bg-violet-100 text-violet-800",
};

/**
 * Control Center lead routing (Phase 6).
 *
 * Control sees every OUTCOME showing (the results) across organizations and
 * directs each prospect lead: keep in-house (tenant-hosted, no broker) or
 * send to management (lands in the org's /admin Leads pool, where a broker
 * can be assigned).
 */
export function LeadRoutingPanel() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/leads");
    if (res.ok) setLeads((await res.json()).leads ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function setDisposition(lead: Lead, disposition: "inhouse" | "management") {
    setBusy(`${disposition}-${lead.showingId}`);
    setError(null);
    try {
      const res = await fetch(`/api/showings/${lead.showingId}/lead-disposition`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ disposition }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Could not update the lead.");
        return;
      }
      await load();
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <h2 className="mb-1 text-lg font-semibold text-slate-900">Lead routing</h2>
      <p className="mb-4 text-sm text-slate-500">
        Showing results across organizations. Direct each prospect lead: keep
        it in-house (resident-hosted, no broker) or send it to management’s
        lead pool for broker assignment.
      </p>

      {error && (
        <p className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      {loading ? (
        <p className="text-sm text-slate-400">Loading…</p>
      ) : leads.length === 0 ? (
        <p className="text-sm text-slate-500">No completed showings with decisions yet.</p>
      ) : (
        <div className="space-y-2">
          {leads.map((l) => (
            <div
              key={l.showingId}
              className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-slate-50 px-3 py-2"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-slate-700">
                  {l.prospectName ?? "Prospect"} · {OUTCOME_LABEL[l.outcome ?? ""] ?? l.outcome}
                  {l.unitLabel && ` · unit ${l.unitLabel}`}
                  {l.propertyName && ` — ${l.propertyName}`}
                </p>
                <p className="truncate text-xs text-slate-500">
                  {l.organizationName}
                  {l.avgStars !== null && ` · ★ ${l.avgStars}`}
                  {l.brokerAssigned && " · broker assigned"}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span
                  className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                    DISPOSITION_STYLES[l.disposition] ?? "bg-slate-200 text-slate-600"
                  }`}
                >
                  {DISPOSITION_LABEL[l.disposition] ?? l.disposition}
                </span>
                <button
                  onClick={() => setDisposition(l, "inhouse")}
                  disabled={busy !== null || l.disposition === "inhouse"}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:border-sky-500 hover:text-sky-700 disabled:opacity-40"
                >
                  {busy === `inhouse-${l.showingId}` ? "…" : "Keep in-house"}
                </button>
                <button
                  onClick={() => setDisposition(l, "management")}
                  disabled={busy !== null || l.disposition === "management"}
                  className="rounded-lg bg-brand-violet px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-brand-violet-light disabled:opacity-40"
                >
                  {busy === `management-${l.showingId}` ? "…" : "Send to management"}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
