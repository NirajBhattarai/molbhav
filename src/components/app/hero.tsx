"use client";

import { useId, type ReactNode } from "react";
import { Moon, Pause, Power } from "lucide-react";
import { BlockPrint } from "@/components/brand/block-print";
import { useT, type Msg } from "@/lib/i18n";

export type HeroTone = "open" | "paused" | "closed";

/** Light behind the panel follows the stall: mint while open, marigold while paused, none closed. */
const GLOW: Record<HeroTone, string> = {
  open: "bg-[radial-gradient(120%_80%_at_100%_0%,color-mix(in_srgb,var(--hero-success)_38%,transparent),transparent_60%)]",
  paused:
    "bg-[radial-gradient(120%_80%_at_100%_0%,color-mix(in_srgb,var(--secondary)_45%,transparent),transparent_60%)]",
  closed: "",
};

export function HeroCard({
  children,
  label,
  tone,
  className = "",
}: {
  children: ReactNode;
  label?: string;
  tone?: HeroTone;
  className?: string;
}) {
  return (
    <section
      aria-label={label}
      className={`relative isolate grid gap-4 overflow-hidden rounded-3xl bg-hero p-4 text-hero-foreground shadow-[0_18px_40px_-18px_color-mix(in_srgb,var(--hero)_70%,transparent)] sm:p-5 ${className}`}
    >
      {(Object.keys(GLOW) as HeroTone[]).map((key) => (
        <span
          key={key}
          aria-hidden
          className={`pointer-events-none absolute inset-0 -z-10 transition-opacity duration-500 ease-out ${GLOW[key]} ${
            tone === key ? "opacity-100" : "opacity-0"
          }`}
        />
      ))}
      <BlockPrint className="absolute inset-0 -z-10 text-secondary opacity-[0.1]" />
      {children}
    </section>
  );
}

export function LiveToggle({
  on,
  onChange,
  title,
  hint,
  disabled,
}: {
  on: boolean;
  onChange: (next: boolean) => void;
  title: string;
  hint: string;
  disabled?: boolean;
}) {
  const hintId = useId();
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-describedby={hintId}
      disabled={disabled}
      onClick={() => onChange(!on)}
      className={`group flex min-h-16 w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left transition-[background-color,transform] duration-200 ease-out focus-visible:outline-secondary active:scale-[0.98] disabled:active:scale-100 ${
        on
          ? "bg-hero-success/15 ring-1 ring-hero-success/40"
          : "bg-hero-foreground/[0.08] hover:bg-hero-foreground/[0.12]"
      }`}
    >
      <span aria-hidden className="relative flex size-3 shrink-0 items-center justify-center">
        {on && (
          <span className="absolute inset-0 rounded-full bg-hero-success opacity-0 motion-safe:animate-[radar_2.4s_var(--ease-out)_infinite]" />
        )}
        <span
          className={`relative size-2.5 rounded-full transition-colors duration-200 ${on ? "bg-hero-success" : "bg-hero-foreground/40"}`}
        />
      </span>
      <span className="grid min-w-0 flex-1">
        <span className="font-semibold">{title}</span>
        <span
          key={hint}
          id={hintId}
          className="animate-[fade-in_200ms_var(--ease-out)] text-sm text-pretty text-hero-foreground/75"
        >
          {hint}
        </span>
      </span>
      <span
        aria-hidden
        className={`relative flex h-7 w-12 shrink-0 items-center rounded-full transition-colors duration-200 ease-out group-disabled:opacity-50 ${
          on ? "bg-hero-success" : "bg-hero-foreground/25"
        }`}
      >
        <span
          className={`absolute left-1 size-5 rounded-full bg-white shadow-sm transition-transform duration-200 ease-out ${
            on ? "translate-x-5" : ""
          }`}
        />
      </span>
    </button>
  );
}

const STATUS_ICON = { open: Power, paused: Pause, closed: Moon } as const;

/** Open / Paused / Closed — mirrors the stall sign buttons. */
export function StallStatusControl({
  status,
  onChange,
  hint,
  disabled,
  pauseSecondsLeft = 0,
}: {
  status: HeroTone;
  onChange: (next: HeroTone) => void;
  hint: string;
  disabled?: boolean;
  pauseSecondsLeft?: number;
}) {
  const t = useT();
  const hintId = useId();
  const options: { id: HeroTone; label: Msg }[] = [
    { id: "open", label: "Open" },
    { id: "paused", label: "Paused" },
    { id: "closed", label: "Closed" },
  ];
  const title =
    status === "open" ? t("Open for buyers") : status === "paused" ? t("Paused") : t("Closed");
  const mins = Math.max(1, Math.ceil(pauseSecondsLeft / 60));
  const pauseHint =
    status === "paused" && pauseSecondsLeft > 0 ? t("Back in {n} min", { n: mins }) : null;
  const Icon = STATUS_ICON[status];

  return (
    <div className="grid gap-2.5">
      <div
        className={`flex min-h-16 items-center gap-3 rounded-2xl px-3 py-2.5 transition-colors duration-300 ease-out ${
          status === "open"
            ? "bg-hero-success/15 ring-1 ring-hero-success/45"
            : status === "paused"
              ? "bg-secondary/15 ring-1 ring-secondary/45"
              : "bg-hero-foreground/[0.08] ring-1 ring-hero-foreground/10"
        }`}
      >
        <span
          aria-hidden
          className={`relative flex size-10 shrink-0 items-center justify-center rounded-full transition-colors duration-300 ${
            status === "open"
              ? "bg-hero-success text-hero"
              : status === "paused"
                ? "bg-secondary text-secondary-foreground"
                : "bg-hero-foreground/15 text-hero-foreground/80"
          }`}
        >
          {status === "open" && (
            <span className="absolute inset-0 rounded-full bg-hero-success opacity-0 motion-safe:animate-[radar_2.4s_var(--ease-out)_infinite]" />
          )}
          <Icon className="relative size-5" strokeWidth={2.25} />
        </span>
        <span className="grid min-w-0 flex-1">
          <span key={status} className="animate-[fade-in_200ms_var(--ease-out)] font-semibold">
            {title}
          </span>
          <span
            key={pauseHint ?? hint}
            id={hintId}
            className="animate-[fade-in_200ms_var(--ease-out)] text-sm text-pretty text-hero-foreground/80"
          >
            {pauseHint ?? hint}
          </span>
        </span>
      </div>
      <div
        role="radiogroup"
        aria-label={t("Stall status")}
        aria-describedby={hintId}
        className="grid grid-cols-3 gap-1 rounded-2xl bg-hero-foreground/[0.08] p-1"
      >
        {options.map((opt) => {
          const on = status === opt.id;
          const OptIcon = STATUS_ICON[opt.id];
          return (
            <button
              key={opt.id}
              type="button"
              role="radio"
              aria-checked={on}
              disabled={disabled}
              onClick={() => onChange(opt.id)}
              className={`flex min-h-11 items-center justify-center gap-1.5 rounded-xl text-sm font-semibold transition-[background-color,color,transform,box-shadow,opacity] duration-150 ease-out focus-visible:outline-secondary active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-45 disabled:active:scale-100 ${
                on
                  ? opt.id === "open"
                    ? "bg-hero-success text-hero shadow-md"
                    : opt.id === "paused"
                      ? "bg-secondary text-secondary-foreground shadow-md"
                      : "bg-hero-foreground text-hero shadow-md"
                  : "text-hero-foreground/85 hover:bg-hero-foreground/10"
              }`}
            >
              <OptIcon className="size-4" aria-hidden strokeWidth={2.25} />
              {t(opt.label)}
            </button>
          );
        })}
      </div>
    </div>
  );
}
