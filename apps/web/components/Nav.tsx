"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { User } from "../lib/session";
import { BrandMark } from "./brand/BrandMark";
import { TestModeBadge } from "./TestModeBar";

const ROLE_LABELS: Record<string, string> = {
  management: "Management",
  inssnapp_admin: "Control Center",
  resident: "Resident",
  prospect: "Prospect",
  broker: "Broker",
};

export function Nav({ user, isControl }: { user: User; isControl: boolean }) {
  const router = useRouter();

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  }

  return (
    <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/80 backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6 lg:px-8">
        <div className="flex items-center gap-3">
          <Link href="/admin" className="flex items-center gap-2.5 text-lg font-bold tracking-tight text-slate-900">
            <BrandMark className="h-8 w-8" />
            INSSNAPP
          </Link>
          <span className="hidden rounded-full bg-brand-violet/10 px-2.5 py-0.5 text-xs font-medium text-brand-violet sm:inline">
            {ROLE_LABELS[user.role] ?? user.role}
          </span>
          <TestModeBadge />
        </div>

        <nav className="flex items-center gap-1 sm:gap-2">
          <Link
            href="/admin"
            className="rounded-lg px-3 py-1.5 text-sm font-medium text-slate-600 transition hover:bg-slate-100 hover:text-slate-900"
          >
            Dashboard
          </Link>
          {isControl && (
            <Link
              href="/control"
              className="rounded-lg px-3 py-1.5 text-sm font-medium text-slate-600 transition hover:bg-slate-100 hover:text-slate-900"
            >
              Control Center
            </Link>
          )}
          <span className="mx-2 hidden h-5 w-px bg-slate-200 sm:block" />
          <span className="hidden text-sm text-slate-500 sm:block">{user.fullName}</span>
          <button
            onClick={logout}
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-600 transition hover:bg-slate-100 hover:text-slate-900"
          >
            Sign out
          </button>
        </nav>
      </div>
    </header>
  );
}
