/**
 * TASK-011 — public site header.
 * Server component, plain anchors only (renders in tests via
 * react-dom/server). No session or store access.
 *
 * Brand enforcement: the official INSSNAPP puzzle-piece logo
 * (components/brand/BrandMark) and the navy/violet brand palette.
 *
 * Mobile navigation is a CSS-only <details>/<summary> hamburger toggle,
 * so this stays a server component with no client JavaScript.
 */

import { NAV_LINKS } from "./marketing-content";
import { BrandMark } from "../brand/BrandMark";

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-10 border-b border-brand-navy-light/15 bg-white/90 backdrop-blur">
      <div className="relative mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
        <a href="/" className="flex items-center gap-2.5">
          <BrandMark className="h-12 w-12" />
          <span className="flex flex-col leading-none">
            <span className="text-lg font-bold tracking-tight text-brand-navy">INSSNAPP</span>
            <span className="text-xs font-semibold tracking-widest text-brand-violet">
              THE MISSING TILE™
            </span>
          </span>
        </a>

        {/* Desktop nav */}
        <nav className="hidden items-center gap-1 sm:gap-2 md:flex" aria-label="Primary">
          {NAV_LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="rounded-lg px-3 py-1.5 text-sm font-medium text-brand-navy-light transition hover:bg-brand-violet/10 hover:text-brand-navy"
            >
              {link.label}
            </a>
          ))}
          <a
            href="/login"
            className="rounded-lg bg-gradient-to-r from-brand-violet to-brand-violet-light px-4 py-1.5 text-sm font-semibold text-white shadow-md shadow-brand-violet/25 transition hover:-translate-y-0.5 hover:shadow-lg hover:shadow-brand-violet/35 hover:brightness-110"
          >
            Sign in
          </a>
        </nav>

        {/* Mobile hamburger — CSS-only details/summary toggle */}
        <details className="md:hidden">
          <summary
            className="flex cursor-pointer list-none items-center justify-center rounded-lg p-2 text-brand-navy transition hover:bg-brand-violet/10 [&::-webkit-details-marker]:hidden"
            aria-label="Open menu"
          >
            <svg
              viewBox="0 0 24 24"
              className="h-6 w-6"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              aria-hidden="true"
            >
              <path d="M4 7h16M4 12h16M4 17h16" />
            </svg>
          </summary>
          <nav
            aria-label="Mobile"
            className="absolute inset-x-4 top-full z-20 rounded-2xl border border-brand-navy-light/15 bg-white p-3 shadow-xl"
          >
            {NAV_LINKS.map((link) => (
              <a
                key={link.href}
                href={link.href}
                className="block rounded-lg px-3 py-2.5 text-sm font-medium text-brand-navy-light transition hover:bg-brand-violet/10 hover:text-brand-navy"
              >
                {link.label}
              </a>
            ))}
            <a
              href="/login"
              className="mt-2 block rounded-lg bg-gradient-to-r from-brand-violet to-brand-violet-light px-3 py-2.5 text-center text-sm font-semibold text-white shadow-md shadow-brand-violet/25 transition hover:brightness-110"
            >
              Sign in
            </a>
          </nav>
        </details>
      </div>
    </header>
  );
}
