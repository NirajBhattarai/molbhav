"use client";

import { useEffect, useOptimistic, useState, useTransition, type FormEvent } from "react";
import { Camera, Check, MapPin, Pencil, Sparkles, Store } from "lucide-react";
import { AgentCardAddress, stallAgentCardPath } from "@/components/app/agent-address";
import { HomeRefresh } from "@/components/app/home-refresh";
import { HeroCard, StallStatusControl } from "@/components/app/hero";
import { MenuSection } from "@/components/app/menu-editor";
import { QrScanner } from "@/components/app/qr-scanner";
import { CopyButton } from "@/components/ui/copy-button";
import { Field, Sheet, fieldInput } from "@/components/ui/sheet";
import { outlineButton, primaryButton } from "@/components/ui/styles";
import { useT, useTx, type Msg, type Text } from "@/lib/i18n";
import { LANG, LANGS, type Lang } from "@/lib/languages";
import type { ShopItem, ShopStall, StallStatus, Style } from "@/lib/server/shop";
import {
  linkStallSign,
  pinLocation,
  saveStallDetails,
  setStallStatus,
  stallSignCredentials,
} from "@/lib/shop-actions";
import { isVpa, parseUpi } from "@/lib/upi";

function setupSteps(stall: ShopStall | null, items: ShopItem[]) {
  return [
    { id: "name", label: "Name your stall" as Msg, done: !!stall?.name.trim() },
    {
      id: "upi",
      label: "Add your UPI ID for payouts" as Msg,
      done: !!stall && isVpa(stall.upi),
    },
    { id: "menu", label: "Add something you sell" as Msg, done: items.length > 0 },
    {
      id: "pin",
      label: "Share live location" as Msg,
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
  const t = useT();
  const tx = useTx();
  const [editingStall, setEditingStall] = useState(false);
  const steps = setupSteps(stall, items);
  const done = steps.filter((s) => s.done).length;
  const ready = done === steps.length;
  const pinned = stall?.lat != null && stall?.lng != null;
  const liveStatus: StallStatus = ready ? (stall?.status ?? "closed") : "closed";
  const [status, setStatus] = useOptimistic(liveStatus);
  const [, startStatus] = useTransition();
  const [pinBusy, setPinBusy] = useState(false);
  // Errors and notices are kept in English and shown through tx(), so they switch with the language.
  const [pinError, setPinError] = useState<Text>("");
  const open = status === "open";

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
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col gap-4 px-4 pt-[max(1.5rem,env(safe-area-inset-top))] pb-[calc(5.5rem+env(safe-area-inset-bottom))]">
      <HomeRefresh everyMs={4_000} />
      <header>
        <p className="text-sm font-medium text-muted-foreground">{t("For shopkeepers")}</p>
        <h1 className="font-display text-3xl font-bold tracking-tight">{t("Your stall")}</h1>
      </header>

      <HeroCard label={t("Stall")}>
        <div className="flex items-center gap-3">
          <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-secondary text-secondary-foreground shadow-sm">
            <Store className="size-6" aria-hidden />
          </span>
          <div className="grid min-w-0 flex-1">
            <p className="line-clamp-2 font-display text-xl leading-tight font-bold tracking-tight">
              {stall?.name || t("Unnamed stall")}
            </p>
            <p className="truncate text-sm text-hero-foreground/75">
              {stall?.upi ? t("Payouts to {upi}", { upi: stall.upi }) : t("No UPI ID yet")}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setEditingStall(true)}
            aria-label={t("Edit stall name and UPI ID")}
            className="-mr-1.5 flex size-11 shrink-0 items-center justify-center rounded-full text-hero-foreground/80 transition-[background-color,transform] duration-150 ease-out hover:bg-hero-foreground/10 active:scale-[0.97]"
          >
            <Pencil className="size-5" aria-hidden />
          </button>
        </div>

        <StallStatusControl
          status={status}
          disabled={!ready}
          pauseSecondsLeft={stall?.pauseSecondsLeft ?? 0}
          onChange={(next) =>
            startStatus(async () => {
              setStatus(next);
              await setStallStatus(next).catch(() => {});
            })
          }
          hint={
            !ready
              ? t("Finish the checklist below. Until then the stall stays closed.")
              : status === "open"
                ? t("Synced with your sign. Tap here or press POWER on the sign.")
                : status === "paused"
                  ? t("Synced with your sign. Tap here or press PAUSE on the sign.")
                  : t("Synced with your sign. Tap Open here or press POWER on the sign.")
          }
        />
      </HeroCard>

      {!ready && (
        <section className="rounded-2xl border border-border bg-card">
          <div className="flex items-center gap-4 border-b border-border px-4 py-3">
            <Progress done={done} total={steps.length} />
            <p className="text-sm text-muted-foreground">
              {t("Finish the checklist below. Until then the stall stays closed.")}
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
                  {t(step.label)}
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
          <h2 className="font-display text-base font-semibold">{t("Location")}</h2>
        </div>
        <p className="text-sm text-muted-foreground">
          {pinned
            ? t(
                "Your stall is pinned at {lat}, {lon}. Buyers get Directions in Maps and agents find you nearby.",
                {
                  lat: stall!.lat!.toFixed(5),
                  lon: stall!.lng!.toFixed(5),
                },
              )
            : t("Buyers’ agents only find stalls that are pinned.")}
        </p>
        <button type="button" disabled={pinBusy} onClick={shareLocation} className={outlineButton}>
          {pinBusy
            ? t("Getting location…")
            : pinned
              ? t("Update location")
              : t("Share live location")}
        </button>
        {pinError && (
          <p role="alert" className="text-sm text-destructive">
            {tx(pinError)}
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
  const t = useT();
  return (
    <section
      aria-label={t("Your AI agent")}
      className="flex items-start gap-3 rounded-2xl border border-border bg-card p-4 text-card-foreground"
    >
      <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
        <Sparkles className="size-5" aria-hidden />
      </span>
      <div className="grid min-w-0 flex-1 gap-0.5">
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-semibold">{t("Your AI agent")}</p>
          <span
            className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
              open ? "bg-success/15 text-success" : "bg-muted text-muted-foreground"
            }`}
          >
            {open ? t("Live") : t("Off")}
          </span>
        </div>
        <p className="text-sm text-pretty text-muted-foreground">
          {open
            ? style === "firm"
              ? t("Bargaining with buyers now, firmly, in their language.")
              : t("Bargaining with buyers now, in a friendly way, in their language.")
            : t("Open your stall and it starts bargaining with buyers.")}{" "}
          {t("It never goes below your lowest price.")}
        </p>
        {open && agentId && <AgentCardAddress path={stallAgentCardPath(agentId)} />}
        {agentId && <SignDeviceCreds />}
      </div>
    </section>
  );
}

/** Link an ESP32 stall sign: 6-digit OLED code (best) or offline claim pack. */
function SignDeviceCreds() {
  const t = useT();
  const tx = useTx();
  const [creds, setCreds] = useState<{
    agentId: string;
    deviceToken: string;
    claimPack: string;
  } | null>(null);
  const [code, setCode] = useState("");
  const [msg, setMsg] = useState<Text>("");
  const [busy, setBusy] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);

  useEffect(() => {
    void stallSignCredentials()
      .then(setCreds)
      .catch(() => setCreds(null));
  }, []);
  if (!creds) return null;

  async function link(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg("");
    try {
      const res = await linkStallSign(code);
      if (res && "error" in res) setMsg(String(res.error));
      else setMsg("Sign linked. It will pick up this stall in a few seconds.");
    } catch {
      setMsg("Couldn’t link just now. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-3 grid gap-3 rounded-xl border border-border/80 bg-muted/40 p-3">
      <div>
        <p className="text-xs font-semibold text-muted-foreground">{t("Stall sign")}</p>
        <p className="mt-1 text-xs text-pretty text-muted-foreground">
          {t(
            "Easiest: join the sign’s hotspot, save market Wi‑Fi only, then enter the 6-digit code from its screen here.",
          )}
        </p>
      </div>
      <form onSubmit={link} className="flex flex-wrap items-center gap-2">
        <input
          inputMode="numeric"
          pattern="[0-9]{6}"
          maxLength={6}
          placeholder="123456"
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
          className="h-10 w-28 rounded-lg border border-input bg-background px-3 font-mono text-base tracking-widest tabular-nums outline-none focus-visible:border-primary"
          aria-label={t("Six-digit code from the sign")}
        />
        <button type="submit" disabled={busy || code.length !== 6} className={primaryButton}>
          {busy ? t("Linking…") : t("Link sign")}
        </button>
      </form>
      {msg && (
        <p role="status" className="text-xs font-medium text-pretty">
          {tx(msg)}
        </p>
      )}
      <button
        type="button"
        onClick={() => setShowAdvanced((v) => !v)}
        className="justify-self-start text-xs font-semibold text-primary"
      >
        {showAdvanced ? t("Hide") : t("Offline claim pack / USB")}
      </button>
      {showAdvanced && (
        <div className="grid gap-2">
          <p className="text-xs text-pretty text-muted-foreground">
            {t(
              "No internet on the phone while you’re on the sign hotspot? Copy the claim pack first, paste it into the sign’s setup page as one field.",
            )}
          </p>
          <CredRow label={t("Claim pack")} value={creds.claimPack} />
          <CredRow label={t("Agent id")} value={creds.agentId} />
          <CredRow label={t("Device token")} value={creds.deviceToken} />
        </div>
      )}
    </div>
  );
}

function CredRow({ label, value }: { label: string; value: string }) {
  const t = useT();
  return (
    <div className="flex min-w-0 items-center gap-1 rounded-lg bg-background/80 py-0.5 ps-2.5">
      <span className="shrink-0 text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">
        {label}
      </span>
      <code translate="no" className="min-w-0 flex-1 truncate font-mono text-xs">
        {value}
      </code>
      <CopyButton
        value={value}
        label={t("Copy {label}", { label })}
        className="text-muted-foreground"
      />
    </div>
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
  const t = useT();
  const tx = useTx();
  const [name, setName] = useState(stall?.name ?? "");
  const [upi, setUpi] = useState(stall?.upi ?? "");
  const [qr, setQr] = useState<string | null>(stall?.qr ?? null);
  const [style, setStyle] = useState<Style>(stall?.style ?? "friendly");
  const [language, setLanguage] = useState<Lang>(stall?.lang ?? "en");
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<Text>("");
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
    <Sheet title={t("Stall details")} onClose={onClose}>
      <form onSubmit={onSubmit} noValidate className="grid gap-4">
        {scanning ? (
          <QrScanner onResult={onScanned} onCancel={() => setScanning(false)} />
        ) : (
          <>
            <Field label={t("Stall name")} htmlFor="stall-name">
              <input
                id="stall-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={60}
                placeholder={t("e.g. Ramu Tea Stall…")}
                className={fieldInput}
              />
            </Field>
            <Field label={t("UPI ID")} htmlFor="stall-upi">
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
                  aria-label={t("Scan your UPI QR")}
                  className="absolute top-1/2 right-0.5 flex size-11 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground hover:text-foreground"
                >
                  <Camera className="size-5" aria-hidden />
                </button>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                {qr && upi.trim().toLowerCase() === qrVpa(qr)
                  ? t("From your QR. Payments go here.")
                  : t("Type your UPI ID, or tap the camera to scan your QR.")}
              </p>
            </Field>
          </>
        )}

        <fieldset>
          <legend className="mb-2 text-sm font-medium">{t("How your agent bargains")}</legend>
          <div className="grid grid-cols-2 gap-2">
            {(["friendly", "firm"] as const).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setStyle(s)}
                className={`h-11 rounded-lg border text-sm font-medium ${
                  style === s
                    ? "border-primary bg-primary/5 text-primary"
                    : "border-input bg-background"
                }`}
              >
                {t(s === "friendly" ? "Friendly" : "Firm")}
              </button>
            ))}
          </div>
        </fieldset>

        <Field label={t("Your language")} htmlFor="stall-lang">
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
            {tx(error)}
          </p>
        )}
        <button type="submit" disabled={busy || scanning} className={`${primaryButton} w-full`}>
          {busy ? t("Saving…") : t("Save")}
        </button>
      </form>
    </Sheet>
  );
}
