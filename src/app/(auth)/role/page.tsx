"use client";

import { ChevronRight, ShoppingBag, Store, type LucideIcon } from "lucide-react";
import { pressable } from "@/components/ui/styles";
import { chooseRole } from "@/lib/role";
import type { Role } from "@/lib/roles";
import { useT, type Msg } from "@/lib/i18n";

const roles: { role: Role; icon: LucideIcon; title: Msg; body: Msg }[] = [
  {
    role: "buyer",
    icon: ShoppingBag,
    title: "I'm buying",
    body: "Tell your agent what you want. It haggles with stalls nearby.",
  },
  {
    role: "shopkeeper",
    icon: Store,
    title: "I run a stall",
    body: "Register your stall, take payouts on UPI, and go open for buyers.",
  },
];

export default function RolePage() {
  const t = useT();
  return (
    <main className="mx-auto min-h-dvh w-full max-w-md px-4 pt-[max(2rem,env(safe-area-inset-top))] pb-[max(1.5rem,env(safe-area-inset-bottom))]">
      <h1 className="font-display text-3xl font-bold tracking-tight">
        {t("How will you use Molbhav?")}
      </h1>
      <p className="mt-2 text-muted-foreground">{t("You can switch any time from Profile.")}</p>

      <ul className="mt-8 flex flex-col gap-3">
        {roles.map(({ role, icon: Icon, title, body }, i) => (
          <li
            key={role}
            className="animate-[rise_300ms_var(--ease-out)_both]"
            style={{ animationDelay: `${i * 50}ms` }}
          >
            <button
              type="button"
              onClick={() => chooseRole(role)}
              className={`flex w-full items-center gap-4 rounded-xl border border-border bg-card p-4 text-left ${pressable}`}
            >
              <span className="grid size-12 shrink-0 place-items-center rounded-full bg-primary/10 text-primary">
                <Icon className="size-6" aria-hidden />
              </span>
              <span className="flex-1">
                <span className="block font-display text-lg font-semibold">{t(title)}</span>
                <span className="block text-sm text-muted-foreground">{t(body)}</span>
              </span>
              <ChevronRight className="size-5 shrink-0 text-muted-foreground" aria-hidden />
            </button>
          </li>
        ))}
      </ul>
    </main>
  );
}
