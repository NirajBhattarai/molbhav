/**
 * The Molbhav mark: your speech bubble and the stall's overlap, and where they meet is the deal (the check).
 * Same geometry as scripts/logo/generate.py, which builds the app icons and splash screens.
 * The left bubble takes `currentColor`, so it is white on the indigo hero and indigo on paper.
 */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="8 12 48 35" aria-hidden className={className}>
      <path d="M24 12a16 16 0 1 1 -5 31.2L8 47l4-10A16 16 0 0 1 24 12z" fill="currentColor" />
      <path d="M40 12a16 16 0 1 0 5 31.2L56 47l-4-10A16 16 0 0 0 40 12z" fill="var(--secondary)" />
      <path d="M32 14.14A16 16 0 0 1 32 41.86A16 16 0 0 1 32 14.14Z" fill="var(--success)" />
      <path
        d="M27.6 28.4l3.2 3.2 5.6-6.6"
        fill="none"
        stroke="var(--success-foreground)"
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Mark plus wordmark. The name is real text, so it reads out and scales with the font. */
export function Logo({ className = "" }: { className?: string }) {
  return (
    <span
      translate="no"
      className={`inline-flex items-center gap-2 font-display text-xl font-bold tracking-tight ${className}`}
    >
      <LogoMark className="h-7 w-auto" />
      Molbhav
    </span>
  );
}
