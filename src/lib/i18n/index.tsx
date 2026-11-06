"use client";

import { useCallback, useEffect, useMemo, useSyncExternalStore } from "react";
import { LANG, isLang, langOf, type Lang } from "@/lib/languages";
import type { Msg } from "@/lib/i18n/catalog";
import { translate, translateText, type Text, type Vars } from "@/lib/i18n/translate";

/*
 * The app in the language picked on Profile (or on sign-in), one of the ten in languages.ts. It's kept on
 * this phone; until it's picked, it's the phone's own language when that's one of ours, else English.
 * Words are looked up by their English (catalog.ts), so screens read as they do in English with t()
 * around each phrase. Server-rendered screens use <T>, which does the same in a client component.
 */

const KEY = "molbhav.lang";
const listeners = new Set<() => void>();

/** Another tab (or the app's web view) picked a language: follow it here too. */
function onStorage(e: StorageEvent) {
  if (e.key === KEY || e.key === null) listeners.forEach((l) => l());
}

function subscribe(cb: () => void) {
  if (!listeners.size) window.addEventListener("storage", onStorage);
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
    if (!listeners.size) window.removeEventListener("storage", onStorage);
  };
}

function current(): Lang {
  try {
    const saved = localStorage.getItem(KEY);
    if (isLang(saved)) return saved;
  } catch {}
  return langOf(navigator.language, "en");
}

export function setLang(lang: Lang) {
  try {
    localStorage.setItem(KEY, lang);
  } catch {}
  listeners.forEach((l) => l());
}

/** The app's language. Pages are prerendered in English and switch on the phone. */
export function useLang(): Lang {
  return useSyncExternalStore(subscribe, current, () => "en");
}

/** `t("Sign out")`: a phrase in the app's language. */
export function useT() {
  const lang = useLang();
  return useCallback((msg: Msg, vars?: Vars) => translate(lang, msg, vars), [lang]);
}

/**
 * `tx(error)`: stored text in the app's language. Keep errors and notices in state as English (or
 * `{ msg, vars }`) and pass them through this when rendering, so they switch with the language.
 */
export function useTx() {
  const lang = useLang();
  return useCallback((text: Text) => translateText(lang, text), [lang]);
}

/** Times and language names in the app's language, from the browser's own Intl data. */
export function useFormat() {
  const lang = useLang();
  return useMemo(() => {
    const locale = LANG[lang].locale;
    const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
    const names = new Intl.DisplayNames([locale], { type: "language" });
    return {
      /** "10 minutes ago", "गत 2 घंटे", "昨日"… */
      ago(minutes: number) {
        if (minutes < 60) return rtf.format(-minutes, "minute");
        if (minutes < 60 * 24) return rtf.format(-Math.round(minutes / 60), "hour");
        return rtf.format(-Math.round(minutes / (60 * 24)), "day");
      },
      /** "hi" → "Hindi" in English, "हिन्दी" in Hindi. */
      language(code: string) {
        return names.of(code) ?? code;
      },
    };
  }, [lang]);
}

/**
 * A phrase for server-rendered screens. `ago` fills {when} with a relative time and `language` fills
 * {language} with a language's name, both in the app's language.
 */
export function T({
  msg,
  vars,
  ago,
  language,
}: {
  msg: Msg;
  vars?: Vars;
  ago?: number;
  language?: string;
}) {
  const t = useT();
  const format = useFormat();
  return t(msg, {
    ...vars,
    ...(ago !== undefined && { when: format.ago(ago) }),
    ...(language && { language: format.language(language) }),
  });
}

/** A relative time ("8 minutes ago") in the app's language, for server-rendered screens. */
export function Ago({ minutes }: { minutes: number }) {
  return useFormat().ago(minutes);
}

/** A language's name ("Japanese", "जापानी") in the app's language, for server-rendered screens. */
export function LanguageName({ code }: { code: string }) {
  return useFormat().language(code);
}

/** Keeps <html lang> on the app's language, so screen readers and fonts pick the right voice and glyphs. */
export function LangSync() {
  const lang = useLang();
  useEffect(() => {
    document.documentElement.lang = LANG[lang].locale;
  }, [lang]);
  return null;
}

export { translate, translateText };
export type { Msg, Text, Vars };
