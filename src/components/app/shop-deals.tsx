"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import { ChevronRight, HandCoins, Handshake, RotateCw, X } from "lucide-react";
import { StallAvatar } from "@/components/app/stall-avatar";
import { LiveRefresh } from "@/components/app/live-refresh";
import { focusRing } from "@/components/ui/styles";
import { useLang, useT, type Msg } from "@/lib/i18n";
import { LANG } from "@/lib/languages";
import type { DealView } from "@/lib/server/bargains";
import { hideDeals, loadEndedDeals } from "@/lib/shop-actions";
import { rupees } from "@/lib/want";

/** Chips only for what's out of the ordinary: a plain conversation needs no label. */
const CHIP: Record<DealView["state"], { label: Msg; tone: keyof typeof TONE } | null> = {
  talking: null,
  waiting: null,
  offered: { label: "Offered", tone: "indigo" },
  won: { label: "Sold", tone: "success" },
  lost: { label: "Went elsewhere", tone: "muted" },
  "no-deal": { label: "No deal", tone: "muted" },
};

/** A group's heading: small and quiet, so the rows carry the screen. */
const GROUP = "px-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase";

// Palette: marigold while talking, indigo once agreed, green only when money has moved.
const TONE = {
  muted: "bg-muted text-muted-foreground",
  marigold: "bg-secondary/20 text-foreground",
  indigo: "bg-primary/12 text-primary",
  success: "bg-success/15 text-success",
} as const;

/* ─── Shop screen: the way in ────────────────────────────────────────────────────────────── */

/**
 * The shop screen's way into bargains: three counts (no list), so the shop screen stays light.
 * A marigold pulse says a buyer is talking right now.
 */
export function BargainsButton({
  summary,
}: {
  summary: { active: number; sold: number; ended: number };
}) {
  const t = useT();
  const stats: { n: number; label: Msg; tone: string }[] = [
    { n: summary.active, label: "Active", tone: "text-foreground" },
    { n: summary.sold, label: "Sold", tone: "text-success" },
    { n: summary.ended, label: "Ended", tone: "text-muted-foreground" },
  ];
  return (
    <Link
      href="/shop/deals"
      className={`group grid gap-3 rounded-2xl border border-border bg-card p-4 shadow-sm transition-[transform,background-color] duration-150 ease-out hover:bg-muted/30 active:scale-[0.99] ${focusRing}`}
    >
      <span className="flex min-h-11 items-center gap-2.5">
        <span
          aria-hidden
          className="relative flex size-9 shrink-0 items-center justify-center rounded-xl bg-secondary/20 text-secondary-foreground"
        >
          <HandCoins className="size-5" />
          {summary.active > 0 && (
            <span className="absolute -top-0.5 -right-0.5 flex size-3">
              <span className="absolute inset-0 rounded-full bg-secondary motion-safe:animate-[radar_1.6s_var(--ease-out)_infinite]" />
              <span className="relative size-3 rounded-full border-2 border-card bg-secondary" />
            </span>
          )}
        </span>
        <span className="flex-1 font-display text-base font-semibold">{t("Today’s bargains")}</span>
        <ChevronRight
          className="size-5 text-muted-foreground transition-transform duration-150 ease-out group-hover:translate-x-0.5"
          aria-hidden
        />
      </span>
      <span className="grid grid-cols-3 divide-x divide-border rounded-xl bg-muted/50 py-2.5">
        {stats.map((s) => (
          <span key={s.label} className="grid justify-items-center gap-0.5">
            <span className={`font-display text-2xl leading-none font-bold tabular-nums ${s.tone}`}>
              {s.n}
            </span>
            <span className="text-xs text-muted-foreground">{t(s.label)}</span>
          </span>
        ))}
      </span>
    </Link>
  );
}

/* ─── Bargains screen ────────────────────────────────────────────────────────────────────── */

/**
 * The stall's bargains in two groups. Active (talked about in the last hour, or a deal made today)
 * comes with the page. Ended starts closed and is fetched only when the shopkeeper opens it.
 */
export function ShopDeals({
  deals,
  ended,
  now,
}: {
  deals: DealView[];
  ended: number;
  now: number;
}) {
  const t = useT();
  const lang = useLang();

  // Ended deals can be cleared: instantly, undoable for a few seconds; the server forgets them after.
  const [hidden, setHidden] = useState<string[]>([]);
  const [undo, setUndo] = useState<{ ids: string[]; message: Msg } | null>(null);
  const pending = useRef<string[]>([]);
  const undoTimer = useRef<number | undefined>(undefined);
  const commit = useCallback(() => {
    window.clearTimeout(undoTimer.current);
    const ids = pending.current;
    pending.current = [];
    if (ids.length) void hideDeals(ids).catch(() => {});
  }, []);
  useEffect(() => commit, [commit]);

  function remove(ids: string[], message: Msg) {
    commit();
    pending.current = ids;
    setHidden((h) => [...h, ...ids]);
    setUndo({ ids, message });
    undoTimer.current = window.setTimeout(() => {
      commit();
      setUndo(null);
    }, 6000);
  }
  function restore() {
    window.clearTimeout(undoTimer.current);
    pending.current = [];
    setHidden((h) => h.filter((id) => !undo?.ids.includes(id)));
    setUndo(null);
  }

  // Ended: nothing is fetched until the group is opened; then once, with a retry if it fails.
  const [open, setOpen] = useState(false);
  const [endedDeals, setEndedDeals] = useState<DealView[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [loading, startLoading] = useTransition();
  const fetchEnded = useCallback(() => {
    setFailed(false);
    startLoading(async () => {
      try {
        setEndedDeals(await loadEndedDeals());
      } catch {
        setFailed(true);
      }
    });
  }, []);
  function toggle() {
    const next = !open;
    setOpen(next);
    if (next && endedDeals === null && !loading) fetchEnded();
  }

  const active = deals.filter((d) => !hidden.includes(d.id));
  const endedShown = endedDeals?.filter((d) => !hidden.includes(d.id)) ?? null;
  const endedCount = endedShown?.length ?? Math.max(0, ended - hidden.length);
  const live = active.some((d) => d.state === "talking" || d.state === "waiting");
  const talking = active.some((d) => d.state === "talking");
  const sold = active.filter((d) => d.state === "won");
  const earned = sold.reduce((sum, d) => sum + (d.final ?? 0), 0);

  // Chat-list time: short ("5 min. ago"), so the order keeps the room.
  const rel = new Intl.RelativeTimeFormat(LANG[lang].locale, { numeric: "auto", style: "narrow" });
  const since = (at: number) => {
    const minutes = Math.round((at - now) / 60_000);
    if (minutes > -60) return rel.format(minutes, "minute");
    if (minutes > -60 * 24) return rel.format(Math.round(minutes / 60), "hour");
    return rel.format(Math.round(minutes / (60 * 24)), "day");
  };
  const who: Record<NonNullable<DealView["last"]>["speaker"], Msg> = {
    stall: "Your agent",
    agent: "Buyer’s agent",
    buyer: "Buyer",
  };

  const row = (deal: DealView, removable: boolean) => {
    const chip = CHIP[deal.state];
    const out = deal.state === "lost" || deal.state === "no-deal";
    const price = deal.final ?? deal.current ?? deal.ask;
    return (
      <li
        key={deal.id}
        className={`animate-[rise_220ms_var(--ease-out)_both] ${removable ? "flex items-center pr-1" : ""}`}
      >
        <Link
          href={`/shop/deals/${deal.id}`}
          className={`flex min-h-16 min-w-0 flex-1 items-center gap-3 px-4 py-3 transition-colors duration-150 hover:bg-muted/50 active:bg-muted ${focusRing}`}
        >
          {/* Tinted by item, so the same dish keeps one colour down the list. */}
          <StallAvatar
            id={deal.item}
            name={deal.item}
            size="lg"
            className={out ? "opacity-60" : ""}
          />
          {/* Chat-list layout: the order and when on top, the latest line and the price below. */}
          <span className="grid min-w-0 flex-1 grid-cols-[minmax(0,1fr)] gap-1">
            <span className="flex items-center gap-2">
              <span
                className={`min-w-0 truncate font-semibold ${out ? "text-muted-foreground" : ""}`}
              >
                &ldquo;{deal.order}&rdquo;
              </span>
              {chip && (
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${TONE[chip.tone]}`}
                >
                  {t(chip.label)}
                </span>
              )}
              <span className="ml-auto shrink-0 text-xs text-muted-foreground tabular-nums">
                {since(deal.lastAt)}
              </span>
            </span>
            <span className="flex items-baseline gap-3">
              <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">
                {deal.state === "talking" ? (
                  <span className="inline-flex items-center gap-1.5 font-medium text-foreground">
                    <span className="size-1.5 rounded-full bg-secondary motion-safe:animate-pulse" />
                    {t("Bargaining…")}
                  </span>
                ) : deal.last ? (
                  <>
                    <span className="font-medium text-foreground/80">
                      {t(who[deal.last.speaker])}:
                    </span>{" "}
                    {deal.last.msg
                      ? t(deal.last.msg as Msg, deal.last.vars ?? undefined)
                      : deal.last.text}
                  </>
                ) : (
                  deal.item
                )}
              </span>
              <span
                className={`shrink-0 font-display text-lg leading-none font-bold tabular-nums ${deal.state === "won" ? "text-success" : out ? "text-muted-foreground" : ""}`}
              >
                {rupees(price)}
              </span>
            </span>
          </span>
        </Link>
        {removable && (
          <button
            type="button"
            onClick={() => remove([deal.id], "Removed the bargain.")}
            aria-label={t("Remove “{order}”", { order: deal.order })}
            className={`flex size-11 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-[background-color,transform] duration-150 ease-out hover:bg-muted active:scale-[0.97] ${focusRing}`}
          >
            <X className="size-5" aria-hidden />
          </button>
        )}
      </li>
    );
  };

  return (
    <div className="grid gap-5">
      <LiveRefresh active={live} every={4000} />

      {/* Today at a glance: what came in, and whether a buyer is talking right now. */}
      <section
        aria-label={t("Earned today")}
        className="animate-[rise_300ms_var(--ease-out)] rounded-3xl bg-hero p-5 text-hero-foreground"
      >
        <div className="flex items-center justify-between gap-3 text-sm">
          <p className="font-medium text-hero-foreground/75">{t("Earned today")}</p>
          {talking && (
            <p className="flex items-center gap-2 font-medium">
              <span className="relative flex size-2.5" aria-hidden>
                <span className="absolute inset-0 rounded-full bg-secondary motion-safe:animate-[radar_1.6s_var(--ease-out)_infinite]" />
                <span className="relative size-2.5 rounded-full bg-secondary" />
              </span>
              {t("Bargaining…")}
            </p>
          )}
        </div>
        <p className="mt-2 font-display text-4xl font-bold tabular-nums">{rupees(earned)}</p>
        <p className="mt-3 text-sm text-hero-foreground/75 tabular-nums">
          {t("Sold")} {sold.length} · {t("Active")} {active.length - sold.length}
        </p>
      </section>

      <div role="status" aria-live="polite" className="empty:hidden">
        {undo && (
          <p className="flex animate-[rise_200ms_var(--ease-out)_both] items-center justify-between gap-3 rounded-2xl bg-foreground py-1 pr-1 pl-4 text-sm text-background">
            {t(undo.message)}
            <button
              type="button"
              onClick={restore}
              className="min-h-11 rounded-xl px-4 font-semibold text-secondary hover:bg-background/10"
            >
              {t("Undo")}
            </button>
          </p>
        )}
      </div>

      {/* Active */}
      <section aria-labelledby="deals-active" className="grid gap-2">
        <h2 id="deals-active" className={GROUP}>
          {t("Active")} · <span className="tabular-nums">{active.length}</span>
        </h2>
        {active.length === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-border px-6 py-7 text-center">
            <Handshake className="size-6 text-muted-foreground" aria-hidden />
            <p className="font-medium">{t("No bargains yet")}</p>
            <p className="text-sm text-pretty text-muted-foreground">
              {t(
                "When a buyer asks for something you sell, your agent answers and the result shows here.",
              )}
            </p>
          </div>
        ) : (
          <DealRows>{active.map((d) => row(d, false))}</DealRows>
        )}
      </section>

      {/* Ended: closed by default, loaded on first open. */}
      {endedCount > 0 || (endedShown && endedShown.length > 0) ? (
        <section aria-labelledby="deals-ended" className="grid gap-2">
          <h2 id="deals-ended">
            <button
              type="button"
              aria-expanded={open}
              aria-controls="deals-ended-list"
              onClick={toggle}
              className={`-mx-1 flex min-h-11 w-[calc(100%+0.5rem)] items-center gap-1.5 rounded-xl px-1 text-left transition-colors duration-150 hover:bg-muted/50 ${focusRing}`}
            >
              <ChevronRight
                className={`size-4 shrink-0 text-muted-foreground transition-transform duration-200 ease-out ${open ? "rotate-90" : ""}`}
                aria-hidden
              />
              <span className={GROUP}>
                {t("Ended")} · <span className="tabular-nums">{endedCount}</span>
              </span>
            </button>
          </h2>

          {open && (
            <div id="deals-ended-list" className="grid animate-[rise_200ms_var(--ease-out)] gap-2">
              {loading && endedShown === null ? (
                <ul
                  aria-busy
                  className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card"
                >
                  {Array.from({ length: Math.min(3, Math.max(1, endedCount)) }, (_, i) => (
                    <li key={i} className="flex min-h-16 items-center gap-3 px-4 py-3">
                      <span className="size-12 shrink-0 animate-pulse rounded-full bg-muted" />
                      <span className="grid flex-1 gap-2">
                        <span className="h-4 w-2/3 animate-pulse rounded bg-muted" />
                        <span className="h-3 w-1/2 animate-pulse rounded bg-muted" />
                      </span>
                    </li>
                  ))}
                </ul>
              ) : failed ? (
                <div className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-card px-4 py-3 text-sm">
                  <span className="text-muted-foreground">
                    {t("Couldn’t load the ended bargains.")}
                  </span>
                  <button
                    type="button"
                    onClick={fetchEnded}
                    className={`inline-flex min-h-11 items-center gap-1.5 rounded-xl px-3 font-semibold text-primary hover:bg-muted ${focusRing}`}
                  >
                    <RotateCw className="size-4" aria-hidden />
                    {t("Try again")}
                  </button>
                </div>
              ) : endedShown && endedShown.length > 0 ? (
                <>
                  <div className="flex items-center justify-between gap-3 pl-1">
                    <p className="text-xs text-pretty text-muted-foreground">
                      {t("Quiet for over an hour, or the buyer took another stall.")}
                    </p>
                    <button
                      type="button"
                      onClick={() =>
                        remove(
                          endedShown.map((d) => d.id),
                          "Cleared the ended bargains.",
                        )
                      }
                      className={`min-h-11 shrink-0 rounded-xl px-3 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground ${focusRing}`}
                    >
                      {t("Clear all")}
                    </button>
                  </div>
                  <DealRows>{endedShown.map((d) => row(d, true))}</DealRows>
                </>
              ) : null}
            </div>
          )}
        </section>
      ) : null}
    </div>
  );
}

function DealRows({ children }: { children: ReactNode }) {
  return (
    <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card text-card-foreground">
      {children}
    </ul>
  );
}
