/**
 * Branded 404 — keeps lost visitors inside the INSSNAPP brand.
 * Static server component: no auth, no database, no session state.
 */

import type { Metadata } from "next";
import { SiteHeader } from "../components/marketing/SiteHeader";
import { SiteFooter } from "../components/marketing/SiteFooter";
import { BrandMark } from "../components/brand/BrandMark";
import { NAV_LINKS } from "../components/marketing/marketing-content";

export const metadata: Metadata = {
  title: "Page not found — INSSNAPP",
  description: "The page you were looking for doesn't exist. Return to INSSNAPP.",
};

export default function NotFound() {
  return (
    <div className="min-h-screen bg-white">
      <SiteHeader />
      <main className="mx-auto flex max-w-2xl flex-col items-center px-4 py-20 text-center sm:px-6 sm:py-28">
        <BrandMark className="h-20 w-20" />
        <p className="mt-6 text-xs font-semibold uppercase tracking-widest text-brand-violet">
          404
        </p>
        <h1 className="mt-2 text-4xl font-bold tracking-tight text-brand-navy sm:text-5xl">
          This tile is missing
        </h1>
        <p className="mt-4 text-lg text-brand-navy-light">
          The page you were looking for doesn't exist or has moved. INSSNAPP is
          in development and pilot — the site map is still taking shape.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <a
            href="/"
            className="rounded-xl bg-gradient-to-r from-brand-violet to-brand-violet-light px-6 py-3 text-sm font-semibold text-white shadow transition hover:opacity-90"
          >
            Back home
          </a>
          <a
            href="/how-it-works"
            className="rounded-xl border border-brand-navy-light/25 bg-white px-6 py-3 text-sm font-semibold text-brand-navy-light transition hover:bg-brand-navy-light/10"
          >
            See how it works
          </a>
        </div>
        <nav aria-label="Not found" className="mt-10 flex flex-wrap items-center justify-center gap-x-5 gap-y-2">
          {NAV_LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="text-sm font-medium text-brand-violet hover:text-brand-violet-light"
            >
              {link.label}
            </a>
          ))}
          <a href="/login" className="text-sm font-medium text-brand-violet hover:text-brand-violet-light">
            Sign in
          </a>
        </nav>
      </main>
      <SiteFooter />
    </div>
  );
}
