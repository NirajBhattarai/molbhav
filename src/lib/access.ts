import { roleHome, type Role } from "@/lib/roles";

export const SESSION_COOKIE = "molbhav_session";
export const ROLE_COOKIE = "molbhav_role";

const roles: Role[] = ["buyer", "shopkeeper"];

export function parseRole(value: string | undefined): Role | null {
  return roles.includes(value as Role) ? (value as Role) : null;
}

const areas: Record<Role, string[]> = {
  buyer: ["/", "/bargains"],
  shopkeeper: ["/shop"],
};

const under = (path: string, base: string) =>
  base === "/" ? path === "/" : path === base || path.startsWith(`${base}/`);

export function canVisit(role: Role, path: string) {
  return under(path, "/profile") || areas[role].some((base) => under(path, base));
}

/**
 * Where a request should go instead, or null to let it through:
 * signed out → /sign-in, no role yet → /role, another role's screen → your own home.
 */
export function redirectFor(path: string, signedIn: boolean, role: Role | null): string | null {
  if (!signedIn) return path === "/sign-in" ? null : "/sign-in";
  if (!role) return path === "/role" ? null : "/role";
  if (path === "/sign-in") return roleHome[role];
  if (path === "/role") return null;
  return canVisit(role, path) ? null : roleHome[role];
}
