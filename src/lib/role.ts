"use client";

import { useSyncExternalStore } from "react";
import { parseRole, ROLE_COOKIE } from "@/lib/access";
import { endSession } from "@/lib/auth-actions";
import { signOutOfMagic } from "@/lib/magic";
import { roleHome, type Role } from "@/lib/roles";

const MONTH = 60 * 60 * 24 * 30;
const listeners = new Set<() => void>();

function readCookie(name: string) {
  return document.cookie
    .split("; ")
    .find((c) => c.startsWith(`${name}=`))
    ?.slice(name.length + 1);
}

function writeCookie(name: string, value: string) {
  document.cookie = `${name}=${value}; Path=/; Max-Age=${MONTH}; SameSite=Lax`;
  listeners.forEach((l) => l());
}

function go(path: string) {
  window.location.assign(path);
}

/** After the server started the session: your home, or the role picker first. */
export function enterApp() {
  const role = parseRole(readCookie(ROLE_COOKIE));
  go(role ? roleHome[role] : "/role");
}

export function chooseRole(role: Role) {
  writeCookie(ROLE_COOKIE, role);
  go(roleHome[role]);
}

export async function signOut() {
  await signOutOfMagic();
  await endSession();
  go("/sign-in");
}

export function useRole(): Role | null {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => {
        listeners.delete(cb);
      };
    },
    () => parseRole(readCookie(ROLE_COOKIE)),
    () => null,
  );
}
