import { Suspense } from "react";
import { MarketAddressCard } from "@/components/app/market-address-card";
import { ProfileLink } from "@/components/app/profile-link";
import { SwitchToShopkeeper } from "@/components/app/switch-to-shopkeeper";
import { Logo } from "@/components/brand/logo";

export default function Home() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col gap-6 px-4 pt-[max(1.5rem,env(safe-area-inset-top))] pb-[max(1.5rem,env(safe-area-inset-bottom))]">
      <header className="flex items-center justify-between gap-3">
        <Logo />
        <Suspense fallback={null}>
          <ProfileLink />
        </Suspense>
      </header>
      <section className="rounded-2xl border border-border bg-card p-5">
        <h1 className="font-display text-2xl font-bold tracking-tight">Buyer home</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Bargaining comes next. Shopkeepers register their stall under{" "}
          <Suspense fallback={<span className="font-medium text-foreground">I run a stall</span>}>
            <SwitchToShopkeeper>I run a stall</SwitchToShopkeeper>
          </Suspense>
          .
        </p>
      </section>
      <MarketAddressCard />
    </main>
  );
}
