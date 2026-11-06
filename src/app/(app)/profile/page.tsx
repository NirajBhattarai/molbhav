import { Suspense } from "react";
import { ProfileAccount } from "@/components/app/profile-account";
import { ProfileSettings } from "@/components/app/profile-settings";
import { Screen } from "@/components/app/screen";
import { me } from "@/lib/server/shop";

export default function ProfilePage() {
  return (
    <Screen title="Profile" back>
      <Suspense fallback={<AccountSkeleton />}>
        <Account />
      </Suspense>
      <ProfileSettings />
    </Screen>
  );
}

async function Account() {
  const { email } = await me();
  return <ProfileAccount email={email} />;
}

function AccountSkeleton() {
  return (
    <section className="grid gap-4 overflow-hidden rounded-3xl bg-hero p-5" aria-hidden>
      <div className="flex items-center gap-4">
        <span className="size-16 shrink-0 animate-pulse rounded-full bg-hero-foreground/15" />
        <span className="grid flex-1 gap-2">
          <span className="h-5 w-40 animate-pulse rounded bg-hero-foreground/15" />
          <span className="h-4 w-48 animate-pulse rounded bg-hero-foreground/10" />
        </span>
      </div>
    </section>
  );
}
