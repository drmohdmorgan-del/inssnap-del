/**
 * Centered BrandMark on a violet gradient rule.
 * Placed between major sections on the public marketing pages.
 * Server component — no interactivity, no external assets.
 */

import { BrandMark } from "../brand/BrandMark";

export function SectionDivider() {
  return (
    <div className="mx-auto max-w-6xl px-4 sm:px-6" aria-hidden="true">
      <div className="flex items-center gap-5">
        <span className="h-px flex-1 bg-gradient-to-r from-transparent via-brand-violet/50 to-brand-violet" />
        <BrandMark className="h-11 w-11" />
        <span className="h-px flex-1 bg-gradient-to-l from-transparent via-brand-violet/50 to-brand-violet" />
      </div>
    </div>
  );
}
