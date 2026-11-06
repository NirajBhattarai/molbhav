"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CircleUserRound, HandCoins, House, Store, type LucideIcon } from "lucide-react";
import { focusRing } from "@/components/ui/styles";
import { useT, type Msg } from "@/lib/i18n";
import { useRole } from "@/lib/role";
import type { Role } from "@/lib/roles";

type Tab = { href: string; label: Msg; icon: LucideIcon };

const profile: Tab = { href: "/profile", label: "Profile", icon: CircleUserRound };

const tabsFor: Record<Role, Tab[]> = {
  buyer: [
    { href: "/", label: "Home", icon: House },
    { href: "/bargains", label: "Bargains", icon: HandCoins },
    profile,
  ],
  shopkeeper: [{ href: "/shop", label: "Stall", icon: Store }, profile],
};

export function TabBar() {
  const path = usePathname();
  const role = useRole();
  const t = useT();
  // Unknown until the role cookie is read. A deal chat owns the bottom chrome.
  if (!role || /^\/bargains\/[^/]+\/[^/]+/.test(path) || /^\/shop\/deals\//.test(path)) return null;

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card/95 pb-[env(safe-area-inset-bottom)] backdrop-blur">
      <ul className="mx-auto grid max-w-md auto-cols-fr grid-flow-col">
        {tabsFor[role].map(({ href, label, icon: Icon }) => {
          const active = href === "/" ? path === "/" : path.startsWith(href);
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={`flex h-16 flex-col items-center justify-center gap-1 text-xs transition-[color,transform] duration-150 ease-out active:scale-95 ${focusRing} ${
                  active ? "font-semibold text-primary" : "text-muted-foreground"
                }`}
              >
                <Icon className="size-6" aria-hidden />
                {t(label)}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
