import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ChevronRight } from "lucide-react";
import { AutoOrderCard } from "@/components/app/auto-order-card";
import { LinePreview } from "@/components/app/line-preview";
import { LiveRefresh } from "@/components/app/live-refresh";
import { Screen } from "@/components/app/screen";
import { StallAvatar } from "@/components/app/stall-avatar";
import { focusRing } from "@/components/ui/styles";
import { T } from "@/lib/i18n";
import { autoPending } from "@/lib/limits";
import { bestPrice, isOpen, statusChip } from "@/lib/offer-status";
import { autoOrderStep } from "@/lib/server/auto-order";
import { me, myBargain, type OfferView } from "@/lib/server/bargains";
import { decideBargain } from "@/lib/server/decide-bargain";
import { pendingMatches, seedHaggle } from "@/lib/server/negotiate";
import { rupees } from "@/lib/want";

async function BargainPageContent({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await me();
  let bargain = await myBargain(user, id);
  if (!bargain) notFound();
  // Finish a seed that stopped after the redirect. Each offer is claimed once, so this never
  // repeats lines the background seed is already writing.
  const pending = await pendingMatches(id);
  if (pending.length) {
    await seedHaggle(id, pending, bargain.budget).catch(() => {});
    await decideBargain(id, user.id).catch((err) => console.error("decideBargain", id, err));
    bargain = (await myBargain(user, id)) ?? bargain;
  }
  // Catch up auto-order if the background worker stopped mid-countdown.
  await autoOrderStep(user.id, id).catch((err) => console.error("auto-order", err));
  bargain = (await myBargain(user, id)) ?? bargain;

  const best = bestPrice(bargain.offers);
  // Going offers by price (cheapest first), then the ones with no price yet, then those that said no.
  const rank = (o: OfferView) =>
    o.status === "declined" ? Infinity : (o.current ?? Number.MAX_SAFE_INTEGER - 1);
  const offers = [...bargain.offers].sort((a, b) => rank(a) - rank(b));
  const talking = offers.some((o) => isOpen(o.status));
  const going = offers.filter((o) => o.status !== "declined");
  const autoBusy = bargain.autoOrder && (!bargain.auto || autoPending(bargain.auto));

  return (
    <Screen title={bargain.title} back="/bargains">
      <LiveRefresh active={talking || autoBusy} />

      <PriceBoard
        want={bargain.want}
        budget={bargain.budget}
        offers={going}
        best={best}
        deal={bargain.offers.find((o) => o.status === "agreed" || o.status === "paid") ?? null}
        talking={talking}
        minutesAgo={bargain.minutesAgo}
      />

      {bargain.auto && <AutoOrderCard bargainId={bargain.id} auto={bargain.auto} />}

      {!offers.length ? (
        <p className="mt-4 rounded-2xl border border-dashed border-border p-6 text-center text-muted-foreground">
          <T msg="No stall near you sells that yet. Try other words." />
        </p>
      ) : (
        <ul className="mt-4 divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
          {offers.map((o, i) => (
            <OfferRow
              key={o.stall.id}
              href={`/bargains/${bargain.id}/${o.stall.id}`}
              offer={o}
              best={isOpen(o.status) && o.current !== null && o.current === best}
              index={i}
            />
          ))}
        </ul>
      )}
    </Screen>
  );
}

/**
 * The bargain at a glance: what was asked for, the best price so far, and every stall placed on one
 * price line with the buyer's budget marked, so "who's cheapest, and is it in budget" reads in a look.
 */
function PriceBoard({
  want,
  budget,
  offers,
  best,
  deal,
  talking,
  minutesAgo,
}: {
  want: string;
  budget: number | null;
  offers: OfferView[];
  best: number | null;
  /** The agreed or paid offer, once there is one: the board then shows that deal. */
  deal: OfferView | null;
  talking: boolean;
  minutesAgo: number;
}) {
  const priced = offers.filter((o): o is OfferView & { current: number } => o.current !== null);
  const values = [...priced.map((o) => o.current), ...(budget !== null ? [budget] : [])];
  const lo = values.length ? Math.min(...values) : 0;
  const hi = values.length ? Math.max(...values) : 0;
  const pad = Math.max(1, (hi - lo) * 0.15);
  const at = (v: number) => (hi === lo ? 50 : ((v - (lo - pad)) / (hi - lo + 2 * pad)) * 100);
  // Stalls priced almost the same would cover each other: alternate them above and below the line.
  const lift = new Map<string, number>();
  let prevAt = -Infinity;
  let flip = 0;
  for (const o of [...priced].sort((a, b) => a.current - b.current)) {
    const x = at(o.current);
    flip = x - prevAt < 9 ? flip + 1 : 0;
    lift.set(o.stall.id, flip === 0 ? 0 : flip % 2 ? -18 : 18);
    prevAt = x;
  }

  return (
    <section
      aria-label={want}
      className="relative isolate animate-[rise_300ms_var(--ease-out)] overflow-hidden rounded-3xl bg-hero p-5 text-hero-foreground"
    >
      <div className="flex items-center justify-between gap-3 text-sm">
        <p className="flex items-center gap-2 font-medium">
          {talking ? (
            <>
              <span className="relative flex size-2.5" aria-hidden>
                <span className="absolute inset-0 rounded-full bg-secondary motion-safe:animate-[radar_1.6s_var(--ease-out)_infinite]" />
                <span className="relative size-2.5 rounded-full bg-secondary" />
              </span>
              <T msg="Asking {n} stalls" vars={{ n: offers.length }} />
            </>
          ) : (
            <T msg="Started {when}" ago={minutesAgo} />
          )}
        </p>
        {budget !== null && (
          <p className="text-hero-foreground/75 tabular-nums">
            <T msg="Your budget" /> {rupees(budget)}
          </p>
        )}
      </div>

      <p className="mt-3 font-display text-lg leading-snug font-semibold text-balance">“{want}”</p>

      {(deal?.current ?? best) !== null && (
        <p className="mt-4 flex items-baseline gap-2">
          <span className="font-display text-4xl font-bold tabular-nums">
            {rupees((deal?.current ?? best) as number)}
          </span>
          <span
            className={`text-sm ${deal?.status === "paid" ? "font-semibold text-hero-success" : "text-hero-foreground/75"}`}
          >
            <T msg={deal ? statusChip(deal.status, false).label : "Best offer"} />
            {deal && <> · {deal.stall.name}</>}
          </span>
        </p>
      )}

      {priced.length > 0 && (
        <div className="relative mx-3 mt-7 mb-9 h-10" aria-hidden>
          <div className="absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-hero-foreground/15" />
          {budget !== null && (
            <div className="absolute inset-y-0" style={{ left: `${at(budget)}%` }}>
              <span className="absolute inset-y-0 w-0.5 -translate-x-1/2 rounded-full bg-hero-foreground/60" />
              <span className="absolute top-full mt-1 -translate-x-1/2 text-[11px] whitespace-nowrap text-hero-foreground/75 tabular-nums">
                {rupees(budget)}
              </span>
            </div>
          )}
          {priced.map((o, i) => (
            <span
              key={o.stall.id}
              className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 transition-[left,margin] duration-500 ease-out"
              style={{ left: `${at(o.current)}%`, marginTop: lift.get(o.stall.id) ?? 0 }}
            >
              <span
                className="block animate-[pop_300ms_var(--ease-out)_both] rounded-full bg-card"
                style={{ animationDelay: `${i * 60}ms` }}
              >
                <StallAvatar
                  id={o.stall.id}
                  name={o.stall.name}
                  size="sm"
                  className={`ring-2 ${o.current === best ? "ring-secondary" : "ring-hero"}`}
                />
              </span>
            </span>
          ))}
        </div>
      )}

      {talking && (
        <p className="text-sm text-hero-foreground/75">
          <T msg="Offers show up here as stalls reply." />
        </p>
      )}
    </section>
  );
}

/** One stall, read like a conversation in a chat list: who, the latest line, the price. */
function OfferRow({
  href,
  offer: o,
  best,
  index,
}: {
  href: string;
  offer: OfferView;
  best: boolean;
  index: number;
}) {
  const chip = statusChip(o.status, best);
  const out = o.status === "declined";
  return (
    <li
      className="animate-[rise_240ms_var(--ease-out)_both]"
      style={{ animationDelay: `${index * 40}ms` }}
    >
      <Link
        href={href}
        className={`flex items-center gap-3 px-4 py-3.5 transition-colors duration-150 hover:bg-muted/50 active:bg-muted ${focusRing} ${out ? "opacity-60" : ""}`}
      >
        <StallAvatar id={o.stall.id} name={o.stall.name} size="lg" />
        {/* Chat-list layout: who and when on top, the latest line and the price below. */}
        <span className="grid min-w-0 flex-1 grid-cols-[minmax(0,1fr)] gap-1">
          <span className="flex items-center gap-2">
            <span className="min-w-0 truncate font-semibold">{o.stall.name}</span>
            <span
              className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${chip.className}`}
            >
              <T msg={chip.label} />
            </span>
          </span>
          <span className="flex items-baseline gap-3">
            <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">
              {o.pending ? (
                <T msg="Waiting for their price" />
              ) : (
                <LinePreview line={o.last} stall={o.stall.name} />
              )}
            </span>
            {o.current !== null && !out && (
              <span className="shrink-0 font-display text-lg leading-none font-bold tabular-nums">
                {rupees(o.current)}
              </span>
            )}
          </span>
        </span>
        <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
      </Link>
    </li>
  );
}

export default async function BargainPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense
      fallback={
        <main className="mx-auto min-h-dvh w-full max-w-md animate-pulse px-4 pt-[max(1rem,env(safe-area-inset-top))]">
          <div className="mb-4 h-11 w-2/3 rounded-lg bg-muted" />
          <div className="h-56 rounded-3xl bg-muted" />
          <div className="mt-4 h-64 rounded-2xl bg-muted" />
        </main>
      }
    >
      <BargainPageContent params={params} />
    </Suspense>
  );
}
