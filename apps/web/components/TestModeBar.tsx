"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type Account = { role: string; label: string; email: string; home: string };

const ACCOUNTS: Account[] = [
  { role: "management", label: "Management", email: "manager@inssnapp.demo", home: "/admin" },
  { role: "resident", label: "Current Tenant", email: "resident@inssnapp.demo", home: "/m/resident" },
  { role: "prospect", label: "Prospect", email: "prospect@inssnapp.demo", home: "/m/prospect" },
  { role: "broker", label: "Broker", email: "broker@inssnapp.demo", home: "/m/broker" },
];

/**
 * Test-mode role switcher (pilot testing).
 *
 * Renders nothing unless the server reports test mode enabled
 * (INSSNAPP_TEST_MODE=0 kills it). Unmistakably labeled TEST MODE —
 * one click signs in as the demo account for that role, no typing,
 * no MFA. Production auth is untouched; this is a parallel path.
 */
export function TestModeBar({ compact = false }: { compact?: boolean }) {
  const router = useRouter();
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/auth/test-mode")
      .then((r) => r.json())
      .then((d) => setEnabled(d.enabled === true))
      .catch(() => setEnabled(false));
  }, []);

  if (enabled !== true) return null;

  async function signInAs(account: Account) {
    setBusy(account.role);
    setError(null);
    try {
      const res = await fetch("/api/auth/test-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: account.role }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Test sign-in failed.");
        return;
      }
      router.push(data.home || account.home);
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  return (
    <div
      className={`rounded-2xl border-2 border-dashed border-amber-400 bg-amber-50 p-4 ${
        compact ? "" : "mb-6"
      }`}
    >
      <div className="mb-1 flex items-center gap-2">
        <span className="rounded-md bg-amber-400 px-2 py-0.5 text-xs font-extrabold tracking-widest text-amber-950">
          TEST MODE
        </span>
        <p className="text-xs text-amber-800">
          Pilot testing only — demo accounts, no real data. No password needed.
        </p>
      </div>
      {error && <p className="mb-2 text-sm text-red-700">{error}</p>}
      <div className="flex flex-wrap gap-2">
        {ACCOUNTS.map((a) => (
          <button
            key={a.role}
            onClick={() => signInAs(a)}
            disabled={busy !== null}
            className="min-h-[44px] rounded-xl bg-brand-navy px-4 py-2 text-sm font-semibold text-white shadow transition active:scale-[0.98] disabled:opacity-50"
          >
            {busy === a.role ? "…" : `Test as ${a.label}`}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Small persistent badge for pages shown to a test-mode session. */
export function TestModeBadge() {
  const [enabled, setEnabled] = useState(false);
  useEffect(() => {
    fetch("/api/auth/test-mode")
      .then((r) => r.json())
      .then((d) => setEnabled(d.enabled === true))
      .catch(() => {});
  }, []);
  if (!enabled) return null;
  return (
    <span className="rounded-md bg-amber-400 px-2 py-0.5 text-xs font-extrabold tracking-widest text-amber-950">
      TEST MODE
    </span>
  );
}
