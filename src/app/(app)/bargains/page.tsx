import Link from "next/link";
import { Suspense } from "react";
import { HandCoins } from "lucide-react";
import { LinePreview } from "@/components/app/line-preview";
import { LiveRefresh } from "@/components/app/live-refresh";
import { Screen } from "@/components/app/screen";
import { StallAvatar } from "@/components/app/stall-avatar";
import { action, focusRing } from "@/components/ui/styles";
import { Ago, T } from "@/lib/i18n";
import { bestPrice, isOpen, statusChip } from "@/lib/offer-status";
import { me, myBargains, type BargainView } from "@/lib/server/bargains";
import { rupees } from "@/lib/want";

export default function BargainsPage() {
  return (
    <Screen title={<T msg="Bargains" />}>
      <Suspense
        fallback={
          <div className="h-72 animate-pulse rounded-2xl border border-border bg-muted/60" />
        }
      >
        <Inbox />
      </Suspense>
    </Screen>
  );
}

async function Inbox() {
  const bargains = await myBargains(await me());
  if (!bargains.length) {
    return (
      <div className="grid justify-items-center gap-4 rounded-3xl border border-dashed border-border px-6 py-10 text-center">
        <span className="grid size-14 place-items-center rounded-2xl bg-secondary/25 text-secondary-foreground">
          <HandCoins className="size-7" aria-hidden />
        </span>
        <p className="text-pretty text-muted-foreground">
          <T msg="No bargains yet. Say what you want on Home." />
        </p>
        <Link href="/" className={`${action.primary} w-auto`}>
          <T msg="Home" />
        </Link>
      </div>
    );
  }

  // Bargains still being talked over come first, newest first within each.
  const live = (b: BargainView) => b.offers.some((o) => isOpen(o.status));
  const sorted = [...bargains].sort((a, b) => Number(live(b)) - Number(live(a)));

  return (
    <>
      <LiveRefresh active={sorted.some(live)} every={4000} />
      <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
        {sorted.map((b, i) => (
          <Row key={b.id} bargain={b} live={live(b)} index={i} />
        ))}
      </ul>
    </>
  );
}

/** One bargain as a conversation in an inbox: the stalls, the latest line, the price that matters. */
function Row({ bargain: b, live, index }: { bargain: BargainView; live: boolean; index: number }) {
  const deal = b.offers.find((o) => o.status === "paid" || o.status === "agreed");
  const latest = b.offers[0]; // newest change first
  const going = b.offers.filter((o) => o.status !== "declined");
  const price = deal?.current ?? bestPrice(b.offers);
  const chip = deal ? statusChip(deal.status, false) : null;
  const faces = (deal ? [deal] : going.length ? going : b.offers).slice(0, 2);

  return (
    <li
      className="animate-[rise_240ms_var(--ease-out)_both]"
      style={{ animationDelay: `${index * 40}ms` }}
    >
      <Link
        href={`/bargains/${b.id}`}
        className={`flex items-center gap-3 px-4 py-3.5 transition-colors duration-150 hover:bg-muted/50 active:bg-muted ${focusRing}`}
      >
        {/* One stall: its face. Several: two faces, overlapped like a group chat's. */}
        {faces.length === 0 ? (
          <span
            className="grid size-12 shrink-0 place-items-center rounded-full bg-muted text-muted-foreground"
            aria-hidden
          >
            <HandCoins className="size-5" />
          </span>
        ) : faces.length === 1 ? (
          <StallAvatar id={faces[0].stall.id} name={faces[0].stall.name} size="lg" />
        ) : (
          <span className="relative size-12 shrink-0" aria-hidden>
            <StallAvatar
              id={faces[0].stall.id}
              name={faces[0].stall.name}
              size="sm"
              className="absolute top-0 left-0 size-8"
            />
            <StallAvatar
              id={faces[1].stall.id}
              name={faces[1].stall.name}
              size="sm"
              className="absolute right-0 bottom-0 size-8 ring-2 ring-card"
            />
          </span>
        )}

        {/* Chat-list layout: what and when on top, the latest line and the price below. */}
        <span className="grid min-w-0 flex-1 grid-cols-[minmax(0,1fr)] gap-1">
          <span className="flex items-center gap-2">
            <span className="min-w-0 truncate font-semibold">{b.title}</span>
            {live && (
              <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-secondary/25 px-2 py-0.5 text-[11px] font-semibold">
                <span className="size-1.5 rounded-full bg-secondary motion-safe:animate-pulse" />
                <T msg="Live" />
              </span>
            )}
            {chip && (
              <span
                className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${chip.className}`}
              >
                <T msg={chip.label} />
              </span>
            )}
            <span className="ml-auto shrink-0 text-xs text-muted-foreground">
              <Ago minutes={latest?.minutesAgo ?? b.minutesAgo} />
            </span>
          </span>
          <span className="flex items-baseline gap-3">
            <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">
              {deal ? (
                <LinePreview line={deal.last} stall={deal.stall.name} />
              ) : latest ? (
                <LinePreview line={latest.last} stall={latest.stall.name} />
              ) : (
                <T msg="No stall near you sells that yet. Try other words." />
              )}
            </span>
            {price !== null && (
              <span
                className={`shrink-0 font-display text-lg leading-none font-bold tabular-nums ${deal?.status === "paid" ? "text-success" : ""}`}
              >
                {rupees(price)}
              </span>
            )}
          </span>
        </span>
      </Link>
    </li>
  );
}
