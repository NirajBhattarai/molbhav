/** A stall's initials on a tint picked from its id, so each stall keeps one colour everywhere. */
const TINTS = [
  "bg-primary/12 text-primary",
  "bg-chart-4/15 text-chart-4",
  "bg-chart-5/15 text-chart-5",
  "bg-secondary/30 text-secondary-foreground",
] as const;

const SIZE = {
  sm: "size-7 text-[11px]",
  md: "size-10 text-sm",
  lg: "size-12 text-base",
} as const;

function tintFor(id: string) {
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return TINTS[h % TINTS.length];
}

export function initials(name: string) {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const two = words.length > 1 ? words[0][0] + words[1][0] : (words[0] ?? "?").slice(0, 2);
  return two.toUpperCase();
}

export function StallAvatar({
  id,
  name,
  size = "md",
  className = "",
}: {
  id: string;
  name: string;
  size?: keyof typeof SIZE;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={`inline-flex shrink-0 items-center justify-center rounded-full font-display font-bold ${SIZE[size]} ${tintFor(id)} ${className}`}
    >
      {initials(name)}
    </span>
  );
}
