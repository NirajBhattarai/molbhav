import { Suspense } from "react";
import { ShopScreen } from "@/components/app/shop-screen";
import { me, myShop } from "@/lib/server/shop";

async function ShopContent() {
  const user = await me();
  const shop = await myShop(user);
  return (
    <ShopScreen
      stall={shop.stall}
      items={shop.items}
      canReadMenu={shop.canReadMenu}
      email={user.email}
    />
  );
}

export default function ShopPage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto flex min-h-dvh max-w-md items-center justify-center text-sm text-muted-foreground">
          Loading your stall…
        </div>
      }
    >
      <ShopContent />
    </Suspense>
  );
}
