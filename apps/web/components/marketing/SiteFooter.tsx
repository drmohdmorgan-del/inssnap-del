/**
 * TASK-011 — public site footer.
 * Server component. Static copy only — no org data, no session access.
 */

import { NAV_LINKS } from "./marketing-content";
import { BrandMark } from "../brand/BrandMark";

export function SiteFooter() {
  return (
    <footer className="border-t border-brand-navy-light/15 bg-brand-navy-light/5">
      {/* Brand lockup */}
      <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 pb-2 pt-8 sm:px-6">
        <BrandMark className="h-10 w-10" />
        <span className="flex flex-col leading-none">
          <span className="text-lg font-bold tracking-tight text-brand-navy">INSSNAPP</span>
          <span className="text-xs font-semibold tracking-widest text-brand-violet">
            THE MISSING TILE™
          </span>
        </span>
      </div>
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-8 sm:grid-cols-3 sm:px-6">
        <div>
          <p className="text-lg font-bold tracking-tight text-brand-navy">INSSNAPP</p>
          <p className="mt-2 text-sm text-brand-navy-light">
            Resident-Powered Leasing Infrastructure — The Missing Tile™ in
            real-time occupied-unit showing coordination.
          </p>
        </div>
        <nav aria-label="Footer">
          <p className="text-sm font-semibold text-brand-navy">Explore</p>
          <ul className="mt-2 space-y-1.5">
            {NAV_LINKS.map((link) => (
              <li key={link.href}>
                <a href={link.href} className="text-sm text-brand-navy-light hover:text-brand-navy">
                  {link.label}
                </a>
              </li>
            ))}
            <li>
              <a href="/login" className="text-sm text-brand-navy-light hover:text-brand-navy">
                Sign in
              </a>
            </li>
          </ul>
        </nav>
        <div>
          <p className="text-sm font-semibold text-brand-navy">Contact</p>
          <p className="mt-2 text-sm text-brand-navy-light">
            To discuss a pilot or partnership, reach the INSSNAPP team at{" "}
            <a
              href="mailto:info@inssnapp.com"
              className="font-medium text-brand-violet hover:text-brand-violet-light"
            >
              info@inssnapp.com
            </a>
            .
          </p>
        </div>
      </div>
      <div className="border-t border-brand-navy-light/15">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-4 py-4 sm:px-6">
          <p className="text-xs text-brand-navy-light/60">
            © 2026 INSSNAPP. All rights reserved.
          </p>
          <p className="text-xs text-brand-navy-light/60">
            Currently in development and pilot — product details may change.
          </p>
        </div>
      </div>
    </footer>
  );
}
