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

/** Text kept in state (an error, a notice): a phrase, a phrase with values, or words from elsewhere. */
export type Text = Msg | { msg: Msg; vars?: Vars } | (string & {});

/**
 * Text in `lang`, looked up when it's shown rather than when it was set, so a stored error switches
 * language with the rest of the screen. Words the catalog doesn't know (a server message, a name) show
 * as they are.
 */
export function translateText(lang: Lang, text: Text): string {
  if (typeof text !== "string") return translate(lang, text.msg, text.vars);
  return text in CATALOG ? translate(lang, text as Msg) : text;
}
