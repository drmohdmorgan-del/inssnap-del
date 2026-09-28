"use client";

import { useEffect, useState, useCallback } from "react";

type Integration = {
  name: string;
  status: "connected" | "sandbox" | "not_connected" | "not_configured" | "error";
  detail: string;
};

const STATUS_STYLES: Record<Integration["status"], string> = {
  connected: "bg-emerald-100 text-emerald-800",
  sandbox: "bg-amber-100 text-amber-800",
  not_connected: "bg-slate-200 text-slate-700",
  not_configured: "bg-slate-200 text-slate-700",
  error: "bg-red-100 text-red-800",
};

const STATUS_LABELS: Record<Integration["status"], string> = {
  connected: "connected",
  sandbox: "sandbox",
  not_connected: "not connected",
  not_configured: "not configured",
  error: "error",
};

export function SettingsPanel() {
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const res = await fetch("/api/integrations");
    if (res.ok) setIntegrations((await res.json()).integrations);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="mb-1 text-lg font-semibold text-slate-900">PMS Connection</h2>
        <p className="mb-3 text-sm text-slate-500">
          Property management remains the system of record for property and unit
          eligibility. Statuses below reflect what is actually configured — never
          a hardcoded badge.
        </p>
        {loading ? (
          <p className="text-sm text-slate-400">Loading…</p>
        ) : (
          <div className="space-y-2">
            {integrations.map((i) => (
              <div
                key={i.name}
                className="flex items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-slate-700">{i.name}</p>
                  <p className="text-xs text-slate-500">{i.detail}</p>
                </div>
                <span
                  className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_STYLES[i.status]}`}
                >
                  {STATUS_LABELS[i.status]}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="mb-1 text-lg font-semibold text-slate-900">Organization</h2>
        <p className="text-sm text-slate-500">
          Organization settings (name, notification preferences, feature flags) are
          planned for a later phase. Portfolio data above is live.
        </p>
      </section>
    </div>
  );
}
