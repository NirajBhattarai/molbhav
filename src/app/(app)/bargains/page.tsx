import Link from "next/link";
import { Suspense } from "react";
import { ChevronRight } from "lucide-react";
import { LiveRefresh } from "@/components/app/live-refresh";
import { Screen } from "@/components/app/screen";
import { pressable } from "@/components/ui/styles";
import { T } from "@/lib/i18n";
import { bestPrice, isOpen } from "@/lib/offer-status";
import { me, myBargains } from "@/lib/server/bargains";
import { rupees } from "@/lib/want";

export default function BargainsPage() {
  return (
    <Screen title={<T msg="Bargains" />}>
      <Suspense fallback={<div className="h-40 animate-pulse rounded-xl bg-muted" />}>
        <List />
      </Suspense>
    </Screen>
  );
}

async function List() {
  const bargains = await myBargains(await me());
  if (!bargains.length) {
    return (
      <p className="rounded-xl border border-dashed border-border p-6 text-center text-muted-foreground">
        <T msg="No bargains yet. Say what you want on Home." />
      </p>
    );
  }
  const live = bargains.some((b) => b.offers.some((o) => o.pending || isOpen(o.status)));

  return (
    <ul className="flex flex-col gap-3">
      <LiveRefresh active={live} every={4000} />
      {bargains.map((b) => {
        const going = b.offers.filter((o) => o.status !== "declined");
        const best = bestPrice(b.offers);
        return (
          <li key={b.id} className="animate-[rise_300ms_var(--ease-out)_both]">
            <Link
              href={`/bargains/${b.id}`}
              className={`flex items-center gap-3 rounded-xl border border-border bg-card p-4 ${pressable}`}
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{b.title}</span>
                <span className="block text-sm text-muted-foreground">
                  {going.length === 1 ? (
                    <T msg="1 stall" />
                  ) : (
                    <T msg="{n} stalls" vars={{ n: going.length }} />
                  )}{" "}
                  · <T msg="Started {when}" ago={b.minutesAgo} />
                </span>
              </span>
              <span className="text-right">
                {best !== null && (
                  <span className="block font-display text-lg font-bold text-success tabular-nums">
                    {rupees(best)}
                  </span>
                )}
                {b.budget !== null && (
                  <span className="block text-xs text-muted-foreground tabular-nums">
                    <T msg="Budget {price}" vars={{ price: rupees(b.budget) }} />
                  </span>
                )}
              </span>
              <ChevronRight className="size-5 shrink-0 text-muted-foreground" aria-hidden />
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
