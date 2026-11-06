"use client";

import { useId, type ReactNode } from "react";
import { BlockPrint } from "@/components/brand/block-print";
import { useT, type Msg } from "@/lib/i18n";

export function HeroCard({
  children,
  label,
  className = "",
}: {
  children: ReactNode;
  label?: string;
  className?: string;
}) {
  return (
    <section
      aria-label={label}
      className={`relative isolate grid gap-4 overflow-hidden rounded-3xl bg-hero p-4 text-hero-foreground sm:p-5 ${className}`}
    >
      <BlockPrint className="absolute inset-0 -z-10 text-secondary opacity-[0.08]" />
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

/** Open / Paused / Closed — mirrors the stall sign buttons. */
export function StallStatusControl({
  status,
  onChange,
  hint,
  disabled,
  pauseSecondsLeft = 0,
}: {
  status: "open" | "closed" | "paused";
  onChange: (next: "open" | "closed" | "paused") => void;
  hint: string;
  disabled?: boolean;
  pauseSecondsLeft?: number;
}) {
  const t = useT();
  const hintId = useId();
  const options: { id: "open" | "paused" | "closed"; label: Msg }[] = [
    { id: "open", label: "Open" },
    { id: "paused", label: "Paused" },
    { id: "closed", label: "Closed" },
  ];
  const title =
    status === "open" ? t("Open for buyers") : status === "paused" ? t("Paused") : t("Closed");
  const mins = Math.max(1, Math.ceil(pauseSecondsLeft / 60));
  const pauseHint =
    status === "paused" && pauseSecondsLeft > 0 ? t("Back in {n} min", { n: mins }) : null;

  return (
    <div className="grid gap-2">
      <div
        className={`flex min-h-14 items-center gap-3 rounded-2xl px-3 py-2.5 ${
          status === "open"
            ? "bg-hero-success/15 ring-1 ring-hero-success/40"
            : status === "paused"
              ? "bg-amber-400/15 ring-1 ring-amber-400/35"
              : "bg-hero-foreground/[0.08]"
        }`}
      >
        <span aria-hidden className="relative flex size-3 shrink-0 items-center justify-center">
          {status === "open" && (
            <span className="absolute inset-0 rounded-full bg-hero-success opacity-0 motion-safe:animate-[radar_2.4s_var(--ease-out)_infinite]" />
          )}
          <span
            className={`relative size-2.5 rounded-full ${
              status === "open"
                ? "bg-hero-success"
                : status === "paused"
                  ? "bg-amber-400"
                  : "bg-hero-foreground/40"
            }`}
          />
        </span>
        <span className="grid min-w-0 flex-1">
          <span className="font-semibold">{title}</span>
          <span id={hintId} className="text-sm text-pretty text-hero-foreground/75">
            {pauseHint ?? hint}
          </span>
        </span>
      </div>
      <div
        role="radiogroup"
        aria-label={t("Stall status")}
        aria-describedby={hintId}
        className="grid grid-cols-3 gap-1.5"
      >
        {options.map((opt) => {
          const on = status === opt.id;
          return (
            <button
              key={opt.id}
              type="button"
              role="radio"
              aria-checked={on}
              disabled={disabled}
              onClick={() => onChange(opt.id)}
              className={`min-h-11 rounded-xl text-sm font-semibold transition-[background-color,transform,opacity] duration-150 ease-out active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-45 disabled:active:scale-100 ${
                on
                  ? opt.id === "open"
                    ? "bg-hero-success text-hero-foreground"
                    : opt.id === "paused"
                      ? "bg-amber-400 text-hero-foreground"
                      : "bg-hero-foreground/25 text-hero-foreground"
                  : "bg-hero-foreground/[0.08] text-hero-foreground/80 hover:bg-hero-foreground/[0.14]"
              }`}
            >
              {t(opt.label)}
            </button>
          );
        })}
      </div>
    </div>
  );
}
