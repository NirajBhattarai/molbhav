import Link from "next/link";
import { me } from "@/lib/server/shop";

/** Header chip: signed-in email → Profile (logout lives there). */
export async function ProfileLink() {
  const { email } = await me();
  return (
    <Link
      href="/profile"
      title={email}
      className="max-w-[11rem] truncate text-sm font-medium text-muted-foreground hover:text-foreground"
    >
      {email}
    </Link>
  );
}
