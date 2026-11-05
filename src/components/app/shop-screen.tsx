"use client";

import { useOptimistic, useRef, useState, useTransition, type FormEvent } from "react";
import { Camera, Check, MapPin, Pencil, Plus, Store, Trash2, UtensilsCrossed } from "lucide-react";
import { HeroCard, LiveToggle } from "@/components/app/hero";
import { QrScanner } from "@/components/app/qr-scanner";
import { outlineButton, primaryButton } from "@/components/ui/styles";
import { LANG, LANGS, type Lang } from "@/lib/languages";
import { shrinkPhoto } from "@/lib/photo";
import { signOut } from "@/lib/role";
import type { ShopItem, ShopStall, Style } from "@/lib/server/shop";
import {
  pinLocation,
  removeItem,
  saveItem,
  saveScannedItems,
  saveStallDetails,
  scanMenu,
  setStallOpen,
  type ScannedMenuItem,
} from "@/lib/shop-actions";
import { isVpa, parseUpi } from "@/lib/upi";

function setupSteps(stall: ShopStall | null, items: ShopItem[]) {
  return [
    { id: "name", label: "Name your stall", done: !!stall?.name.trim() },
    { id: "upi", label: "Add your UPI ID for payouts", done: !!stall && isVpa(stall.upi) },
    { id: "menu", label: "Add something you sell", done: items.length > 0 },
    {
      id: "pin",
      label: "Share your stall location",
      done: stall?.lat != null && stall?.lng != null,
    },
  ] as const;
}

export function ShopScreen({
  stall,
  items,
  canReadMenu,
}: {
  stall: ShopStall | null;
  items: ShopItem[];
  canReadMenu: boolean;
}) {
  const [editingStall, setEditingStall] = useState(false);
  const [editingItem, setEditingItem] = useState<ShopItem | null | "new">(null);
  const [review, setReview] = useState<ScannedMenuItem[] | null>(null);
  const steps = setupSteps(stall, items);
  const done = steps.filter((s) => s.done).length;
  const ready = done === steps.length;
  const pinned = stall?.lat != null && stall?.lng != null;
  const [open, setOpen] = useOptimistic(!!stall?.open && ready);
  const [, startOpening] = useTransition();
  const [pinBusy, setPinBusy] = useState(false);
  const [pinError, setPinError] = useState("");
  const [scanBusy, setScanBusy] = useState(false);
  const [scanMsg, setScanMsg] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  function shareLocation() {
    setPinError("");
    if (!navigator.geolocation) {
      setPinError("This device can’t share location.");
      return;
    }
    setPinBusy(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        void pinLocation(pos.coords.latitude, pos.coords.longitude).then((res) => {
          setPinBusy(false);
          if (res?.error) setPinError(res.error);
        });
      },
      () => {
        setPinBusy(false);
        setPinError("Couldn’t share location. Allow location access and try again.");
      },
      { enableHighAccuracy: true, timeout: 15_000 },
    );
  }

  async function onMenuPhoto(file: File | undefined) {
    if (!file) return;
    setScanBusy(true);
    setScanMsg("");
    try {
      const small = await shrinkPhoto(file);
      const form = new FormData();
      form.set("photo", small);
      const res = await scanMenu(form);
      if ("error" in res) {
        setScanMsg(res.error);
        return;
      }
      setReview(res.items);
    } catch {
      setScanMsg("Couldn't read that photo. Try a clearer one, or add items by hand.");
    } finally {
      setScanBusy(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col gap-4 px-4 pt-[max(1.5rem,env(safe-area-inset-top))] pb-[max(1.5rem,env(safe-area-inset-bottom))]">
      <header className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-muted-foreground">For shopkeepers</p>
          <h1 className="font-display text-3xl font-bold tracking-tight">Your stall</h1>
        </div>
        <button
          type="button"
          onClick={() => void signOut()}
          className="text-sm font-medium text-muted-foreground hover:text-foreground"
        >
          Sign out
        </button>
      </header>

      <HeroCard label="Stall">
        <div className="flex items-center gap-3">
          <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-secondary text-secondary-foreground shadow-sm">
            <Store className="size-6" aria-hidden />
          </span>
          <div className="grid min-w-0 flex-1">
            <p className="line-clamp-2 font-display text-xl leading-tight font-bold tracking-tight">
              {stall?.name || "Unnamed stall"}
            </p>
            <p className="truncate text-sm text-hero-foreground/75">
              {stall?.upi ? `Payouts to ${stall.upi}` : "No UPI ID yet"}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setEditingStall(true)}
            aria-label="Edit stall name and UPI ID"
            className="-mr-1.5 flex size-11 shrink-0 items-center justify-center rounded-full text-hero-foreground/80 transition-[background-color,transform] duration-150 ease-out hover:bg-hero-foreground/10 active:scale-[0.97]"
          >
            <Pencil className="size-5" aria-hidden />
          </button>
        </div>

        <LiveToggle
          on={open}
          disabled={!ready}
          onChange={(next) =>
            startOpening(async () => {
              setOpen(next);
              await setStallOpen(next).catch(() => {});
            })
          }
          title="Open for buyers"
          hint={
            !ready
              ? "Finish setting up to open."
              : open
                ? "Your stall is open."
                : "Buyers can’t find you right now."
          }
        />
      </HeroCard>

      {!ready && (
        <section className="rounded-2xl border border-border bg-card">
          <div className="flex items-center gap-4 border-b border-border px-4 py-3">
            <Progress done={done} total={steps.length} />
            <p className="text-sm text-muted-foreground">
              {done} of {steps.length} done. Your stall can open when all four are.
            </p>
          </div>
          <ul>
            {steps.map((step) => (
              <li
                key={step.id}
                className="flex items-center gap-3 border-b border-border px-4 py-3 last:border-0"
              >
                {step.done ? (
                  <Check className="size-5 shrink-0 text-success" aria-hidden />
                ) : (
                  <span
                    className="size-4 shrink-0 rounded-full border-2 border-input"
                    aria-hidden
                  />
                )}
                <button
                  type="button"
                  disabled={step.done}
                  onClick={() => {
                    if (step.id === "pin") shareLocation();
                    else if (step.id === "menu") setEditingItem("new");
                    else setEditingStall(true);
                  }}
                  className={`flex-1 text-left text-sm font-medium disabled:cursor-default ${
                    step.done ? "text-muted-foreground line-through" : "text-foreground"
                  }`}
                >
                  {step.label}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="grid gap-3 rounded-2xl border border-border bg-card p-4">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <UtensilsCrossed className="size-5 text-primary" aria-hidden />
            <h2 className="font-display text-base font-semibold">Menu</h2>
          </div>
          <button
            type="button"
            onClick={() => setEditingItem("new")}
            className="inline-flex items-center gap-1 text-sm font-semibold text-primary"
          >
            <Plus className="size-4" aria-hidden /> Add
          </button>
        </div>
        <p className="text-sm text-muted-foreground">
          Starting price is what you ask. Lowest is the absolute floor — your agent never goes below
          it.
        </p>

        {canReadMenu && (
          <label
            className={`${outlineButton} w-full cursor-pointer ${scanBusy ? "pointer-events-none opacity-60" : ""}`}
          >
            <Camera className="size-5" aria-hidden />
            {scanBusy ? "Reading menu…" : "Scan or upload menu photo"}
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="sr-only"
              disabled={scanBusy}
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                void onMenuPhoto(file);
              }}
            />
          </label>
        )}
        {scanMsg && (
          <p
            role="status"
            className={`text-sm ${scanMsg.startsWith("Added") ? "text-success" : "text-destructive"}`}
          >
            {scanMsg}
          </p>
        )}

        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">No items yet. Add one or scan a menu.</p>
        ) : (
          <ul className="divide-y divide-border">
            {items.map((item) => (
              <li key={item.id} className="flex items-center gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{item.name}</p>
                  <p className="text-sm text-muted-foreground tabular-nums">
                    Ask ₹{item.price.toLocaleString("en-IN")} · floor ₹
                    {item.lowest.toLocaleString("en-IN")}
                  </p>
                </div>
                <button
                  type="button"
                  aria-label={`Edit ${item.name}`}
                  onClick={() => setEditingItem(item)}
                  className="flex size-10 items-center justify-center rounded-lg text-muted-foreground hover:text-foreground"
                >
                  <Pencil className="size-4" aria-hidden />
                </button>
                <button
                  type="button"
                  aria-label={`Remove ${item.name}`}
                  onClick={() => void removeItem(item.id)}
                  className="flex size-10 items-center justify-center rounded-lg text-muted-foreground hover:text-destructive"
                >
                  <Trash2 className="size-4" aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="grid gap-3 rounded-2xl border border-border bg-card p-4">
        <div className="flex items-center gap-2">
          <MapPin className="size-5 text-primary" aria-hidden />
          <h2 className="font-display text-base font-semibold">Location</h2>
        </div>
        <p className="text-sm text-muted-foreground">
          {pinned
            ? `Pinned at ${stall!.lat!.toFixed(5)}, ${stall!.lng!.toFixed(5)}`
            : "Buyers’ agents only find stalls that are pinned."}
        </p>
        <button type="button" disabled={pinBusy} onClick={shareLocation} className={outlineButton}>
          {pinBusy ? "Getting location…" : pinned ? "Update location" : "Share live location"}
        </button>
        {pinError && (
          <p role="alert" className="text-sm text-destructive">
            {pinError}
          </p>
        )}
      </section>

      {editingStall && <StallDetailsForm stall={stall} onClose={() => setEditingStall(false)} />}
      {editingItem !== null && (
        <ItemForm
          item={editingItem === "new" ? null : editingItem}
          onClose={() => setEditingItem(null)}
        />
      )}
      {review && (
        <MenuReview
          items={review}
          onClose={() => setReview(null)}
          onSaved={(n) => {
            setReview(null);
            setScanMsg(`Added ${n} item${n === 1 ? "" : "s"} from your menu.`);
          }}
        />
      )}
    </main>
  );
}

function Progress({ done, total }: { done: number; total: number }) {
  const pct = Math.round((done / total) * 100);
  return (
    <div
      role="progressbar"
      aria-valuenow={done}
      aria-valuemin={0}
      aria-valuemax={total}
      className="relative size-10 shrink-0 rounded-full bg-muted"
      style={{ background: `conic-gradient(var(--primary) ${pct}%, var(--muted) 0)` }}
    >
      <span className="absolute inset-1 grid place-items-center rounded-full bg-card text-xs font-semibold">
        {done}/{total}
      </span>
    </div>
  );
}

const qrVpa = (qr: string | null) => {
  const payee = qr ? parseUpi(qr) : null;
  return payee && "vpa" in payee ? payee.vpa : "";
};

function StallDetailsForm({ stall, onClose }: { stall: ShopStall | null; onClose: () => void }) {
  const [name, setName] = useState(stall?.name ?? "");
  const [upi, setUpi] = useState(stall?.upi ?? "");
  const [qr, setQr] = useState<string | null>(stall?.qr ?? null);
  const [style, setStyle] = useState<Style>(stall?.style ?? "friendly");
  const [language, setLanguage] = useState<Lang>(stall?.lang ?? "en");
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  function onScanned(text: string) {
    setScanning(false);
    const payee = parseUpi(text);
    if ("error" in payee) {
      setError(payee.error);
      return;
    }
    setError("");
    setUpi(payee.vpa);
    setQr(payee.qr ?? text);
    if (!name.trim() && payee.name) setName(payee.name);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    if (upi.trim() && !isVpa(upi)) {
      setError("A UPI ID looks like name@bank, e.g. ramu@okaxis.");
      return;
    }
    const keepQr = qr && qrVpa(qr) === upi.trim().toLowerCase() ? qr : null;
    setBusy(true);
    try {
      const res = await saveStallDetails({ name, upi, qr: keepQr, style, language });
      setBusy(false);
      if (res?.error) {
        setError(res.error);
        return;
      }
      onClose();
    } catch {
      setBusy(false);
      setError("Something went wrong. Please try again.");
    }
  }

  return (
    <Sheet title="Stall details" onClose={onClose}>
      <form onSubmit={onSubmit} noValidate className="grid gap-4">
        {scanning ? (
          <QrScanner onResult={onScanned} onCancel={() => setScanning(false)} />
        ) : (
          <>
            <Field label="Stall name" htmlFor="stall-name">
              <input
                id="stall-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={60}
                placeholder="Ramu’s chai"
                className={fieldInput}
              />
            </Field>
            <Field label="UPI ID" htmlFor="stall-upi">
              <div className="relative">
                <input
                  id="stall-upi"
                  value={upi}
                  onChange={(e) => {
                    setUpi(e.target.value);
                    setError("");
                  }}
                  inputMode="email"
                  autoCapitalize="none"
                  spellCheck={false}
                  placeholder="ramu@okaxis"
                  className={`${fieldInput} pr-12`}
                />
                <button
                  type="button"
                  onClick={() => {
                    setError("");
                    setScanning(true);
                  }}
                  aria-label="Scan UPI QR"
                  className="absolute top-1/2 right-1 flex size-10 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground hover:text-foreground"
                >
                  <Camera className="size-5" aria-hidden />
                </button>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                {qr && upi.trim().toLowerCase() === qrVpa(qr)
                  ? "From your QR. Payments go here."
                  : "Type your UPI ID, or tap the camera to scan your QR."}
              </p>
            </Field>
          </>
        )}

        <fieldset>
          <legend className="mb-2 text-sm font-medium">How your agent bargains</legend>
          <div className="grid grid-cols-2 gap-2">
            {(["friendly", "firm"] as const).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setStyle(s)}
                className={`h-11 rounded-lg border text-sm font-medium capitalize ${
                  style === s
                    ? "border-primary bg-primary/5 text-primary"
                    : "border-input bg-background"
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        </fieldset>

        <Field label="Your language" htmlFor="stall-lang">
          <select
            id="stall-lang"
            value={language}
            onChange={(e) => setLanguage(e.target.value as Lang)}
            className={fieldInput}
          >
            {LANGS.map((code) => (
              <option key={code} value={code}>
                {LANG[code].own} ({LANG[code].english})
              </option>
            ))}
          </select>
        </Field>

        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <button type="submit" disabled={busy || scanning} className={`${primaryButton} w-full`}>
          {busy ? "Saving…" : "Save"}
        </button>
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

function MenuReview({
  items,
  onClose,
  onSaved,
}: {
  items: ScannedMenuItem[];
  onClose: () => void;
  onSaved: (added: number) => void;
}) {
  const [mode, setMode] = useState<"fixed" | "bump">("fixed");
  const [pct, setPct] = useState(10);
  const [rows, setRows] = useState<ReviewRow[]>(() =>
    items.map((it, i) => ({
      key: `${it.name}-${i}`,
      name: it.name,
      words: it.words,
      scanned: it.scanned,
      price: String(it.scanned),
      lowest: String(it.scanned),
    })),
  );
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  function applyFixed() {
    setMode("fixed");
    setRows((prev) =>
      prev.map((row) => ({
        ...row,
        price: String(row.scanned),
        lowest: String(row.scanned),
      })),
    );
  }

  function applyBump(nextPct: number) {
    const n = Math.min(50, Math.max(0, Math.round(nextPct)));
    setPct(n);
    setMode("bump");
    setRows((prev) =>
      prev.map((row) => {
        const floor = row.scanned;
        const ask = Math.max(floor, Math.round(row.scanned * (1 + n / 100)));
        return { ...row, price: String(ask), lowest: String(floor) };
      }),
    );
  }

  function patch(key: string, patch: Partial<Pick<ReviewRow, "name" | "price" | "lowest">>) {
    setRows((prev) => prev.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  }

  function drop(key: string) {
    setRows((prev) => prev.filter((row) => row.key !== key));
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    if (!rows.length) {
      setError("Keep at least one item, or close and try again.");
      return;
    }
    setBusy(true);
    try {
      const res = await saveScannedItems(
        rows.map((row) => ({
          name: row.name,
          words: row.words,
          price: Math.round(Number(row.price)),
          lowest: Math.round(Number(row.lowest)),
        })),
      );
      setBusy(false);
      if ("error" in res) {
        setError(res.error);
        return;
      }
      onSaved(res.added);
    } catch {
      setBusy(false);
      setError("Something went wrong. Please try again.");
    }
  }

  return (
    <Sheet title="Review scanned menu" onClose={onClose}>
      <form onSubmit={onSubmit} className="grid gap-4">
        <p className="text-sm text-muted-foreground">
          Fixed keeps ask and floor at the scanned price. Increase raises the ask above that floor.
          You can still edit any number by hand.
        </p>

        <fieldset>
          <legend className="mb-2 text-sm font-medium">Price type</legend>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={applyFixed}
              className={`h-11 rounded-lg border text-sm font-medium ${
                mode === "fixed"
                  ? "border-primary bg-primary/5 text-primary"
                  : "border-input bg-background"
              }`}
            >
              Fixed (as scanned)
            </button>
            <button
              type="button"
              onClick={() => applyBump(pct || 10)}
              className={`h-11 rounded-lg border text-sm font-medium ${
                mode === "bump"
                  ? "border-primary bg-primary/5 text-primary"
                  : "border-input bg-background"
              }`}
            >
              Increase ask
            </button>
          </div>
        </fieldset>

        {mode === "bump" && (
          <div>
            <div className="mb-2 flex items-center justify-between gap-3">
              <label htmlFor="ask-bump" className="text-sm font-medium">
                Raise ask above floor
              </label>
              <span className="text-sm font-semibold text-primary tabular-nums">+{pct}%</span>
            </div>
            <input
              id="ask-bump"
              type="range"
              min={0}
              max={50}
              step={1}
              value={pct}
              onChange={(e) => applyBump(Number(e.target.value))}
              className="h-2 w-full cursor-pointer appearance-none rounded-full bg-muted accent-primary"
            />
            <p className="mt-2 text-sm text-muted-foreground">
              Floor stays at the scanned price. Ask becomes scanned + {pct}%.
            </p>
          </div>
        )}

        <ul className="divide-y divide-border rounded-xl border border-border">
          {rows.map((row) => (
            <li key={row.key} className="grid gap-3 p-3">
              <div className="flex items-start gap-2">
                <input
                  aria-label="Item name"
                  value={row.name}
                  onChange={(e) => patch(row.key, { name: e.target.value })}
                  maxLength={80}
                  className={`${fieldInput} flex-1`}
                />
                <button
                  type="button"
                  aria-label={`Remove ${row.name}`}
                  onClick={() => drop(row.key)}
                  className="flex size-12 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:text-destructive"
                >
                  <Trash2 className="size-4" aria-hidden />
                </button>
              </div>
              <p className="text-xs text-muted-foreground tabular-nums">
                Scanned ₹{row.scanned.toLocaleString("en-IN")}
              </p>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Ask (₹)" htmlFor={`ask-${row.key}`}>
                  <input
                    id={`ask-${row.key}`}
                    inputMode="numeric"
                    value={row.price}
                    onChange={(e) => patch(row.key, { price: e.target.value.replace(/\D/g, "") })}
                    className={fieldInput}
                  />
                </Field>
                <Field label="Floor (₹)" htmlFor={`floor-${row.key}`}>
                  <input
                    id={`floor-${row.key}`}
                    inputMode="numeric"
                    value={row.lowest}
                    onChange={(e) => patch(row.key, { lowest: e.target.value.replace(/\D/g, "") })}
                    className={fieldInput}
                  />
                </Field>
              </div>
            </li>
          ))}
        </ul>

        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <button
          type="submit"
          disabled={busy || rows.length === 0}
          className={`${primaryButton} w-full`}
        >
          {busy ? "Saving…" : `Add ${rows.length} item${rows.length === 1 ? "" : "s"}`}
        </button>
      </form>
    </Sheet>
  );
}

function ItemForm({ item, onClose }: { item: ShopItem | null; onClose: () => void }) {
  const [name, setName] = useState(item?.name ?? "");
  const [price, setPrice] = useState(item ? String(item.price) : "");
  const [lowest, setLowest] = useState(item ? String(item.lowest) : "");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const ask = Math.round(Number(price));
      const floor = lowest.trim() ? Math.round(Number(lowest)) : Math.max(1, Math.round(ask * 0.8));
      const res = await saveItem({
        id: item?.id ?? null,
        name,
        price: ask,
        lowest: floor,
      });
      setBusy(false);
      if (res?.error) {
        setError(res.error);
        return;
      }
      onClose();
    } catch {
      setBusy(false);
      setError("Something went wrong. Please try again.");
    }
  }

  return (
    <Sheet title={item ? "Edit item" : "Add item"} onClose={onClose}>
      <form onSubmit={onSubmit} className="grid gap-4">
        <Field label="Item name" htmlFor="item-name">
          <input
            id="item-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={80}
            placeholder="Masala chai"
            className={fieldInput}
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Starting price (₹)" htmlFor="item-price">
            <input
              id="item-price"
              inputMode="numeric"
              value={price}
              onChange={(e) => setPrice(e.target.value.replace(/\D/g, ""))}
              placeholder="40"
              className={fieldInput}
            />
          </Field>
          <Field label="Lowest you’ll take (₹)" htmlFor="item-lowest">
            <input
              id="item-lowest"
              inputMode="numeric"
              value={lowest}
              onChange={(e) => setLowest(e.target.value.replace(/\D/g, ""))}
              placeholder="32"
              className={fieldInput}
            />
          </Field>
        </div>
        <p className="text-sm text-muted-foreground">
          Leave lowest empty to default to 80% of the starting price. Your agent never goes below
          it.
        </p>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <button type="submit" disabled={busy} className={`${primaryButton} w-full`}>
          {busy ? "Saving…" : "Save item"}
        </button>
      </form>
    </Sheet>
  );
}

function Sheet({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/45 sm:items-center">
      <div className="m-0 max-h-[92dvh] w-full max-w-md animate-[rise_240ms_var(--ease-out)] overflow-y-auto rounded-t-3xl bg-card p-5 text-card-foreground sm:rounded-3xl">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="font-display text-xl font-bold">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-sm font-medium text-muted-foreground"
          >
            Close
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label htmlFor={htmlFor} className="text-sm font-medium">
        {label}
      </label>
      <div className="mt-2">{children}</div>
    </div>
  );
}

const fieldInput =
  "h-12 w-full rounded-lg border border-input bg-background px-3 text-base outline-none focus-visible:border-primary focus-visible:ring-3 focus-visible:ring-primary/20";
