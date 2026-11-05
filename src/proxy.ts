import { NextResponse, type NextRequest } from "next/server";
import { parseRole, redirectFor, ROLE_COOKIE, SESSION_COOKIE } from "@/lib/access";
import { openSession } from "@/lib/session";

export function proxy(request: NextRequest) {
  const signedIn = openSession(request.cookies.get(SESSION_COOKIE)?.value) !== null;
  const role = parseRole(request.cookies.get(ROLE_COOKIE)?.value);
  const to = redirectFor(request.nextUrl.pathname, signedIn, role);
  return to ? NextResponse.redirect(new URL(to, request.url)) : NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/|api/|.*\\..*).*)"],
};
