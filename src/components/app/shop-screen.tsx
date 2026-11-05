"use client";

import { useOptimistic, useState, useTransition, type FormEvent } from "react";
import { Camera, Check, MapPin, Pencil, Store } from "lucide-react";
import { HeroCard, LiveToggle } from "@/components/app/hero";
import { QrScanner } from "@/components/app/qr-scanner";
import { outlineButton, primaryButton } from "@/components/ui/styles";
import { LANG, LANGS, type Lang } from "@/lib/languages";
import { signOut } from "@/lib/role";
import type { ShopStall, Style } from "@/lib/server/shop";
import { pinLocation, saveStallDetails, setStallOpen } from "@/lib/shop-actions";
import { isVpa, parseUpi } from "@/lib/upi";

function setupSteps(stall: ShopStall | null) {
  return [
    { id: "name", label: "Name your stall", done: !!stall?.name.trim() },
    { id: "upi", label: "Add your UPI ID for payouts", done: !!stall && isVpa(stall.upi) },
    {
      id: "pin",
      label: "Share your stall location",
      done: stall?.lat != null && stall?.lng != null,
    },
  ] as const;
}

export function ShopScreen({ stall }: { stall: ShopStall | null }) {
  const [editing, setEditing] = useState(false);
  const steps = setupSteps(stall);
  const done = steps.filter((s) => s.done).length;
  const ready = done === steps.length;
  const pinned = stall?.lat != null && stall?.lng != null;
  const canGoLive = ready;
  const [open, setOpen] = useOptimistic(!!stall?.open && canGoLive);
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
            onClick={() => setEditing(true)}
            aria-label="Edit stall name and UPI ID"
            className="-mr-1.5 flex size-11 shrink-0 items-center justify-center rounded-full text-hero-foreground/80 transition-[background-color,transform] duration-150 ease-out hover:bg-hero-foreground/10 active:scale-[0.97]"
          >
            <Pencil className="size-5" aria-hidden />
          </button>
        </div>

        <LiveToggle
          on={open}
          disabled={!canGoLive}
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
              {done} of {steps.length} done. Your stall can open when all three are.
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
                    else setEditing(true);
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

      {editing && <StallDetailsForm stall={stall} onClose={() => setEditing(false)} />}
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
      style={{
        background: `conic-gradient(var(--primary) ${pct}%, var(--muted) 0)`,
      }}
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
      document.getElementById("stall-upi")?.focus();
      return;
    }
    // Keep the QR only while it still matches the typed UPI ID.
    const keepQr = qr && qrVpa(qr) === upi.trim().toLowerCase() ? qr : null;
    setBusy(true);
    try {
      const res = await saveStallDetails({
        name,
        upi,
        qr: keepQr,
        style,
        language,
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
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/45 sm:items-center">
      <form
        onSubmit={onSubmit}
        noValidate
        className="m-0 max-h-[92dvh] w-full max-w-md animate-[rise_240ms_var(--ease-out)] overflow-y-auto rounded-t-3xl bg-card p-5 text-card-foreground sm:rounded-3xl"
      >
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="font-display text-xl font-bold">Stall details</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-sm font-medium text-muted-foreground"
          >
            Close
          </button>
        </div>

        {scanning ? (
          <div className="mb-4">
            <QrScanner onResult={onScanned} onCancel={() => setScanning(false)} />
          </div>
        ) : (
          <>
            <label htmlFor="stall-name" className="text-sm font-medium">
              Stall name
            </label>
            <input
              id="stall-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={60}
              placeholder="Ramu’s chai"
              className="mt-2 mb-4 h-12 w-full rounded-lg border border-input bg-background px-3 text-base outline-none focus-visible:border-primary focus-visible:ring-3 focus-visible:ring-primary/20"
            />

            <label htmlFor="stall-upi" className="text-sm font-medium">
              UPI ID
            </label>
            <div className="relative mt-2 mb-1">
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
                aria-invalid={error ? true : undefined}
                className="h-12 w-full rounded-lg border border-input bg-background py-1 pr-12 pl-3 text-base outline-none focus-visible:border-primary focus-visible:ring-3 focus-visible:ring-primary/20"
              />
              <button
                type="button"
                onClick={() => {
                  setError("");
                  setScanning(true);
                }}
                aria-label="Scan UPI QR"
                className="absolute top-1/2 right-1 flex size-10 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground transition-colors hover:text-foreground"
              >
                <Camera className="size-5" aria-hidden />
              </button>
            </div>
            <p className="mb-4 text-sm text-muted-foreground">
              {qr && upi.trim().toLowerCase() === qrVpa(qr)
                ? "From your QR. Payments go here."
                : "Type your UPI ID, or tap the camera to scan your QR."}
            </p>
          </>
        )}

        <p className="mb-2 text-sm font-medium">How your agent bargains</p>
        <div className="mb-4 grid grid-cols-2 gap-2">
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

        <label htmlFor="stall-lang" className="text-sm font-medium">
          Your language
        </label>
        <select
          id="stall-lang"
          value={language}
          onChange={(e) => setLanguage(e.target.value as Lang)}
          className="mt-2 mb-4 h-12 w-full rounded-lg border border-input bg-background px-3 text-base outline-none"
        >
          {LANGS.map((code) => (
            <option key={code} value={code}>
              {LANG[code].own} ({LANG[code].english})
            </option>
          ))}
        </select>

        {error && (
          <p role="alert" className="mb-3 text-sm text-destructive">
            {error}
          </p>
        )}

        <button type="submit" disabled={busy} className={`${primaryButton} w-full`}>
          {busy ? "Saving…" : "Save"}
        </button>
      </form>
    </div>
  );
}
