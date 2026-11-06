"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ChevronLeft, Sparkles } from "lucide-react";
import { LiveRefresh } from "@/components/app/live-refresh";
import { focusRing } from "@/components/ui/styles";
import { useT, type Msg, type Vars } from "@/lib/i18n";
import type { DealView, TurnView } from "@/lib/server/bargains";
import { rupees } from "@/lib/want";

/** The two agents, as molbhav names them: the stall's and the buyer's. */
type Side = "stall" | "agent";

/** How it ended, from the seller's side. */
const OUTCOME: Record<Exclude<DealView["state"], "talking">, Msg> = {
  won: "Sold for {price}. The buyer took your agent’s deal.",
  offered: "Agreed at {price}. Waiting for the buyer to take it.",
  waiting: "Waiting for the buyer",
  lost: "Agreed at {price}, but the buyer went with another stall.",
  "no-deal": "The buyer’s budget was under your lowest price, so there was no deal.",
};

/** The seller's agent haggling with a buyer's agent over one order. */
export function ShopDeal({
  deal,
  turns,
  next,
}: {
  deal: DealView;
  turns: TurnView[];
  next: "agent" | "stall" | null;
}) {
  const t = useT();
  const open = deal.state === "talking" || deal.state === "waiting";
  const talking = deal.state === "talking" || (open && next !== null);
  const names: Record<Side, string> = { stall: t("Your agent"), agent: t("Buyer’s agent") };
  const price: Vars = { price: deal.final != null ? rupees(deal.final) : "" };
  // The buyer's words to the stall sit on their agent's side of the chat.
  const said = turns.map((x) =>
    x.speaker === "buyer" ? { ...x, speaker: "agent" as const } : x,
  ) as (TurnView & { speaker: Side })[];

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col">
      <LiveRefresh active={open} every={talking ? 1200 : 4000} />

      <header className="shrink-0 border-b border-border bg-background pt-[env(safe-area-inset-top)]">
        <div className="flex items-center gap-2 px-2 py-2">
          <Link
            href="/shop/deals"
            className={`grid size-11 shrink-0 place-items-center rounded-full transition-transform duration-150 active:scale-90 active:bg-muted ${focusRing}`}
          >
            <ChevronLeft className="size-6" aria-hidden />
            <span className="sr-only">{t("Shop")}</span>
          </Link>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium text-muted-foreground">
              {talking ? t("Your agent is bargaining") : t("A buyer asked")}
            </p>
            <h1 className="truncate font-display text-lg leading-tight font-bold">
              “{deal.order}”
            </h1>
          </div>
          <span className="flex shrink-0 flex-col items-end gap-1.5">
            {talking && <LiveBadge />}
            <span className="inline-flex h-7 items-center gap-1.5 rounded-full bg-muted px-3 text-xs font-semibold text-muted-foreground">
              <Sparkles className="size-3.5" aria-hidden /> {t("AI agent")}
            </span>
          </span>
        </div>
      </header>

      <div className="grid flex-1 gap-4 px-4 pt-4 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
        <div className="grid gap-2 rounded-2xl border border-border bg-card p-4 text-card-foreground">
          <p className="text-sm text-pretty text-muted-foreground">{deal.item}</p>
          <PriceGap turns={said} ask={deal.ask} final={deal.final} names={names} />
        </div>

        <AgentChat
          turns={said}
          names={names}
          next={talking ? (next === "stall" ? "stall" : "agent") : null}
        />

        {!open && deal.state !== "talking" && (
          <p
            role="status"
            className={`animate-[rise_240ms_var(--ease-out)_both] rounded-2xl p-4 text-sm ${
              deal.state === "won"
                ? "bg-success/12 font-semibold text-success"
                : "bg-muted text-muted-foreground"
            }`}
          >
            {t(OUTCOME[deal.state], price)}
          </p>
        )}
      </div>
    </div>
  );
}

/**
 * Two agents haggling, as a chat, seen from the stall: its own agent on the right, like your own
 * messages in any chat app. While they're talking, the side due to speak next shows "typing".
 */
function AgentChat({
  turns,
  names,
  next,
}: {
  turns: (TurnView & { speaker: Side })[];
  names: Record<Side, string>;
  next: Side | null;
}) {
  const t = useT();
  const [seen] = useState(turns.length);
  const end = useRef<HTMLDivElement>(null);
  const count = turns.length;
  const me: Side = "stall";

  useEffect(() => {
    if (count <= seen) return;
    const nearEnd =
      window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 240;
    if (!nearEnd) return;
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    end.current?.scrollIntoView({ block: "end", behavior: still ? "auto" : "smooth" });
  }, [count, seen]);

  return (
    <div className="grid gap-1.5">
      <ol role="log" aria-label={t("Messages")} className="grid gap-1.5">
        {turns.map((turn, i) => {
          const mine = turn.speaker === me;
          const before = turns[i - 1];
          const first = before?.speaker !== turn.speaker;
          const body =
            turn.msg && turn.vars
              ? t(turn.msg as Msg, turn.vars)
              : turn.msg
                ? t(turn.msg as Msg)
                : (turn.text ?? "");
          return (
            <li
              key={turn.id}
              className={`grid gap-1 ${mine ? "justify-items-end" : "justify-items-start"} ${first && i ? "mt-2" : ""}`}
            >
              {first && (
                <span className="px-1 text-xs font-medium text-muted-foreground">
                  {names[turn.speaker]}
                </span>
              )}
              <span
                className={`max-w-[80%] rounded-2xl px-3.5 py-2 text-[0.9375rem] leading-snug text-pretty [word-break:auto-phrase] whitespace-pre-line ${
                  mine
                    ? "origin-bottom-right rounded-br-md bg-primary text-primary-foreground"
                    : "origin-bottom-left rounded-bl-md border border-border bg-card text-card-foreground"
                } ${i >= seen ? "animate-[pop_220ms_var(--ease-out)_both]" : ""}`}
              >
                <span className="sr-only">{names[turn.speaker]}: </span>
                {body}
              </span>
            </li>
          );
        })}
        {next && (
          <li
            key={`typing-${count}`}
            className={`grid ${next === me ? "justify-items-end" : "justify-items-start"} ${turns.at(-1)?.speaker !== next ? "mt-2" : ""}`}
          >
            <Typing who={names[next]} mine={next === me} />
          </li>
        )}
      </ol>
      <div ref={end} className="h-px" />
    </div>
  );
}

function Typing({ who, mine }: { who: string; mine?: boolean }) {
  const t = useT();
  return (
    <span
      className={`inline-flex animate-[pop_200ms_var(--ease-out)_both] items-center gap-1 rounded-2xl px-3.5 py-3 ${
        mine
          ? "origin-bottom-right rounded-br-md bg-primary/15"
          : "origin-bottom-left rounded-bl-md bg-muted"
      }`}
    >
      <span className="sr-only">{t("{who} is typing", { who })}</span>
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          aria-hidden
          style={{ animationDelay: `${i * 160}ms` }}
          className={`size-1.5 animate-[typing_1.1s_ease-in-out_infinite] rounded-full bg-current opacity-30 ${
            mine ? "text-primary" : "text-muted-foreground"
          }`}
        />
      ))}
    </span>
  );
}

/**
 * Where the two prices stand: the stall's ask coming down and the buyer's offer going up.
 * When they agree, both land on the deal.
 */
function PriceGap({
  turns,
  ask,
  final,
  names,
}: {
  turns: (TurnView & { speaker: Side })[];
  ask: number;
  final: number | null;
  names: Record<Side, string>;
}) {
  const t = useT();
  const priced = turns.filter((x) => x.amount !== null);
  const lastOf = (side: Side) => priced.findLast((x) => x.speaker === side)?.amount ?? undefined;
  const hi = priced.find((x) => x.speaker === "stall")?.amount ?? ask;
  const lo = priced.find((x) => x.speaker === "agent")?.amount ?? Math.round(hi * 0.65);
  const deal = final !== null;
  const offer = deal ? final : (lastOf("agent") ?? lo);
  const asking = deal ? final : (lastOf("stall") ?? hi);
  const at = (v: number) => (hi > lo ? Math.min(1, Math.max(0, (v - lo) / (hi - lo))) : 1) * 100;
  const b = at(offer);
  const s = at(asking);
  const move = "transition-transform duration-300 ease-out";

  return (
    <div className="grid gap-1.5">
      <div aria-hidden className="overflow-hidden px-2 py-1">
        <div className="relative h-1.5 rounded-full bg-muted">
          <span
            style={{
              transform: `translateX(${b}%) scaleX(${Math.max(0, (deal ? 100 : s) - b) / 100})`,
            }}
            className={`absolute inset-0 origin-left rounded-full ${deal ? "bg-success/25" : "bg-secondary/45"} ${move}`}
          />
          {deal && <Marker x={100} className="bg-muted-foreground/40" move={move} small />}
          <Marker x={b} className={deal ? "bg-success" : "bg-primary"} move={move} />
          {!deal && <Marker x={s} className="bg-secondary" move={move} />}
        </div>
      </div>
      <p className="flex items-baseline justify-between gap-3 text-xs text-muted-foreground tabular-nums">
        {deal ? (
          <span className="font-semibold text-success">
            {t("Agreed at {price}", { price: rupees(final) })}
          </span>
        ) : (
          <>
            <span>
              {names.agent} <span className="font-semibold text-foreground">{rupees(offer)}</span>
            </span>
            <span className="text-right">
              {names.stall} <span className="font-semibold text-foreground">{rupees(asking)}</span>
            </span>
          </>
        )}
      </p>
    </div>
  );
}

function Marker({
  x,
  className,
  move,
  small,
}: {
  x: number;
  className: string;
  move: string;
  small?: boolean;
}) {
  return (
    <span style={{ transform: `translateX(${x}%)` }} className={`absolute inset-0 ${move}`}>
      <span
        className={`absolute top-1/2 left-0 ${small ? "size-2.5" : "size-3.5"} -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-card transition-colors duration-300 ${className}`}
      />
    </span>
  );
}

function LiveBadge() {
  const t = useT();
  return (
    <span
      role="status"
      className="inline-flex h-7 shrink-0 animate-[fade-in_200ms_var(--ease-out)_both] items-center gap-2 rounded-full bg-destructive/10 px-3 text-xs font-bold tracking-wide text-destructive uppercase"
    >
      <span aria-hidden className="relative flex size-2">
        <span className="absolute inset-0 rounded-full bg-current motion-safe:animate-[radar_1.4s_var(--ease-out)_infinite]" />
        <span className="relative size-2 rounded-full bg-current" />
      </span>
      {t("Live")}
    </span>
  );
}
