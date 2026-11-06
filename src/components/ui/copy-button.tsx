"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Copy } from "lucide-react";

/** Copies `value` and shows a check for a moment. */
export function CopyButton({
  value,
  label,
  className = "",
}: {
  value: string;
  label: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          window.clearTimeout(timer.current);
          timer.current = window.setTimeout(() => setCopied(false), 1600);
        } catch {
          /* clipboard blocked: the value is selectable text */
        }
      }}
      aria-label={copied ? "Copied" : label}
      className={`flex size-11 shrink-0 items-center justify-center rounded-lg transition-[background-color,transform] duration-150 ease-out active:scale-[0.97] ${className}`}
    >
      <span key={copied ? "copied" : "copy"} className="flex animate-[rise_160ms_var(--ease-out)]">
        {copied ? (
          <Check className="size-5" aria-hidden />
        ) : (
          <Copy className="size-5" aria-hidden />
        )}
      </span>
    </button>
  );
}
