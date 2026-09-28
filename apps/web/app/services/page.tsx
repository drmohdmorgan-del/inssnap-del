/**
 * TASK-011 — public services page.
 * Static server component: no auth, no database, no session state.
 */

import type { Metadata } from "next";
import { SiteHeader } from "../../components/marketing/SiteHeader";
import { BrandMark } from "../../components/brand/BrandMark";
import { SectionDivider } from "../../components/marketing/SectionDivider";
import { SiteFooter } from "../../components/marketing/SiteFooter";
import { Card, CheckList, CtaBand, NavyBand, SectionHeading } from "../../components/marketing/marketing-ui";
import { MOBILE_NOTE, SERVICE_CARDS } from "../../components/marketing/marketing-content";

export const metadata: Metadata = {
  title: "Services — INSSNAPP",
  description:
    "All INSSNAPP services: Showing Engine coordination, management and Control Center portals, resident, prospect, and broker mobile experiences.",
};

export default function ServicesPage() {
  return (
    <div className="min-h-screen bg-white">
      <SiteHeader />
      <main>
        <NavyBand>
          <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
            <div className="mb-8 flex justify-center">
              <BrandMark className="h-16 w-16" />
            </div>
            <SectionHeading
              dark
              eyebrow="Services"
              title="All services, one coordinated platform"
              intro="INSSNAPP is a real-time leasing coordination layer for occupied residential units. These are the services being built for the pilot — management remains the system of record for property and unit eligibility throughout."
            />
          </div>
        </NavyBand>

        <section className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
          <div className="mt-10 grid gap-5 md:grid-cols-2">
            {SERVICE_CARDS.map((service) => (
              <Card key={service.title} title={service.title}>
                <p>{service.detail}</p>
                <CheckList items={service.bullets} />
              </Card>
            ))}
          </div>
        </section>

        <SectionDivider />

        <NavyBand>
          <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
            <SectionHeading
              dark
              eyebrow="Mobile"
              title="One Expo codebase, three experiences"
              intro={MOBILE_NOTE}
            />
            <div className="mx-auto mt-8 grid max-w-4xl gap-5 sm:grid-cols-3">
              <Card title="Resident">Available NOW toggle, accept/decline, live status.</Card>
              <Card title="Prospect">Discovery, request showing, Apply / Watch / Decline.</Card>
              <Card title="Broker">Assignment queue, check-in, completion, rating.</Card>
            </div>
          </div>
        </NavyBand>

        <section className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
          <div className="mb-8 flex justify-center">
            <BrandMark className="h-16 w-16" />
          </div>
          <SectionHeading
            eyebrow="Design principles"
            title="Built for trust in occupied units"
          />
          <div className="mt-8 grid gap-5 sm:grid-cols-2">
            <Card title="Resident stays in control">
              Showings only move forward when the resident accepts. Private
              resident contact information is never shared with prospects.
            </Card>
            <Card title="Engine is the authority">
              The Showing Engine is the sole authority for state changes —
              portals and mobile apps request transitions; they don't make
              workflow rules.
            </Card>
            <Card title="No double-booking">
              Confirmation locks the unit so conflicting active showings can't
              overlap; completion releases the lock.
            </Card>
            <Card title="Auditable by design">
              Every material transition emits an immutable event with actor,
              organization, timestamp, and state change.
            </Card>
          </div>
        </section>

        <SectionDivider />

        <CtaBand
          title="See the services in action"
          body="Sign in to the portal or contact us to discuss a pilot of the INSSNAPP services."
        />
      </main>
      <SiteFooter />
    </div>
  );
}
