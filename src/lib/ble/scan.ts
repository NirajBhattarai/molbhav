"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Capacitor } from "@capacitor/core";
import { stallInAdvert } from "@/lib/ble/beacon";

/** How long each scan listens, and the pause before the next, while the buyer is ordering. */
const LISTEN_MS = 4000;
const PAUSE_MS = 2500;
/** Drop a stall if we haven't heard it askable within this window (covers a missed scan). */
const STALE_MS = 12_000;

const noSubscribe = () => () => {};

/** Bluetooth LE scan is only available in the native Capacitor shell. */
const isNative = () => Capacitor.isNativePlatform();

function payloadBytes(view: DataView): Uint8Array {
  return new Uint8Array(view.buffer, view.byteOffset, view.byteLength);
}

type Pass = { askable: Set<string>; closed: Set<string> };

/** One scan pass: askable agent ids, and ids heard as closed/paused (to remove). */
async function listen(): Promise<Pass> {
  const { BleClient } = await import("@capacitor-community/bluetooth-le");
  await BleClient.initialize({ androidNeverForLocation: true });
  const askable = new Set<string>();
  const closed = new Set<string>();

  // allowDuplicates: iOS often omits manufacturer data on the first packet.
  await BleClient.requestLEScan({ allowDuplicates: true }, (result) => {
    const chunks = Object.values(result.manufacturerData ?? {}).map(payloadBytes);
    const stall = stallInAdvert({
      name: result.localName ?? result.device?.name,
      data: chunks,
    });
    if (!stall) return;
    if (stall.askable) askable.add(stall.id);
    else closed.add(stall.id);
  });

  await new Promise((r) => setTimeout(r, LISTEN_MS));
  await BleClient.stopLEScan().catch(() => {});
  return { askable, closed };
}

/**
 * Stalls heard over Bluetooth while `active`.
 * Closed/paused signs are removed as soon as we hear their status byte.
 * On the web there is nothing to scan — `native` is false and `agents` stays empty.
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
          for (const [id, seen] of lastAskable.current) {
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
