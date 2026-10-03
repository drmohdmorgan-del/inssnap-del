import Link from "next/link";
import { BrandMark } from "../../components/brand/BrandMark";

const ROLES = [
  {
    href: "/m/resident",
    title: "Current Tenant",
    blurb: "Manage availability, answer showing requests, and track live showings.",
    accent: "bg-brand-navy",
  },
  {
    href: "/m/prospect",
    title: "Prospect",
    blurb: "Find available units, request showings, and track your requests live.",
    accent: "bg-brand-violet",
  },
  {
    href: "/m/broker",
    title: "Broker",
    blurb: "Work your assignment queue — accept, check in, complete, and rate.",
    accent: "bg-brand-navy-light",
  },
];

export default function MobileLandingPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-b from-brand-navy to-brand-navy-light p-4">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <BrandMark className="mx-auto h-16 w-16" />
          <h1 className="mt-4 text-3xl font-bold tracking-tight text-white">INSSNAPP</h1>
          <p className="mt-1 text-sm text-slate-300">Mobile — Tenant, Prospect &amp; Broker</p>
        </div>

        <div className="space-y-4">
          {ROLES.map((r) => (
            <Link
              key={r.href}
              href={r.href}
              className={`flex min-h-[88px] items-center gap-4 rounded-2xl ${r.accent} p-5 shadow-lg transition active:scale-[0.98]`}
            >
              <div className="flex-1">
                <h2 className="text-lg font-bold text-white">{r.title}</h2>
                <p className="mt-0.5 text-sm text-slate-200">{r.blurb}</p>
              </div>
              <span aria-hidden="true" className="text-2xl text-white/70">
                →
              </span>
            </Link>
          ))}
        </div>

        <p className="mt-6 text-center text-xs leading-relaxed text-slate-400">
          Everything you do here syncs live with the desktop Control Center —
          same showings, same engine, same records.
        </p>
        <p className="mt-2 text-center text-xs text-slate-500">
          <Link href="/login" className="underline hover:text-slate-300">
            Sign in
          </Link>
        </p>
      </div>
    </main>
  );
}
