/**
 * Public contact-us landing page.
 * Static server component: no auth, no database, no session state.
 * The form posts to /api/contact (ContactForm, client component).
 */

import type { Metadata } from "next";
import { SiteHeader } from "../../components/marketing/SiteHeader";
import { SiteFooter } from "../../components/marketing/SiteFooter";
import { BrandMark } from "../../components/brand/BrandMark";
import { Card, NavyBand, SectionHeading } from "../../components/marketing/marketing-ui";
import { ContactForm } from "./ContactForm";

export const metadata: Metadata = {
  title: "Contact us — INSSNAPP",
  description:
    "Talk to the INSSNAPP team about pilots, partnerships, and the Showing Engine.",
};

export default function ContactPage() {
  return (
    <div className="min-h-screen bg-white">
      <SiteHeader />
      <main>
        <NavyBand>
          <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
            <div className="mb-6 flex justify-center">
              <BrandMark className="h-16 w-16" />
            </div>
            <SectionHeading
              dark
              eyebrow="Contact"
              title="Talk to the INSSNAPP team"
              intro="Questions about a pilot, partnerships, or how the Showing Engine fits your portfolio? Send us a note — a human replies to every message."
            />
          </div>
        </NavyBand>

        <section className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
          <div className="grid gap-8 lg:grid-cols-5">
            <div className="lg:col-span-3">
              <ContactForm />
            </div>
            <div className="flex flex-col gap-5 lg:col-span-2">
              <Card title="Email us directly">
                <p>
                  Prefer your own inbox? Reach us anytime at{" "}
                  <a
                    href="mailto:info@inssnapp.com"
                    className="font-semibold text-brand-violet hover:text-brand-violet-light"
                  >
                    info@inssnapp.com
                  </a>
                  .
                </p>
              </Card>
              <Card title="Running a pilot">
                <p>
                  Tell us about your portfolio — unit count, markets, and your
                  current showing workflow. We will map out what a controlled
                  pilot looks like for your team.
                </p>
              </Card>
              <Card title="What happens next">
                <p>
                  Your message lands directly with the INSSNAPP team. Expect a
                  personal reply, not an autoresponder — usually within one
                  business day.
                </p>
              </Card>
            </div>
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
