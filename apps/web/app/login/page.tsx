"use client";

import { DEMO_TOTP_SECRET } from "../../lib/demo";

import { useState } from "react";
import { useRouter } from "next/navigation";

const DEMO_ACCOUNTS = [
  { label: "Management", email: "manager@inssnapp.demo" },
  { label: "Control Center (Admin)", email: "admin@inssnapp.demo" },
  { label: "Resident", email: "resident@inssnapp.demo" },
  { label: "Prospect", email: "prospect@inssnapp.demo" },
  { label: "Broker", email: "broker@inssnapp.demo" },
];

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("pw");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  // MFA step: set when the server answers 202 with a challenge id.
  const [challengeId, setChallengeId] = useState<string | null>(null);
  const [code, setCode] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    setLoading(false);
    const data = await res.json().catch(() => ({}));
    if (res.status === 202 && data.mfaRequired && data.challengeId) {
      setChallengeId(data.challengeId);
      return;
    }
    if (!res.ok) {
      setError(data.error || "Login failed");
      return;
    }
    router.push("/admin");
    router.refresh();
  }

  async function handleMfaSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const res = await fetch("/api/auth/mfa/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ challengeId, code }),
    });
    setLoading(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Verification failed");
      return;
    }
    router.push("/admin");
    router.refresh();
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-50 to-slate-200 p-4">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-xl">
        <div className="mb-6 text-center">
          <img
            src="/brand/inssnapp-logo.png"
            alt="INSSNAPP"
            className="mx-auto h-24 w-24 rounded-2xl bg-brand-navy object-contain"
            draggable={false}
          />
          <h1 className="mt-4 text-3xl font-bold tracking-tight text-slate-900">INSSNAPP</h1>
          <p className="mt-1 text-sm text-slate-500">Resident-Powered Leasing Infrastructure</p>
        </div>

        {challengeId ? (
          <form onSubmit={handleMfaSubmit} className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">
                Authenticator code
              </label>
              <input
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm tracking-widest focus:border-brand-violet focus:outline-none focus:ring-2 focus:ring-brand-violet/30"
                placeholder="6-digit code"
                required
              />
              <p className="mt-1 text-xs text-slate-500">
                This account has MFA enabled. Enter the 6-digit code from your authenticator app.
              </p>
            </div>

            {error && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-lg bg-brand-violet px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-violet-light disabled:opacity-50"
            >
              {loading ? "Verifying…" : "Verify"}
            </button>
            <button
              type="button"
              onClick={() => {
                setChallengeId(null);
                setCode("");
                setError(null);
              }}
              className="w-full text-center text-xs text-slate-500 hover:text-slate-700"
            >
              ← Back to sign in
            </button>
          </form>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-violet focus:outline-none focus:ring-2 focus:ring-brand-violet/30"
                placeholder="you@company.com"
                required
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-violet focus:outline-none focus:ring-2 focus:ring-brand-violet/30"
                placeholder="••••••••"
                required
              />
            </div>

            {error && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-lg bg-brand-violet px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-violet-light disabled:opacity-50"
            >
              {loading ? "Signing in…" : "Sign in"}
            </button>
          </form>
        )}

        <div className="mt-6 border-t border-slate-200 pt-4">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-400">
            Demo accounts
          </p>
          <div className="flex flex-wrap gap-2">
            {DEMO_ACCOUNTS.map((a) => (
              <button
                key={a.email}
                type="button"
                onClick={() => setEmail(a.email)}
                className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs text-slate-600 transition hover:border-brand-violet/40 hover:text-brand-violet"
              >
                {a.label}
              </button>
            ))}
          </div>
          <p className="mt-3 text-xs text-slate-400">
            Password for all demo accounts: <code className="rounded bg-slate-100 px-1">pw</code>
          </p>
          <p className="mt-1 text-xs text-slate-400">
            <span className="font-semibold text-amber-600">Dev only:</span> the admin account has
            MFA enabled — enroll this TOTP secret in your authenticator app:{" "}
            <code className="rounded bg-slate-100 px-1">{DEMO_TOTP_SECRET}</code>
          </p>
        </div>
      </div>
    </main>
  );
}
