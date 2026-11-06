"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** Soft-refresh the buyer home so Open/Closed tracks the stall sign. */
export function HomeRefresh({ everyMs = 5_000 }: { everyMs?: number }) {
  const router = useRouter();
  useEffect(() => {
    const id = window.setInterval(() => router.refresh(), everyMs);
    return () => window.clearInterval(id);
  }, [router, everyMs]);
  return null;
}
