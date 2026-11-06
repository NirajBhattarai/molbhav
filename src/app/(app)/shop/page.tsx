import { Suspense } from "react";
import { ShopScreen } from "@/components/app/shop-screen";
import { T } from "@/lib/i18n";
import { me, shopDealsSummary } from "@/lib/server/bargains";
import { myShop } from "@/lib/server/shop";

async function ShopContent() {
  const user = await me();
  const [shop, bargains] = await Promise.all([myShop(user), shopDealsSummary(user)]);
  return (
    <ShopScreen
      stall={shop.stall}
      items={shop.items}
      bargains={bargains}
      canReadMenu={shop.canReadMenu}
    />
  );
}

export default function ShopPage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto flex min-h-dvh max-w-md items-center justify-center text-sm text-muted-foreground">
          <T msg="Loading your stall…" />
        </div>
      }
    >
      <ShopContent />
    </Suspense>
  );
}
