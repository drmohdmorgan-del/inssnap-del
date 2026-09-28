"use client";

import { useEffect, useState, useCallback } from "react";

type SecurityEvent = {
  id: string;
  organizationId: string | null;
  type: "login_failed" | "login_succeeded" | "mfa_failed" | "session_revoked";
  actorUserId: string | null;
  actorEmail: string | null;
  detail: string | null;
  at: string;
};

const TYPE_STYLES: Record<SecurityEvent["type"], string> = {
  login_failed: "bg-red-100 text-red-800",
  login_succeeded: "bg-emerald-100 text-emerald-800",
  mfa_failed: "bg-amber-100 text-amber-800",
  session_revoked: "bg-slate-200 text-slate-700",
};

const TYPE_OPTIONS = [
  "",
  "login_failed",
  "login_succeeded",
  "mfa_failed",
  "session_revoked",
];

export function SecurityEvents() {
  const [events, setEvents] = useState<SecurityEvent[]>([]);
  const [type, setType] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const params = new URLSearchParams({ limit: "100" });
    if (type) params.set("type", type);
    const res = await fetch(`/api/control/security-events?${params.toString()}`);
    if (res.ok) setEvents((await res.json()).events);
    setLoading(false);
  }, [type]);

  useEffect(() => {
    load();
    const interval = setInterval(load, 5000);
    return () => clearInterval(interval);
  }, [load]);

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold text-slate-900">Security Events</h2>
        <select
          value={type}
          onChange={(e) => setType(e.target.value)}
          className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-700"
          aria-label="Filter by event type"
        >
          {TYPE_OPTIONS.map((t) => (
            <option key={t} value={t}>
              {t === "" ? "All types" : t.replace(/_/g, " ")}
            </option>
          ))}
        </select>
      </div>

      {loading ? (
        <p className="text-sm text-slate-400">Loading…</p>
      ) : events.length === 0 ? (
        <p className="text-sm text-slate-500">No security events recorded yet.</p>
      ) : (
        <div className="max-h-96 overflow-auto">
          <table className="w-full text-left text-sm">
            <thead className="sticky top-0 bg-white">
              <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-400">
                <th className="pb-2 pr-4">Time</th>
                <th className="pb-2 pr-4">Event</th>
                <th className="pb-2 pr-4">Actor</th>
                <th className="pb-2">Detail</th>
              </tr>
            </thead>
            <tbody>
              {events.map((e) => (
                <tr key={e.id} className="border-b border-slate-100">
                  <td className="whitespace-nowrap py-2 pr-4 text-slate-500">
                    {new Date(e.at).toLocaleString()}
                  </td>
                  <td className="py-2 pr-4">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-semibold ${TYPE_STYLES[e.type]}`}
                    >
                      {e.type.replace(/_/g, " ")}
                    </span>
                  </td>
                  <td className="py-2 pr-4 text-xs text-slate-600">
                    {e.actorEmail ?? <span className="text-slate-400">—</span>}
                  </td>
                  <td className="py-2 text-xs text-slate-500">{e.detail ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
