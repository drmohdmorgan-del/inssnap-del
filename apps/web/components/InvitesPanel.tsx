"use client";

import { useEffect, useState, useCallback } from "react";

type Unit = { id: string; label: string; propertyId: string };
type Property = { id: string; name: string };
type Invite = {
  id: string;
  code: string;
  unitId: string | null;
  role: string;
  email: string | null;
  createdAt: string;
  expiresAt: string;
  usedAt: string | null;
  usable: boolean;
  link: string;
};

/**
 * Management tenant invitations (Phase 1).
 *
 * Creates a shareable invite code/link per unit. The tenant opens
 * `/signup?invite=CODE`, registers, and is linked to the unit on signup.
 * No email provider is required — management copies the link and sends it
 * manually (SMS, WhatsApp, printed flyer, …).
 */
export function InvitesPanel() {
  const [units, setUnits] = useState<Unit[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [loading, setLoading] = useState(true);
  const [unitId, setUnitId] = useState("");
  const [email, setEmail] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [uRes, pRes, iRes] = await Promise.all([
      fetch("/api/units"),
      fetch("/api/properties"),
      fetch("/api/invites"),
    ]);
    if (uRes.ok) setUnits((await uRes.json()).units ?? []);
    if (pRes.ok) setProperties((await pRes.json()).properties ?? []);
    if (iRes.ok) setInvites((await iRes.json()).invites ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const propName = (id: string) => properties.find((p) => p.id === id)?.name ?? "—";

  async function createInvite() {
    if (!unitId) return;
    setCreating(true);
    setError(null);
    try {
      const res = await fetch("/api/invites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ unitId, email: email.trim() || null }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Could not create the invite.");
        return;
      }
      setUnitId("");
      setEmail("");
      await load();
    } finally {
      setCreating(false);
    }
  }

  async function copyLink(link: string, id: string) {
    const url = `${window.location.origin}${link}`;
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = url;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    }
    setCopied(id);
    setTimeout(() => setCopied(null), 2000);
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <h2 className="mb-1 text-lg font-semibold text-slate-900">Tenant invitations</h2>
      <p className="mb-4 text-sm text-slate-500">
        Create a shareable invite link per unit. The current tenant opens it,
        registers, verifies their email, and is linked to the unit — no email
        provider needed, just copy the link and send it yourself.
      </p>

      <div className="mb-6 rounded-lg bg-slate-50 p-4">
        <h3 className="mb-3 text-sm font-semibold text-slate-800">New invitation</h3>
        <div className="flex flex-col gap-3 sm:flex-row">
          <select
            value={unitId}
            onChange={(e) => setUnitId(e.target.value)}
            className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-violet focus:outline-none"
          >
            <option value="">Select a unit…</option>
            {units.map((u) => (
              <option key={u.id} value={u.id}>
                Unit {u.label} — {propName(u.propertyId)}
              </option>
            ))}
          </select>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Tenant email (optional)"
            className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-violet focus:outline-none"
          />
          <button
            onClick={createInvite}
            disabled={!unitId || creating}
            className="rounded-lg bg-brand-violet px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-violet-light disabled:opacity-50"
          >
            {creating ? "Creating…" : "Create invite"}
          </button>
        </div>
        {error && <p className="mt-2 text-sm text-red-700">{error}</p>}
      </div>

      <h3 className="mb-2 text-sm font-semibold text-slate-800">Invitations</h3>
      {loading ? (
        <p className="text-sm text-slate-400">Loading…</p>
      ) : invites.length === 0 ? (
        <p className="text-sm text-slate-500">No invitations yet.</p>
      ) : (
        <div className="space-y-2">
          {invites.map((inv) => (
            <div
              key={inv.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-slate-50 px-3 py-2"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium text-slate-700">
                  Code <span className="font-mono font-bold tracking-widest">{inv.code}</span>
                  {inv.email && <span className="font-normal text-slate-500"> · {inv.email}</span>}
                </p>
                <p className="truncate text-xs text-slate-500">
                  {inv.role} · expires {new Date(inv.expiresAt).toLocaleDateString()}
                  {inv.usedAt ? " · used" : inv.usable ? " · active" : " · expired"}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span
                  className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                    inv.usedAt
                      ? "bg-slate-200 text-slate-600"
                      : inv.usable
                        ? "bg-emerald-100 text-emerald-800"
                        : "bg-red-100 text-red-700"
                  }`}
                >
                  {inv.usedAt ? "Used" : inv.usable ? "Active" : "Expired"}
                </span>
                {inv.usable && (
                  <button
                    onClick={() => copyLink(inv.link, inv.id)}
                    className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:border-brand-violet hover:text-brand-violet"
                  >
                    {copied === inv.id ? "Copied ✓" : "Copy link"}
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
