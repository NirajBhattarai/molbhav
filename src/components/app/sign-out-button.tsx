"use client";

import { signOut } from "@/lib/role";

export function SignOutButton() {
  return (
    <button
      type="button"
      onClick={() => void signOut()}
      className="text-sm font-medium text-muted-foreground hover:text-foreground"
    >
      Sign out
    </button>
  );
}
