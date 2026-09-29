"use client";

import { useState } from "react";

const ROLE_OPTIONS = [
  { value: "property_manager", label: "Property manager" },
  { value: "resident", label: "Resident" },
  { value: "prospect", label: "Prospective renter" },
  { value: "broker", label: "Broker" },
  { value: "other", label: "Other" },
];

const inputClass =
  "w-full rounded-xl border border-brand-navy-light/20 bg-white px-4 py-2.5 text-sm text-brand-navy placeholder:text-brand-navy-light/40 outline-none transition focus:border-brand-violet focus:ring-2 focus:ring-brand-violet/25";

export function ContactForm() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [company, setCompany] = useState("");
  const [role, setRole] = useState("property_manager");
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("sending");
    setError(null);
    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, company, role, message }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Something went wrong. Please try again.");
        setStatus("error");
        return;
      }
      setStatus("sent");
    } catch {
      setError("Something went wrong. Please try again.");
      setStatus("error");
    }
  }

  if (status === "sent") {
    return (
      <div className="rounded-3xl border border-brand-violet/20 bg-white p-8 text-center shadow-xl shadow-brand-violet/10 sm:p-10">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-brand-violet/10">
          <svg viewBox="0 0 24 24" className="h-7 w-7 text-brand-violet" fill="none" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h2 className="mt-4 text-2xl font-bold tracking-tight text-brand-navy">Message received</h2>
        <p className="mx-auto mt-2 max-w-md text-sm text-brand-navy-light">
          Thanks for reaching out — the INSSNAPP team will get back to you at{" "}
          <span className="font-semibold text-brand-navy">{email}</span> shortly.
        </p>
      </div>
    );
  }

  return (
    <form
      onSubmit={onSubmit}
      className="rounded-3xl border border-brand-navy-light/10 bg-white p-6 shadow-xl shadow-brand-navy/5 sm:p-8"
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="contact-name" className="mb-1.5 block text-sm font-medium text-brand-navy">
            Name
          </label>
          <input
            id="contact-name"
            className={inputClass}
            placeholder="Jordan Lee"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            minLength={2}
            maxLength={100}
            autoComplete="name"
          />
        </div>
        <div>
          <label htmlFor="contact-email" className="mb-1.5 block text-sm font-medium text-brand-navy">
            Email
          </label>
          <input
            id="contact-email"
            type="email"
            className={inputClass}
            placeholder="you@company.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            maxLength={254}
            autoComplete="email"
          />
        </div>
        <div>
          <label htmlFor="contact-company" className="mb-1.5 block text-sm font-medium text-brand-navy">
            Company <span className="font-normal text-brand-navy-light/50">(optional)</span>
          </label>
          <input
            id="contact-company"
            className={inputClass}
            placeholder="Acme Property Group"
            value={company}
            onChange={(e) => setCompany(e.target.value)}
            maxLength={200}
            autoComplete="organization"
          />
        </div>
        <div>
          <label htmlFor="contact-role" className="mb-1.5 block text-sm font-medium text-brand-navy">
            I am a
          </label>
          <select
            id="contact-role"
            className={inputClass}
            value={role}
            onChange={(e) => setRole(e.target.value)}
          >
            {ROLE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="mt-4">
        <label htmlFor="contact-message" className="mb-1.5 block text-sm font-medium text-brand-navy">
          Message
        </label>
        <textarea
          id="contact-message"
          className={`${inputClass} min-h-32 resize-y`}
          placeholder="Tell us about your portfolio, your role, or what you'd like to see in a pilot…"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          required
          minLength={10}
          maxLength={5000}
          rows={5}
        />
      </div>
      {error && (
        <p className="mt-3 rounded-xl bg-red-50 px-4 py-2.5 text-sm text-red-700">{error}</p>
      )}
      <button
        type="submit"
        disabled={status === "sending"}
        className="mt-5 w-full rounded-xl bg-gradient-to-r from-brand-violet to-brand-violet-light px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-brand-violet/30 transition hover:-translate-y-0.5 hover:shadow-xl hover:shadow-brand-violet/40 hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0 sm:w-auto"
      >
        {status === "sending" ? "Sending…" : "Send message"}
      </button>
      <p className="mt-3 text-xs text-brand-navy-light/50">
        We reply to every message. Your details are only used to respond to your inquiry.
      </p>
    </form>
  );
}
