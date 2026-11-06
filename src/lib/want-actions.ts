"use server";

import { isLang } from "@/lib/languages";
import { me } from "@/lib/server/shop";
import { scopeFrom, understandWant } from "@/lib/server/want";
import type { HeardWant } from "@/lib/want";

/** What the buyer's agent understood of an order, before searching stalls. */
export async function readWant(form: FormData): Promise<HeardWant | { error: string }> {
  await me();
  const want = String(form.get("q") ?? "")
    .trim()
    .slice(0, 200);
  const langRaw = String(form.get("lang") ?? "en");
  const lang = isLang(langRaw) ? langRaw : "en";
  if (!want) return { error: "Say or type what you want." };
  try {
    const heard = await understandWant(want, lang, scopeFrom(form));
    if (!heard.items.length) {
      return {
        error: `Your agent didn’t catch anything to buy in “${want}”. Try “2 chai and 2 samosa”.`,
      };
    }
    return heard;
  } catch {
    return { error: "Couldn’t read that order. Try typing it." };
  }
}
