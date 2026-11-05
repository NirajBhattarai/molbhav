"use client";

import { useState } from "react";
import { Check, Languages } from "lucide-react";
import { focusRing, pressable } from "@/components/ui/styles";
import { setLang, useLang } from "@/lib/app-lang";
import { LANG, LANGS } from "@/lib/languages";

/**
 * App language: pill showing the current one, opening a sheet of all ten.
 * Each is named in its own words, with English below.
 */
export function LanguagePicker({ className = "" }: { className?: string }) {
  const lang = useLang();
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`Language: ${LANG[lang].own}`}
        className={`inline-flex h-11 shrink-0 items-center gap-2 rounded-full px-4 text-sm font-medium whitespace-nowrap transition-[transform,background-color] duration-150 active:scale-95 ${focusRing} ${className}`}
      >
        <Languages className="size-4" aria-hidden />
        <span translate="no">{LANG[lang].own}</span>
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/45 sm:items-center"
          onClick={() => setOpen(false)}
          onKeyDown={(e) => e.key === "Escape" && setOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="app-lang-title"
            className="m-0 max-h-[92dvh] w-full max-w-md animate-[rise_240ms_var(--ease-out)] overflow-y-auto rounded-t-3xl bg-card text-card-foreground sm:rounded-3xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-6 pt-6 text-left">
              <h2 id="app-lang-title" className="font-display text-xl font-bold">
                App language
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Stalls still talk to you in their own language. Your agent translates.
              </p>
            </div>
            <ul className="grid gap-1 overflow-y-auto px-4 pt-4 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
              {LANGS.map((code) => (
                <li key={code}>
                  <button
                    type="button"
                    aria-pressed={code === lang}
                    onClick={() => {
                      setLang(code);
                      setOpen(false);
                    }}
                    className={`flex min-h-12 w-full items-center gap-3 rounded-xl px-3 py-2 text-left ${pressable} ${
                      code === lang ? "bg-muted" : ""
                    }`}
                  >
                    <span className="min-w-0 flex-1">
                      <span lang={LANG[code].locale} translate="no" className="block font-medium">
                        {LANG[code].own}
                      </span>
                      {code !== lang && (
                        <span className="block text-sm text-muted-foreground">
                          {LANG[code].english}
                        </span>
                      )}
                    </span>
                    {code === lang && <Check className="size-5 text-primary" aria-hidden />}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </>
  );
}
