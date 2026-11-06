"use client";

import { useState, type ReactNode } from "react";
import { LogOut } from "lucide-react";
import { LanguagePicker } from "@/components/app/language-picker";
import { ThemeToggle } from "@/components/app/theme-toggle";
import { action, focusRing } from "@/components/ui/styles";
import { chooseRole, signOut, useRole } from "@/lib/role";
import type { Role } from "@/lib/roles";

const roles: { role: Role; label: string }[] = [
  { role: "buyer", label: "Buyer" },
  { role: "shopkeeper", label: "Stall" },
];

export function ProfileSettings({ children }: { children?: ReactNode }) {
  const current = useRole();
  const [leaving, setLeaving] = useState(false);

  return (
    <>
      <section className="mt-6">
        <h2 id="role-label" className="mb-2 text-sm font-medium text-muted-foreground">
          Using Molbhav as
        </h2>
        <div
          role="group"
          aria-labelledby="role-label"
          className="grid grid-cols-2 gap-1 rounded-full bg-muted p-1"
        >
          {roles.map(({ role, label }) => (
            <button
              key={role}
              type="button"
              aria-pressed={current === role}
              onClick={() => current !== role && chooseRole(role)}
              className={`h-11 rounded-full text-sm font-semibold transition-[background-color,color] duration-150 ${focusRing} ${
                current === role ? "bg-primary text-primary-foreground" : "text-muted-foreground"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </section>

      {children}

      <section className="mt-6 divide-y divide-border rounded-xl border border-border bg-card">
        <div className="flex items-center justify-between gap-3 p-4">
          <span className="min-w-0">
            <span className="block font-medium">Language</span>
            <span className="block text-sm text-muted-foreground">
              For the app&apos;s words. Chats are translated either way.
            </span>
          </span>
          <LanguagePicker className="border border-input hover:bg-accent" />
        </div>
        <div className="flex items-center justify-between gap-3 p-4">
          <span className="min-w-0">
            <span className="block font-medium">Appearance</span>
            <span className="block text-sm text-muted-foreground">
              Follows your phone unless you pick one
            </span>
          </span>
          <ThemeToggle />
        </div>
      </section>

      <button
        type="button"
        disabled={leaving}
        onClick={() => {
          setLeaving(true);
          signOut().catch(() => setLeaving(false));
        }}
        className={`${action.outline} mt-8 disabled:opacity-60`}
      >
        <LogOut className="size-5" aria-hidden />
        {leaving ? "Signing out…" : "Sign out"}
      </button>
    </>
  );
}
