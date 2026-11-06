"use client";

import { BadgeCheck, Sparkles, Store } from "lucide-react";
import { useT, type Msg } from "@/lib/i18n";

// `optional` lines drop out on short phones so the sign-in form stays above the fold.
type Line = { from: "you" | "stall" | "agent"; who?: string; text: Msg; optional?: boolean };

const LINES: Line[] = [
  { from: "you", text: "2 chai and 2 samosa, under ₹100?" },
  { from: "stall", who: "Ramu Tea Stall", text: "₹90 for everything.", optional: true },
  { from: "stall", who: "Shree Snacks", text: "₹84, samosa fresh from the kadhai." },
  { from: "agent", text: "Shree Snacks agreed to ₹76. Shall I pay?" },
];

// Each line arrives after the last; the whole haggle plays once in about four seconds.
const STEP_MS = 850;

/** A short bargain playing out in chat bubbles, so the sign-in screen shows what the app does. */
export function HaggleDemo() {
  const t = useT();
  return (
    <figure className="grid gap-2">
      <figcaption className="sr-only">
        {t(
          "Example: you ask for 2 chai and 2 samosa under ₹100. One stall offers ₹90, another ₹84, and your agent gets the deal down to ₹76, saving ₹14.",
        )}
      </figcaption>
      <ol aria-hidden className="grid gap-2">
        {LINES.map((line, i) => (
          <li
            key={i}
            style={{ animationDelay: `${300 + i * STEP_MS}ms` }}
            className={`flex motion-safe:animate-[pop_320ms_var(--ease-out)_both] ${
              line.from === "you" ? "justify-end" : "justify-start"
            } ${line.optional ? "short:hidden" : ""}`}
          >
            <Bubble line={line} />
          </li>
        ))}
        <li
          style={{ animationDelay: `${300 + LINES.length * STEP_MS}ms` }}
          className="flex justify-center pt-0.5 motion-safe:animate-[pop_320ms_var(--ease-out)_both]"
        >
          <span className="inline-flex items-center gap-1.5 rounded-full bg-success px-3 py-1 text-sm font-semibold text-success-foreground">
            <BadgeCheck className="size-4" aria-hidden />
            {t("Deal ₹76 · you saved ₹14")}
          </span>
        </li>
      </ol>
    </figure>
  );
}

function Bubble({ line }: { line: Line }) {
  const t = useT();
  if (line.from === "you") {
    return (
      <p className="max-w-[80%] rounded-2xl rounded-br-md bg-hero-foreground px-3.5 py-2 text-sm font-medium text-hero shadow-sm">
        {t(line.text)}
      </p>
    );
  }
  if (line.from === "agent") {
    return (
      <div className="max-w-[85%] rounded-2xl rounded-bl-md bg-secondary px-3.5 py-2 text-secondary-foreground shadow-sm">
        <p className="flex items-center gap-1 text-xs font-semibold">
          <Sparkles className="size-3.5" aria-hidden /> {t("Your agent")}
        </p>
        <p className="text-sm font-medium">{t(line.text)}</p>
      </div>
    );
  }
  return (
    <div className="max-w-[80%] rounded-2xl rounded-bl-md bg-hero-foreground/10 px-3.5 py-2 text-hero-foreground ring-1 ring-hero-foreground/15">
      <p className="flex items-center gap-1 text-xs font-semibold text-hero-foreground/75">
        <Store className="size-3.5" aria-hidden /> {line.who}
      </p>
      <p className="text-sm">{t(line.text)}</p>
    </div>
  );
}
