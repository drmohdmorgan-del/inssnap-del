/**
 * Public signup (Phase 2/3) — mobile-first.
 *
 * ?invite=CODE pre-fills and validates the invite. Flow:
 *   1. Choose role (invite locks the role for resident invites).
 *   2. Enter name / email / password → POST /api/auth/signup.
 *   3. Enter the 6-digit email code → POST /api/auth/verify → signed in.
 */
"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { BrandMark } from "../../components/brand/BrandMark";
import { TestModeBar } from "../../components/TestModeBar";

type Role = "resident" | "prospect" | "broker";

const ROLES: { id: Role; label: string; blurb: string }[] = [
  { id: "resident", label: "Current Tenant", blurb: "You live in a managed unit — invite code required." },
  { id: "prospect", label: "Prospect", blurb: "Looking for a place — find units and request showings." },
  { id: "broker", label: "Broker", blurb: "Work showing assignments from management." },
];

const ROLE_HOME: Record<Role, string> = {
  resident: "/m/resident",
  prospect: "/m/prospect",
  broker: "/m/broker",
};

type InviteInfo = {
  valid: boolean;
  role?: string;
  organizationName?: string | null;
  unitLabel?: string | null;
  propertyName?: string | null;
};

function SignupForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [role, setRole] = useState<Role>("prospect");
  const [inviteCode, setInviteCode] = useState(searchParams.get("invite")?.toUpperCase() ?? "");
  const [invite, setInvite] = useState<InviteInfo | null>(null);
  const [checkingInvite, setCheckingInvite] = useState(false);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState(searchParams.get("email") ?? "");
  const [password, setPassword] = useState("");
  // ?email= present (e.g. bounced from login) → start at the verify step.
  const [step, setStep] = useState<"form" | "verify">(searchParams.get("email") ? "verify" : "form");
  const [code, setCode] = useState("");
  const [devCode, setDevCode] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Validate the invite code as it is typed.
  useEffect(() => {
    const c = inviteCode.trim();
    if (!c) {
      setInvite(null);
      return;
    }
    setCheckingInvite(true);
    const t = setTimeout(() => {
      fetch(`/api/invites/validate?code=${encodeURIComponent(c)}`)
        .then((r) => r.json())
        .then((d: InviteInfo) => {
          setInvite(d);
          if (d.valid && d.role && (d.role === "resident" || d.role === "prospect" || d.role === "broker")) {
            setRole(d.role);
          }
        })
        .catch(() => setInvite({ valid: false }))
        .finally(() => setCheckingInvite(false));
    }, 400);
    return () => clearTimeout(t);
  }, [inviteCode]);

  async function submitSignup(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          password,
          fullName,
          role,
          inviteCode: inviteCode.trim() || undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Sign-up failed.");
        return;
      }
      if (data.devCode) setDevCode(data.devCode);
      setStep("verify");
    } finally {
      setBusy(false);
    }
  }

  async function submitVerify(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, code, inviteCode: inviteCode.trim() || undefined }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Verification failed.");
        return;
      }
      router.push(ROLE_HOME[role]);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function resend() {
    setError(null);
    const res = await fetch("/api/auth/verify/resend", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    const data = await res.json().catch(() => ({}));
    if (data.devCode) setDevCode(data.devCode);
  }

  const inputCls =
    "w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm focus:border-brand-violet focus:outline-none focus:ring-2 focus:ring-brand-violet/30";

  return (
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-b from-brand-navy to-brand-navy-light p-4">
      <div className="w-full max-w-md">
        <div className="mb-6 text-center">
          <BrandMark className="mx-auto h-14 w-14" />
          <h1 className="mt-3 text-2xl font-bold tracking-tight text-white">
            {step === "form" ? "Create your account" : "Verify your email"}
          </h1>
          <p className="mt-1 text-sm text-slate-300">
            {step === "form" ? "Join INSSNAPP in under a minute." : `We sent a 6-digit code to ${email}.`}
          </p>
        </div>

        <TestModeBar />

        <div className="rounded-2xl bg-white p-6 shadow-xl">
          {step === "form" ? (
            <form onSubmit={submitSignup} className="space-y-4">
              <div>
                <p className="mb-2 text-sm font-medium text-slate-700">I am a…</p>
                <div className="grid gap-2">
                  {ROLES.map((r) => (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() => setRole(r.id)}
                      className={`min-h-[44px] rounded-xl border-2 px-3 py-2 text-left transition ${
                        role === r.id
                          ? "border-brand-violet bg-brand-violet/5"
                          : "border-slate-200 hover:border-slate-300"
                      }`}
                    >
                      <span className="block text-sm font-semibold text-slate-900">{r.label}</span>
                      <span className="block text-xs text-slate-500">{r.blurb}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  Invite code {role === "resident" ? "(required)" : "(optional)"}
                </label>
                <input
                  value={inviteCode}
                  onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
                  placeholder="e.g. K7Q2XD"
                  className={`${inputCls} font-mono tracking-widest uppercase`}
                  maxLength={12}
                />
                {checkingInvite && <p className="mt-1 text-xs text-slate-400">Checking…</p>}
                {!checkingInvite && inviteCode.trim() && invite && (
                  <p className={`mt-1 text-xs ${invite.valid ? "text-emerald-700" : "text-red-600"}`}>
                    {invite.valid
                      ? `✓ ${invite.organizationName ?? "Organization"}${invite.propertyName ? ` · ${invite.propertyName}` : ""}${invite.unitLabel ? ` · unit ${invite.unitLabel}` : ""}`
                      : "That code is invalid or expired."}
                  </p>
                )}
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Full name</label>
                <input
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Jordan Lee"
                  required
                  maxLength={120}
                  className={inputCls}
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  required
                  className={inputCls}
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Password</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="8+ characters"
                  required
                  minLength={8}
                  maxLength={128}
                  className={inputCls}
                />
              </div>

              {error && (
                <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                  {error}
                </p>
              )}

              <button
                type="submit"
                disabled={busy}
                className="min-h-[48px] w-full rounded-xl bg-brand-violet px-4 py-3 text-sm font-semibold text-white transition hover:bg-brand-violet-light disabled:opacity-50"
              >
                {busy ? "Creating…" : "Create account"}
              </button>
            </form>
          ) : (
            <form onSubmit={submitVerify} className="space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  6-digit code
                </label>
                <input
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  placeholder="123456"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  required
                  className={`${inputCls} text-center font-mono text-2xl tracking-[0.5em]`}
                />
                {devCode && (
                  <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
                    Pilot mode — your code is <span className="font-mono font-bold">{devCode}</span>
                    . (No email provider configured yet.)
                  </p>
                )}
              </div>

              {error && (
                <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                  {error}
                </p>
              )}

              <button
                type="submit"
                disabled={busy || code.length !== 6}
                className="min-h-[48px] w-full rounded-xl bg-brand-violet px-4 py-3 text-sm font-semibold text-white transition hover:bg-brand-violet-light disabled:opacity-50"
              >
                {busy ? "Verifying…" : "Verify & sign in"}
              </button>
              <button
                type="button"
                onClick={resend}
                className="w-full text-center text-sm text-brand-violet hover:underline"
              >
                Resend code
              </button>
            </form>
          )}

          <p className="mt-4 text-center text-xs text-slate-500">
            Already have an account?{" "}
            <Link href="/login" className="font-semibold text-brand-violet hover:underline">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </main>
  );
}

export default function SignupPage() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-screen items-center justify-center bg-brand-navy">
          <p className="text-sm text-slate-300">Loading…</p>
        </main>
      }
    >
      <SignupForm />
    </Suspense>
  );
}
