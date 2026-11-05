"use client";

import { chooseRole } from "@/lib/role";

/** Inline control: switch role to shopkeeper and open /shop. */
export function SwitchToShopkeeper({ children }: { children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={() => chooseRole("shopkeeper")}
      className="font-medium text-foreground underline underline-offset-4"
    >
      {children}
    </button>
  );
}
