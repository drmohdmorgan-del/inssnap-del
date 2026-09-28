/**
 * TASK-011 — public site header.
 * Server component, plain anchors only (renders in tests via
 * react-dom/server). No session or store access.
 *
 * Brand enforcement: the official INSSNAPP puzzle-piece logo
 * (components/brand/BrandMark) and the navy/violet brand palette.
 */

import { NAV_LINKS } from "./marketing-content";
import { BrandMark } from "../brand/BrandMark";

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/90 backdrop-blur">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
        <a href="/" className="flex items-center gap-2.5">
          <BrandMark className="h-9 w-9" />
          <span className="flex flex-col leading-none">
            <span className="text-lg font-bold tracking-tight text-slate-900">INSSNAPP</span>
            <span className="text-xs font-semibold tracking-widest text-brand-violet">
              THE MISSING TILE™
            </span>
          </span>
        </a>
        <nav className="flex flex-wrap items-center gap-1 sm:gap-2" aria-label="Primary">
          {NAV_LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="rounded-lg px-3 py-1.5 text-sm font-medium text-slate-600 transition hover:bg-brand-violet/10 hover:text-brand-navy"
            >
              {link.label}
            </a>
          ))}
          <a
            href="/login"
            className="rounded-lg bg-gradient-to-r from-brand-violet to-brand-violet-light px-4 py-1.5 text-sm font-semibold text-white transition hover:opacity-90"
          >
            Sign in
          </a>
        </nav>
      </div>
    </header>
  );
}
