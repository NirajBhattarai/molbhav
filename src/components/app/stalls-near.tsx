"use client";

import { useDeferredValue, useState } from "react";
import { ChevronRight, Search, X } from "lucide-react";
import { StallAvatar } from "@/components/app/stall-avatar";
import { focusRing } from "@/components/ui/styles";
import { useT } from "@/lib/i18n";
import type { NearbyStall } from "@/lib/server/shop";
import { rupees } from "@/lib/want";

/** Open stalls shown before "Show more", and how many each tap adds. */
const FIRST = 10;
const STEP = 20;

const fold = (s: string) => s.toLocaleLowerCase().normalize("NFKD");

/**
 * Stalls near the buyer, built to stay calm at 100: one search over stall names and dishes, open
 * stalls in short batches behind "Show more", and closed ones folded away at the bottom.
 */
export function StallsNear({ stalls }: { stalls: NearbyStall[] }) {
  const t = useT();
  const [q, setQ] = useState("");
  const query = fold(useDeferredValue(q).trim());
  const [shown, setShown] = useState(FIRST);
  const [closedOpen, setClosedOpen] = useState(false);

  // With a search, each stall leads with the dishes that matched.
  const matches = stalls.flatMap((s) => {
    if (!query) return [{ stall: s, items: s.items, hits: [] as string[] }];
    const hits = s.items.filter((i) => fold(i).includes(query));
    if (!hits.length && !fold(s.name).includes(query)) return [];
    return [{ stall: s, items: [...hits, ...s.items.filter((i) => !hits.includes(i))], hits }];
  });
  const open = matches.filter((m) => m.stall.open);
  const closed = matches.filter((m) => !m.stall.open);
  // A search shows every match: the batches are for browsing, not for hiding results.
  const visible = query ? open : open.slice(0, shown);
  const more = open.length - visible.length;

  return (
    <div className="grid gap-3">
      {stalls.length > 6 && (
        <label className="relative block">
          <span className="sr-only">{t("Search stalls or dishes")}</span>
          <Search
            className="pointer-events-none absolute top-1/2 left-3.5 size-5 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t("Search stalls or dishes")}
            enterKeyHint="search"
            className={`h-12 w-full rounded-2xl border border-border bg-card pr-11 pl-11 text-base placeholder:text-muted-foreground [&::-webkit-search-cancel-button]:hidden ${focusRing}`}
          />
          {q && (
            <button
              type="button"
              onClick={() => setQ("")}
              aria-label={t("Clear")}
              className={`absolute top-1/2 right-1 grid size-10 -translate-y-1/2 place-items-center rounded-xl text-muted-foreground hover:bg-muted ${focusRing}`}
            >
              <X className="size-4" aria-hidden />
            </button>
          )}
        </label>
      )}

      {query && !matches.length ? (
        <p className="rounded-2xl border border-dashed border-border px-6 py-7 text-center text-sm text-pretty text-muted-foreground">
          {t("Nothing nearby matches “{q}”.", { q: q.trim() })}
        </p>
      ) : (
        <>
          {visible.length > 0 && (
            <Rows>
              {visible.map((m, i) => (
                <Row key={m.stall.id} stall={m.stall} items={m.items} hits={m.hits} index={i} />
              ))}
            </Rows>
          )}

          {more > 0 && (
            <button
              type="button"
              onClick={() => setShown((n) => n + STEP)}
              className={`min-h-12 rounded-2xl border border-border bg-card font-semibold text-primary transition-colors duration-150 hover:bg-muted/50 active:bg-muted ${focusRing}`}
            >
              {t("Show {n} more", { n: Math.min(STEP, more) })}
            </button>
          )}

          {closed.length > 0 && (
            <section className="mt-2 grid gap-2">
              <h3>
                <button
                  type="button"
                  aria-expanded={closedOpen || !!query}
                  onClick={() => setClosedOpen((o) => !o)}
                  disabled={!!query}
                  className={`-mx-1 flex min-h-11 items-center gap-1.5 rounded-xl px-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase hover:bg-muted/50 disabled:hover:bg-transparent ${focusRing}`}
                >
                  {!query && (
                    <ChevronRight
                      className={`size-4 transition-transform duration-200 ease-out ${closedOpen ? "rotate-90" : ""}`}
                      aria-hidden
                    />
                  )}
                  {t("Closed now")} · <span className="tabular-nums">{closed.length}</span>
                </button>
              </h3>
              {(closedOpen || query) && (
                <Rows>
                  {closed.map((m, i) => (
                    <Row key={m.stall.id} stall={m.stall} items={m.items} hits={m.hits} index={i} />
                  ))}
                </Rows>
              )}
            </section>
          )}
        </>
      )}
    </div>
  );
}

function Rows({ children }: { children: React.ReactNode }) {
  return (
    <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
      {children}
    </ul>
  );
}

/** One stall: who, what it sells (matches first when searching), and where its prices start. */
function Row({
  stall: s,
  items,
  hits,
  index,
}: {
  stall: NearbyStall;
  items: string[];
  hits?: string[];
  index: number;
}) {
  const t = useT();
  const preview = items.slice(0, 3);
  const extra = items.length - preview.length;
  return (
    <li
      className={`flex animate-[rise_240ms_var(--ease-out)_both] items-center gap-3 px-4 py-3 ${s.open ? "" : "opacity-60"}`}
      style={{ animationDelay: `${Math.min(index, 8) * 30}ms` }}
    >
      <StallAvatar id={s.id} name={s.name} size="lg" />
      <span className="grid min-w-0 flex-1 grid-cols-[minmax(0,1fr)] gap-1">
        <span className="flex items-baseline gap-3">
          <span className="min-w-0 flex-1 truncate font-semibold">{s.name}</span>
          {s.from !== null && (
            <span className="shrink-0 text-sm text-muted-foreground tabular-nums">
              {t("From {price}", { price: rupees(s.from) })}
            </span>
          )}
        </span>
        <span className="truncate text-sm text-muted-foreground">
          {preview.map((item, i) => (
            <span key={item}>
              {i > 0 && ", "}
              <span className={hits?.includes(item) ? "font-semibold text-foreground" : ""}>
                {item}
              </span>
            </span>
          ))}
          {extra > 0 && <span className="tabular-nums"> +{extra}</span>}
        </span>
      </span>
    </li>
  );
}
