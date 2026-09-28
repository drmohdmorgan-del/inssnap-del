/**
 * Official INSSNAPP puzzle-piece logo (final artwork — do not alter).
 * Served from /brand/inssnapp-logo.png. The lockup is designed for dark
 * backgrounds, so it renders on a deep-navy tile at icon sizes.
 *
 * The codebase uses plain <img> rather than next/image, so this follows suit.
 */

export function BrandMark({ className = "h-9 w-9" }: { className?: string }) {
  return (
    <span
      className={`flex shrink-0 items-center justify-center overflow-hidden rounded-xl bg-brand-navy ${className}`}
      aria-hidden="true"
    >
      <img
        src="/brand/inssnapp-logo.png"
        alt="INSSNAPP"
        className="h-full w-full object-contain"
        draggable={false}
      />
    </span>
  );
}
