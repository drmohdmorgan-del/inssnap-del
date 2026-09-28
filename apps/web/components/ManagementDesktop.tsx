"use client";

import { useState } from "react";
import type { User } from "../lib/session";
import { ShowingsMonitor } from "./ShowingsMonitor";
import { PropertiesManager } from "./PropertiesManager";
import { UnitsManager } from "./UnitsManager";
import { ResidentsList } from "./ResidentsList";
import { ReportsPanel } from "./ReportsPanel";
import { SettingsPanel } from "./SettingsPanel";

const TABS = [
  { id: "monitor", label: "Live Monitor" },
  { id: "properties", label: "Properties" },
  { id: "units", label: "Units" },
  { id: "residents", label: "Residents" },
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
                ? "border-indigo-600 text-indigo-700"
                : "border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-800"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "monitor" && <ShowingsMonitor />}
      {tab === "properties" && <PropertiesManager />}
      {tab === "units" && <UnitsManager />}
      {tab === "residents" && <ResidentsList />}
      {tab === "reports" && <ReportsPanel />}
      {tab === "settings" && <SettingsPanel />}
    </div>
  );
}
