import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense, type CSSProperties } from "react";
import { ChevronRight } from "lucide-react";
import { LiveRefresh } from "@/components/app/live-refresh";
import { Screen } from "@/components/app/screen";
import { pressable } from "@/components/ui/styles";
import { T } from "@/lib/i18n";
import { bestPrice, isOpen, statusChip } from "@/lib/offer-status";
import { me, myBargain } from "@/lib/server/bargains";
import { seedHaggle, pendingMatches } from "@/lib/server/negotiate";
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
    bargain = (await myBargain(user, id)) ?? bargain;
  }

  const best = bestPrice(bargain.offers);
  const rank = (o: (typeof bargain.offers)[number]) =>
    o.status === "declined" ? Infinity : (o.current ?? Number.MAX_SAFE_INTEGER);
  const offers = [...bargain.offers].sort((a, b) => rank(a) - rank(b));
  const talking = offers.some((o) => o.pending || o.status === "waiting");

  return (
    <Screen title={bargain.title} back="/bargains">
      <LiveRefresh active={talking} />
      <p className="-mt-2 mb-5 text-muted-foreground">
        {bargain.budget !== null && (
          <>
            <T msg="Your budget" />{" "}
            <span className="font-semibold text-foreground tabular-nums">
              {rupees(bargain.budget)}
            </span>{" "}
            ·{" "}
          </>
        )}
        <T msg="Started {when}" ago={bargain.minutesAgo} />
      </p>

      {talking && (
        <section
          role="status"
          className="mb-4 animate-[rise_300ms_var(--ease-out)] rounded-xl bg-hero p-4 text-hero-foreground"
        >
          <p className="flex items-center gap-2 text-sm font-medium text-hero-success">
            <span className="relative flex size-2.5">
              <span className="absolute inset-0 rounded-full bg-hero-success motion-safe:animate-[radar_1.6s_var(--ease-out)_infinite]" />
              <span className="relative size-2.5 rounded-full bg-hero-success" />
            </span>
            <T msg="Asking {n} stalls" vars={{ n: offers.length }} />
          </p>
          <p className="mt-1 font-display text-lg font-semibold">“{bargain.want}”</p>
          <p className="text-sm text-hero-foreground/80">
            <T msg="Offers show up here as stalls reply." />
          </p>
        </section>
      )}

      {!offers.length && (
        <p className="rounded-xl border border-dashed border-border p-6 text-center text-muted-foreground">
          <T msg="No stall near you sells that yet. Try other words." />
        </p>
      )}

      <ul className="flex flex-col gap-3">
        {offers.map((o) => {
          const chip = statusChip(o.status, isOpen(o.status) && o.current === best);
          const asked = o.asked ?? o.current;
          const drop =
            asked && o.current !== null ? Math.round(((asked - o.current) / asked) * 100) : 0;
          const fits = bargain.budget === null || (o.current ?? Infinity) <= bargain.budget;
          return (
            <li key={o.stall.id} className="animate-[rise_240ms_var(--ease-out)_both]">
              <Link
                href={`/bargains/${bargain.id}/${o.stall.id}`}
                className={`block rounded-xl border bg-card p-4 ${pressable} ${
                  o.status === "declined"
                    ? "border-border opacity-70"
                    : chip.className.startsWith("bg-success")
                      ? "border-success"
                      : "border-border"
                }`}
              >
                <div className="flex items-start gap-3">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{o.stall.name}</span>
                    <span className="block text-sm text-muted-foreground">
                      <T msg="Speaks {language}" language={o.stall.lang} />
                    </span>
                  </span>
                  <span
                    className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold ${chip.className}`}
                  >
                    <T msg={chip.label} />
                  </span>
                </div>

                {o.current === null ? (
                  // A stall that said no before giving a price has nothing to wait for.
                  o.status !== "declined" && (
                    <p className="mt-4 text-sm text-muted-foreground">
                      <T msg="Waiting for their price" />
                    </p>
                  )
                ) : (
                  <>
                    <div className="mt-4 flex items-baseline gap-2 tabular-nums">
                      <span className="font-display text-2xl font-bold">{rupees(o.current)}</span>
                      {drop > 0 && asked && (
                        <>
                          <span className="text-sm text-muted-foreground line-through">
                            {rupees(asked)}
                          </span>
                          <span className="text-sm font-medium text-success">−{drop}%</span>
                        </>
                      )}
                    </div>
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden>
                      <div
                        key={o.current}
                        className={`h-full origin-left rounded-full motion-safe:animate-[settle_500ms_var(--ease-out)_200ms_both] ${fits ? "bg-success" : "bg-secondary"}`}
                        style={
                          {
                            width: `${100 - drop}%`,
                            "--from": 100 / Math.max(1, 100 - drop),
                          } as CSSProperties
                        }
                      />
                    </div>
                  </>
                )}
                <span className="mt-3 flex items-center justify-end gap-1 text-sm font-medium text-primary">
                  <T msg="Open the chat" />
                  <ChevronRight className="size-4" aria-hidden />
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </Screen>
  );
}

export default async function BargainPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense
      fallback={
        <main className="mx-auto min-h-dvh w-full max-w-md animate-pulse px-4 pt-[max(1rem,env(safe-area-inset-top))]">
          <div className="mb-6 h-11 w-2/3 rounded-lg bg-muted" />
          <div className="h-28 rounded-xl bg-muted" />
        </main>
      }
    >
      <BargainPageContent params={params} />
    </Suspense>
  );
}
