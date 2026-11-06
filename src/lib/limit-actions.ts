"use server";

import type { Msg } from "@/lib/i18n/catalog";
import { limitsProblem } from "@/lib/limits";
import { ensureUser, me } from "@/lib/server/bargains";
import { saveLimits } from "@/lib/server/limits";

export type LimitsSaved = { saved: true } | { error: Msg } | null;

/** A rupee amount as typed ("1,500"); empty is no limit, and anything else is NaN, which is refused. */
const rupeesIn = (value: FormDataEntryValue | null) => {
  const typed = String(value ?? "").replaceAll(/[\s,₹]/g, "");
  return typed ? Number(typed) : null;
};

export async function saveSpendingLimits(_: LimitsSaved, form: FormData): Promise<LimitsSaved> {
  const user = await me();
  const limits = {
    perOrder: rupeesIn(form.get("perOrder")),
    perDay: rupeesIn(form.get("perDay")),
    autoAgree: form.get("autoAgree") === "on",
    autoOrder: form.get("autoOrder") === "on",
  };
  const problem = limitsProblem(limits);
  if (problem) return { error: problem };
  await ensureUser(user);
  await saveLimits(user.id, limits);
  return { saved: true };
}
