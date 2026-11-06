import Link from "next/link";
import { me } from "@/lib/server/shop";

/** Header chip: signed-in email → Profile (logout lives there). */
export async function ProfileLink() {
  const { email } = await me();
  return (
    <Link
      href="/profile"
      title={email}
      className="-mr-2 inline-flex h-11 max-w-[12rem] items-center truncate rounded-lg px-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
    >
      {email}
    </Link>
  );
}
