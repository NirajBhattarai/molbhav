"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bot, Loader2 } from "lucide-react";
import { action, focusRing } from "@/components/ui/styles";
import { agentPayFailed, claimAgentPay, stopAutoOrder } from "@/lib/bargain-actions";
import { useT } from "@/lib/i18n";
import type { Msg } from "@/lib/i18n/catalog";
import { AUTO_PAY_WINDOW_MS, AUTO_SECONDS, type AutoOrder } from "@/lib/limits";
import { hashscanTxUrl } from "@/lib/x402";
import { payDeal } from "@/lib/x402-pay";
import { rupees } from "@/lib/want";

const note = "mb-4 rounded-xl bg-muted p-4 text-sm text-pretty text-muted-foreground";

/** "Order and pay for me" on one bargain: countdown, paid, or why it didn't. */
export function AutoOrderCard({ bargainId, auto }: { bargainId: string; auto: AutoOrder }) {
  const t = useT();
  if ("skipped" in auto) {
    if (auto.skipped === "no-deal" || !auto.limit) return null;
    return (
      <p role="status" className={note}>
        {t(
          auto.skipped === "order"
            ? "This is over your limit of {price} for one order."
            : "This would pass your limit of {price} for one day.",
          { price: rupees(auto.limit) },
        )}{" "}
        {t("Take a deal yourself if you want one.")}
      </p>
    );
  }
  const values = { stall: auto.stall, price: rupees(auto.total) };
  if (auto.stopped)
    return (
      <p role="status" className={note}>
        {t("You stopped your agent.")} {t("Take a deal yourself if you want one.")}
      </p>
    );
  if (auto.error)
    return (
      <section className="mb-4 grid gap-3 rounded-xl bg-muted p-4 text-sm text-pretty">
        <p role="status" className="text-muted-foreground">
          {t("Your agent couldn’t take this one.")}{" "}
          {auto.payError
            ? t(auto.payError as Msg, { account: auto.payAccount ?? "" })
            : t("Take a deal yourself if you want one.")}
        </p>
        {auto.payError && (
          <Link href={`/bargains/${bargainId}/${auto.stallId}`} className={action.outline}>
            {t("Open deal")}
          </Link>
        )}
      </section>
    );
  if (auto.done) {
    if (auto.paid) {
      return (
        <section className="mb-4 grid animate-[rise_240ms_var(--ease-out)_both] gap-3 rounded-xl border border-success bg-card p-4">
          <p role="status" className="flex items-start gap-2 font-medium text-pretty">
            <Bot className="mt-0.5 size-5 shrink-0 text-success" aria-hidden />
            {t("Your agent paid {price}.", values)}
          </p>
          <p className="text-sm text-pretty text-muted-foreground">
            {t("HBAR paid on Hedera. Collect your order at {stall}.", values)}
          </p>
          {auto.settleTx && (
            <a
              href={hashscanTxUrl(auto.settleTx)}
              target="_blank"
              rel="noreferrer"
              className="font-mono text-xs break-all text-success underline underline-offset-2"
            >
              {auto.settleTx}
            </a>
          )}
          <Link href={`/bargains/${bargainId}/${auto.stallId}`} className={action.outline}>
            {t("Open deal")}
          </Link>
        </section>
      );
    }
    return (
      <section className="mb-4 grid animate-[rise_240ms_var(--ease-out)_both] gap-3 rounded-xl border border-success bg-card p-4">
        <p role="status" className="flex items-start gap-2 font-medium text-pretty">
          <Bot className="mt-0.5 size-5 shrink-0 text-success" aria-hidden />
          {t("Your agent took {stall}’s deal at {price}.", values)}
        </p>
        <Link href={`/bargains/${bargainId}/${auto.stallId}`} className={action.primary}>
          {t("Pay {amount}", { amount: rupees(auto.total) })}
        </Link>
      </section>
    );
  }
  if (auto.paying) return <Paying values={values} />;
  return <Countdown bargainId={bargainId} at={auto.at} stallId={auto.stallId} values={values} />;
}

function Paying({ values }: { values: { stall: string; price: string } }) {
  const t = useT();
  return (
    <section className="mb-4 rounded-xl border bg-card p-4">
      <p role="status" className="flex items-center gap-2 font-medium text-pretty">
        <Loader2 className="size-5 shrink-0 animate-spin text-primary" aria-hidden />
        {t("Your agent is paying {price} in HBAR from your wallet…", values)}
      </p>
    </section>
  );
}

/**
 * Counts down on the buyer's screen; at zero their agent claims the payment and pays it with the
 * buyer's Magic Hedera wallet, exactly like the Pay button. A countdown that ended while the page
 * was closed isn't paid late: the buyer gets the deal to pay themselves.
 */
function Countdown({
  bargainId,
  at,
  stallId,
  values,
}: {
  bargainId: string;
  at: number;
  stallId: string;
  values: { stall: string; price: string };
}) {
  const t = useT();
  const router = useRouter();
  const [left, setLeft] = useState(AUTO_SECONDS);
  const [stopping, stop] = useTransition();
  const [paying, setPaying] = useState(false);
  const [late] = useState(() => Date.now() > at + AUTO_PAY_WINDOW_MS);
  const tried = useRef(false);

  useEffect(() => {
    const tick = () => setLeft(Math.max(0, Math.ceil((at - Date.now()) / 1000)));
    tick();
    const id = setInterval(tick, 250);
    return () => clearInterval(id);
  }, [at]);

  useEffect(() => {
    if (left > 0 || late || tried.current) return;
    tried.current = true;
    void (async () => {
      const deal = await claimAgentPay(bargainId);
      if (!deal) return router.refresh();
      setPaying(true);
      const paid = await payDeal(bargainId, deal.stallId);
      if (!paid.ok) await agentPayFailed(bargainId, paid.error, paid.account);
      router.refresh();
    })();
  }, [left, late, bargainId, router]);

  if (late)
    return (
      <section className="mb-4 grid gap-3 rounded-xl bg-muted p-4 text-sm text-pretty">
        <p role="status" className="text-muted-foreground">
          {t("Your agent waited for you to come back. Pay it yourself if you still want it.")}
        </p>
        <Link href={`/bargains/${bargainId}/${stallId}`} className={action.primary}>
          {t("Pay {amount}", { amount: values.price })}
        </Link>
      </section>
    );
  if (paying || left === 0) return <Paying values={values} />;

  return (
    <section className="mb-4 grid animate-[rise_240ms_var(--ease-out)_both] gap-2 rounded-xl border bg-card p-4">
      <div className="flex items-center justify-between gap-3">
        <p role="status" className="min-w-0 font-medium text-pretty tabular-nums">
          {t("Your agent takes {stall}’s deal at {price} in {seconds}…", {
            ...values,
            seconds: left,
          })}
        </p>
        <button
          type="button"
          disabled={stopping}
          onClick={() => stop(() => stopAutoOrder(bargainId))}
          className={`${focusRing} min-h-11 shrink-0 rounded-lg px-4 text-sm font-semibold text-primary transition-[background-color,transform] duration-150 ease-out hover:bg-accent active:scale-[0.97] disabled:opacity-60`}
        >
          {t("Stop")}
        </button>
      </div>
      <span aria-hidden className="h-1 overflow-hidden rounded-full bg-muted">
        <span
          style={{ transform: `scaleX(${left / AUTO_SECONDS})` }}
          className="block h-full origin-left bg-primary transition-transform duration-300 ease-out"
        />
      </span>
    </section>
  );
}
