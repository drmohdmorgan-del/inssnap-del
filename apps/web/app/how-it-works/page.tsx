/**
 * TASK-011 — public how-it-works page (workflow deep-dive).
 * Static server component: no auth, no database, no session state.
 */

import type { Metadata } from "next";
import { SiteHeader } from "../../components/marketing/SiteHeader";
import { SiteFooter } from "../../components/marketing/SiteFooter";
import { Card, CtaBand, SectionHeading } from "../../components/marketing/marketing-ui";
import { WORKFLOW_STEPS } from "../../components/marketing/marketing-content";

export const metadata: Metadata = {
  title: "How it works — INSSNAPP",
  description:
    "The INSSNAPP end-to-end workflow: from management sign up to lease — Management sync, Resident Available NOW, prospect request, resident accept, broker gate, confirmation, showing, completion, Apply / Watch / Decline.",
};

export default function HowItWorksPage() {
  return (
    <div className="min-h-screen bg-slate-50">
      <SiteHeader />
      <main>
        <section className="mx-auto max-w-4xl px-4 py-14 sm:px-6">
          <SectionHeading
            eyebrow="How it works"
            title="From management sign up to lease"
            intro="The end-to-end workflow: management owns the platform, the leads, and the prospects. Each step hands off cleanly to the next — and the Showing Engine guards every transition."
          />

          <ol className="mt-10 space-y-4">
            {WORKFLOW_STEPS.map((step, i) => (
              <li
                key={step.title}
                className="flex gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-indigo-600 text-sm font-bold text-white">
                  {i + 1}
                </span>
                <div>
                  <h3 className="text-base font-semibold text-slate-900">{step.title}</h3>
                  <p className="mt-1 text-sm text-slate-600">{step.detail}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        <section className="bg-white">
          <div className="mx-auto max-w-4xl px-4 py-14 sm:px-6">
            <SectionHeading
              eyebrow="Engine states"
              title="One authoritative state machine"
              intro="The Showing Engine moves each workflow through these states — portals and mobile apps request transitions, the engine approves them."
            />
            <div className="mt-8 flex flex-wrap items-center justify-center gap-2">
              {[
                "AVAILABLE",
                "REQUESTED",
                "RESIDENT_ACCEPTED",
                "BROKER_GATE",
                "CONFIRMED",
                "IN_PROGRESS",
                "COMPLETED",
                "OUTCOME",
              ].map((state) => (
                <span
                  key={state}
                  className="rounded-full bg-indigo-50 px-3 py-1.5 font-mono text-xs font-semibold text-indigo-700"
                >
                  {state}
                </span>
              ))}
            </div>
            <div className="mt-10 grid gap-5 sm:grid-cols-2">
              <Card title="Eligibility is enforced up front">
                A prospect can't request a unit unless it's eligible and the
                resident's availability is active. Invalid requests are
                rejected before they start.
              </Card>
              <Card title="Locks prevent conflicts">
                Confirmation creates a unit lock so no two active showings can
                claim the same unit; completion releases it.
              </Card>
              <Card title="Retries are safe">
                Caller idempotency keys make repeated or concurrent requests
                replay safely instead of double-booking.
              </Card>
              <Card title="Everything is audited">
                Each material transition records actor, organization, timestamp,
                and the state change — a complete trail for operations and
                review.
              </Card>
            </div>
          </div>
        </section>

        <CtaBand
          title="Follow the full workflow live"
          body="The workflow is running in the portal today — sign in to explore the management and Control Center views, or contact us about a pilot."
        />
      </main>
      <SiteFooter />
    </div>
  );
}
