/**
 * Mobile web (/m) shared UI — Tailwind, navy/violet brand palette,
 * touch-friendly (min 44px targets), max-w-md centered column.
 */
"use client";

import { useState, useEffect, type ReactNode } from "react";
import { BrandMark } from "../../../components/brand/BrandMark";
import { mobileApi, MobileApiError } from "./api";
import type { Showing, ShowingState } from "./types";

/** Inline TEST MODE badge (no extra import cycle — mirrors TestModeBadge). */
function MobileTestBadge() {
  const [enabled, setEnabled] = useState(false);
  useEffect(() => {
    fetch("/api/auth/test-mode")
      .then((r) => r.json())
      .then((d) => setEnabled(d.enabled === true))
      .catch(() => {});
  }, []);
  if (!enabled) return null;
  return (
    <span className="rounded bg-amber-400 px-1.5 py-0.5 text-[10px] font-extrabold tracking-widest text-amber-950">
      TEST
    </span>
  );
}

const STATE_META: Record<ShowingState, { label: string; classes: string }> = {
  AVAILABLE: { label: "Available", classes: "bg-slate-100 text-slate-700" },
  REQUESTED: { label: "Requested", classes: "bg-amber-100 text-amber-800" },
  RESIDENT_ACCEPTED: { label: "Resident accepted", classes: "bg-sky-100 text-sky-800" },
  BROKER_GATE: { label: "With broker", classes: "bg-violet-100 text-violet-800" },
  CONFIRMED: { label: "Confirmed", classes: "bg-emerald-100 text-emerald-800" },
  IN_PROGRESS: { label: "In progress", classes: "bg-indigo-100 text-indigo-800" },
  COMPLETED: { label: "Completed", classes: "bg-teal-100 text-teal-800" },
  OUTCOME: { label: "Done", classes: "bg-slate-200 text-slate-600" },
};

export function StatusPill({ state }: { state: ShowingState }) {
  const meta = STATE_META[state];
  return (
    <span
      className={`inline-block rounded-full px-3 py-1 text-xs font-semibold ${meta.classes}`}
    >
      {meta.label}
    </span>
  );
}

export function MobileShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto w-full max-w-md px-4 pb-16">{children}</div>
    </div>
  );
}

export function MobileHeader({
  title,
  email,
  onSignOut,
}: {
  title: string;
  email: string;
  onSignOut: () => void;
}) {
  return (
    <header className="flex items-center gap-3 py-5">
      <BrandMark className="h-10 w-10" />
      <div className="min-w-0 flex-1">
        <h1 className="flex items-center gap-2 truncate text-lg font-bold text-brand-navy">
          {title}
          <MobileTestBadge />
        </h1>
        <p className="truncate text-xs text-slate-500">{email}</p>
      </div>
      <button
        type="button"
        onClick={onSignOut}
        className="min-h-[44px] rounded-lg px-3 text-sm font-medium text-slate-500 hover:text-slate-800"
      >
        Sign out
      </button>
    </header>
  );
}

export function MCard({ children }: { children: ReactNode }) {
  return (
    <div className="mb-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      {children}
    </div>
  );
}

type ButtonKind = "primary" | "secondary" | "danger" | "ghost";

const BUTTON_KINDS: Record<ButtonKind, string> = {
  primary: "bg-brand-violet text-white hover:bg-brand-violet-light",
  secondary: "border border-slate-300 bg-white text-slate-700 hover:border-brand-violet/50",
  danger: "bg-red-600 text-white hover:bg-red-700",
  ghost: "text-slate-500 hover:text-slate-800",
};

export function MButton({
  children,
  onClick,
  kind = "primary",
  disabled,
  type = "button",
}: {
  children: ReactNode;
  onClick?: () => void;
  kind?: ButtonKind;
  disabled?: boolean;
  type?: "button" | "submit";
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`min-h-[44px] rounded-xl px-4 py-2.5 text-sm font-semibold transition disabled:opacity-50 ${BUTTON_KINDS[kind]}`}
    >
      {children}
    </button>
  );
}

export function SectionTitle({ children }: { children: ReactNode }) {
  return <h2 className="mb-2 mt-6 text-base font-bold text-brand-navy">{children}</h2>;
}

export function LoadingView({ message }: { message: string }) {
  return (
    <div className="flex min-h-[40vh] items-center justify-center">
      <p className="text-sm text-slate-500">{message}</p>
    </div>
  );
}

export function ErrorView({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <MCard>
      <p className="mb-3 text-sm text-red-700">{message}</p>
      <MButton kind="secondary" onClick={onRetry}>
        Retry
      </MButton>
    </MCard>
  );
}

export function EmptyView({ message }: { message: string }) {
  return (
    <MCard>
      <p className="text-center text-sm text-slate-500">{message}</p>
    </MCard>
  );
}

export function MToggle({
  label,
  hint,
  value,
  disabled,
  onChange,
}: {
  label: string;
  hint: string;
  value: boolean;
  disabled?: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex-1">
        <p className="text-sm font-semibold text-slate-800">{label}</p>
        <p className="text-xs text-slate-500">{hint}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={value}
        aria-label={label}
        disabled={disabled}
        onClick={() => onChange(!value)}
        className={`relative flex min-h-[44px] min-w-[64px] items-center rounded-full px-1 transition disabled:opacity-50 ${
          value ? "justify-end bg-brand-violet" : "justify-start bg-slate-300"
        }`}
      >
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-white text-xs font-bold text-slate-600 shadow">
          {value ? "ON" : "OFF"}
        </span>
      </button>
    </div>
  );
}

export function RatingForm({
  showingId,
  onDone,
}: {
  showingId: string;
  onDone: () => void;
}) {
  const [stars, setStars] = useState(5);
  const [comment, setComment] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setSaving(true);
    setError(null);
    try {
      await mobileApi.rateShowing(showingId, stars, comment.trim() || undefined);
      onDone();
    } catch (err) {
      setError(err instanceof MobileApiError ? err.message : "Could not save rating.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mt-3 rounded-xl bg-slate-50 p-3">
      <p className="mb-2 text-sm font-semibold text-slate-700">Rate this showing</p>
      <div className="mb-2 flex gap-1" role="radiogroup" aria-label="Stars">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={stars === n}
            aria-label={`${n} star${n > 1 ? "s" : ""}`}
            onClick={() => setStars(n)}
            className="flex min-h-[44px] min-w-[44px] items-center justify-center text-2xl"
          >
            <span className={n <= stars ? "text-amber-400" : "text-slate-300"}>★</span>
          </button>
        ))}
      </div>
      <textarea
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        placeholder="Comment (optional, 500 chars max)"
        maxLength={500}
        rows={2}
        className="mb-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-brand-violet focus:outline-none focus:ring-2 focus:ring-brand-violet/30"
      />
      {error && <p className="mb-2 text-sm text-red-700">{error}</p>}
      <div className="flex gap-2">
        <div className="flex-1">
          <MButton disabled={saving} onClick={submit}>
            {saving ? "Saving…" : "Submit rating"}
          </MButton>
        </div>
        <MButton kind="ghost" disabled={saving} onClick={onDone}>
          Cancel
        </MButton>
      </div>
    </div>
  );
}

export function ShowingCard({
  showing,
  unitLabel,
  children,
}: {
  showing: Showing;
  unitLabel: string;
  children?: ReactNode;
}) {
  return (
    <MCard>
      <div className="mb-1 flex items-center justify-between gap-2">
        <h3 className="text-sm font-bold text-slate-900">Unit {unitLabel}</h3>
        <StatusPill state={showing.state} />
      </div>
      <p className="mb-3 text-xs text-slate-500">
        Requested {new Date(showing.createdAt).toLocaleDateString()}
      </p>
      {children}
    </MCard>
  );
}
