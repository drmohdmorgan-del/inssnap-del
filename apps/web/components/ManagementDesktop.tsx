"use client";

import { useState } from "react";
import type { User } from "../lib/session";
import { ShowingsMonitor } from "./ShowingsMonitor";
import { PropertiesManager } from "./PropertiesManager";
import { UnitsManager } from "./UnitsManager";
import { ResidentsList } from "./ResidentsList";
import { InvitesPanel } from "./InvitesPanel";
import { LeadsPanel } from "./LeadsPanel";
import { LiveMap } from "./LiveMapDynamic";
import { ReportsPanel } from "./ReportsPanel";
import { SettingsPanel } from "./SettingsPanel";

const TABS = [
  { id: "monitor", label: "Live Monitor" },
  { id: "map", label: "Map" },
  { id: "properties", label: "Properties" },
  { id: "units", label: "Units" },
  { id: "residents", label: "Residents" },
  { id: "invites", label: "Invites" },
  { id: "leads", label: "Leads" },
  { id: "reports", label: "Reports" },
  { id: "settings", label: "Settings" },
] as const;

type TabId = (typeof TABS)[number]["id"];

/**
 * Management desktop: portfolio/unit oversight, resident enrollment view,
 * live showing monitor, reporting, and settings — all backed by the real
 * store (Postgres when DATABASE_URL is set, in-memory otherwise).
 */
export function ManagementDesktop({ user }: { user: User }) {
  const [tab, setTab] = useState<TabId>("monitor");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Portfolio Overview</h1>
        <p className="mt-1 text-sm text-slate-500">
          Live showing operations across your organization.
        </p>
      </div>

      <div className="-mb-1 flex gap-1 overflow-x-auto border-b border-slate-200">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium transition ${
              tab === t.id
                ? "border-brand-violet text-brand-violet"
                : "border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-800"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "monitor" && <ShowingsMonitor />}
      {tab === "map" && (
        <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="mb-1 text-lg font-semibold text-slate-900">Live map</h2>
          <p className="mb-3 text-sm text-slate-500">
            Every building, live unit availability, and active showing requests —
            updating every 5 seconds.
          </p>
          <LiveMap height={520} />
        </section>
      )}
      {tab === "properties" && <PropertiesManager />}
      {tab === "units" && <UnitsManager />}
      {tab === "residents" && <ResidentsList />}
      {tab === "invites" && <InvitesPanel />}
      {tab === "leads" && <LeadsPanel />}
      {tab === "reports" && <ReportsPanel />}
      {tab === "settings" && <SettingsPanel />}
    </div>
  );
}
