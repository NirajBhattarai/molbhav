import { Suspense } from "react";
import { Screen } from "@/components/app/screen";
import { ShopDeals } from "@/components/app/shop-deals";
import { T } from "@/lib/i18n";
import { me, shopDealsActive } from "@/lib/server/bargains";

async function DealsContent() {
  const { deals, ended, now } = await shopDealsActive(await me());
  return <ShopDeals deals={deals} ended={ended} now={now} />;
}

export default function ShopDealsPage() {
  return (
    <Screen title={<T msg="Today’s bargains" />} back="/shop">
      <Suspense
        fallback={
          <div className="grid gap-3" aria-busy>
            <div className="h-6 w-1/3 animate-pulse rounded bg-muted" />
            <div className="h-48 animate-pulse rounded-2xl bg-muted" />
            <div className="h-16 animate-pulse rounded-2xl bg-muted" />
          </div>
        }
      >
        <DealsContent />
      </Suspense>
    </Screen>
  );
}
