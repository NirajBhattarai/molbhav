import Link from "next/link";
import { Suspense, type ReactNode } from "react";
import { ChevronLeft } from "lucide-react";
import { ProfileBack } from "@/components/app/profile-back";
import { focusRing } from "@/components/ui/styles";
import { T } from "@/lib/i18n";

export function Screen({
  title,
  back,
  children,
  className = "",
}: {
  title?: ReactNode;
  /** `true` → role home; a path → that path. */
  back?: boolean | string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <main
      className={`mx-auto min-h-dvh w-full max-w-md px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-[calc(5.5rem+env(safe-area-inset-bottom))] ${className}`}
    >
      {(title || back) && (
        <header className="mb-4 flex min-h-11 items-center gap-1">
          {back === true && (
            <Suspense fallback={<span className="size-11 shrink-0" aria-hidden />}>
              <ProfileBack />
            </Suspense>
          )}
          {typeof back === "string" && (
            <Link
              href={back}
              className={`-ml-2 grid size-11 shrink-0 place-items-center rounded-full transition-transform duration-150 active:scale-90 active:bg-muted ${focusRing}`}
            >
              <ChevronLeft className="size-6" aria-hidden />
              <span className="sr-only">
                <T msg="Back" />
              </span>
            </Link>
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
