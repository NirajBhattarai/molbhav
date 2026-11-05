import { Suspense, type ReactNode } from "react";
import { ProfileBack } from "@/components/app/profile-back";

export function Screen({
  title,
  back,
  children,
}: {
  title?: ReactNode;
  /** When true, show a back control to the current role home. */
  back?: boolean;
  children: ReactNode;
}) {
  return (
    <main className="mx-auto min-h-dvh w-full max-w-md px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1.5rem,env(safe-area-inset-bottom))]">
      {(title || back) && (
        <header className="mb-4 flex min-h-11 items-center gap-1">
          {back && (
            <Suspense fallback={<span className="size-11 shrink-0" aria-hidden />}>
              <ProfileBack />
            </Suspense>
          )}
          {title && (
            <h1 className="truncate font-display text-2xl font-bold tracking-tight">{title}</h1>
          )}
        </header>
      )}
      {children}
    </main>
  );
}
