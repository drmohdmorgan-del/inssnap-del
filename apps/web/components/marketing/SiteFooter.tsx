/**
 * TASK-011 — public site footer.
 * Server component. Static copy only — no org data, no session access.
 */

import { NAV_LINKS } from "./marketing-content";

export function SiteFooter() {
  return (
    <footer className="border-t border-slate-200 bg-slate-50">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 sm:grid-cols-3 sm:px-6">
        <div>
          <p className="text-lg font-bold tracking-tight text-slate-900">INSSNAPP</p>
          <p className="mt-2 text-sm text-slate-600">
            Resident-Powered Leasing Infrastructure — The Missing Tile™ in
            real-time occupied-unit showing coordination.
          </p>
        </div>
        <nav aria-label="Footer">
          <p className="text-sm font-semibold text-slate-900">Explore</p>
          <ul className="mt-2 space-y-1.5">
            {NAV_LINKS.map((link) => (
              <li key={link.href}>
                <a href={link.href} className="text-sm text-slate-600 hover:text-slate-900">
                  {link.label}
                </a>
              </li>
            ))}
            <li>
              <a href="/login" className="text-sm text-slate-600 hover:text-slate-900">
                Sign in
              </a>
            </li>
          </ul>
        </nav>
        <div>
          <p className="text-sm font-semibold text-slate-900">Contact</p>
          <p className="mt-2 text-sm text-slate-600">
            To discuss a pilot or partnership, reach the INSSNAPP team at{" "}
            <a
              href="mailto:info@inssnapp.com"
              className="font-medium text-indigo-600 hover:text-indigo-800"
            >
              info@inssnapp.com
            </a>
            .
          </p>
        </div>
      </div>
      <div className="border-t border-slate-200">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-4 py-4 sm:px-6">
          <p className="text-xs text-slate-500">
            © 2026 INSSNAPP. All rights reserved.
          </p>
          <p className="text-xs text-slate-500">
            Currently in development and pilot — product details may change.
          </p>
        </div>
      </div>
    </footer>
  );
}
