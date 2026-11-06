import type { ReactNode } from "react";

/** Small status / heard-item chip. */
export function Chip({
  children,
  tone = "muted",
}: {
  children: ReactNode;
  tone?: "muted" | "marigold" | "success";
}) {
  const tones = {
    muted: "bg-muted text-muted-foreground",
    marigold: "bg-secondary/20 text-foreground",
    success: "bg-success/15 text-success",
  };
  return (
    <span
      className={`inline-flex h-7 shrink-0 items-center gap-1.5 rounded-full px-3 text-xs font-semibold whitespace-nowrap ${tones[tone]}`}
    >
      {children}
    </span>
  );
}
