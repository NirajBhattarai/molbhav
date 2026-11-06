"use client";

import { useEffect, useRef, useTransition } from "react";
import { CircleCheck, Loader2 } from "lucide-react";
import { LiveRefresh } from "@/components/app/live-refresh";
import { action } from "@/components/ui/styles";
import { agreeOffer, markPaid } from "@/lib/bargain-actions";
import { useT, type Msg } from "@/lib/i18n";
import { HANDED_OFF } from "@/lib/offer-status";
import type { ChatView } from "@/lib/server/bargains";
import { rupees } from "@/lib/want";

/** One stall's haggle chat: bubbles, Agree, and soft Pay confirm. */
export function HaggleChat({ chat }: { chat: ChatView }) {
  const t = useT();
  const end = useRef<HTMLLIElement>(null);
  const [busy, start] = useTransition();
  const [paying, startPay] = useTransition();
  const agreed = chat.status === "agreed" || chat.status === "paid";
  const talking = chat.status === "haggling" || chat.status === "waiting";
  const last = chat.turns.at(-1);
  const handedOff = talking && last?.msg === HANDED_OFF && chat.current !== null;

  useEffect(() => {
    end.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [chat.turns.length, chat.next, agreed]);

  return (
    <>
      <LiveRefresh active={talking || chat.next !== null} every={chat.next ? 1200 : 3000} />

      <ul className="flex flex-col gap-3 pb-28">
        {chat.turns.map((line) => {
          const you = line.speaker === "buyer";
          const agent = line.speaker === "agent";
          const body =
            line.msg && line.vars
              ? t(line.msg as Msg, line.vars)
              : line.msg
                ? t(line.msg as Msg)
                : (line.text ?? "");
          return (
            <li
              key={line.id}
              className={`flex animate-[pop_220ms_var(--ease-out)_both] ${you ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm ${
                  you
                    ? "rounded-br-md bg-primary text-primary-foreground"
                    : agent
                      ? "rounded-bl-md bg-secondary text-secondary-foreground"
                      : "rounded-bl-md border border-border bg-card text-card-foreground"
                }`}
              >
                {!you && (
                  <p className="mb-0.5 text-xs font-semibold opacity-75">
                    {agent ? t("Your agent") : chat.stall.name}
                  </p>
                )}
                <p className="text-pretty whitespace-pre-wrap">{body}</p>
              </div>
            </li>
          );
        })}

        {chat.next && (
          <li className="flex justify-start">
            <span className="inline-flex items-center gap-1.5 rounded-2xl rounded-bl-md bg-muted px-3.5 py-3">
              {[0, 1, 2].map((i) => (
                <span
                  key={i}
                  className="size-1.5 animate-[typing_1.1s_ease-in-out_infinite] rounded-full bg-muted-foreground opacity-30"
                  style={{ animationDelay: `${i * 150}ms` }}
                />
              ))}
            </span>
          </li>
        )}
        <li ref={end} className="h-px scroll-mb-32" aria-hidden />
      </ul>

      {agreed && (
        <section className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card/95 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur">
          <div className="mx-auto grid max-w-md gap-3">
            <p className="flex items-center justify-center gap-2 text-sm font-semibold text-success">
              <CircleCheck className="size-5" aria-hidden />
              {chat.status === "paid"
                ? t("Paid")
                : t("Deal agreed") + (chat.current !== null ? ` · ${rupees(chat.current)}` : "")}
            </p>
            {chat.status === "agreed" && (
              <button
                type="button"
                disabled={paying}
                onClick={() => startPay(async () => markPaid(chat.bargainId, chat.stall.id))}
                className={`${action.primary} disabled:opacity-60`}
              >
                {paying ? <Loader2 className="size-5 animate-spin" aria-hidden /> : null}
                {t("I've paid")}
              </button>
            )}
          </div>
        </section>
      )}

      {handedOff && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card/95 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur">
          <div className="mx-auto max-w-md">
            <button
              type="button"
              disabled={busy}
              onClick={() => start(async () => agreeOffer(chat.bargainId, chat.stall.id))}
              className={`${action.primary} disabled:opacity-60`}
            >
              {busy ? <Loader2 className="size-5 animate-spin" aria-hidden /> : null}
              {chat.current !== null
                ? t("Agree {price}", { price: rupees(chat.current) })
                : t("Agree the cheapest deal")}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
