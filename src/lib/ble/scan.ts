"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Capacitor } from "@capacitor/core";
import { stallInAdvert } from "@/lib/ble/beacon";

const LISTEN_MS = 3500;
const PAUSE_MS = 1500;
/** Forget a stall if we haven't heard it askable this recently. */
const STALE_MS = 8_000;

const noSubscribe = () => () => {};
const isNative = () => Capacitor.isNativePlatform();

type Pass = { askable: Set<string>; closed: Set<string> };

async function listen(): Promise<Pass> {
  const { BleClient } = await import("@capacitor-community/bluetooth-le");
  await BleClient.initialize({ androidNeverForLocation: true });
  const askable = new Set<string>();
  const closed = new Set<string>();

  // allowDuplicates: iOS often sends name first, manufacturer data on a later packet.
  await BleClient.requestLEScan({ allowDuplicates: true }, (result) => {
    const chunks = Object.values(result.manufacturerData ?? {});
    const stall = stallInAdvert({
      name: result.localName ?? result.device?.name,
      data: chunks,
    });
    if (!stall) return;
    if (stall.askable) {
      askable.add(stall.id);
      closed.delete(stall.id);
    } else {
      closed.add(stall.id);
      askable.delete(stall.id);
    }
  });

  await new Promise((r) => setTimeout(r, LISTEN_MS));
  await BleClient.stopLEScan().catch(() => {});
  return { askable, closed };
}

/**
 * Nearby open/in-deal stall agents while `active`.
 * Hearing a closed/paused status removes that agent immediately.
 */
export function useNearbyStalls(active: boolean) {
  const native = useSyncExternalStore(noSubscribe, isNative, () => false);
  const [agents, setAgents] = useState<string[]>([]);
  const [blocked, setBlocked] = useState(false);
  const lastAskable = useRef(new Map<string, number>());

  useEffect(() => {
    if (!native || !active) return;
    const heard = lastAskable.current;
    let on = true;
    void (async () => {
      while (on) {
        try {
          const { askable, closed } = await listen();
          if (!on) return;
          const now = Date.now();
          for (const id of closed) lastAskable.current.delete(id);
          for (const id of askable) lastAskable.current.set(id, now);
          for (const [id, seen] of [...lastAskable.current]) {
            if (now - seen > STALE_MS) lastAskable.current.delete(id);
          }
          setBlocked(false);
          setAgents([...lastAskable.current.keys()].sort());
        } catch {
          if (on) setBlocked(true);
        }
        await new Promise((r) => setTimeout(r, PAUSE_MS));
      }
      await import("@capacitor-community/bluetooth-le")
        .then(({ BleClient }) => BleClient.stopLEScan())
        .catch(() => {});
    })();
    return () => {
      on = false;
      // Scanning stopped: forget what we heard so a later scan starts fresh.
      heard.clear();
      setAgents([]);
      setBlocked(false);
    };
  }, [native, active]);

  return { native, agents, blocked };
}
