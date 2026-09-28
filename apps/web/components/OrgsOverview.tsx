"use client";

import { useEffect, useState, useCallback } from "react";
import { StatCard } from "./StatCard";

type OrgSummary = {
  id: string;
  name: string;
  counts: {
    users: number;
    properties: number;
    units: number;
    eligibleUnits: number;
    showings: number;
    activeShowings: number;
  };
};

export function OrgsOverview() {
  const [orgs, setOrgs] = useState<OrgSummary[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const res = await fetch("/api/control/orgs");
    if (res.ok) setOrgs((await res.json()).orgs);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) return <p className="text-sm text-slate-400">Loading…</p>;

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-slate-900">Organizations</h2>
        <span className="text-xs text-slate-500">{orgs.length} total</span>
      </div>
      {orgs.length === 0 ? (
        <p className="text-sm text-slate-500">No organizations.</p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {orgs.map((o) => (
            <div key={o.id} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <p className="font-mono text-xs text-slate-400">{o.id.slice(0, 8)}</p>
              <p className="mt-0.5 truncate text-sm font-semibold text-slate-900">{o.name}</p>
              <dl className="mt-2 grid grid-cols-3 gap-2 text-center">
                <div>
                  <dt className="text-[11px] text-slate-500">Users</dt>
                  <dd className="text-base font-bold text-slate-800">{o.counts.users}</dd>
                </div>
                <div>
                  <dt className="text-[11px] text-slate-500">Properties</dt>
                  <dd className="text-base font-bold text-slate-800">{o.counts.properties}</dd>
                </div>
                <div>
                  <dt className="text-[11px] text-slate-500">Units</dt>
                  <dd className="text-base font-bold text-slate-800">{o.counts.units}</dd>
                </div>
                <div>
                  <dt className="text-[11px] text-slate-500">Eligible</dt>
                  <dd className="text-base font-bold text-blue-700">{o.counts.eligibleUnits}</dd>
                </div>
                <div>
                  <dt className="text-[11px] text-slate-500">Showings</dt>
                  <dd className="text-base font-bold text-slate-800">{o.counts.showings}</dd>
                </div>
                <div>
                  <dt className="text-[11px] text-slate-500">Active</dt>
                  <dd className="text-base font-bold text-brand-violet">{o.counts.activeShowings}</dd>
                </div>
              </dl>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

export function OrgsStatCards() {
  const [orgs, setOrgs] = useState<OrgSummary[]>([]);

  useEffect(() => {
    fetch("/api/control/orgs")
      .then((r) => (r.ok ? r.json() : { orgs: [] }))
      .then((d) => setOrgs(d.orgs));
  }, []);

  const totals = orgs.reduce(
    (a, o) => ({
      users: a.users + o.counts.users,
      units: a.units + o.counts.units,
      showings: a.showings + o.counts.showings,
      active: a.active + o.counts.activeShowings,
    }),
    { users: 0, units: 0, showings: 0, active: 0 },
  );

  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      <StatCard label="Organizations" value={orgs.length} accent="text-slate-700" />
      <StatCard label="Total Users" value={totals.users} accent="text-blue-600" />
      <StatCard label="Total Units" value={totals.units} accent="text-brand-violet" />
      <StatCard label="Active Showings" value={totals.active} accent="text-emerald-600" />
    </div>
  );
}
