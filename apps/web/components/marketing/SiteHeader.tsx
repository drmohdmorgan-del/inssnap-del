/**
 * TASK-011 — public site header.
 * Server component, plain anchors only (renders in tests via
 * react-dom/server). No session or store access.
 */

import { NAV_LINKS } from "./marketing-content";

/** Simple puzzle-tile mark built with SVG — no external assets. */
export function TileMark({ className = "h-8 w-8" }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden="true">
      <rect x="4" y="4" width="40" height="40" rx="8" fill="#4f46e5" />
      <rect x="14" y="14" width="20" height="20" rx="4" fill="#ffffff" opacity="0.92" />
      <circle cx="24" cy="9" r="5" fill="#4f46e5" />
      <circle cx="24" cy="39" r="5" fill="#4f46e5" />
      <circle cx="9" cy="24" r="5" fill="#ffffff" opacity="0.92" />
      <circle cx="39" cy="24" r="5" fill="#ffffff" opacity="0.92" />
    </svg>
  );
}

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/90 backdrop-blur">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
        <a href="/" className="flex items-center gap-2.5">
          <TileMark />
          <span className="flex flex-col leading-none">
            <span className="text-lg font-bold tracking-tight text-slate-900">INSSNAPP</span>
            <span className="text-xs text-slate-500">The Missing Tile™</span>
          </span>
        </a>
        <nav className="flex flex-wrap items-center gap-1 sm:gap-2" aria-label="Primary">
          {NAV_LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="rounded-lg px-3 py-1.5 text-sm font-medium text-slate-600 transition hover:bg-slate-100 hover:text-slate-900"
            >
              {link.label}
            </a>
          ))}
          <a
            href="/login"
            className="rounded-lg bg-indigo-600 px-4 py-1.5 text-sm font-semibold text-white transition hover:bg-indigo-700"
          >
            Sign in
          </a>
        </nav>
      </div>
    </header>
  );
}
