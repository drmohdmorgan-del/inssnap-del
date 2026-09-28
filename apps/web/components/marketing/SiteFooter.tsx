/**
 * TASK-011 — public site footer.
 * Server component. Static copy only — no org data, no session access.
 */

import { NAV_LINKS } from "./marketing-content";
import { BrandMark } from "../brand/BrandMark";

export function SiteFooter() {
  return (
    <footer className="relative overflow-hidden bg-brand-navy">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0">
        <div className="absolute -bottom-32 left-1/3 h-72 w-72 rounded-full bg-brand-violet/20 blur-[120px]" />
        <BrandMark className="absolute -bottom-20 right-8 h-64 w-64 opacity-[0.05]" />
      </div>
      <div className="relative">
      {/* Brand lockup */}
      <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 pb-2 pt-8 sm:px-6">
        <BrandMark className="h-10 w-10" />
        <span className="flex flex-col leading-none">
          <span className="text-lg font-bold tracking-tight text-white">INSSNAPP</span>
          <span className="text-xs font-semibold tracking-widest text-brand-violet-light">
            THE MISSING TILE™
          </span>
        </span>
      </div>
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-8 sm:grid-cols-3 sm:px-6">
        <div>
          <p className="text-lg font-bold tracking-tight text-white">INSSNAPP</p>
          <p className="mt-2 text-sm text-white/60">
            Resident-Powered Leasing Infrastructure — The Missing Tile™ in
            real-time occupied-unit showing coordination.
          </p>
        </div>
        <nav aria-label="Footer">
          <p className="text-sm font-semibold text-white">Explore</p>
          <ul className="mt-2 space-y-1.5">
            {NAV_LINKS.map((link) => (
              <li key={link.href}>
                <a href={link.href} className="text-sm text-white/60 hover:text-white">
                  {link.label}
                </a>
              </li>
            ))}
            <li>
              <a href="/login" className="text-sm text-white/60 hover:text-white">
                Sign in
              </a>
            </li>
          </ul>
        </nav>
        <div>
          <p className="text-sm font-semibold text-white">Contact</p>
          <p className="mt-2 text-sm text-white/60">
            To discuss a pilot or partnership, reach the INSSNAPP team at{" "}
            <a
              href="mailto:info@inssnapp.com"
              className="font-medium text-brand-violet-light hover:text-white"
            >
              info@inssnapp.com
            </a>
            .
          </p>
        </div>
      </div>
      <div className="border-t border-white/10">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-4 py-4 sm:px-6">
          <p className="text-xs text-white/40">
            © 2026 INSSNAPP. All rights reserved.
          </p>
          <p className="text-xs text-white/40">
            Currently in development and pilot — product details may change.
          </p>
        </div>
      </div>
      </div>
    </footer>
  );
}
