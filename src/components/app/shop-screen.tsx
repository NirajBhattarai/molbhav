"use client";

import {
  useEffect,
  useOptimistic,
  useState,
  useTransition,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  Camera,
  Check,
  ChevronRight,
  MapPin,
  Pencil,
  RadioTower,
  Sparkles,
  Store,
  type LucideIcon,
} from "lucide-react";
import { AgentCardAddress, stallAgentCardPath } from "@/components/app/agent-address";
import { HomeRefresh } from "@/components/app/home-refresh";
import { HeroCard, StallStatusControl } from "@/components/app/hero";
import { BlockPrint } from "@/components/brand/block-print";
import { MenuSection } from "@/components/app/menu-editor";
import { QrScanner } from "@/components/app/qr-scanner";
import { BargainsButton } from "@/components/app/shop-deals";
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
  bargains,
  canReadMenu,
}: {
  stall: ShopStall | null;
  items: ShopItem[];
  /** Counts only: the list loads on the Bargains screen. */
  bargains: { active: number; sold: number; ended: number };
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
    <main className="relative isolate mx-auto flex min-h-dvh w-full max-w-md flex-col gap-4 px-4 pt-[max(1.5rem,env(safe-area-inset-top))] pb-[calc(5.5rem+env(safe-area-inset-bottom))]">
      {/* Warm marigold wash behind the top of the screen, like an awning over the stall. */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-x-0 top-0 -z-10 h-80 bg-[radial-gradient(90%_100%_at_50%_0%,var(--awning),transparent_70%)]"
      />
      <HomeRefresh everyMs={4_000} />
      <header className="grid gap-1.5">
        <p className="inline-flex items-center gap-1.5 justify-self-start rounded-full bg-secondary/20 px-2.5 py-1 text-xs font-semibold text-foreground ring-1 ring-secondary/40">
          <Store className="size-3.5" aria-hidden />
          {t("For shopkeepers")}
        </p>
        <h1 className="font-display text-3xl font-bold tracking-tight">{t("Your stall")}</h1>
      </header>

      <HeroCard label={t("Stall")} tone={status}>
        <div className="flex items-center gap-3">
          <span className="flex size-12 shrink-0 -rotate-3 items-center justify-center rounded-2xl bg-secondary font-display text-xl font-bold text-secondary-foreground shadow-md ring-2 ring-hero-foreground/20">
            {stall?.name.trim() ? (
              <span aria-hidden>{stall.name.trim()[0].toUpperCase()}</span>
            ) : (
              <Store className="size-6" aria-hidden />
            )}
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

      {/* What a shopkeeper checks most: right under open/closed, above the menu. */}
      {ready && <BargainsButton summary={bargains} />}

      {!ready && (
        <section className="overflow-hidden rounded-2xl border border-secondary/50 bg-card shadow-sm">
          <div className="flex items-center gap-4 border-b border-border bg-secondary/10 px-4 py-3">
            <Progress done={done} total={steps.length} />
            <p className="text-sm text-muted-foreground">
              {t("Finish the checklist below. Until then the stall stays closed.")}
            </p>
          </div>
          <ul>
            {steps.map((step) => (
              <li
                key={step.id}
                className="flex items-center gap-3 border-b border-border px-4 py-1.5 last:border-0"
              >
                {step.done ? (
                  <span
                    aria-hidden
                    className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground"
                  >
                    <Check className="size-4" strokeWidth={3} />
                  </span>
                ) : (
                  <span
                    className="size-6 shrink-0 rounded-full border-2 border-dashed border-input"
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
                  className={`flex min-h-11 flex-1 items-center gap-2 text-left text-sm font-medium disabled:cursor-default ${
                    step.done ? "text-muted-foreground line-through" : "text-foreground"
                  }`}
                >
                  <span className="flex-1">{t(step.label)}</span>
                  {!step.done && (
                    <ChevronRight className="size-4 shrink-0 text-primary" aria-hidden />
                  )}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <MenuSection items={items} canReadMenu={canReadMenu} />

      <section className="grid gap-3 rounded-2xl border border-border bg-card p-4 shadow-sm">
        <SectionTitle icon={MapPin} tint="teal">
          {t("Location")}
        </SectionTitle>
        <PinMap pinned={pinned} />
        <p className="text-sm text-pretty text-muted-foreground">
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
      {stall && ready && stall.agentId && <SignDeviceCreds />}

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
      className="relative isolate flex items-start gap-3 overflow-hidden rounded-2xl border border-primary/20 bg-[linear-gradient(135deg,color-mix(in_srgb,var(--primary)_12%,var(--card)),var(--card)_55%,color-mix(in_srgb,var(--secondary)_16%,var(--card)))] p-4 text-card-foreground shadow-sm"
    >
      <span
        aria-hidden
        className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-md"
      >
        <Sparkles className="size-5" />
      </span>
      <div className="grid min-w-0 flex-1 gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="font-display text-base font-semibold">{t("Your AI agent")}</h2>
          <span
            className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-semibold ${
              open ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
            }`}
          >
            <span aria-hidden className="relative flex size-1.5">
              {open && (
                <span className="absolute inset-0 rounded-full bg-primary opacity-0 motion-safe:animate-[radar_1.6s_var(--ease-out)_infinite]" />
              )}
              <span
                className={`relative size-1.5 rounded-full ${open ? "bg-primary" : "bg-muted-foreground"}`}
              />
            </span>
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
        {open && agentId && (
          <AgentCardAddress
            path={stallAgentCardPath(agentId)}
            caption={t("Its address for other AI agents (A2A)")}
            copyLabel={t("Copy agent card address")}
          />
        )}
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
    <section className="grid gap-3 rounded-2xl border border-border bg-card p-4 shadow-sm">
      <div className="grid gap-1">
        <SectionTitle icon={RadioTower} tint="terracotta">
          {t("Stall sign")}
        </SectionTitle>
        <p className="text-sm text-pretty text-muted-foreground">
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
          className="h-12 w-36 rounded-lg border border-input bg-background px-3 text-center font-mono text-lg tracking-[0.3em] tabular-nums outline-none focus-visible:border-primary"
          aria-label={t("Six-digit code from the sign")}
        />
        <button type="submit" disabled={busy || code.length !== 6} className={primaryButton}>
          {busy ? t("Linking…") : t("Link sign")}
        </button>
      </form>
      {msg && (
        <p role="status" className="text-sm font-medium text-pretty">
          {tx(msg)}
        </p>
      )}
      <button
        type="button"
        onClick={() => setShowAdvanced((v) => !v)}
        className="-my-2 min-h-11 justify-self-start text-sm font-semibold text-primary underline-offset-2 hover:underline"
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
    </section>
  );
}

function CredRow({ label, value }: { label: string; value: string }) {
  const t = useT();
  return (
    <div className="flex min-w-0 items-center gap-1 rounded-lg bg-muted/60 py-0.5 ps-2.5">
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

const TINT = {
  teal: "bg-chart-4/15 text-chart-4",
  terracotta: "bg-chart-5/15 text-chart-5",
} as const;

/** Section heading with a coloured icon tile, so each card is easy to tell apart at a glance. */
function SectionTitle({
  icon: Icon,
  tint,
  children,
}: {
  icon: LucideIcon;
  tint: keyof typeof TINT;
  children: ReactNode;
}) {
  return (
    <div className="flex items-center gap-2.5">
      <span
        aria-hidden
        className={`flex size-9 shrink-0 items-center justify-center rounded-xl ${TINT[tint]}`}
      >
        <Icon className="size-5" />
      </span>
      <h2 className="font-display text-base font-semibold">{children}</h2>
    </div>
  );
}

/** A small decorative "map" with the stall's pin: pulsing once pinned, faded until then. */
function PinMap({ pinned }: { pinned: boolean }) {
  return (
    <div
      aria-hidden
      className="relative isolate h-24 overflow-hidden rounded-xl bg-chart-4/10 ring-1 ring-chart-4/20"
    >
      <BlockPrint className="absolute inset-0 -z-10 text-chart-4 opacity-[0.12]" />
      <span className="absolute top-[38%] -left-4 h-2.5 w-[120%] -rotate-6 bg-card/90" />
      <span className="absolute top-0 left-[62%] h-full w-2.5 rotate-12 bg-card/90" />
      <span className="absolute top-1/2 left-1/2 flex -translate-x-1/2 -translate-y-full flex-col items-center">
        <span className="relative flex size-9 items-center justify-center">
          {pinned && (
            <span className="absolute inset-0 rounded-full bg-chart-4/40 opacity-0 motion-safe:animate-[radar_2s_var(--ease-out)_infinite]" />
          )}
          <MapPin
            className={`relative size-8 drop-shadow-sm ${pinned ? "fill-chart-4 text-card" : "text-chart-4/50"}`}
            strokeWidth={2}
          />
        </span>
      </span>
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
      style={{ background: `conic-gradient(var(--secondary) ${pct}%, var(--muted) 0)` }}
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
