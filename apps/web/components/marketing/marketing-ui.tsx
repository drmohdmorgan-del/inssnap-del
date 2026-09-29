/**
 * TASK-011 — small reusable marketing primitives.
 * Server components, plain anchors, no external assets.
 */

import { BrandMark } from "../brand/BrandMark";

export function SectionHeading({
  eyebrow,
  title,
  intro,
  dark = false,
}: {
  eyebrow?: string;
  title: string;
  intro?: string;
  dark?: boolean;
}) {
  return (
    <div className="mx-auto max-w-3xl text-center">
      {eyebrow && (
        <p
          className={`text-xs font-semibold uppercase tracking-widest ${
            dark ? "text-brand-violet-light" : "text-brand-violet"
          }`}
        >
          {eyebrow}
        </p>
      )}
      <h2
        className={`mt-2 text-3xl font-bold tracking-tight sm:text-4xl ${
          dark ? "text-white" : "text-brand-navy"
        }`}
      >
        {title}
      </h2>
      {intro && (
        <p className={`mt-3 text-base ${dark ? "text-white/70" : "text-brand-navy-light"}`}>
          {intro}
        </p>
      )}
    </div>
  );
}

/**
 * Deep-navy band with the signature violet glow + large-scale logo watermark.
 * Used for heroes and alternating dark sections. Children render above the
 * backdrop. Server component — pure decoration, no interactivity.
 */
export function NavyBand({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`relative overflow-hidden bg-brand-navy ${className}`}>
      <div aria-hidden="true" className="pointer-events-none absolute inset-0">
        <div className="absolute -top-24 left-1/4 h-96 w-96 rounded-full bg-brand-violet/25 blur-[130px]" />
        <div className="absolute -bottom-32 right-1/5 h-80 w-80 rounded-full bg-brand-violet-light/20 blur-[130px]" />
        <BrandMark className="absolute -right-20 -top-20 h-80 w-80 opacity-[0.05]" />
        <BrandMark className="absolute -bottom-24 -left-16 h-64 w-64 opacity-[0.04]" />
      </div>
      <div className="relative">{children}</div>
    </section>
  );
}

export function CtaBand({
  title,
  body,
}: {
  title: string;
  body: string;
}) {
  return (
    <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-brand-navy via-brand-navy-light to-brand-violet px-6 py-12 text-center sm:px-12">
        <div aria-hidden="true" className="pointer-events-none absolute inset-0">
          <div className="absolute -top-20 right-1/4 h-64 w-64 rounded-full bg-brand-violet-light/30 blur-[100px]" />
          <BrandMark className="absolute -bottom-16 -right-10 h-56 w-56 opacity-[0.07]" />
        </div>
        <div className="relative">
          <h2 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">{title}</h2>
          <p className="mx-auto mt-3 max-w-2xl text-white/80">{body}</p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            <a
              href="/login"
              className="rounded-xl bg-white px-6 py-3 text-sm font-semibold text-brand-violet shadow-lg shadow-black/20 transition hover:-translate-y-0.5 hover:bg-brand-violet/10 hover:shadow-xl"
            >
              Sign in
            </a>
            <a
              href="/contact"
              className="rounded-xl border border-white/40 px-6 py-3 text-sm font-semibold text-white transition hover:-translate-y-0.5 hover:bg-white/10"
            >
              Contact us
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}

export function Card({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-brand-navy-light/15 bg-white p-6 shadow-sm transition duration-300 hover:-translate-y-1 hover:shadow-xl hover:shadow-brand-violet/15">
      <span
        aria-hidden="true"
        className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-brand-violet to-brand-violet-light"
      />
      <h3 className="text-lg font-semibold text-brand-navy">{title}</h3>
      <div className="mt-2 text-sm text-brand-navy-light">{children}</div>
    </div>
  );
}

export function CheckList({ items }: { items: string[] }) {
  return (
    <ul className="mt-3 space-y-2">
      {items.map((item) => (
        <li key={item} className="flex gap-2 text-sm text-brand-navy-light">
          <svg viewBox="0 0 20 20" className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true">
            <circle cx="10" cy="10" r="9" fill="#7b2ff7" fillOpacity="0.15" />
            <path
              d="M6.5 10.5l2.5 2.5 4.5-5"
              stroke="#7b2ff7"
              strokeWidth="2"
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}
