"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Bluetooth, LogOut, MapPin } from "lucide-react";
import { LanguagePicker } from "@/components/app/language-picker";
import { ThemeToggle } from "@/components/app/theme-toggle";
import { action, focusRing } from "@/components/ui/styles";
import {
  hydrateDiscoveryMode,
  setDiscoveryMode,
  useDiscoveryMode,
  type DiscoveryMode,
} from "@/lib/discovery";
import { useT, type Msg } from "@/lib/i18n";
import { chooseRole, signOut, useRole } from "@/lib/role";
import type { Role } from "@/lib/roles";
import { saveDiscoveryMode } from "@/lib/settings-actions";

const roles: { role: Role; label: Msg }[] = [
  { role: "buyer", label: "Buyer" },
  { role: "shopkeeper", label: "Stall" },
];

const discoveryModes: {
  id: DiscoveryMode;
  label: Msg;
  hint: Msg;
  Icon: typeof MapPin;
}[] = [
  {
    id: "location",
    label: "Search by location",
    hint: "Find open stalls near your GPS pin.",
    Icon: MapPin,
  },
  {
    id: "nearby",
    label: "Nearby agents",
    hint: "Shop with stall agents your phone hears nearby.",
    Icon: Bluetooth,
  },
];

export function ProfileSettings({
  children,
  initialDiscovery,
}: {
  children?: ReactNode;
  /** Server value (Redis → DB) to seed the local mirror. */
  initialDiscovery?: DiscoveryMode;
}) {
  const t = useT();
  const current = useRole();
  const discovery = useDiscoveryMode();
  const [leaving, setLeaving] = useState(false);
  const [savingDiscovery, setSavingDiscovery] = useState(false);

  useEffect(() => {
    if (initialDiscovery) hydrateDiscoveryMode(initialDiscovery);
  }, [initialDiscovery]);

  function pickDiscovery(mode: DiscoveryMode) {
    if (mode === discovery || savingDiscovery) return;
    setDiscoveryMode(mode);
    setSavingDiscovery(true);
    void saveDiscoveryMode(mode)
      .then((res) => {
        if ("error" in res) hydrateDiscoveryMode(discovery);
        else if (res.mode) hydrateDiscoveryMode(res.mode);
      })
      .catch(() => hydrateDiscoveryMode(discovery))
      .finally(() => setSavingDiscovery(false));
  }

  return (
    <>
      <section className="mt-6">
        <h2 id="role-label" className="mb-2 text-sm font-medium text-muted-foreground">
          {t("Using Molbhav as")}
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
              {t(label)}
            </button>
          ))}
        </div>
      </section>

      {children}

      {(current === "buyer" || current === null) && (
        <section className="mt-6">
          <h2 id="discovery-label" className="mb-2 text-sm font-medium text-muted-foreground">
            {t("How your agent finds stalls")}
          </h2>
          <div
            role="group"
            aria-labelledby="discovery-label"
            className="relative grid grid-cols-2 gap-1 rounded-2xl bg-muted p-1"
          >
            <span
              aria-hidden
              className={`absolute inset-y-1 left-1 w-[calc(50%-0.25rem)] rounded-xl bg-card shadow-sm ring-1 ring-border transition-transform duration-200 ease-out ${
                discovery === "nearby" ? "translate-x-full" : ""
              }`}
            />
            {discoveryModes.map(({ id, label, Icon }) => {
              const on = discovery === id;
              return (
                <button
                  key={id}
                  type="button"
                  aria-pressed={on}
                  disabled={savingDiscovery}
                  onClick={() => pickDiscovery(id)}
                  className={`relative flex min-h-11 items-center justify-center gap-2 rounded-xl px-2 text-sm transition-[color,transform] duration-150 ease-out active:scale-[0.97] disabled:opacity-60 ${focusRing} ${
                    on ? "font-semibold text-foreground" : "font-medium text-muted-foreground"
                  }`}
                >
                  <Icon className={`size-4 shrink-0 ${on ? "text-primary" : ""}`} aria-hidden />
                  <span className="truncate">{t(label)}</span>
                </button>
              );
            })}
          </div>
          <p className="mt-2 text-sm text-muted-foreground">
            {t(discoveryModes.find((m) => m.id === discovery)!.hint)}
          </p>
        </section>
      )}

      <section className="mt-6 divide-y divide-border rounded-xl border border-border bg-card">
        <div className="flex items-center justify-between gap-3 p-4">
          <span className="min-w-0">
            <span className="block font-medium">{t("Language")}</span>
            <span className="block text-sm text-muted-foreground">
              {t("For the app's words. Chats are translated either way.")}
            </span>
          </span>
          <LanguagePicker className="border border-input hover:bg-accent" />
        </div>
        <div className="flex items-center justify-between gap-3 p-4">
          <span className="min-w-0">
            <span className="block font-medium">{t("Appearance")}</span>
            <span className="block text-sm text-muted-foreground">
              {t("Follows your phone unless you pick one")}
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
        {leaving ? t("Signing out…") : t("Sign out")}
      </button>
    </>
  );
}
