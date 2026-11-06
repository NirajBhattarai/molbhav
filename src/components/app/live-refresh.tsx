"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Re-reads the screen from the server every few seconds while `active`
 * (a stall or agent is still talking), and only while the screen is visible.
 */
export function LiveRefresh({ active = true, every = 2000 }: { active?: boolean; every?: number }) {
  const router = useRouter();
  useEffect(() => {
    if (!active) return;
    const tick = () => document.visibilityState === "visible" && router.refresh();
    const id = setInterval(tick, every);
    document.addEventListener("visibilitychange", tick);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [active, every, router]);
  return null;
}
