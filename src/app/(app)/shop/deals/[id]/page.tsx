import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ShopDeal } from "@/components/app/shop-deal";
import { me, stallDeal } from "@/lib/server/bargains";

async function DealPageContent({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const found = await stallDeal(await me(), id);
  if (!found) notFound();
  return <ShopDeal deal={found.deal} turns={found.turns} next={found.next} />;
}

export default function StallDealPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense
      fallback={
        <main className="mx-auto min-h-dvh w-full max-w-md animate-pulse px-4 pt-[max(1rem,env(safe-area-inset-top))]">
          <div className="mb-4 h-11 w-2/3 rounded-lg bg-muted" />
          <div className="h-28 rounded-2xl bg-muted" />
          <div className="mt-4 h-64 rounded-2xl bg-muted" />
        </main>
      }
    >
      <DealPageContent params={params} />
    </Suspense>
  );
}
