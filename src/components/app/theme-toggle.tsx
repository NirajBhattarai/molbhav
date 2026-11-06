"use client";

import { useState } from "react";
import { useT, type Msg } from "@/lib/i18n";

const themes = ["system", "light", "dark"] as const;
const names: Record<(typeof themes)[number], Msg> = {
  system: "System",
  light: "Light",
  dark: "Dark",
};

/** Cycles system → light → dark by setting .light / .dark on <html>, as globals.css expects. */
export function ThemeToggle() {
  const t = useT();
  const [theme, setTheme] = useState<(typeof themes)[number]>("system");

  function next() {
    const value = themes[(themes.indexOf(theme) + 1) % themes.length];
    const root = document.documentElement;
    root.classList.remove("light", "dark");
    if (value !== "system") root.classList.add(value);
    setTheme(value);
  }

  return (
    <button
      type="button"
      onClick={next}
      className="h-11 shrink-0 rounded-full border border-input px-4 text-sm font-medium whitespace-nowrap transition-colors duration-150 hover:bg-accent"
    >
      {t("Theme: {theme}", { theme: t(names[theme]) })}
    </button>
  );
}
