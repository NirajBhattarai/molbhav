import { Suspense } from "react";
import { ShopScreen } from "@/components/app/shop-screen";
import { me, myShop } from "@/lib/server/shop";

async function ShopContent() {
  const shop = await myShop(await me());
  return <ShopScreen stall={shop.stall} />;
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
