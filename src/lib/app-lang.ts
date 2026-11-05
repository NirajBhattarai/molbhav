"use client";

import { useSyncExternalStore } from "react";
import { isLang, langOf, type Lang } from "@/lib/languages";

const KEY = "molbhav.lang";
const listeners = new Set<() => void>();

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

/** The app's language preference (stored on this phone). */
export function useLang(): Lang {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => {
        listeners.delete(cb);
      };
    },
    current,
    () => "en",
  );
}
