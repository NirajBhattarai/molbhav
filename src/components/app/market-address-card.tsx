"use client";

import { Store } from "lucide-react";
import { AgentCardAddress, MARKET_AGENT_CARD_PATH } from "@/components/app/agent-address";

/** Market directory Agent Card — same address chip as the stall agent. */
export function MarketAddressCard() {
  return (
    <section
      aria-label="Molbhav market"
      className="flex items-start gap-3 rounded-2xl border border-border bg-card p-4 text-card-foreground"
    >
      <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
        <Store className="size-5" aria-hidden />
      </span>
      <div className="grid min-w-0 flex-1 gap-0.5">
        <p className="font-semibold">Molbhav market</p>
        <p className="text-sm text-pretty text-muted-foreground">
          Where buyers&apos; agents start: find open stalls and each stall&apos;s agent card.
        </p>
        <AgentCardAddress
          path={MARKET_AGENT_CARD_PATH}
          caption="Market address for other AI agents (A2A)"
          copyLabel="Copy market agent card address"
        />
      </div>
    </section>
  );
}
