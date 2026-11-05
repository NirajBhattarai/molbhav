"use client";

import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { focusRing } from "@/components/ui/styles";
import { useRole } from "@/lib/role";
import { roleHome } from "@/lib/roles";

export function ProfileBack() {
  const role = useRole();
  const href = role ? roleHome[role] : "/";
  return (
    <Link
      href={href}
      className={`-ml-2 grid size-11 shrink-0 place-items-center rounded-full transition-transform duration-150 active:scale-90 active:bg-muted ${focusRing}`}
    >
      <ChevronLeft className="size-6" aria-hidden />
      <span className="sr-only">Back</span>
    </Link>
  );
}
