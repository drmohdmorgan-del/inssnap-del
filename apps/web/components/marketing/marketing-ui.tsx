/**
 * TASK-011 — small reusable marketing primitives.
 * Server components, plain anchors, no external assets.
 */

export function SectionHeading({
  eyebrow,
  title,
  intro,
}: {
  eyebrow?: string;
  title: string;
  intro?: string;
}) {
  return (
    <div className="mx-auto max-w-3xl text-center">
      {eyebrow && (
        <p className="text-xs font-semibold uppercase tracking-widest text-brand-violet">
          {eyebrow}
        </p>
      )}
      <h2 className="mt-2 text-3xl font-bold tracking-tight text-brand-navy sm:text-4xl">
        {title}
      </h2>
      {intro && <p className="mt-3 text-base text-brand-navy-light">{intro}</p>}
    </div>
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
      <div className="rounded-3xl bg-gradient-to-br from-brand-navy via-brand-navy-light to-brand-violet px-6 py-12 text-center sm:px-12">
        <h2 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">{title}</h2>
        <p className="mx-auto mt-3 max-w-2xl text-white/80">{body}</p>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          <a
            href="/login"
            className="rounded-xl bg-white px-6 py-3 text-sm font-semibold text-brand-violet shadow transition hover:bg-brand-violet/10"
          >
            Sign in
          </a>
          <a
            href="mailto:info@inssnapp.com"
            className="rounded-xl border border-white/40 px-6 py-3 text-sm font-semibold text-white transition hover:bg-white/10"
          >
            Contact us
          </a>
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
    <div className="rounded-2xl border border-brand-navy-light/15 bg-white p-6 shadow-sm">
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
