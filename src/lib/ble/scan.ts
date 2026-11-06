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

/** ENS name per askable agent id, from its sign's scan response (null: it sent none). */
type Pass = { askable: Map<string, string | null>; closed: Set<string> };

async function listen(): Promise<Pass> {
  const { BleClient } = await import("@capacitor-community/bluetooth-le");
  await BleClient.initialize({ androidNeverForLocation: true });
  const askable = new Map<string, string | null>();
  const closed = new Set<string>();
  // The name (scan response) and the manufacturer data can arrive in different packets.
  const names = new Map<string, string>();

  // allowDuplicates: iOS often sends name first, manufacturer data on a later packet.
  await BleClient.requestLEScan({ allowDuplicates: true }, (result) => {
    const device = result.device?.deviceId ?? "";
    const heard = result.localName ?? result.device?.name;
    if (device && heard) names.set(device, heard);
    const chunks = Object.values(result.manufacturerData ?? {});
    const stall = stallInAdvert({ name: heard ?? names.get(device), data: chunks });
    if (!stall) return;
    if (stall.askable) {
      askable.set(stall.id, stall.ens ?? askable.get(stall.id) ?? null);
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
  /** ENS names heard from those agents' signs (agent id → name). */
  const [ens, setEns] = useState<Record<string, string>>({});
  const [blocked, setBlocked] = useState(false);
  const lastAskable = useRef(new Map<string, number>());
  const lastEns = useRef(new Map<string, string>());

  useEffect(() => {
    if (!native || !active) return;
    const heard = lastAskable.current;
    const heardEns = lastEns.current;
    let on = true;
    void (async () => {
      while (on) {
        try {
          const { askable, closed } = await listen();
          if (!on) return;
          const now = Date.now();
          for (const id of closed) {
            lastAskable.current.delete(id);
            lastEns.current.delete(id);
          }
          for (const [id, name] of askable) {
            lastAskable.current.set(id, now);
            if (name) lastEns.current.set(id, name);
          }
          for (const [id, seen] of [...lastAskable.current]) {
            if (now - seen <= STALE_MS) continue;
            lastAskable.current.delete(id);
            lastEns.current.delete(id);
          }
          setBlocked(false);
          setAgents([...lastAskable.current.keys()].sort());
          setEns(Object.fromEntries(lastEns.current));
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
      heardEns.clear();
      setAgents([]);
      setEns({});
      setBlocked(false);
    };
  }, [native, active]);

  return { native, agents, ens, blocked };
}
