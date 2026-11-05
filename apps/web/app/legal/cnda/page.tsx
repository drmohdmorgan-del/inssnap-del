/**
 * Public CNDA signing page — the IEC mutual Confidentiality &
 * Non-Disclosure Agreement covering IEC, Inc. and all Schedule A
 * assets, with the sign-this-agreement panel that creates INSNAPP
 * Demo Portal access (2026-11-05, mirroring the armed InSnap page).
 *
 * The agreement text below is the complete IEC mutual CNDA, verbatim
 * — preamble, sections 1–10, Schedule A, and the execution blocks.
 * Signing posts to /api/nda/submit, which records the signing FIRST
 * (nda_signing_records) and only then provisions demo access.
 * Static server component; the signing panel is the only client part.
 */

import type { Metadata } from "next";
import { SiteHeader } from "../../../components/marketing/SiteHeader";
import { SiteFooter } from "../../../components/marketing/SiteFooter";
import { NavyBand, SectionHeading } from "../../../components/marketing/marketing-ui";
import { SigningPanel } from "./SigningPanel";

export const metadata: Metadata = {
  title: "Mutual Non-Disclosure Agreement — INSSNAPP",
  description:
    "The IEC mutual non-disclosure agreement covering International Empire Consultants, Inc. and all of its assets listed in Schedule A. Sign on this page to create INSNAPP Demo Portal access.",
};

const SIGNATURE_BLANK = "_".repeat(52);

const SECTIONS: { heading: string; paragraphs: string[] }[] = [
  {
    heading: "1. Confidential Information",
    paragraphs: [
      '"Confidential Information" means all non-public information disclosed by one Party (the "Disclosing Party") to the other (the "Receiving Party"), whether orally, visually, or in writing, that is designated as confidential or that a reasonable person would understand to be confidential given the circumstances of disclosure. It includes, without limitation: product designs, software, source code, algorithms, technical documentation, business plans, pricing, customer and patient-related information (subject to Section 9), financial data, and marketing strategies.',
      'Exclusions. Confidential Information does not include information that: (a) is or becomes publicly available without breach of this Agreement; (b) was already known to the Receiving Party without a duty of confidentiality, as shown by written records; (c) is independently developed by the Receiving Party without use of or reference to the Disclosing Party\'s Confidential Information; or (d) is rightfully received from a third party without a duty of confidentiality.',
    ],
  },
  {
    heading: "2. Obligations",
    paragraphs: [
      "The Receiving Party shall: (a) hold the Disclosing Party's Confidential Information in strict confidence; (b) use it solely for the Purpose; (c) not disclose it to any third party except as permitted in Section 3; and (d) protect it with at least the same degree of care it uses for its own confidential information, and in no event less than reasonable care.",
    ],
  },
  {
    heading: "3. Permitted disclosures",
    paragraphs: [
      "The Receiving Party may disclose Confidential Information to its and its affiliates' employees, contractors, and professional advisors who have a need to know for the Purpose and who are bound by confidentiality obligations at least as protective as this Agreement. The Receiving Party remains responsible for any breach by such persons.",
    ],
  },
  {
    heading: "4. Legally compelled disclosure",
    paragraphs: [
      "If the Receiving Party is required by law, regulation, or court order to disclose Confidential Information, it shall (to the extent legally permitted) promptly notify the Disclosing Party and cooperate to seek confidential treatment, disclosing only the minimum information legally required.",
    ],
  },
  {
    heading: "5. No license; no obligation",
    paragraphs: [
      'Nothing in this Agreement grants any intellectual property license or right, by implication or otherwise. Neither Party is obligated to enter into any further agreement or transaction. All Confidential Information is provided "as is."',
    ],
  },
  {
    heading: "6. Return or destruction",
    paragraphs: [
      "Upon the Disclosing Party's written request, or upon termination of discussions regarding the Purpose, the Receiving Party shall promptly return or destroy all Confidential Information (including copies), except for one archival copy retained for legal compliance, which remains subject to this Agreement.",
    ],
  },
  {
    heading: "7. Term and survival",
    paragraphs: [
      "This Agreement takes effect on the Effective Date and continues for two (2) years. The obligations in Sections 1-4 and 6 survive for two (2) years from the date of each disclosure. Notwithstanding the foregoing, the Receiving Party's obligations with respect to Confidential Information that qualifies as a trade secret under applicable law shall survive for so long as such information remains a trade secret.",
    ],
  },
  {
    heading: "8. Remedies",
    paragraphs: [
      "The Parties acknowledge that breach may cause irreparable harm for which monetary damages are inadequate, and the Disclosing Party is entitled to seek injunctive relief in addition to any other remedies.",
    ],
  },
  {
    heading: "9. Protected health information",
    paragraphs: [
      'If any disclosure involves protected health information ("PHI") as defined by HIPAA, the Parties shall execute a Business Associate Agreement before any PHI is disclosed, and this Agreement does not authorize the disclosure of PHI.',
    ],
  },
  {
    heading: "10. General",
    paragraphs: [
      "This Agreement is the entire agreement on confidentiality for the Purpose and supersedes prior discussions on that subject. It may not be amended except in a signed writing. Neither Party may assign it without the other's written consent, except to a successor in a merger or asset sale. If any provision is unenforceable, the remainder continues in effect. This Agreement is governed by the laws of the Commonwealth of Massachusetts, without regard to conflict-of-law rules. The Parties consent to the exclusive jurisdiction of the state and federal courts located in the Commonwealth of Massachusetts for any dispute arising under this Agreement. No waiver of any provision of this Agreement is effective unless in a signed writing, and no waiver of one breach constitutes waiver of any other. It may be executed in counterparts, including by electronic signature.",
    ],
  },
];

const ASSETS: { name: string; description: string }[] = [
  {
    name: "MEDEXEC (getmedexec.com)",
    description: "Clinical intelligence platform for injury claims - converts medical records into litigation-ready evidence and claim valuations for plaintiff firms and carriers.",
  },
  {
    name: "CURAVIA (getcuravia.com)",
    description: "Coordinated clinic platform: 24H Doctor (24/7 clinician-backed patient access and chronic-care management), INSNAPP Medical (real-time appointment recovery), AI voice front desk, and exam-room scribe with billing-review workbench.",
  },
  {
    name: "INSNAPP Medical",
    description: "Real-time appointment-recovery engine for clinics - wait-pool backfill with EHR write-back.",
  },
  {
    name: "IEC Docs",
    description: "IEC office suite - word processing, spreadsheets, presentations, PDF tools, and electronic signature.",
  },
  {
    name: "IEC OS",
    description: "Business operating system for medical and dental practices.",
  },
  {
    name: 'SPARE ("Save Place A Ready Every")',
    description: "IEC-owned naloxone readiness program - venue-based overdose-response readiness, training, and kit placement.",
  },
  {
    name: "Zero-PHI de-identification pipeline",
    description: "IEC's de-identification technology applied across its healthcare assets.",
  },
  {
    name: "All other IEC assets",
    description: "All other software, platforms, code, data, documentation, brands, and technology assets owned or controlled by International Empire Consultants, Inc.",
  },
];

function AgreementSection({ heading, paragraphs }: { heading: string; paragraphs: string[] }) {
  return (
    <section>
      <h2 className="text-lg font-semibold text-brand-navy">{heading}</h2>
      {paragraphs.map((paragraph) => (
        <p key={paragraph} className="mt-2 text-[15px] leading-relaxed text-brand-navy/85">
          {paragraph}
        </p>
      ))}
    </section>
  );
}

function SignatureLine({ label, value }: { label: string; value?: string }) {
  return (
    <p className="mt-2 text-[15px] leading-relaxed text-brand-navy/85">
      <span className="inline-block min-w-24 font-medium text-brand-navy">{label}</span>
      <span>{value ?? SIGNATURE_BLANK}</span>
    </p>
  );
}

export default function CndaPage() {
  return (
    <div className="min-h-screen bg-white">
      <SiteHeader />
      <main>
        <NavyBand>
          <div className="mx-auto max-w-4xl px-4 py-14 sm:px-6">
            <SectionHeading
              dark
              eyebrow="Legal"
              title="Mutual Non-Disclosure Agreement"
              intro="Covering International Empire Consultants, Inc. and all of its assets listed in Schedule A"
            />
          </div>
        </NavyBand>

        <div className="mx-auto max-w-4xl space-y-10 px-4 py-14 sm:px-6">
          <section className="text-center">
            <p className="font-bold text-brand-violet">International Empire Consultants, Inc.</p>
            <p className="mt-1 text-sm text-brand-navy-light">
              iecincglobal.com | 923 Hyde Park Ave, Boston, MA 02136
            </p>
            <h2 className="mt-5 text-2xl font-bold tracking-tight text-brand-navy">
              MUTUAL NON-DISCLOSURE AGREEMENT
            </h2>
            <p className="mt-2 text-sm text-brand-navy-light">
              <span className="block">Covering International Empire Consultants, Inc. and all of its assets</span>
              <span className="block">listed in Schedule A</span>
            </p>
            <p className="mt-4">
              <a
                className="inline-block rounded-xl bg-gradient-to-r from-brand-violet to-brand-violet-light px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-brand-violet/30 transition hover:-translate-y-0.5 hover:shadow-xl hover:shadow-brand-violet/40 hover:brightness-110"
                href="/legal/iec-mutual-nda-all-assets.pdf"
                download
              >
                Download PDF
              </a>
            </p>
          </section>

          <section>
            <p className="text-[15px] leading-relaxed text-brand-navy/85">
              This Mutual Non-Disclosure Agreement (&quot;Agreement&quot;) is entered into as of
              ________________________ (&quot;Effective Date&quot;), by and between:
            </p>
            <p className="mt-2.5 font-bold text-[15px] leading-relaxed text-brand-navy">
              International Empire Consultants, Inc., a Massachusetts corporation with its principal
              place of business at 923 Hyde Park Ave, Boston, MA 02136 (&quot;IEC&quot;),
            </p>
            <p className="mt-2.5 text-[15px] leading-relaxed text-brand-navy/85">and</p>
            <p className="mt-2.5 break-words text-[15px] leading-relaxed text-brand-navy/85">
              ________________________________________________________________________, a
              ________________________________________ with its principal place of business at
              ________________________________________________________________________
              (&quot;Counterparty&quot;).
            </p>
            <p className="mt-2.5 text-[15px] leading-relaxed text-brand-navy/85">
              IEC and Counterparty are each a &quot;Party&quot; and together the
              &quot;Parties.&quot; Each Party may disclose Confidential Information to the other in
              connection with discussions regarding a potential business relationship, pilot
              deployment, partnership, or investment involving IEC and/or one or more of the assets
              listed in Schedule A (the &quot;Purpose&quot;).
            </p>
          </section>

          {SECTIONS.map((section) => (
            <AgreementSection key={section.heading} heading={section.heading} paragraphs={section.paragraphs} />
          ))}

          <section>
            <h2 className="text-center text-xl font-bold tracking-tight text-brand-navy">
              SCHEDULE A - IEC ASSETS COVERED BY THIS AGREEMENT
            </h2>
            <p className="mt-3 text-[15px] leading-relaxed text-brand-navy/85">
              Confidential Information relating to any of the following assets (and any successor,
              rebranded, or derivative version of them) is covered by this Agreement:
            </p>
            <div className="mt-4 space-y-3">
              {ASSETS.map((asset) => (
                <div key={asset.name}>
                  <p className="font-bold text-[15px] leading-relaxed text-brand-navy">- {asset.name}</p>
                  <p className="ml-6 text-[15px] leading-relaxed text-brand-navy-light">{asset.description}</p>
                </div>
              ))}
            </div>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-brand-violet">
              IN WITNESS WHEREOF, the Parties have executed this Agreement as of the Effective Date.
            </h2>

            <h3 className="mt-5 text-base font-semibold text-brand-navy">International Empire Consultants, Inc.</h3>
            <SignatureLine label="Signature:" value="Mohammed M. Morgan" />
            <SignatureLine label="Name:" value="Mohammed M. Morgan" />
            <SignatureLine label="Title:" value="Founder & CEO" />
            <SignatureLine label="Date:" />
            <p className="ml-24 mt-1 text-sm text-brand-navy-light">(Effective Date)</p>

            <h3 className="mt-6 text-base font-semibold text-brand-navy">Counterparty</h3>
            <SignatureLine label="Signature:" />
            <SignatureLine label="Name:" />
            <SignatureLine label="Title:" />
            <SignatureLine label="Date:" />
          </section>

          <SigningPanel />

          <p className="text-center text-xs text-brand-navy-light/60">Developed by IEC, Inc.</p>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
