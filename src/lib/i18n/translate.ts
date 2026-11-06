import type { Lang } from "@/lib/languages";
import { CATALOG, type Msg } from "@/lib/i18n/catalog";

export type Vars = Record<string, string | number>;

/** A phrase in `lang`, with its {placeholders} filled in. A phrase not translated yet shows in English. */
export function translate(lang: Lang, msg: Msg, vars?: Vars): string {
  const said = lang === "en" ? msg : ((CATALOG[msg] as Partial<Record<Lang, string>>)[lang] ?? msg);
  return vars
    ? said.replace(/\{(\w+)\}/g, (all, name: string) => (name in vars ? String(vars[name]) : all))
    : said;
}
