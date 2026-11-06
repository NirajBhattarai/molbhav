"use client";

import { useSyncExternalStore } from "react";
import { CopyButton } from "@/components/ui/copy-button";

const noSubscribe = () => () => {};

function useOrigin() {
  return useSyncExternalStore(
    noSubscribe,
    () => window.location.origin,
    () => "",
  );
}

export function AgentCardAddress({
  path,
  caption = "Its address for other AI agents (A2A)",
  copyLabel = "Copy agent card address",
}: {
  /** Path from origin, e.g. `/a2a/agents/agent_x/.well-known/agent-card.json` */
  path: string;
  caption?: string;
  copyLabel?: string;
}) {
  const origin = useOrigin();
  if (!origin) return null;
  const card = `${origin}${path.startsWith("/") ? path : `/${path}`}`;
  return (
    <div className="mt-2 grid min-w-0 gap-1">
      <p className="text-xs font-medium text-muted-foreground">{caption}</p>
      <div className="flex min-w-0 items-center gap-1 rounded-xl bg-muted/60 py-0.5 ps-3">
        <a
          href={card}
          target="_blank"
          rel="noreferrer"
          translate="no"
          className="min-w-0 flex-1 truncate font-mono text-xs text-foreground underline-offset-2 hover:underline"
        >
          {card.replace(/^https?:\/\//, "")}
        </a>
        <CopyButton
          value={card}
          label={copyLabel}
          className="text-muted-foreground hover:bg-accent"
        />
      </div>
    </div>
  );
}

export function stallAgentCardPath(agentId: string) {
  return `/a2a/agents/${agentId}/.well-known/agent-card.json`;
}

export const MARKET_AGENT_CARD_PATH = "/.well-known/agent-card.json";
