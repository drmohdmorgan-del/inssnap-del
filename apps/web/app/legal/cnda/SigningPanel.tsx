"use client";

import { useState } from "react";

/* The attestation statement the signer affirms below. These words are
   locked to ATTESTATION_TEXT in lib/nda-submit-core.js — the
   server stores that exact statement in the signing record. */
const ATTESTATION_STATEMENT =
  "I agree to the terms of this Mutual Non-Disclosure Agreement, I am authorized to sign on behalf of the company named above, and I sign electronically by typing my name.";

const inputClass =
  "w-full rounded-xl border border-brand-navy-light/20 bg-white px-4 py-2.5 text-sm text-brand-navy placeholder:text-brand-navy-light/40 outline-none transition focus:border-brand-violet focus:ring-2 focus:ring-brand-violet/25";

/* Sign-this-agreement panel (2026-11-05): the website NDA signing that
   creates INSNAPP Demo Portal access. Submits to /api/nda/submit, which
   records the signing FIRST and only then provisions demo access and
   sends the activation email. Success is shown only after the server
   confirms the signing was recorded; any failure says so plainly and
   leaves the form ready to sign again. This page states the flow but
   never links the portal — the only door in is the activation email. */
export function SigningPanel() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [company, setCompany] = useState("");
  const [title, setTitle] = useState("");
  const [signature, setSignature] = useState("");
  const [attested, setAttested] = useState(false);
  const [phase, setPhase] = useState<"idle" | "sending" | "done" | "error">("idle");

  const ready =
    name.trim().length > 1 &&
    /.+@.+\..+/.test(email.trim()) &&
    company.trim().length > 0 &&
    signature.trim().length > 1 &&
    attested;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!ready || phase === "sending") return;
    setPhase("sending");
    try {
      const response = await fetch("/api/nda/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim(),
          company: company.trim(),
          title: title.trim(),
          signature: signature.trim(),
          attestation: true,
        }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok || !body || body.ok !== true) {
        setPhase("error");
        return;
      }
      setPhase("done");
    } catch {
      setPhase("error");
    }
  }

  if (phase === "done") {
    return (
      <section className="rounded-3xl border border-brand-violet/30 bg-white p-6 shadow-xl shadow-brand-violet/10 sm:p-8">
        <h2 className="text-xl font-bold tracking-tight text-brand-navy">Signed — and recorded</h2>
        <p className="mt-2 text-[15px] leading-relaxed text-brand-navy/85">
          Thank you. Your signing has been recorded, your INSNAPP Demo Portal access is being
          created, and an activation email is on its way to{" "}
          <strong className="text-brand-navy">{email.trim()}</strong>. Open that email to set your
          own password and enter the demo.
        </p>
        <p className="mt-2 text-sm leading-relaxed text-brand-navy-light">
          The demo is a walkthrough of the INSNAPP workflow — the tenant, prospective renter, and
          broker flows following one showing from request to live lead — on synthetic data only.
        </p>
      </section>
    );
  }

  return (
    <section className="rounded-3xl border border-brand-navy-light/15 bg-white p-6 shadow-xl shadow-brand-navy/5 sm:p-8">
      <h2 className="text-xl font-bold tracking-tight text-brand-navy">
        Sign this agreement — and get demo access
      </h2>
      <p className="mt-2 text-[15px] leading-relaxed text-brand-navy/85">
        Signing this agreement creates your <strong className="text-brand-navy">INSNAPP Demo Portal</strong>{" "}
        access. The moment your signing is recorded, your demo account is created and an{" "}
        <strong className="text-brand-navy">activation email</strong> follows to the email address
        below — you <strong className="text-brand-navy">set your own password</strong> from that
        email; we never send passwords.
      </p>
      <p className="mt-2 text-sm leading-relaxed text-brand-navy-light">
        The demo is a walkthrough of the exact INSNAPP workflow — the tenant, prospective renter,
        and broker flows following one showing from request to live lead — on synthetic data only.
        INSNAPP delivers live leads, not cold leads. No real tenants, prospects, brokers, or
        properties are used.
      </p>
      <form onSubmit={submit} className="mt-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="cnda-name" className="mb-1.5 block text-sm font-medium text-brand-navy">
              Full name (printed)
            </label>
            <input
              id="cnda-name"
              className={inputClass}
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete="name"
              required
            />
          </div>
          <div>
            <label htmlFor="cnda-email" className="mb-1.5 block text-sm font-medium text-brand-navy">
              Email
            </label>
            <input
              id="cnda-email"
              className={inputClass}
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              required
            />
          </div>
          <div>
            <label htmlFor="cnda-company" className="mb-1.5 block text-sm font-medium text-brand-navy">
              Company
            </label>
            <input
              id="cnda-company"
              className={inputClass}
              value={company}
              onChange={(e) => setCompany(e.target.value)}
              autoComplete="organization"
              required
            />
          </div>
          <div>
            <label htmlFor="cnda-title" className="mb-1.5 block text-sm font-medium text-brand-navy">
              Title <span className="font-normal text-brand-navy-light/50">(optional)</span>
            </label>
            <input
              id="cnda-title"
              className={inputClass}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              autoComplete="organization-title"
            />
          </div>
        </div>
        <div className="mt-4">
          <label htmlFor="cnda-signature" className="mb-1.5 block text-sm font-medium text-brand-navy">
            Signature — type your full name to sign
          </label>
          <input
            id="cnda-signature"
            className={inputClass}
            value={signature}
            onChange={(e) => setSignature(e.target.value)}
            required
          />
        </div>
        <label className="mt-4 flex items-start gap-2.5 text-sm leading-relaxed text-brand-navy/85">
          <input
            type="checkbox"
            className="mt-1 shrink-0"
            checked={attested}
            onChange={(e) => setAttested(e.target.checked)}
          />
          <span>{ATTESTATION_STATEMENT}</span>
        </label>
        <button
          type="submit"
          disabled={!ready || phase === "sending"}
          className="mt-5 rounded-xl bg-gradient-to-r from-brand-violet to-brand-violet-light px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-brand-violet/30 transition hover:-translate-y-0.5 hover:shadow-xl hover:shadow-brand-violet/40 hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0"
        >
          {phase === "sending" ? "Recording your signing…" : "Sign agreement & create my demo access"}
        </button>
        {phase === "error" && (
          <p className="mt-3 rounded-xl bg-red-50 px-4 py-2.5 text-sm font-medium text-red-700">
            Your signing could not be recorded — nothing was submitted and no access was created.
            Please check your connection and sign again.
          </p>
        )}
      </form>
    </section>
  );
}
