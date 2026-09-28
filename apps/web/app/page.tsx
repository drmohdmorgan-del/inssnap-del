/**
 * TASK-011 — public landing page.
 *
 * Fully static server component: no auth, no database, no session state.
 * Public copy only — nothing on this page may leak organization data.
 */

import type { Metadata } from "next";
import { SiteHeader } from "../components/marketing/SiteHeader";
import { BrandMark } from "../components/brand/BrandMark";
import { SiteFooter } from "../components/marketing/SiteFooter";
import { Card, CheckList, CtaBand, NavyBand, SectionHeading } from "../components/marketing/marketing-ui";
import { SectionDivider } from "../components/marketing/SectionDivider";
import {
  MOBILE_NOTE,
  ROLE_CARDS,
  WORKFLOW_STEPS,
} from "../components/marketing/marketing-content";

export const metadata: Metadata = {
  title: "INSSNAPP — Resident-Powered Leasing Infrastructure",
  description:
    "The Missing Tile in real-time occupied-unit showing coordination. End-to-end workflow from management sign-up to lease.",
};

const WORKFLOW_PREVIEW = WORKFLOW_STEPS.slice(0, 5);

export default function HomePage() {
  return (
    <div className="min-h-screen bg-white">
      <SiteHeader />

      <main>
        {/* Hero */}
        <NavyBand>
          <div className="mx-auto grid max-w-6xl items-center gap-10 px-4 py-16 sm:px-6 lg:grid-cols-2 lg:py-24">
            <div>
              <BrandMark className="h-16 w-16" />
              <p className="mt-4 inline-flex items-center gap-2 rounded-full border border-brand-violet-light/40 bg-white/5 px-3 py-1 text-xs font-semibold text-brand-violet-light">
                In development — preparing for pilot
              </p>
              <h1 className="mt-4 text-4xl font-bold tracking-tight text-white sm:text-5xl">
                Resident-Powered{" "}
                <span className="bg-gradient-to-r from-brand-violet-light to-brand-violet bg-clip-text text-transparent">
                  Leasing Infrastructure
                </span>
              </h1>
              <p className="mt-4 text-lg text-white/70">
                The Missing Tile™ in real-time occupied-unit showing
                coordination. INSSNAPP coordinates resident availability,
                prospect requests, optional broker participation, and showing
                status — while property management stays the system of record.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <a
                  href="/login"
                  className="rounded-xl bg-gradient-to-r from-brand-violet to-brand-violet-light px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-brand-violet/30 transition hover:-translate-y-0.5 hover:shadow-xl hover:shadow-brand-violet/40 hover:brightness-110"
                >
                  Sign in
                </a>
                <a
                  href="/how-it-works"
                  className="rounded-xl border border-white/25 bg-white/5 px-6 py-3 text-sm font-semibold text-white transition hover:-translate-y-0.5 hover:border-brand-violet-light/60 hover:bg-white/10"
                >
                  See how it works
                </a>
              </div>
            </div>
            <div className="hidden lg:block">
              <div className="rounded-3xl border border-white/10 bg-white/5 p-8 shadow-2xl backdrop-blur">
                <div className="mb-4 flex items-center gap-3">
                  <BrandMark className="h-10 w-10" />
                  <p className="text-sm font-semibold text-white">
                    End-to-end workflow
                  </p>
                </div>
                <p className="text-sm text-white/60">
                  From management sign up to lease — management owns the
                  platform, the leads, and the prospects.
                </p>
                <ol className="mt-5 space-y-3">
                  {WORKFLOW_PREVIEW.map((step, i) => (
                    <li key={step.title} className="flex items-start gap-3">
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-r from-brand-violet to-brand-violet-light text-xs font-bold text-white shadow-md shadow-brand-violet/40">
                        {i + 1}
                      </span>
                      <div>
                        <p className="text-sm font-semibold text-white">{step.title}</p>
                        <p className="text-xs text-white/60">{step.detail}</p>
                      </div>
                    </li>
                  ))}
                </ol>
                <a
                  href="/how-it-works"
                  className="mt-5 inline-block text-sm font-semibold text-brand-violet-light hover:text-white"
                >
                  View the full workflow →
                </a>
              </div>
            </div>
          </div>
        </NavyBand>

        <SectionDivider />

        {/* Roles */}
        <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
          <SectionHeading
            eyebrow="Who it serves"
            title="Five roles, one coordinated workflow"
            intro="Management, Control Center, residents, prospects, and brokers each get an experience built for their part of the showing."
          />
          <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {ROLE_CARDS.map((role) => (
              <Card key={role.role} title={`${role.role} · ${role.platform}`}>
                <p className="font-medium text-brand-navy-light">{role.headline}</p>
                <CheckList items={role.bullets.slice(0, 3)} />
              </Card>
            ))}
          </div>
          <p className="mt-6 text-center">
            <a href="/roles" className="text-sm font-semibold text-brand-violet hover:text-brand-violet-light">
              Explore each role experience →
            </a>
          </p>
        </section>

        <SectionDivider />

        {/* Mobile */}
        <NavyBand>
          <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
            <SectionHeading
              dark
              eyebrow="Mobile"
              title="iOS and Android, one codebase"
              intro={MOBILE_NOTE}
            />
            <div className="mx-auto mt-10 grid max-w-4xl gap-5 sm:grid-cols-3">
              <Card title="Resident app">
                Available NOW toggle, request inbox, accept/decline, live
                status, completion and rating.
              </Card>
              <Card title="Prospect app">
                Unit discovery, request showing, live status, Apply / Watch /
                Decline.
              </Card>
              <Card title="Broker app">
                Assignment queue, accept/decline, check-in, completion and
                rating.
              </Card>
            </div>
          </div>
        </NavyBand>

        <SectionDivider />

        {/* Services teaser */}
        <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
          <SectionHeading
            eyebrow="What it includes"
            title="Services built for occupied-unit leasing"
            intro="The engine, the portals, and the mobile experiences — designed for a controlled pilot."
          />
          <div className="mt-10 grid gap-5 sm:grid-cols-2">
            <Card title="Showing Engine coordination">
              An authoritative state machine with unit locking, idempotent
              transitions, role policy, and immutable audit events.
            </Card>
            <Card title="Management & Control Center portals">
              Desktop operations for property teams and the INSSNAPP super-admin
              surface for platform health, integrations, and audit.
            </Card>
            <Card title="Resident, prospect & broker mobile">
              One-screen workflows on iOS and Android — availability, requests,
              assignments, check-in, and outcomes.
            </Card>
            <Card title="Integrations in development">
              PMS synchronization boundary and screening sandbox — syncing
              eligibility while management stays the system of record.
            </Card>
          </div>
          <p className="mt-6 text-center">
            <a href="/services" className="text-sm font-semibold text-brand-violet hover:text-brand-violet-light">
              See all services →
            </a>
          </p>
        </section>

        <SectionDivider />

        <CtaBand
          title="Coordinating occupied-unit showings?"
          body="INSSNAPP is being built for management teams running occupied-unit leasing — sign in to the portal or contact us to discuss a pilot."
        />
      </main>

      <SiteFooter />
    </div>
  );
}
