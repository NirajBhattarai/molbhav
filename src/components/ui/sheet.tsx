"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { X } from "lucide-react";
import { focusRing } from "@/components/ui/styles";
import { useT } from "@/lib/i18n";

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Bottom sheet on phones, centred dialog on wider screens.
 * Escape closes, Tab stays inside, focus returns to the opener, and the page behind doesn't scroll.
 * `footer` sticks to the bottom (above the home indicator) — put the primary action there.
 */
export function Sheet({
  title,
  description,
  onClose,
  footer,
  dismissible = true,
  children,
}: {
  title: string;
  description?: ReactNode;
  onClose: () => void;
  footer?: ReactNode;
  /** When false, tapping the backdrop does nothing (use for sheets holding unsaved work). */
  dismissible?: boolean;
  children: ReactNode;
}) {
  const t = useT();
  const titleId = useId();
  const descId = useId();
  const panel = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);

  useEffect(() => {
    close.current = onClose;
  });

  useEffect(() => {
    const node = panel.current;
    if (!node) return;
    const opener = document.activeElement as HTMLElement | null;
    (node.querySelector<HTMLElement>("[data-autofocus]") ?? node).focus();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        close.current();
        return;
      }
      if (e.key !== "Tab" || !node) return;
      const items = [...node.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
        (el) => el.offsetParent !== null,
      );
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && (active === first || active === node)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
      opener?.focus?.();
    };
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4">
      <div
        aria-hidden
        onClick={dismissible ? onClose : undefined}
        className="absolute inset-0 animate-[fade-in_200ms_var(--ease-out)] bg-black/45 backdrop-blur-[2px]"
      />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descId : undefined}
        tabIndex={-1}
        className="relative flex max-h-[92dvh] w-full max-w-md animate-[sheet-in_320ms_var(--ease-drawer)_both] flex-col overflow-hidden rounded-t-3xl bg-card text-card-foreground shadow-2xl outline-none sm:animate-[rise_260ms_var(--ease-out)_both] sm:rounded-3xl"
      >
        <span
          aria-hidden
          className="mx-auto mt-2.5 h-1 w-10 shrink-0 rounded-full bg-border sm:hidden"
        />
        <header className="flex shrink-0 items-start gap-3 px-5 pt-3 pb-4 sm:pt-5">
          <div className="min-w-0 flex-1">
            <h2 id={titleId} className="font-display text-xl font-bold tracking-tight text-balance">
              {title}
            </h2>
            {description && (
              <p id={descId} className="mt-1 text-sm text-pretty text-muted-foreground">
                {description}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("Close")}
            className={`-mt-1.5 -mr-2.5 flex size-11 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground ${focusRing}`}
          >
            <X className="size-5" aria-hidden />
          </button>
        </header>
        <div
          className={`min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 ${
            footer ? "pb-5" : "pb-[max(1.25rem,env(safe-area-inset-bottom))]"
          }`}
        >
          {children}
        </div>
        {footer && (
          <div className="shrink-0 border-t border-border bg-card px-5 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

/** Visible label above a control, with optional helper text (`${htmlFor}-hint`). */
export function Field({
  label,
  htmlFor,
  hint,
  children,
}: {
  label: string;
  htmlFor: string;
  hint?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="min-w-0">
      <label htmlFor={htmlFor} className="text-sm font-medium">
        {label}
      </label>
      <div className="mt-1.5">{children}</div>
      {hint && (
        <p id={`${htmlFor}-hint`} className="mt-1.5 text-xs text-muted-foreground">
          {hint}
        </p>
      )}
    </div>
  );
}

export const fieldInput =
  "h-12 w-full rounded-lg border border-input bg-background px-3 text-base outline-none transition-[border-color,box-shadow] duration-150 focus-visible:border-primary focus-visible:ring-3 focus-visible:ring-primary/20";

const invalidInput =
  "border-destructive focus-visible:border-destructive focus-visible:ring-destructive/20";

/** Whole-rupee input with a ₹ prefix and the number keypad. */
export function MoneyInput({
  id,
  value,
  onChange,
  placeholder,
  invalid,
  describedBy,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  invalid?: boolean;
  describedBy?: string;
}) {
  return (
    <div className="relative">
      <span
        aria-hidden
        className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-muted-foreground"
      >
        ₹
      </span>
      <input
        id={id}
        inputMode="numeric"
        pattern="[0-9]*"
        autoComplete="off"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value.replace(/\D/g, "").slice(0, 8))}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        className={`${fieldInput} pl-7 tabular-nums ${invalid ? invalidInput : ""}`}
      />
    </div>
  );
}
