"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import {
  Camera,
  Check,
  ChevronRight,
  CircleAlert,
  LoaderCircle,
  Lock,
  Plus,
  ReceiptText,
  RefreshCw,
  Search,
  Trash2,
  Undo2,
  X,
} from "lucide-react";
import { Field, MoneyInput, Sheet, fieldInput } from "@/components/ui/sheet";
import { focusRing, outlineButton, primaryButton } from "@/components/ui/styles";
import { useT, useTx, type Msg, type Text } from "@/lib/i18n";
import { menuKey } from "@/lib/menu";
import { shrinkPhoto } from "@/lib/photo";
import type { ShopItem } from "@/lib/server/shop";
import {
  removeItem,
  saveItem,
  saveScannedItems,
  scanMenu,
  type ScannedMenuItem,
} from "@/lib/shop-actions";

const inr = (n: number) => `₹${n.toLocaleString("en-IN")}`;
const SCAN_ERROR = "Couldn't read that photo. Try a clearer one, or add items by hand.";

// Kept in English and shown through tx(), so notices switch with the app language.
type Notice = { tone: "success" | "error"; text: Text };

/** The stall's menu: printed-menu list, add by hand, or scan/upload a photo and review it. */
export function MenuSection({ items, canReadMenu }: { items: ShopItem[]; canReadMenu: boolean }) {
  const t = useT();
  const [editing, setEditing] = useState<ShopItem | "new" | null>(null);
  const [review, setReview] = useState<ScannedMenuItem[] | null>(null);
  const [scanPreview, setScanPreview] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [draftName, setDraftName] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (notice?.tone !== "success") return;
    const t = window.setTimeout(() => setNotice(null), 4000);
    return () => window.clearTimeout(t);
  }, [notice]);

  async function onPhoto(file: File | undefined) {
    if (!file) return;
    const preview = URL.createObjectURL(file);
    setScanPreview(preview);
    setNotice(null);
    try {
      const form = new FormData();
      form.set("photo", await shrinkPhoto(file));
      const res = await scanMenu(form);
      if ("error" in res) setNotice({ tone: "error", text: res.error });
      else setReview(res.items);
    } catch {
      setNotice({ tone: "error", text: SCAN_ERROR });
    } finally {
      setScanPreview(null);
      URL.revokeObjectURL(preview);
    }
  }

  const pickPhoto = () => fileRef.current?.click();
  const scanning = scanPreview !== null;

  return (
    <section
      id="menu"
      aria-labelledby="menu-title"
      className="scroll-mt-4 overflow-hidden rounded-2xl border border-border bg-card text-card-foreground"
    >
      <header className="flex items-end justify-between gap-3 px-4 pt-4 pb-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold tracking-[0.08em] text-muted-foreground uppercase">
            {t("Menu")}
          </p>
          <h2
            id="menu-title"
            tabIndex={-1}
            className="font-display text-xl font-bold tracking-tight outline-none"
          >
            {t("What you sell")}
          </h2>
        </div>
        {items.length > 0 && (
          <span className="shrink-0 rounded-full bg-muted px-2.5 py-1 text-xs font-semibold text-muted-foreground tabular-nums">
            {t(items.length === 1 ? "{n} item" : "{n} items", { n: items.length })}
          </span>
        )}
      </header>

      {/* No `capture`: phones then offer both the camera and the photo library. */}
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        tabIndex={-1}
        aria-hidden
        className="sr-only"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          void onPhoto(file);
        }}
      />

      {scanPreview ? (
        <ScanProgress preview={scanPreview} />
      ) : items.length === 0 ? (
        <EmptyMenu canScan={canReadMenu} onScan={pickPhoto} onAdd={() => setEditing("new")} />
      ) : (
        <MenuList
          items={items}
          onEdit={setEditing}
          onAdd={(name) => {
            setDraftName(name);
            setEditing("new");
          }}
        />
      )}

      {notice && (
        <div className="border-t border-border p-3">
          <NoticeBar notice={notice} onDismiss={() => setNotice(null)} />
        </div>
      )}

      {items.length > 0 && !scanning && (
        <div
          className={`grid gap-2 border-t border-border bg-muted/40 p-3 ${canReadMenu ? "grid-cols-2" : ""}`}
        >
          <button
            type="button"
            onClick={() => {
              setDraftName("");
              setEditing("new");
            }}
            className={outlineButton}
          >
            <Plus className="size-5" aria-hidden />
            {t("Add item")}
          </button>
          {canReadMenu && (
            <button type="button" onClick={pickPhoto} className={outlineButton}>
              <Camera className="size-5" aria-hidden />
              {t("Scan menu")}
            </button>
          )}
        </div>
      )}

      {editing !== null && (
        <ItemForm
          key={editing === "new" ? "new" : editing.id}
          item={editing === "new" ? null : editing}
          initialName={editing === "new" ? draftName : undefined}
          menu={items}
          onOpen={setEditing}
          onClose={() => setEditing(null)}
          onRemoved={(name) => {
            setEditing(null);
            setNotice({
              tone: "success",
              text: { msg: "Removed {name} from your menu.", vars: { name } },
            });
          }}
        />
      )}
      {review && (
        <MenuReview
          items={review}
          menu={items}
          onClose={() => setReview(null)}
          onSaved={({ added, updated }) => {
            setReview(null);
            setNotice({
              tone: "success",
              text: {
                msg: "Menu saved. New: {added}, updated: {updated}.",
                vars: { added, updated },
              },
            });
          }}
        />
      )}
    </section>
  );
}

/** From this many items, the menu gets a search box. */
const SEARCH_FROM = 8;

/**
 * The menu rows in a fixed-height scroller, so a long menu doesn't push the rest of the shop
 * screen away. Fades at the edges show there's more; search narrows long menus.
 */
function MenuList({
  items,
  onEdit,
  onAdd,
}: {
  items: ShopItem[];
  onEdit: (item: ShopItem) => void;
  onAdd: (name: string) => void;
}) {
  const t = useT();
  const [query, setQuery] = useState("");
  const [edges, setEdges] = useState({ top: true, bottom: true });
  const scroller = useRef<HTMLDivElement>(null);
  const search = useRef<HTMLInputElement>(null);

  const q = menuKey(query);
  const shown = q
    ? items.filter(
        (i) => menuKey(i.name).includes(q) || i.aliases.some((a) => menuKey(a).includes(q)),
      )
    : items;

  const measure = useCallback(() => {
    const el = scroller.current;
    if (!el) return;
    setEdges({
      top: el.scrollTop <= 1,
      bottom: el.scrollTop + el.clientHeight >= el.scrollHeight - 1,
    });
  }, []);

  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    if (el.firstElementChild) observer.observe(el.firstElementChild);
    return () => observer.disconnect();
  }, [measure, shown.length]);

  function onQuery(value: string) {
    setQuery(value);
    scroller.current?.scrollTo({ top: 0 });
  }

  return (
    <div className="border-t border-border">
      {items.length >= SEARCH_FROM && (
        <div className="border-b border-border px-3 py-3">
          <label htmlFor="menu-search" className="sr-only">
            {t("Search your menu")}
          </label>
          <div className="relative">
            <Search
              className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <input
              ref={search}
              id="menu-search"
              type="search"
              value={query}
              onChange={(e) => onQuery(e.target.value)}
              placeholder={t("Search {n} items", { n: items.length })}
              autoComplete="off"
              enterKeyHint="search"
              className={`${fieldInput} h-11 pr-11 pl-9 [&::-webkit-search-cancel-button]:appearance-none`}
            />
            {query && (
              <button
                type="button"
                aria-label={t("Clear search")}
                onClick={() => {
                  onQuery("");
                  search.current?.focus();
                }}
                className={`absolute top-1/2 right-0 flex size-11 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground ${focusRing}`}
              >
                <X className="size-4" aria-hidden />
              </button>
            )}
          </div>
          <p aria-live="polite" className="sr-only">
            {q ? t("Found: {n}", { n: shown.length }) : ""}
          </p>
        </div>
      )}

      <div className="relative">
        <div
          ref={scroller}
          onScroll={measure}
          className="max-h-[min(30rem,60dvh)] overflow-y-auto overscroll-contain"
        >
          {shown.length > 0 ? (
            <ul>
              {shown.map((item) => (
                <MenuRow key={item.id} item={item} onEdit={() => onEdit(item)} />
              ))}
            </ul>
          ) : (
            <div className="px-4 py-8 text-center">
              <p className="text-sm text-muted-foreground">
                {t("Nothing on your menu matches “{q}”.", { q: query.trim() })}
              </p>
              <button
                type="button"
                onClick={() => onAdd(query.trim())}
                className={`${outlineButton} mt-3 max-w-full`}
              >
                <Plus className="size-5 shrink-0" aria-hidden />
                <span className="truncate">{t("Add “{q}”", { q: query.trim() })}</span>
              </button>
            </div>
          )}
        </div>
        <div
          aria-hidden
          className={`pointer-events-none absolute inset-x-0 top-0 h-3 bg-linear-to-b from-foreground/10 to-transparent transition-opacity duration-200 ${
            edges.top ? "opacity-0" : "opacity-100"
          }`}
        />
        <div
          aria-hidden
          className={`pointer-events-none absolute inset-x-0 bottom-0 h-12 bg-linear-to-t from-card to-transparent transition-opacity duration-200 ${
            edges.bottom ? "opacity-0" : "opacity-100"
          }`}
        />
      </div>
    </div>
  );
}

function MenuRow({ item, onEdit }: { item: ShopItem; onEdit: () => void }) {
  const t = useT();
  const room = item.price - item.lowest;
  return (
    <li className="border-b border-border last:border-0">
      <button
        type="button"
        onClick={onEdit}
        className={`flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors duration-150 hover:bg-muted/50 active:bg-muted ${focusRing} focus-visible:ring-inset`}
      >
        <span className="min-w-0 flex-1">
          <span className="flex items-baseline gap-2">
            <span className="min-w-0 font-medium text-pretty">{item.name}</span>
            <span
              aria-hidden
              className="min-w-6 flex-1 -translate-y-1 border-b border-dotted border-input/60"
            />
            <span className="shrink-0 font-display text-base font-semibold tabular-nums">
              {inr(item.price)}
            </span>
          </span>
          <span className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1 tabular-nums">
              <Lock className="size-3.5" aria-hidden />
              {t("Lowest {price}", { price: inr(item.lowest) })}
            </span>
            <span className="tabular-nums">
              {room > 0 ? t("{price} to bargain", { price: inr(room) }) : t("Fixed price")}
            </span>
            {item.aliases.length > 0 && (
              <span className="max-w-full truncate">
                {t("Also: {names}", { names: item.aliases.slice(0, 3).join(", ") })}
              </span>
            )}
          </span>
        </span>
        <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
        <span className="sr-only">{t("Edit")}</span>
      </button>
    </li>
  );
}

function EmptyMenu({
  canScan,
  onScan,
  onAdd,
}: {
  canScan: boolean;
  onScan: () => void;
  onAdd: () => void;
}) {
  const t = useT();
  return (
    <div className="border-t border-border px-4 pt-6 pb-4 text-center">
      <span className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-secondary/20 text-foreground">
        <ReceiptText className="size-7" aria-hidden />
      </span>
      <h3 className="mt-3 font-display text-lg font-semibold">{t("Add your menu")}</h3>
      <p className="mx-auto mt-1 max-w-xs text-sm text-pretty text-muted-foreground">
        {canScan
          ? t(
              "Take or upload a photo of your menu or price board. We’ll read every item and price for you to check.",
            )
          : t("Add each thing you sell with the price you ask and the lowest you’ll take.")}
      </p>
      <div className="mt-5 grid gap-2">
        {canScan && (
          <button type="button" onClick={onScan} className={`${primaryButton} w-full`}>
            <Camera className="size-5" aria-hidden />
            {t("Scan or upload menu")}
          </button>
        )}
        <button
          type="button"
          onClick={onAdd}
          className={`${canScan ? outlineButton : primaryButton} w-full`}
        >
          <Plus className="size-5" aria-hidden />
          {canScan ? t("Add items by hand") : t("Add your first item")}
        </button>
      </div>
    </div>
  );
}

const CORNERS = [
  "top-3 left-3 rounded-tl-lg border-t-2 border-l-2",
  "top-3 right-3 rounded-tr-lg border-t-2 border-r-2",
  "bottom-3 left-3 rounded-bl-lg border-b-2 border-l-2",
  "bottom-3 right-3 rounded-br-lg border-b-2 border-r-2",
];

function ScanProgress({ preview }: { preview: string }) {
  const t = useT();
  return (
    <div className="border-t border-border p-4">
      <div className="relative aspect-[4/3] overflow-hidden rounded-xl bg-muted">
        {/* eslint-disable-next-line @next/next/no-img-element -- local blob preview */}
        <img src={preview} alt="" className="size-full object-cover" />
        <div aria-hidden className="absolute inset-0 bg-hero/35" />
        <div
          aria-hidden
          className="absolute inset-0 animate-[scan_1.8s_ease-in-out_infinite_alternate] border-b-2 border-secondary bg-linear-to-b from-transparent via-transparent to-secondary/30"
        />
        {CORNERS.map((c) => (
          <span key={c} aria-hidden className={`absolute size-7 border-hero-foreground ${c}`} />
        ))}
      </div>
      <div role="status" className="mt-3 flex items-start gap-3">
        <LoaderCircle
          className="mt-0.5 size-5 shrink-0 animate-spin text-primary motion-reduce:animate-none"
          aria-hidden
        />
        <p className="text-sm">
          <span className="font-semibold">{t("Reading your menu…")}</span>{" "}
          <span className="text-muted-foreground">
            {t("Finding each item and its price. This usually takes 10–20 seconds.")}
          </span>
        </p>
      </div>
    </div>
  );
}

function NoticeBar({ notice, onDismiss }: { notice: Notice; onDismiss: () => void }) {
  const t = useT();
  const tx = useTx();
  const ok = notice.tone === "success";
  const Icon = ok ? Check : CircleAlert;
  return (
    <div
      role={ok ? "status" : "alert"}
      className={`flex items-start gap-2 rounded-xl py-2 pr-1 pl-3 text-sm ${
        ok ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive"
      }`}
    >
      <Icon className="mt-1 size-4 shrink-0" aria-hidden />
      <p className="flex-1 py-0.5 font-medium text-pretty">{tx(notice.text)}</p>
      <button
        type="button"
        onClick={onDismiss}
        aria-label={t("Dismiss")}
        className={`-my-2 flex size-11 shrink-0 items-center justify-center rounded-lg hover:bg-current/10 ${focusRing}`}
      >
        <X className="size-4" aria-hidden />
      </button>
    </div>
  );
}

function FormError({ children }: { children: ReactNode }) {
  return (
    <p role="alert" className="flex items-start gap-2 text-sm font-medium text-destructive">
      <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
      {children}
    </p>
  );
}

function BargainRange({ ask, floor }: { ask: number; floor: number }) {
  const t = useT();
  const room = ask - floor;
  const pct = Math.round((room / ask) * 100);
  return (
    <div className="rounded-xl bg-muted/60 p-3">
      <div className="flex items-center justify-between text-xs font-medium text-muted-foreground tabular-nums">
        <span>{t("Lowest {price}", { price: inr(floor) })}</span>
        <span>{t("Ask {price}", { price: inr(ask) })}</span>
      </div>
      <div className="mt-2 flex h-2 overflow-hidden rounded-full bg-border" aria-hidden>
        <div
          className="ml-auto h-full rounded-full bg-success"
          style={{ width: `${Math.max(pct, 3)}%` }}
        />
      </div>
      <p className="mt-2 text-sm text-pretty">
        {room === 0
          ? t("Fixed price: your agent won’t give a discount.")
          : t("Your agent can come down by up to {price} ({pct}%).", { price: inr(room), pct })}
      </p>
    </div>
  );
}

function ItemForm({
  item,
  initialName,
  menu,
  onOpen,
  onClose,
  onRemoved,
}: {
  item: ShopItem | null;
  /** Prefill for a new item, e.g. what the shopkeeper just searched for. */
  initialName?: string;
  /** The stall's current menu, to catch a second entry for the same dish while typing. */
  menu: ShopItem[];
  /** Switch this sheet to another menu item (the one this name already belongs to). */
  onOpen: (item: ShopItem) => void;
  onClose: () => void;
  onRemoved: (name: string) => void;
}) {
  const t = useT();
  const tx = useTx();
  const [name, setName] = useState(item?.name ?? initialName ?? "");
  const [price, setPrice] = useState(item ? String(item.price) : "");
  const [lowest, setLowest] = useState(item ? String(item.lowest) : "");
  const [error, setError] = useState<Text>("");
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const ask = Number(price) || 0;
  const autoFloor = ask ? Math.max(1, Math.round(ask * 0.8)) : 0;
  const floor = lowest ? Number(lowest) : autoFloor;
  const floorTooHigh = ask > 0 && floor > ask;
  const key = menuKey(name);
  const twin = key ? menu.find((i) => i.id !== item?.id && menuKey(i.name) === key) : undefined;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    if (!name.trim()) return setError("Give the item a name.");
    if (twin) return document.getElementById("item-name-twin")?.focus();
    if (!ask) return setError("Enter the price you ask, in rupees.");
    if (floorTooHigh) return setError("The lowest price can’t be above the price you ask.");
    setBusy(true);
    try {
      const res = await saveItem({ id: item?.id ?? null, name, price: ask, lowest: floor });
      if (res?.error) {
        const existing = res.duplicateOf ? menu.find((i) => i.id === res.duplicateOf) : null;
        if (existing) return onOpen(existing);
        setError(res.error);
        setBusy(false);
        return;
      }
      onClose();
    } catch {
      setBusy(false);
      setError("Something went wrong. Please try again.");
    }
  }

  async function onRemove() {
    if (!item) return;
    setBusy(true);
    try {
      await removeItem(item.id);
      onRemoved(item.name);
    } catch {
      setBusy(false);
      setError("Couldn’t remove it. Please try again.");
    }
  }

  return (
    <Sheet
      title={item ? t("Edit item") : t("Add item")}
      description={t("Buyers see your asking price. Only your agent knows the lowest.")}
      onClose={onClose}
      footer={
        <button
          type="submit"
          form="item-form"
          disabled={busy || !!twin}
          className={`${primaryButton} w-full`}
        >
          {busy && !confirming && <LoaderCircle className="size-5 animate-spin" aria-hidden />}
          {busy && !confirming ? t("Saving…") : item ? t("Save changes") : t("Add to menu")}
        </button>
      }
    >
      <form id="item-form" onSubmit={onSubmit} noValidate className="grid gap-4">
        <Field label={t("Item name")} htmlFor="item-name">
          <input
            id="item-name"
            data-autofocus={item ? undefined : true}
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={80}
            autoComplete="off"
            placeholder="Masala chai"
            aria-describedby={twin ? "item-name-dup" : undefined}
            className={fieldInput}
          />
          {twin && (
            <div
              id="item-name-dup"
              role="status"
              className="mt-2 flex items-center gap-3 rounded-xl border border-secondary/60 bg-secondary/15 py-2 pr-2 pl-3"
            >
              <CircleAlert className="size-4 shrink-0" aria-hidden />
              <p className="min-w-0 flex-1 text-sm">
                {t("{name} is already on your menu at {price}.", {
                  name: twin.name,
                  price: inr(twin.price),
                })}
              </p>
              <button
                id="item-name-twin"
                type="button"
                onClick={() => onOpen(twin)}
                className={`inline-flex h-11 shrink-0 items-center gap-1 rounded-lg bg-card px-3 text-sm font-semibold shadow-sm transition-colors hover:bg-muted ${focusRing}`}
              >
                {t("Edit it")}
                <ChevronRight className="size-4" aria-hidden />
              </button>
            </div>
          )}
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t("You ask")} htmlFor="item-price" hint={t("Buyers see this first")}>
            <MoneyInput
              id="item-price"
              value={price}
              onChange={setPrice}
              placeholder="40"
              describedBy="item-price-hint"
            />
          </Field>
          <Field label={t("Lowest you’ll take")} htmlFor="item-lowest" hint={t("Kept private")}>
            <MoneyInput
              id="item-lowest"
              value={lowest}
              onChange={setLowest}
              placeholder={autoFloor ? String(autoFloor) : "32"}
              invalid={floorTooHigh}
              describedBy="item-lowest-hint"
            />
          </Field>
        </div>

        {!lowest && ask > 0 && (
          <p className="text-sm text-muted-foreground">
            {t("No lowest set, so we’ll use {price} (80% of your ask).", { price: inr(autoFloor) })}
          </p>
        )}
        {ask > 0 && !floorTooHigh && <BargainRange ask={ask} floor={floor} />}
        {error && <FormError>{tx(error)}</FormError>}

        {item &&
          (confirming ? (
            <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-3">
              <p className="font-medium">{t("Remove {name}?", { name: item.name })}</p>
              <p className="mt-0.5 text-sm text-muted-foreground">
                {t("Your agent stops selling it. If it’s your last item, your stall closes.")}
              </p>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setConfirming(false)}
                  disabled={busy}
                  className={outlineButton}
                >
                  {t("Keep it")}
                </button>
                <button
                  type="button"
                  onClick={onRemove}
                  disabled={busy}
                  className="inline-flex h-12 items-center justify-center gap-2 rounded-lg bg-destructive px-5 font-semibold text-destructive-foreground transition-[transform,opacity] duration-150 ease-out active:scale-[0.97] disabled:opacity-60"
                >
                  {busy && <LoaderCircle className="size-5 animate-spin" aria-hidden />}
                  {t("Remove")}
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirming(true)}
              className={`mt-1 inline-flex h-11 items-center justify-center gap-2 rounded-lg text-sm font-semibold text-destructive transition-colors hover:bg-destructive/10 ${focusRing}`}
            >
              <Trash2 className="size-4" aria-hidden />
              {t("Remove from menu")}
            </button>
          ))}
      </form>
    </Sheet>
  );
}

type ReviewRow = {
  key: string;
  name: string;
  words: string;
  scanned: number;
  price: string;
  lowest: string;
};

/** What saving a reviewed row does to the stall's menu. */
type RowStatus = { kind: "new" } | { kind: "update" | "same"; current: ShopItem };

type Problem = { field: "name" | "price" | "lowest"; text: Msg };

function problemOf(row: ReviewRow, repeated: boolean): Problem | null {
  const ask = Number(row.price);
  const floor = Number(row.lowest);
  if (!row.name.trim()) return { field: "name", text: "Give this item a name." };
  if (repeated)
    return { field: "name", text: "This is already in the list above. Remove one of them." };
  if (!ask) return { field: "price", text: "Enter the price you ask." };
  if (!floor) return { field: "lowest", text: "Enter the lowest you’ll take." };
  if (floor > ask) return { field: "lowest", text: "The lowest can’t be above the ask." };
  return null;
}

const BUMPS = [5, 10, 15, 20, 25] as const;

function Choice({
  name,
  checked,
  onSelect,
  title,
  children,
}: {
  name: string;
  checked: boolean;
  onSelect: () => void;
  title: string;
  children: ReactNode;
}) {
  return (
    <label
      className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition-colors duration-150 has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-ring/50 ${
        checked ? "border-primary bg-primary/5" : "border-border hover:bg-muted/50"
      }`}
    >
      <input type="radio" name={name} checked={checked} onChange={onSelect} className="sr-only" />
      <span
        aria-hidden
        className={`mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors ${
          checked ? "border-primary" : "border-input"
        }`}
      >
        {checked && <span className="size-2.5 rounded-full bg-primary" />}
      </span>
      <span className="min-w-0">
        <span className="block font-medium">{title}</span>
        <span className="block text-sm text-pretty text-muted-foreground">{children}</span>
      </span>
    </label>
  );
}

const STATUS: Record<RowStatus["kind"], { icon: typeof Plus; label: Msg; badge: string }> = {
  new: { icon: Plus, label: "New", badge: "bg-success/10 text-success" },
  update: {
    icon: RefreshCw,
    label: "Updates your menu",
    badge: "bg-secondary/25 text-foreground",
  },
  same: { icon: Check, label: "Already on menu", badge: "bg-muted text-muted-foreground" },
};

function StatusBadge({ kind }: { kind: RowStatus["kind"] }) {
  const t = useT();
  const { icon: Icon, label, badge } = STATUS[kind];
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${badge}`}
    >
      <Icon className="size-3.5" aria-hidden />
      {t(label)}
    </span>
  );
}

function SummaryStat({ kind, count }: { kind: RowStatus["kind"]; count: number }) {
  const t = useT();
  const { icon: Icon, badge } = STATUS[kind];
  const label = ({ new: "New", update: "Will update", same: "No change" } as const)[kind];
  return (
    <div
      className={`grid gap-0.5 rounded-xl px-3 py-2 ${count ? badge : "bg-muted/50 text-muted-foreground"}`}
    >
      <span className="flex items-center gap-1.5 font-display text-xl font-bold tabular-nums">
        <Icon className="size-4" aria-hidden />
        {count}
      </span>
      <span className="text-xs font-medium">{t(label)}</span>
    </div>
  );
}

/** "Masala chai" twice in one photo is one dish: keep the first, report how many were folded in. */
function dedupeScan(items: ScannedMenuItem[]) {
  const seen = new Set<string>();
  const kept: ScannedMenuItem[] = [];
  for (const it of items) {
    const key = menuKey(it.name);
    if (seen.has(key)) continue;
    seen.add(key);
    kept.push(it);
  }
  return { kept, merged: items.length - kept.length };
}

function MenuReview({
  items,
  menu,
  onClose,
  onSaved,
}: {
  items: ScannedMenuItem[];
  /** The stall's current menu: scanned dishes already on it are updated, never added twice. */
  menu: ShopItem[];
  onClose: () => void;
  onSaved: (result: { added: number; updated: number }) => void;
}) {
  const t = useT();
  const tx = useTx();
  const [{ merged, initial }] = useState(() => {
    const { kept, merged } = dedupeScan(items);
    // A dish already on the menu keeps the shopkeeper's spelling; the photo only brings prices.
    const names = new Map(menu.map((m) => [menuKey(m.name), m.name]));
    return {
      merged,
      initial: kept.map((it, i) => ({
        key: `r${i}`,
        name: names.get(menuKey(it.name)) ?? it.name,
        words: it.words,
        scanned: it.scanned,
        price: String(it.scanned),
        lowest: String(it.scanned),
      })),
    };
  });
  const [bump, setBump] = useState(0);
  const [rows, setRows] = useState<ReviewRow[]>(initial);
  const [removed, setRemoved] = useState<{ row: ReviewRow; index: number } | null>(null);
  const [checked, setChecked] = useState(false);
  const [error, setError] = useState<Text>("");
  const [busy, setBusy] = useState(false);

  function applyBump(pct: number) {
    setBump(pct);
    setRows((prev) =>
      prev.map((row) => ({
        ...row,
        price: String(Math.round(row.scanned * (1 + pct / 100))),
        lowest: String(row.scanned),
      })),
    );
  }

  function patch(key: string, change: Partial<Pick<ReviewRow, "name" | "price" | "lowest">>) {
    setRows((prev) => prev.map((row) => (row.key === key ? { ...row, ...change } : row)));
  }

  function drop(index: number) {
    setRemoved({ row: rows[index], index });
    setRows(rows.filter((_, i) => i !== index));
  }

  function undo() {
    if (!removed) return;
    const next = [...rows];
    next.splice(Math.min(removed.index, next.length), 0, removed.row);
    setRows(next);
    setRemoved(null);
  }

  // Match every row against the live menu, and against the rows above it.
  const onMenu = new Map(menu.map((i) => [menuKey(i.name), i]));
  const seen = new Set<string>();
  const view = rows.map((row) => {
    const key = menuKey(row.name);
    const repeated = !!key && seen.has(key);
    if (key) seen.add(key);
    const current = onMenu.get(key);
    const status: RowStatus = !current
      ? { kind: "new" }
      : Number(row.price) === current.price &&
          Number(row.lowest) === current.lowest &&
          row.name.trim() === current.name
        ? { kind: "same", current }
        : { kind: "update", current };
    return { row, status, repeated, problem: problemOf(row, repeated) };
  });
  // A repeat of a row above is an error to fix, not a second save, so it isn't counted.
  const count = (kind: RowStatus["kind"]) =>
    view.filter((v) => !v.repeated && v.status.kind === kind).length;
  const added = count("new");
  const updated = count("update");
  const unchanged = count("same");
  const toSave = view.filter((v) => v.status.kind !== "same");
  const badCount = toSave.filter((v) => v.problem).length;
  const example = rows[0];

  const cta =
    toSave.length === 0
      ? t("Nothing to change")
      : added && updated
        ? t("Add {added} · Update {updated}", { added, updated })
        : added
          ? t("Add to menu ({n})", { n: added })
          : t("Update ({n})", { n: updated });

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    if (!toSave.length) return setError("Everything here is already on your menu as it is.");
    const first = toSave.find((v) => v.problem);
    if (first) {
      setChecked(true);
      setError({ msg: "Fix the items marked below ({n}).", vars: { n: badCount } });
      document.getElementById(`${first.problem!.field}-${first.row.key}`)?.focus();
      return;
    }
    setBusy(true);
    try {
      const res = await saveScannedItems(
        toSave.map(({ row }) => ({
          name: row.name,
          words: row.words,
          price: Number(row.price),
          lowest: Number(row.lowest),
        })),
      );
      if ("error" in res) {
        setBusy(false);
        setError(res.error);
        return;
      }
      onSaved(res);
    } catch {
      setBusy(false);
      setError("Something went wrong. Please try again.");
    }
  }

  const known = updated + unchanged;
  return (
    <Sheet
      title={t("Check your menu")}
      description={
        !known
          ? t(
              "Items found: {n}. Fix anything we misread, then choose how your agent prices them.",
              {
                n: rows.length,
              },
            )
          : known === rows.length
            ? t(
                "Items found: {n}. All of them are already on your menu, so we’ll update them instead of adding them twice.",
                { n: rows.length },
              )
            : t(
                "Items found: {n}. {k} are already on your menu, so we’ll update those instead of adding them twice.",
                { n: rows.length, k: known },
              )
      }
      onClose={onClose}
      dismissible={false}
      footer={
        <div className="grid gap-3">
          {error && <FormError>{tx(error)}</FormError>}
          <button
            type="submit"
            form="menu-review"
            disabled={busy || toSave.length === 0}
            className={`${primaryButton} w-full`}
          >
            {busy && <LoaderCircle className="size-5 animate-spin" aria-hidden />}
            {busy ? t("Saving…") : cta}
          </button>
        </div>
      }
    >
      <form id="menu-review" onSubmit={onSubmit} noValidate className="grid gap-5">
        {menu.length > 0 && (
          <section aria-label={t("What will change")} className="grid gap-2">
            <div className="grid grid-cols-3 gap-2" aria-live="polite">
              <SummaryStat kind="new" count={added} />
              <SummaryStat kind="update" count={updated} />
              <SummaryStat kind="same" count={unchanged} />
            </div>
            {merged > 0 && (
              <p className="text-xs text-muted-foreground">
                {t("Some items appeared twice in the photo, so we kept one of each.")}
              </p>
            )}
          </section>
        )}

        <fieldset className="grid gap-2">
          <legend className="mb-2 text-sm font-semibold">
            {t("How should your agent price these?")}
          </legend>
          <Choice
            name="strategy"
            checked={bump === 0}
            onSelect={() => applyBump(0)}
            title={t("Sell at menu price")}
          >
            {t("No bargaining. Buyers pay what’s on your menu.")}
          </Choice>
          <Choice
            name="strategy"
            checked={bump > 0}
            onSelect={() => applyBump(bump || 10)}
            title={t("Leave room to bargain")}
          >
            {t("Ask a little more than your menu. Your agent never goes below the menu price.")}
          </Choice>
        </fieldset>

        {bump > 0 && (
          <fieldset className="-mt-2 grid gap-2 rounded-xl bg-muted/60 p-3">
            <legend className="sr-only">{t("Ask above menu price")}</legend>
            <p className="text-sm font-medium" aria-hidden>
              {t("Ask above menu price")}
            </p>
            <div className="flex flex-wrap gap-2">
              {BUMPS.map((p) => (
                <label
                  key={p}
                  className={`inline-flex h-11 min-w-16 cursor-pointer items-center justify-center rounded-full border px-4 text-sm font-semibold tabular-nums transition-colors duration-150 has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-ring/50 ${
                    bump === p
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-input bg-card hover:bg-muted"
                  }`}
                >
                  <input
                    type="radio"
                    name="bump"
                    checked={bump === p}
                    onChange={() => applyBump(p)}
                    className="sr-only"
                  />
                  +{p}%
                </label>
              ))}
            </div>
            {example && (
              <p className="text-sm text-pretty text-muted-foreground">
                {t(
                  "{item} is {price} in your photo. Buyers are asked {ask}, and your agent can come down to {price}.",
                  {
                    item: example.name,
                    price: inr(example.scanned),
                    ask: inr(Math.round(example.scanned * (1 + bump / 100))),
                  },
                )}
              </p>
            )}
          </fieldset>
        )}

        <div className="grid gap-2">
          <div className="flex items-baseline justify-between gap-3">
            <h3 className="text-sm font-semibold">
              {t("Items")}{" "}
              <span className="font-normal text-muted-foreground">({rows.length})</span>
            </h3>
            <p className="text-xs text-muted-foreground">{t("Tap any field to change it")}</p>
          </div>

          {removed && (
            <div
              role="status"
              className="flex items-center gap-2 rounded-xl bg-foreground py-1 pr-1 pl-3 text-sm text-background"
            >
              <span className="min-w-0 flex-1 truncate">
                {removed.row.name
                  ? t("Removed {name}", { name: removed.row.name })
                  : t("Removed an item")}
              </span>
              <button
                type="button"
                onClick={undo}
                className={`inline-flex h-11 shrink-0 items-center gap-1.5 rounded-lg px-3 font-semibold hover:bg-background/15 ${focusRing}`}
              >
                <Undo2 className="size-4" aria-hidden />
                {t("Undo")}
              </button>
            </div>
          )}

          {rows.length === 0 ? (
            <p className="rounded-xl border border-dashed border-border p-4 text-center text-sm text-muted-foreground">
              {t("No items left. Undo, or close and scan again.")}
            </p>
          ) : (
            <ul className="grid gap-2">
              {view.map(({ row, status, repeated, problem }, i) => {
                const show =
                  problem !== null &&
                  status.kind !== "same" &&
                  (checked || repeated || problem.field === "lowest");
                const errId = `err-${row.key}`;
                const describe = [`status-${row.key}`, show ? errId : ""].filter(Boolean).join(" ");
                const ask = Number(row.price);
                const floor = Number(row.lowest);
                const changes =
                  status.kind === "update"
                    ? [
                        row.name.trim() !== status.current.name &&
                          t("Name “{from}” → “{to}”", {
                            from: status.current.name,
                            to: row.name.trim(),
                          }),
                        ask !== status.current.price &&
                          t("Ask {from} → {to}", {
                            from: inr(status.current.price),
                            to: ask ? inr(ask) : "—",
                          }),
                        floor !== status.current.lowest &&
                          t("Lowest {from} → {to}", {
                            from: inr(status.current.lowest),
                            to: floor ? inr(floor) : "—",
                          }),
                      ].filter((c): c is string => Boolean(c))
                    : [];
                return (
                  <li
                    key={row.key}
                    className={`rounded-xl border bg-background p-3 transition-colors ${
                      show
                        ? "border-destructive/60"
                        : status.kind === "update"
                          ? "border-secondary/70"
                          : "border-border"
                    }`}
                  >
                    <div className="flex items-start gap-1">
                      <div className="min-w-0 flex-1">
                        <div
                          id={`status-${row.key}`}
                          className="flex flex-wrap items-center gap-x-2 gap-y-1"
                        >
                          <StatusBadge kind={status.kind} />
                          <span className="text-xs text-muted-foreground tabular-nums">
                            {t("In photo {price}", { price: inr(row.scanned) })}
                          </span>
                        </div>
                        <label htmlFor={`name-${row.key}`} className="sr-only">
                          {t("Item name")}
                        </label>
                        <input
                          id={`name-${row.key}`}
                          value={row.name}
                          onChange={(e) => patch(row.key, { name: e.target.value })}
                          maxLength={80}
                          autoComplete="off"
                          aria-invalid={(show && problem.field === "name") || undefined}
                          aria-describedby={describe}
                          className="mt-1 -ml-2 h-11 w-[calc(100%+0.5rem)] rounded-lg border border-transparent bg-transparent px-2 font-medium transition-[border-color,box-shadow] duration-150 outline-none hover:border-border focus-visible:border-primary focus-visible:bg-card focus-visible:ring-3 focus-visible:ring-primary/20"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => drop(i)}
                        aria-label={
                          row.name ? t("Remove {name}", { name: row.name }) : t("Remove this item")
                        }
                        className={`-mr-1 flex size-11 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive ${focusRing}`}
                      >
                        <X className="size-5" aria-hidden />
                      </button>
                    </div>

                    {changes.length > 0 && (
                      <ul
                        aria-label={t("Changes to {name}", {
                          name: status.kind !== "new" ? status.current.name : row.name,
                        })}
                        className="mt-1 flex flex-wrap gap-1.5"
                      >
                        {changes.map((c) => (
                          <li
                            key={c}
                            className="rounded-md bg-secondary/15 px-2 py-1 text-xs font-medium tabular-nums"
                          >
                            {c}
                          </li>
                        ))}
                      </ul>
                    )}
                    {status.kind === "same" && (
                      <p className="mt-1 text-xs text-muted-foreground">
                        {t(
                          "Same name and prices as your menu, so nothing changes. Edit a price to update it.",
                        )}
                      </p>
                    )}

                    <div className="mt-3 grid grid-cols-2 gap-3">
                      <Field label={t("Ask")} htmlFor={`price-${row.key}`}>
                        <MoneyInput
                          id={`price-${row.key}`}
                          value={row.price}
                          onChange={(v) => patch(row.key, { price: v })}
                          invalid={show && problem.field === "price"}
                          describedBy={describe}
                        />
                      </Field>
                      <Field label={t("Lowest")} htmlFor={`lowest-${row.key}`}>
                        <MoneyInput
                          id={`lowest-${row.key}`}
                          value={row.lowest}
                          onChange={(v) => patch(row.key, { lowest: v })}
                          invalid={show && problem.field === "lowest"}
                          describedBy={describe}
                        />
                      </Field>
                    </div>
                    {show && (
                      <p
                        id={errId}
                        className="mt-2 flex items-center gap-1.5 text-sm text-destructive"
                      >
                        <CircleAlert className="size-4 shrink-0" aria-hidden />
                        {t(problem.text)}
                      </p>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </form>
    </Sheet>
  );
}
