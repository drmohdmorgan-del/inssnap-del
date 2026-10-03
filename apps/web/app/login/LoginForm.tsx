"use client";

import { DEMO_TOTP_SECRET } from "../../lib/demo";
import { fetchSession } from "../../lib/session";
import { BrandMark } from "../../components/brand/BrandMark";
import { TestModeBar } from "../../components/TestModeBar";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

const DEMO_ACCOUNTS = [
  { label: "Management", email: "manager@inssnapp.demo" },
  { label: "Control Center (Admin)", email: "admin@inssnapp.demo" },
  { label: "Resident", email: "resident@inssnapp.demo" },
  { label: "Prospect", email: "prospect@inssnapp.demo" },
  { label: "Broker", email: "broker@inssnapp.demo" },
];

const ROLE_HOME: Record<string, string> = {
  prospect: "/m/prospect",
  broker: "/m/broker",
  resident: "/m/resident",
  management: "/admin",
  inssnapp_admin: "/control",
};

function safeNext(raw: string | null): string | null {
  if (!raw) return null;
  if (!raw.startsWith("/")) return null;
  if (raw.startsWith("//")) return null;
  return raw;
}

export default function LoginForm({ showDemo }: { showDemo: boolean }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState(showDemo ? "pw" : "");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  // MFA step: set when the server answers 202 with a challenge id.
  const [challengeId, setChallengeId] = useState<string | null>(null);
  const [code, setCode] = useState("");

  async function routeAfterLogin() {
    const next = safeNext(searchParams.get("next"));
    if (next) {
      router.push(next);
    } else {
      const user = await fetchSession();
      router.push(user ? ROLE_HOME[user.role] || "/admin" : "/admin");
    }
    router.refresh();
  }

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
      if (data.verificationRequired && data.email) {
        router.push(`/signup?email=${encodeURIComponent(data.email)}`);
        return;
      }
      setError(data.error || "Login failed");
      return;
    }
    await routeAfterLogin();
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
    await routeAfterLogin();
  }

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-brand-navy p-4">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0">
        <div className="absolute -top-24 left-1/4 h-96 w-96 rounded-full bg-brand-violet/25 blur-[130px]" />
        <div className="absolute -bottom-32 right-1/4 h-80 w-80 rounded-full bg-brand-violet-light/20 blur-[130px]" />
        <BrandMark className="absolute -right-20 -top-20 h-80 w-80 opacity-[0.05]" />
        <BrandMark className="absolute -bottom-24 -left-16 h-64 w-64 opacity-[0.04]" />
      </div>
      <div className="relative w-full max-w-md">
      <TestModeBar />
      <div className="rounded-2xl border border-white/10 bg-white p-8 shadow-2xl">
        <div className="mb-6 text-center">
          <img
            src="/brand/inssnapp-logo.png"
            alt="INSSNAPP"
            className="mx-auto h-24 w-24 rounded-2xl bg-brand-navy object-contain"
            draggable={false}
          />
          <h1 className="mt-4 text-3xl font-bold tracking-tight text-brand-navy">INSSNAPP</h1>
          <p className="mt-1 text-sm text-brand-navy-light/60">Resident-Powered Leasing Infrastructure</p>
        </div>

        {challengeId ? (
          <form onSubmit={handleMfaSubmit} className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-brand-navy-light">
                Authenticator code
              </label>
              <input
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                className="w-full rounded-lg border border-brand-navy-light/25 px-3 py-2 text-sm tracking-widest focus:border-brand-violet focus:outline-none focus:ring-2 focus:ring-brand-violet/30"
                placeholder="6-digit code"
                required
              />
              <p className="mt-1 text-xs text-brand-navy-light/60">
                This account has MFA enabled. Enter the 6-digit code from your authenticator app.
              </p>
            </div>

            {error && (
              <div className="flex items-start gap-2 rounded-lg border border-brand-violet/40 bg-brand-violet/10 px-3 py-2 text-sm text-brand-navy">
                <svg viewBox="0 0 20 20" className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true">
                  <circle cx="10" cy="10" r="9" fill="#7b2ff7" opacity="0.18" />
                  <path d="M10 6.2v4.6" stroke="#7b2ff7" strokeWidth="2" strokeLinecap="round" />
                  <circle cx="10" cy="13.6" r="1.2" fill="#7b2ff7" />
                </svg>
                <span>{error}</span>
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
              className="w-full text-center text-xs text-brand-navy-light/60 hover:text-brand-navy-light"
            >
              ← Back to sign in
            </button>
          </form>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-brand-navy-light">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-lg border border-brand-navy-light/25 px-3 py-2 text-sm focus:border-brand-violet focus:outline-none focus:ring-2 focus:ring-brand-violet/30"
                placeholder="you@company.com"
                required
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-brand-navy-light">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-lg border border-brand-navy-light/25 px-3 py-2 text-sm focus:border-brand-violet focus:outline-none focus:ring-2 focus:ring-brand-violet/30"
                placeholder="••••••••"
                required
              />
            </div>

            {error && (
              <div className="flex items-start gap-2 rounded-lg border border-brand-violet/40 bg-brand-violet/10 px-3 py-2 text-sm text-brand-navy">
                <svg viewBox="0 0 20 20" className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true">
                  <circle cx="10" cy="10" r="9" fill="#7b2ff7" opacity="0.18" />
                  <path d="M10 6.2v4.6" stroke="#7b2ff7" strokeWidth="2" strokeLinecap="round" />
                  <circle cx="10" cy="13.6" r="1.2" fill="#7b2ff7" />
                </svg>
                <span>{error}</span>
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

        {showDemo && (
        <div className="mt-6 border-t border-brand-navy-light/15 pt-4">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-brand-navy-light/50">
            Demo accounts
          </p>
          <div className="flex flex-wrap gap-2">
            {DEMO_ACCOUNTS.map((a) => (
              <button
                key={a.email}
                type="button"
                onClick={() => setEmail(a.email)}
                className="rounded-full border border-brand-navy-light/15 bg-brand-navy-light/5 px-3 py-1 text-xs text-brand-navy-light transition hover:border-brand-violet/40 hover:text-brand-violet"
              >
                {a.label}
              </button>
            ))}
          </div>
          <p className="mt-3 text-xs text-brand-navy-light/50">
            Password for all demo accounts: <code className="rounded bg-brand-navy-light/10 px-1">pw</code>
          </p>
          <p className="mt-1 text-xs text-brand-navy-light/50">
            <span className="font-semibold text-brand-violet">Dev only:</span> the admin account has
            MFA enabled — enroll this TOTP secret in your authenticator app:{" "}
            <code className="rounded bg-brand-navy-light/10 px-1">{DEMO_TOTP_SECRET}</code>
          </p>
        </div>
        )}
      </div>
      </div>
    </main>
  );
}
