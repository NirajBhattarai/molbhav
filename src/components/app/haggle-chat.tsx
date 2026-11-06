"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Fragment,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  useTransition,
  type ReactNode,
} from "react";
import { ArrowDown, ChevronLeft, CircleCheck, ExternalLink, Loader2, Sparkles } from "lucide-react";
import { AutoOrderCard } from "@/components/app/auto-order-card";
import { LiveRefresh } from "@/components/app/live-refresh";
import { StallAvatar } from "@/components/app/stall-avatar";
import { action, focusRing } from "@/components/ui/styles";
import { agreeOffer, markPaid } from "@/lib/bargain-actions";
import { useFormat, useLang, useT, type Msg } from "@/lib/i18n";
import { LANG } from "@/lib/languages";
import { autoPending, type AutoOrder } from "@/lib/limits";
import { HANDED_OFF, OVER_BUDGET, statusChip } from "@/lib/offer-status";
import type { ChatView, TurnView } from "@/lib/server/bargains";
import { rupees } from "@/lib/want";
import { formatHbar, hashscanTxUrl } from "@/lib/x402";
import { payDeal, type PayError } from "@/lib/x402-pay";

/* ─── Building the thread ────────────────────────────────────────────────────────────────── */

type Item =
  | { kind: "day"; key: string; at: string }
  | { kind: "group"; key: string; speaker: TurnView["speaker"]; turns: TurnView[] }
  | { kind: "event"; key: string; tone: "price" | "deal" | "no" | "paid"; label: ReactNode };

/** Lines sent this close together by the same speaker share one group and one time. */
const GROUP_GAP_MS = 2 * 60_000;

/**
 * Turns the flat list of lines into what a chat shows: day dividers, runs of bubbles by the same
 * speaker, and quiet notices for what changed (the price came down, a deal was made, a stall said no).
 * A notice ends a run, so the bubbles after it start a new group.
 */
function thread(
  turns: TurnView[],
  dayOf: ((iso: string) => string) | null,
  t: ReturnType<typeof useT>,
): Item[] {
  const items: Item[] = [];
  let group: Extract<Item, { kind: "group" }> | null = null;
  let lastDay = "";
  let price: number | null = null;
  let status: TurnView["status"] = "haggling";

  for (const line of turns) {
    const day = dayOf?.(line.at) ?? "";
    if (dayOf && day !== lastDay) {
      items.push({ kind: "day", key: `day-${line.id}`, at: line.at });
      lastDay = day;
      group = null;
    }

    const prev = group?.turns.at(-1);
    const near = prev && Date.parse(line.at) - Date.parse(prev.at) < GROUP_GAP_MS;
    if (group && group.speaker === line.speaker && near) group.turns.push(line);
    else {
      group = { kind: "group", key: `g-${line.id}`, speaker: line.speaker, turns: [line] };
      items.push(group);
    }

    // A stall naming a lower price than before.
    if (line.speaker === "stall" && line.amount !== null) {
      if (price !== null && line.amount < price) {
        const drop = Math.round(((price - line.amount) / price) * 100);
        items.push({
          kind: "event",
          key: `p-${line.id}`,
          tone: "price",
          label: (
            <>
              {t("Price down to {price}", { price: rupees(line.amount) })}
              {drop > 0 && <span className="tabular-nums"> · −{drop}%</span>}
            </>
          ),
        });
        group = null;
      }
      price = line.amount;
    }

    if (line.status !== status) {
      if (line.status === "agreed" && line.speaker === "stall") {
        items.push({
          kind: "event",
          key: `d-${line.id}`,
          tone: "deal",
          label: (
            <>
              {t("Deal agreed")}
              {line.amount !== null && (
                <span className="tabular-nums"> · {rupees(line.amount)}</span>
              )}
            </>
          ),
        });
        group = null;
        status = line.status;
      } else if (line.status === "declined") {
        items.push({ kind: "event", key: `n-${line.id}`, tone: "no", label: t("Said no") });
        group = null;
        status = line.status;
      }
    }
  }
  return items;
}

/* ─── Small pieces ───────────────────────────────────────────────────────────────────────── */

/** Puts rupee amounts inside a line in tabular, heavier type, so prices stand out as you scan. */
function withPrices(text: string) {
  const parts = text.split(/(₹[\d,]+)/);
  return parts.map((p, i) =>
    /^₹[\d,]+$/.test(p) ? (
      <span key={i} className="font-semibold whitespace-nowrap tabular-nums">
        {p}
      </span>
    ) : (
      <Fragment key={i}>{p}</Fragment>
    ),
  );
}

/** Formats times in the viewer's own time zone, so it waits until it runs in the browser. */
function useClock() {
  const lang = useLang();
  // False while rendering on the server, true in the browser: no effect or re-render needed.
  const ready = useSyncExternalStore(
    noop,
    () => true,
    () => false,
  );
  return useMemo(() => {
    if (!ready) return null;
    const locale = LANG[lang].locale;
    const time = new Intl.DateTimeFormat(locale, { hour: "numeric", minute: "2-digit" });
    const date = new Intl.DateTimeFormat(locale, { day: "numeric", month: "short" });
    const rel = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
    const dayKey = (iso: string) => new Date(iso).toDateString();
    return {
      time: (iso: string) => time.format(new Date(iso)),
      dayKey,
      /** "Today", "Yesterday", or "6 Nov". */
      day(iso: string) {
        const start = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
        const days = Math.round((start(new Date()) - start(new Date(iso))) / 86_400_000);
        if (days < 2) {
          const s = rel.format(-days, "day");
          return s.charAt(0).toLocaleUpperCase(locale) + s.slice(1);
        }
        return date.format(new Date(iso));
      },
    };
  }, [ready, lang]);
}

const noop = () => () => {};

function TypingDots() {
  return (
    <span className="inline-flex items-center gap-1 py-1" aria-hidden>
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="size-1.5 animate-[typing_1.1s_ease-in-out_infinite] rounded-full bg-muted-foreground opacity-30"
          style={{ animationDelay: `${i * 150}ms` }}
        />
      ))}
    </span>
  );
}

const EVENT_TONE = {
  price: "bg-secondary/20 text-foreground",
  deal: "bg-primary/12 text-primary",
  no: "bg-muted text-muted-foreground",
  paid: "bg-success/15 text-success",
} as const;

/* ─── The chat ───────────────────────────────────────────────────────────────────────────── */

/** One stall's haggle, laid out like a messaging app: header, pinned deal, thread, action bar. */
export function HaggleChat({
  chat,
  overLimit = null,
  autoOrder = false,
  auto = null,
  dealLog = null,
}: {
  chat: ChatView;
  /** When set, the agreed price would break the buyer's spending limits. */
  overLimit?: { kind: "order" | "day"; limit: number } | null;
  /** The bargain was started with "pay for me" on. */
  autoOrder?: boolean;
  /** What the buyer's agent decided about paying (shown here when it's this stall's deal). */
  auto?: AutoOrder | null;
  /** HashScan page of the Hedera topic where agreed and paid deals are logged. */
  dealLog?: string | null;
}) {
  const t = useT();
  const format = useFormat();
  const clock = useClock();
  const [busy, start] = useTransition();
  const [paying, startPay] = useTransition();
  const [payingUsdc, startUsdc] = useTransition();
  const [payError, setPayError] = useState<{ error: PayError; account?: string } | null>(null);
  const router = useRouter();
  const hbar = chat.hbar ?? null;
  const paidTx = chat.paidTx ?? null;
  const payUsdc = () =>
    startUsdc(async () => {
      setPayError(null);
      const paid = await payDeal(chat.bargainId, chat.stall.id);
      if (paid.ok) router.refresh();
      else setPayError({ error: paid.error, account: paid.account });
    });
  const log = useRef<HTMLDivElement>(null);
  const end = useRef<HTMLDivElement>(null);
  const landed = useRef(false);
  const away = useRef(false);
  const [awayFromEnd, setAwayFromEnd] = useState(false);

  const talking = chat.status === "haggling" || chat.status === "waiting";
  const last = chat.turns.at(-1);
  const ready =
    talking && chat.current !== null && (last?.msg === HANDED_OFF || last?.msg === OVER_BUDGET);
  const over = chat.budget !== null && chat.current !== null ? chat.current - chat.budget : 0;
  const drop =
    chat.asked && chat.current !== null && chat.current < chat.asked
      ? Math.round(((chat.asked - chat.current) / chat.asked) * 100)
      : 0;

  const { turns, status, current } = chat;
  const items = useMemo(() => {
    const list = thread(turns, clock?.dayKey ?? null, t);
    if (status === "paid")
      list.push({
        kind: "event",
        key: "paid",
        tone: "paid",
        label: (
          <>
            {t("Paid")}
            {current !== null && <span className="tabular-nums"> · {rupees(current)}</span>}
          </>
        ),
      });
    return list;
  }, [turns, status, current, clock, t]);

  // Only the thread scrolls (like any chat app), so the window's scroll never gets in the way.
  // Land on the newest line once the layout is final (day dividers appear once times can be read
  // in the browser); after that, follow new lines smoothly unless the buyer scrolled up.
  useEffect(() => {
    const el = log.current;
    if (!clock || !el) return;
    if (!landed.current) {
      landed.current = true;
      el.scrollTop = el.scrollHeight;
      return;
    }
    if (away.current) return;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [clock, chat.turns.length, chat.next, chat.status]);

  useEffect(() => {
    const el = end.current;
    if (!el || !log.current) return;
    const io = new IntersectionObserver(
      ([e]) => {
        away.current = !e.isIntersecting;
        setAwayFromEnd(!e.isIntersecting);
      },
      { root: log.current, rootMargin: "0px 0px 48px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  // The agent is counting down to pay (or paying) this stall's deal: it pays from here too, and the
  // buyer's own Pay button stays hidden so the same deal is never paid twice at once.
  const agentPays = auto !== null && "at" in auto && auto.stallId === chat.stall.id;
  const agentBusy = agentPays && autoPending(auto);
  // Keep reading while the agent hasn't decided yet or is still on it.
  const orderOpen = autoOrder && (auto === null || autoPending(auto));

  const chip = statusChip(chat.status, false);
  const subtitle = chat.next === "stall" ? null : t(chip.label);

  return (
    <div className="mx-auto flex h-dvh w-full max-w-md flex-col overflow-hidden">
      <LiveRefresh
        active={talking || chat.next !== null || orderOpen}
        every={chat.next ? 1200 : orderOpen ? 2000 : 3000}
      />

      {/* Header: who you're talking to, and where the price stands. */}
      <header className="shrink-0 border-b border-border bg-background pt-[env(safe-area-inset-top)]">
        <div className="flex items-center gap-2 px-2 py-2">
          <Link
            href={`/bargains/${chat.bargainId}`}
            className={`grid size-11 shrink-0 place-items-center rounded-full transition-transform duration-150 active:scale-90 active:bg-muted ${focusRing}`}
          >
            <ChevronLeft className="size-6" aria-hidden />
            <span className="sr-only">{t("Back")}</span>
          </Link>
          <StallAvatar id={chat.stall.id} name={chat.stall.name} />
          <div className="min-w-0 flex-1">
            <h1 className="truncate font-display text-lg leading-tight font-bold">
              {chat.stall.name}
            </h1>
            <p className="flex items-center gap-1.5 truncate text-xs text-muted-foreground">
              {talking && (
                <span className="relative flex size-2 shrink-0" aria-hidden>
                  <span className="absolute inset-0 rounded-full bg-secondary motion-safe:animate-[radar_1.6s_var(--ease-out)_infinite]" />
                  <span className="relative size-2 rounded-full bg-secondary" />
                </span>
              )}
              {subtitle ?? t("Waiting for their price")}
              <span aria-hidden>·</span>
              {t("Speaks {language}", { language: format.language(chat.stall.lang) })}
            </p>
          </div>
        </div>

        {/* Pinned deal: the item, the first ask struck through, today's price. */}
        <div className="flex items-center gap-3 border-t border-border/60 px-4 py-2.5">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{chat.item}</p>
            {chat.budget !== null && (
              <p className="text-xs text-muted-foreground tabular-nums">
                {t("Your budget")} {rupees(chat.budget)}
              </p>
            )}
          </div>
          {chat.current !== null ? (
            <div className="text-right tabular-nums">
              <p
                key={chat.current}
                className="animate-[tick-down_300ms_var(--ease-out)] font-display text-xl leading-none font-bold"
              >
                {rupees(chat.current)}
              </p>
              {drop > 0 && chat.asked && (
                <p className="mt-0.5 text-xs text-muted-foreground">
                  <span className="line-through">{rupees(chat.asked)}</span> · −{drop}%
                </p>
              )}
            </div>
          ) : (
            <span className="text-sm text-muted-foreground">—</span>
          )}
        </div>
      </header>

      {/* The thread: the only part that scrolls. */}
      <div className="relative min-h-0 flex-1">
        <div
          ref={log}
          role="log"
          aria-live="polite"
          aria-label={chat.stall.name}
          className="flex h-full flex-col gap-1 overflow-y-auto overscroll-contain px-3 pt-4 pb-4"
        >
          {items.map((item) => {
            if (item.kind === "day")
              return (
                <p
                  key={item.key}
                  className="my-2 self-center rounded-full bg-muted px-3 py-1 text-xs font-medium text-muted-foreground"
                >
                  {clock?.day(item.at)}
                </p>
              );

            if (item.kind === "event")
              return (
                <p
                  key={item.key}
                  className={`my-2 animate-[fade-in_240ms_var(--ease-out)_both] self-center rounded-full px-3 py-1 text-xs font-semibold ${EVENT_TONE[item.tone]}`}
                >
                  {item.tone === "deal" || item.tone === "paid" ? (
                    <CircleCheck className="-mt-px mr-1 inline size-3.5" aria-hidden />
                  ) : null}
                  {item.label}
                </p>
              );

            return <Group key={item.key} item={item} chat={chat} time={clock?.time} t={t} />;
          })}

          {chat.next && (
            <div
              className={`mt-2 flex items-end gap-2 ${chat.next === "agent" ? "flex-row-reverse" : ""}`}
            >
              {chat.next === "stall" && (
                <StallAvatar id={chat.stall.id} name={chat.stall.name} size="sm" />
              )}
              <div
                className={`rounded-2xl px-3.5 py-2 ${
                  chat.next === "agent"
                    ? "rounded-br-md bg-primary/10"
                    : "rounded-bl-md border border-border bg-card"
                }`}
              >
                <TypingDots />
                <span className="sr-only">{t("Waiting for their price")}</span>
              </div>
            </div>
          )}
          <div ref={end} className="h-px shrink-0" aria-hidden />
        </div>

        {awayFromEnd && (
          <button
            type="button"
            onClick={() =>
              log.current?.scrollTo({ top: log.current.scrollHeight, behavior: "smooth" })
            }
            className={`absolute right-4 bottom-4 z-10 grid size-11 animate-[pop_200ms_var(--ease-out)] place-items-center rounded-full border border-border bg-card shadow-md ${focusRing}`}
          >
            <ArrowDown className="size-5" aria-hidden />
            <span className="sr-only">{t("Go to the latest message")}</span>
          </button>
        )}
      </div>

      {/* Action bar: what the buyer can do now. */}
      <ActionBar>
        {ready && chat.current !== null && (
          <>
            {over > 0 && (
              <p className="flex items-center justify-center gap-1.5 text-sm text-muted-foreground tabular-nums">
                <span className="size-1.5 rounded-full bg-secondary" aria-hidden />
                {t("{amount} over your budget", { amount: rupees(over) })}
              </p>
            )}
            <button
              type="button"
              disabled={busy}
              onClick={() => start(async () => agreeOffer(chat.bargainId, chat.stall.id))}
              className={action.primary}
            >
              {busy && <Loader2 className="size-5 animate-spin" aria-hidden />}
              {t("Agree {price}", { price: rupees(chat.current) })}
            </button>
          </>
        )}

        {chat.status === "agreed" && (
          <>
            <p className="flex items-center justify-center gap-2 text-sm font-semibold text-primary">
              <CircleCheck className="size-5" aria-hidden />
              {t("Deal agreed")}
              {chat.current !== null && (
                <span className="tabular-nums">· {rupees(chat.current)}</span>
              )}
            </p>
            {agentBusy ? (
              <AutoOrderCard bargainId={chat.bargainId} auto={auto} />
            ) : overLimit ? (
              <p role="status" className="text-center text-sm font-medium text-pretty">
                {t(
                  overLimit.kind === "order"
                    ? "This is over your limit of {price} for one order."
                    : "This would pass your limit of {price} for one day.",
                  { price: rupees(overLimit.limit) },
                )}{" "}
                <Link href="/profile" className="font-semibold text-primary underline">
                  {t("Change it in Profile")}
                </Link>
              </p>
            ) : (
              <>
                {hbar && (
                  <button
                    type="button"
                    disabled={payingUsdc || paying}
                    onClick={payUsdc}
                    className={action.primary}
                  >
                    {payingUsdc && <Loader2 className="size-5 animate-spin" aria-hidden />}
                    {payingUsdc
                      ? t("Paying on Hedera…")
                      : t("Pay {amount} HBAR", { amount: formatHbar(hbar) })}
                  </button>
                )}
                {payError && (
                  <p role="alert" className="text-center text-sm text-destructive">
                    {t(payError.error, { account: payError.account ?? "" })}
                  </p>
                )}
                <button
                  type="button"
                  disabled={paying || payingUsdc}
                  onClick={() => startPay(async () => markPaid(chat.bargainId, chat.stall.id))}
                  className={hbar ? action.outline : action.primary}
                >
                  {paying && <Loader2 className="size-5 animate-spin" aria-hidden />}
                  {hbar ? t("I've paid another way") : t("I've paid")}
                </button>
              </>
            )}
          </>
        )}

        {chat.status === "paid" && (
          <p className="flex items-center justify-center gap-2 py-2 text-sm font-semibold text-success">
            <CircleCheck className="size-5" aria-hidden />
            {t("Paid")}
            {chat.current !== null && (
              <span className="tabular-nums">· {rupees(chat.current)}</span>
            )}
          </p>
        )}
        {chat.status === "paid" && paidTx && (
          <a
            href={hashscanTxUrl(paidTx)}
            target="_blank"
            rel="noreferrer"
            className={`${focusRing} flex items-center justify-center gap-1.5 rounded-md text-sm text-muted-foreground underline-offset-2 hover:underline`}
          >
            {hbar
              ? t("Paid {amount} HBAR on Hedera · HashScan", { amount: formatHbar(hbar) })
              : t("Paid on Hedera · HashScan")}
            <ExternalLink className="size-3.5" aria-hidden />
          </a>
        )}
        {(chat.status === "agreed" || chat.status === "paid") && dealLog && (
          <a
            href={dealLog}
            target="_blank"
            rel="noreferrer"
            className={`${focusRing} flex items-center justify-center gap-1.5 rounded-md text-xs text-muted-foreground underline-offset-2 hover:underline`}
          >
            {t("Deal logged on Hedera · HashScan")}
            <ExternalLink className="size-3" aria-hidden />
          </a>
        )}

        {chat.status === "declined" && (
          <Link href={`/bargains/${chat.bargainId}`} className={action.outline}>
            {t("See other offers")}
          </Link>
        )}
      </ActionBar>
    </div>
  );
}

function ActionBar({ children }: { children: ReactNode }) {
  const has = Array.isArray(children) ? children.some(Boolean) : Boolean(children);
  if (!has) return null;
  return (
    <div className="shrink-0 border-t border-border bg-card px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
      <div className="grid animate-[rise_240ms_var(--ease-out)] gap-2.5">{children}</div>
    </div>
  );
}

/** A run of bubbles from one speaker: label on the first, avatar and time on the last. */
function Group({
  item,
  chat,
  time,
  t,
}: {
  item: Extract<Item, { kind: "group" }>;
  chat: ChatView;
  time: ((iso: string) => string) | undefined;
  t: ReturnType<typeof useT>;
}) {
  const mine = item.speaker !== "stall";
  const agent = item.speaker === "agent";
  const lastAt = item.turns.at(-1)!.at;

  return (
    <div className={`mt-2 flex items-end gap-2 ${mine ? "flex-row-reverse" : ""}`}>
      {!mine && <StallAvatar id={chat.stall.id} name={chat.stall.name} size="sm" />}
      <div
        className={`flex max-w-[82%] min-w-0 flex-col gap-0.5 ${mine ? "items-end" : "items-start"}`}
      >
        <p
          className={`flex items-center gap-1 px-1 text-xs font-semibold ${agent ? "text-primary" : "text-muted-foreground"}`}
        >
          {agent && <Sparkles className="size-3" aria-hidden />}
          {agent ? t("Your agent") : mine ? t("You") : chat.stall.name}
        </p>
        {item.turns.map((line, i) => {
          const body =
            line.msg && line.vars
              ? t(line.msg as Msg, line.vars)
              : line.msg
                ? t(line.msg as Msg)
                : (line.text ?? "");
          const first = i === 0;
          // Tighten the corners that face the next bubble in the run, like most chat apps.
          const corners = mine
            ? `rounded-br-md ${first ? "" : "rounded-tr-md"}`
            : `rounded-bl-md ${first ? "" : "rounded-tl-md"}`;
          return (
            <div
              key={line.id}
              className={`animate-[pop_220ms_var(--ease-out)_both] rounded-2xl px-3.5 py-2 text-[15px] leading-snug text-pretty whitespace-pre-wrap ${corners} ${
                item.speaker === "buyer"
                  ? "bg-primary text-primary-foreground"
                  : agent
                    ? "bg-primary/10 text-foreground"
                    : "border border-border bg-card text-card-foreground"
              }`}
            >
              {withPrices(body)}
            </div>
          );
        })}
        {time && (
          <p className="px-1 text-[11px] text-muted-foreground tabular-nums">{time(lastAt)}</p>
        )}
      </div>
    </div>
  );
}
