import { Suspense } from "react";
import { ProfileAccount } from "@/components/app/profile-account";
import { ProfileSettings } from "@/components/app/profile-settings";
import { Screen } from "@/components/app/screen";
import { T } from "@/lib/i18n";
import { getDiscovery } from "@/lib/server/discovery";
import { ensureUser, me } from "@/lib/server/shop";

export default function ProfilePage() {
  return (
    <Screen title={<T msg="Profile" />} back>
      <Suspense fallback={<AccountSkeleton />}>
        <Account />
      </Suspense>
      <Suspense fallback={null}>
        <Settings />
      </Suspense>
    </Screen>
  );
}

async function Account() {
  const { email } = await me();
  return <ProfileAccount email={email} />;
}

async function Settings() {
  const user = await me();
  await ensureUser(user);
  const discovery = await getDiscovery(user.id);
  return <ProfileSettings initialDiscovery={discovery} />;
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
