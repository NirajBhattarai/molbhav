"use client";

import { useId, type ReactNode } from "react";
import { BlockPrint } from "@/components/brand/block-print";

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
