import { connection } from "next/server";
import { Suspense } from "react";
import { HomeRefresh } from "@/components/app/home-refresh";
import { ProfileLink } from "@/components/app/profile-link";
import { Screen } from "@/components/app/screen";
import { WantForm } from "@/components/app/want-form";
import { BlockPrint } from "@/components/brand/block-print";
import { Logo } from "@/components/brand/logo";
import { T } from "@/lib/i18n";
import { isLang } from "@/lib/languages";
import { stallsNear } from "@/lib/server/shop";

export default function Home() {
  return (
    <Screen>
      <HomeRefresh />
      <header className="mb-4 flex h-11 items-center justify-between gap-3">
        <Logo />
        <Suspense fallback={null}>
          <ProfileLink />
        </Suspense>
      </header>

      <section className="relative animate-[rise_400ms_var(--ease-out)] overflow-hidden rounded-2xl bg-hero p-5 text-hero-foreground">
        <BlockPrint className="pointer-events-none absolute inset-0 text-secondary opacity-15" />
        <div className="relative">
          <Suspense fallback={<p className="h-5" />}>
            <OpenNearYou />
          </Suspense>
          <h1 className="mt-3 font-display text-3xl leading-tight font-bold tracking-tight">
            <T msg="Say what you want. Your agent bargains for you." />
          </h1>
          <WantForm />
        </div>
      </section>

      <h2 className="mt-8 mb-3 font-display text-lg font-semibold">
        <T msg="Stalls near you" />
      </h2>
      <Suspense fallback={<div className="h-72 animate-pulse rounded-xl bg-muted" />}>
        <Stalls />
      </Suspense>
    </Screen>
  );
}

async function OpenNearYou() {
  await connection();
  const open = (await stallsNear()).filter((s) => s.open).length;
  return (
    <p className="flex h-5 items-center gap-2 text-sm font-medium text-hero-success">
      <span className="relative flex size-2.5">
        <span className="absolute inset-0 rounded-full bg-hero-success motion-safe:animate-[radar_1.6s_var(--ease-out)_infinite]" />
        <span className="relative size-2.5 rounded-full bg-hero-success" />
      </span>
      {open === 1 ? (
        <T msg="1 stall open near you" />
      ) : (
        <T msg="{n} stalls open near you" vars={{ n: open }} />
      )}
    </p>
  );
}

async function Stalls() {
  await connection();
  const stalls = await stallsNear();
  if (!stalls.length) {
    return (
      <p className="rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground">
        <T msg="No stalls are set up yet. When shopkeepers open, they’ll show up here." />
      </p>
    );
  }
  return (
    <ul className="divide-y divide-border rounded-xl border border-border bg-card">
      {stalls.map((s) => {
        const code = isLang(s.lang) ? s.lang : "en";
        return (
          <li key={s.id} className={`flex items-center gap-3 p-4 ${s.open ? "" : "opacity-60"}`}>
            <span className="grid size-10 shrink-0 place-items-center rounded-full bg-muted font-display font-bold text-primary">
              {s.name[0]}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium">{s.name}</span>
              <span className="block truncate text-sm text-muted-foreground">
                <T msg={s.open ? "Open" : "Closed"} />
                {" · "}
                <T msg="Speaks {language}" language={code} />
              </span>
            </span>
          </li>
        );
      })}
    </ul>
  );
}
