"use client";

import { useOptimistic, useState, useTransition, type FormEvent } from "react";
import Link from "next/link";
import { Camera, Check, MapPin, Pencil, Sparkles, Store } from "lucide-react";
import { AgentCardAddress, stallAgentCardPath } from "@/components/app/agent-address";
import { HeroCard, LiveToggle } from "@/components/app/hero";
import { MenuSection } from "@/components/app/menu-editor";
import { QrScanner } from "@/components/app/qr-scanner";
import { Field, Sheet, fieldInput } from "@/components/ui/sheet";
import { outlineButton, primaryButton } from "@/components/ui/styles";
import { LANG, LANGS, type Lang } from "@/lib/languages";
import type { ShopItem, ShopStall, Style } from "@/lib/server/shop";
import { pinLocation, saveStallDetails, setStallOpen } from "@/lib/shop-actions";
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
  email,
}: {
  stall: ShopStall | null;
  items: ShopItem[];
  canReadMenu: boolean;
  email: string;
}) {
  const [editingStall, setEditingStall] = useState(false);
  const steps = setupSteps(stall, items);
  const done = steps.filter((s) => s.done).length;
  const ready = done === steps.length;
  const pinned = stall?.lat != null && stall?.lng != null;
  const [open, setOpen] = useOptimistic(!!stall?.open && ready);
  const [, startOpening] = useTransition();
  const [pinBusy, setPinBusy] = useState(false);
  const [pinError, setPinError] = useState("");

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

  function focusMenu() {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    document.getElementById("menu")?.scrollIntoView({ behavior: reduce ? "auto" : "smooth" });
    document.getElementById("menu-title")?.focus({ preventScroll: true });
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col gap-4 px-4 pt-[max(1.5rem,env(safe-area-inset-top))] pb-[max(1.5rem,env(safe-area-inset-bottom))]">
      <header className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-muted-foreground">For shopkeepers</p>
          <h1 className="font-display text-3xl font-bold tracking-tight">Your stall</h1>
        </div>
        <Link
          href="/profile"
          title={email}
          className="max-w-[11rem] truncate text-sm font-medium text-muted-foreground hover:text-foreground"
        >
          {email}
        </Link>
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
                    else if (step.id === "menu") focusMenu();
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

      <MenuSection items={items} canReadMenu={canReadMenu} />

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

      {stall && ready && <AgentCard style={stall.style} open={open} agentId={stall.agentId} />}

      {editingStall && <StallDetailsForm stall={stall} onClose={() => setEditingStall(false)} />}
    </main>
  );
}

function AgentCard({
  style,
  open,
  agentId,
}: {
  style: ShopStall["style"];
  open: boolean;
  agentId: string | null;
}) {
  return (
    <section
      aria-label="Your AI agent"
      className="flex items-start gap-3 rounded-2xl border border-border bg-card p-4 text-card-foreground"
    >
      <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
        <Sparkles className="size-5" aria-hidden />
      </span>
      <div className="grid min-w-0 flex-1 gap-0.5">
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-semibold">Your AI agent</p>
          <span
            className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
              open ? "bg-success/15 text-success" : "bg-muted text-muted-foreground"
            }`}
          >
            {open ? "Live" : "Off"}
          </span>
        </div>
        <p className="text-sm text-pretty text-muted-foreground">
          {open
            ? style === "firm"
              ? "Bargaining with buyers now, firmly, in their language."
              : "Bargaining with buyers now, in a friendly way, in their language."
            : "Open your stall and it starts bargaining with buyers."}{" "}
          It never goes below your lowest price.
        </p>
        {open && agentId && <AgentCardAddress path={stallAgentCardPath(agentId)} />}
      </div>
    </section>
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
