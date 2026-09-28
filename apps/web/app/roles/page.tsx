/**
 * TASK-011 — public roles page (role experiences).
 * Static server component: no auth, no database, no session state.
 */

import type { Metadata } from "next";
import { SiteHeader } from "../../components/marketing/SiteHeader";
import { SiteFooter } from "../../components/marketing/SiteFooter";
import { Card, CheckList, CtaBand, SectionHeading } from "../../components/marketing/marketing-ui";
import { MOBILE_NOTE, ROLE_CARDS } from "../../components/marketing/marketing-content";

export const metadata: Metadata = {
  title: "Roles — INSSNAPP",
  description:
    "The five INSSNAPP roles: Management, Control Center / Super Admin, Resident, Prospect, and Broker — and what each gets.",
};

export default function RolesPage() {
  return (
    <div className="min-h-screen bg-slate-50">
      <SiteHeader />
      <main>
        <section className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
          <SectionHeading
            eyebrow="Roles"
            title="Five roles, five purpose-built experiences"
            intro="Every role sees only what it needs for its part of the showing. Web portals for operations teams; mobile for residents, prospects, and brokers."
          />
          <div className="mt-10 grid gap-5 md:grid-cols-2">
            {ROLE_CARDS.map((role) => (
              <Card key={role.role} title={role.role}>
                <p className="mb-1">
                  <span className="inline-block rounded-full bg-brand-violet/10 px-2.5 py-0.5 text-xs font-semibold text-brand-violet">
                    {role.platform}
                  </span>
                </p>
                <p className="font-medium text-slate-800">{role.headline}</p>
                <CheckList items={role.bullets} />
              </Card>
            ))}
          </div>
        </section>

        <section className="bg-white">
          <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
            <SectionHeading
              eyebrow="Mobile"
              title="Role-based mobile, one codebase"
              intro={MOBILE_NOTE}
            />
            <div className="mx-auto mt-8 grid max-w-4xl gap-5 sm:grid-cols-3">
              <Card title="Resident">iOS & Android — availability first.</Card>
              <Card title="Prospect">iOS & Android — discovery first.</Card>
              <Card title="Broker">iOS & Android — assignments first.</Card>
            </div>
          </div>
        </section>

        <CtaBand
          title="Which role fits you?"
          body="Sign in to the portal for the management and Control Center views, or contact us to discuss a pilot and the mobile experiences."
        />
      </main>
      <SiteFooter />
    </div>
  );
}
