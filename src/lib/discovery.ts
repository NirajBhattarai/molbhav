"use client";

import { useSyncExternalStore } from "react";
import { isDiscoveryMode, type DiscoveryMode } from "@/lib/discovery-mode";

export type { DiscoveryMode };
export { isDiscoveryMode };

const KEY = "molbhav.discovery";
const listeners = new Set<() => void>();

function current(): DiscoveryMode {
  try {
    const saved = localStorage.getItem(KEY);
    if (isDiscoveryMode(saved)) return saved;
  } catch {}
  return "nearby";
}

/** Optimistic local mirror; server (Postgres + Redis) is the source of truth. */
export function setDiscoveryMode(mode: DiscoveryMode) {
  try {
    localStorage.setItem(KEY, mode);
  } catch {}
  listeners.forEach((l) => l());
}

/** Seed the local mirror from the server (Redis/DB). */
export function hydrateDiscoveryMode(mode: DiscoveryMode) {
  try {
    if (localStorage.getItem(KEY) === mode) return;
    localStorage.setItem(KEY, mode);
  } catch {}
  listeners.forEach((l) => l());
}

/** Buyer discovery preference on this phone (mirrors server). */
export function useDiscoveryMode(): DiscoveryMode {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => {
        listeners.delete(cb);
      };
    },
    current,
    () => "nearby",
  );
}
