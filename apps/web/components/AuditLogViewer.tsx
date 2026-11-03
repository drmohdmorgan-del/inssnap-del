"use client";

import { useEffect, useState, useCallback } from "react";

type Org = { id: string; name: string };

type AuditEvent = {
  id: string;
  showingId: string;
  organizationId: string;
  actorRole: string;
  transition: string;
  fromState: string;
  toState: string;
  idempotencyKey: string;
  at: string;
};

// Engine transition names (packages/engine TRANSITION_TABLE). Fixed
// 2026-10-29: the list previously offered "REQUEST", which no stored event
// ever carries (the real name is PROSPECT_REQUEST), so that filter option
// could only ever return an empty log. EXPIRE added for completeness.
const TRANSITIONS = [
  "",
  "PROSPECT_REQUEST",
  "RESIDENT_ACCEPT",
  "RESIDENT_DECLINE",
  "BROKER_ASSIGN",
  "BROKER_ACCEPT",
  "BROKER_DECLINE",
  "CONFIRM",
  "CHECK_IN",
  "COMPLETE",
  "RECORD_OUTCOME",
  "EXPIRE",
];

export function AuditLogViewer() {
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [orgId, setOrgId] = useState("");
  const [transition, setTransition] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const params = new URLSearchParams({ limit: "100" });
    if (orgId) params.set("orgId", orgId);
    if (transition) params.set("transition", transition);
    const res = await fetch(`/api/control/events?${params.toString()}`);
    if (res.ok) setEvents((await res.json()).events);
    setLoading(false);
  }, [orgId, transition]);

  useEffect(() => {
    fetch("/api/control/orgs")
      .then((r) => (r.ok ? r.json() : { orgs: [] }))
      .then((d) => setOrgs(d.orgs));
  }, []);

  useEffect(() => {
    load();
    const interval = setInterval(load, 5000);
    return () => clearInterval(interval);
  }, [load]);

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold text-slate-900">Audit Log</h2>
        <div className="flex flex-wrap gap-2">
          <select
            value={orgId}
            onChange={(e) => setOrgId(e.target.value)}
            className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-700"
            aria-label="Filter by organization"
          >
            <option value="">All organizations</option>
            {orgs.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
          <select
            value={transition}
            onChange={(e) => setTransition(e.target.value)}
            className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-700"
            aria-label="Filter by transition"
          >
            {TRANSITIONS.map((t) => (
              <option key={t} value={t}>
                {t === "" ? "All transitions" : t}
              </option>
            ))}
          </select>
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-slate-400">Loading…</p>
      ) : events.length === 0 ? (
        <p className="text-sm text-slate-500">No events match these filters.</p>
      ) : (
        <div className="max-h-96 overflow-y-auto">
          {/* F3 (2026-10-25): below sm the table becomes stacked cards carrying
              every column — no sideways scroll at 360/390px, no data dropped. */}
          <div className="space-y-2 sm:hidden">
            {events.map((e) => (
              <div key={e.id} className="rounded-lg bg-slate-50 px-3 py-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-mono text-xs font-semibold text-slate-700">
                    {e.transition}
                  </span>
                  <span className="text-xs text-slate-500">{new Date(e.at).toLocaleString()}</span>
                </div>
                <p className="mt-1 text-xs text-slate-600">
                  {e.fromState} → {e.toState} · {e.actorRole}
                </p>
                <p className="mt-0.5 break-all font-mono text-xs text-slate-400">
                  {e.showingId}
                </p>
              </div>
            ))}
          </div>
          <div className="hidden sm:block">
          <table className="w-full text-left text-sm">
            <thead className="sticky top-0 bg-white">
              <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-400">
                <th className="pb-2 pr-4">Time</th>
                <th className="pb-2 pr-4">Transition</th>
                <th className="pb-2 pr-4">From → To</th>
                <th className="pb-2 pr-4">Actor Role</th>
                <th className="pb-2">Showing</th>
              </tr>
            </thead>
            <tbody>
              {events.map((e) => (
                <tr key={e.id} className="border-b border-slate-100">
                  <td className="py-2 pr-4 text-slate-500">
                    {new Date(e.at).toLocaleString()}
                  </td>
                  <td className="py-2 pr-4 font-mono text-xs text-slate-700 [overflow-wrap:anywhere]">
                    {e.transition}
                  </td>
                  <td className="py-2 pr-4 text-xs text-slate-600">
                    {e.fromState} → {e.toState}
                  </td>
                  <td className="py-2 pr-4 text-xs text-slate-600">{e.actorRole}</td>
                  <td className="py-2 font-mono text-xs text-slate-400">
                    {e.showingId.slice(0, 8)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </div>
      )}
    </section>
  );
}
