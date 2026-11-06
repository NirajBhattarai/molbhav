"use client";

import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ChangeEvent,
  type FormEvent,
} from "react";
import { Bluetooth, Loader2, MapPin, Mic, Square } from "lucide-react";
import { Sheet } from "@/components/ui/sheet";
import { action, focusRing } from "@/components/ui/styles";
import { useLang } from "@/lib/app-lang";
import { useDiscoveryMode } from "@/lib/discovery";
import { LANG } from "@/lib/languages";

const QUICK_PICKS = ["2 chai, 2 samosa", "Tomatoes & onions", "Pani puri for 4"];

type Recognition = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  start(): void;
  stop(): void;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error: string }) => void) | null;
};
type RecognitionCtor = new () => Recognition;

function recognitionCtor(): RecognitionCtor | undefined {
  const w = window as unknown as {
    SpeechRecognition?: RecognitionCtor;
    webkitSpeechRecognition?: RecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition;
}

const noSubscribe = () => () => {};

/** Home CTA: open “What do you want?” to speak or type an order. */
export function WantForm() {
  const [open, setOpen] = useState(false);
  const [session, setSession] = useState(0);
  return (
    <>
      <button
        type="button"
        onClick={() => {
          setSession((n) => n + 1);
          setOpen(true);
        }}
        className={`${action.secondary} mt-5`}
      >
        <Mic className="size-5" aria-hidden />
        Speak your order
      </button>
      {open && <WantSheet key={session} onClose={() => setOpen(false)} />}
    </>
  );
}

function WantSheet({ onClose }: { onClose: () => void }) {
  const lang = useLang();
  const discovery = useDiscoveryMode();
  const [order, setOrder] = useState("");
  const [listening, setListening] = useState(false);
  const [micError, setMicError] = useState("");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const recognition = useRef<Recognition | null>(null);
  const canListen = useSyncExternalStore(
    noSubscribe,
    () => !!recognitionCtor(),
    () => false,
  );

  useEffect(() => () => recognition.current?.stop(), []);

  function listen() {
    if (listening) {
      recognition.current?.stop();
      return;
    }
    const Ctor = recognitionCtor();
    if (!Ctor) return;
    const rec = new Ctor();
    rec.lang = LANG[lang].locale;
    rec.interimResults = true;
    rec.continuous = false;
    const before = order.trim();
    let said = "";
    rec.onresult = (e) => {
      const words = Array.from(e.results, (r) => r[0]?.transcript ?? "").join("");
      said = (before ? `${before} ${words}` : words).trim();
      setOrder(said);
    };
    rec.onerror = (e) =>
      setMicError(
        e.error === "not-allowed" || e.error === "service-not-allowed"
          ? "Microphone access is off. Allow it in Settings, or type your order."
          : e.error === "no-speech"
            ? "Didn’t catch that. Tap the mic and try again."
            : "Couldn’t listen just now. Type your order instead.",
      );
    rec.onend = () => setListening(false);
    recognition.current = rec;
    setMicError("");
    setStatus("");
    setListening(true);
    rec.start();
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const q = order.trim();
    if (!q) return;
    setBusy(true);
    setStatus("");
    // Bargaining pipeline lands next; keep the order UI ready.
    window.setTimeout(() => {
      setBusy(false);
      setStatus(
        discovery === "nearby"
          ? `Got it — “${q}”. Your agent will shop with nearby stall agents once bargaining is live.`
          : `Got it — “${q}”. Your agent will search by your location once bargaining is live.`,
      );
    }, 400);
  }

  return (
    <Sheet
      onClose={onClose}
      title="What do you want?"
      description="Say it like you would to a shopkeeper. Your agent bargains with every open stall."
      footer={
        <button
          type="submit"
          form="want-form"
          disabled={busy || !order.trim()}
          className={`${action.primary} disabled:opacity-60`}
        >
          {busy ? (
            <>
              <Loader2 className="size-5 animate-spin" aria-hidden />
              Starting…
            </>
          ) : (
            "Start bargaining"
          )}
        </button>
      }
    >
      <form id="want-form" onSubmit={onSubmit} className="grid gap-4">
        <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
          {discovery === "nearby" ? (
            <Bluetooth className="size-4 shrink-0 text-primary" aria-hidden />
          ) : (
            <MapPin className="size-4 shrink-0 text-primary" aria-hidden />
          )}
          {discovery === "nearby"
            ? "Finding stalls via nearby agents (change in Profile)."
            : "Finding stalls by location (change in Profile)."}
        </p>
        <input type="hidden" name="discovery" value={discovery} />
        {canListen && (
          <div className="grid justify-items-center gap-2">
            <button
              type="button"
              onClick={listen}
              aria-pressed={listening}
              aria-label={listening ? "Stop listening" : "Speak your order"}
              className={`relative flex size-20 items-center justify-center rounded-full bg-secondary text-secondary-foreground shadow-sm transition-transform duration-150 ease-out active:scale-[0.97] ${focusRing}`}
            >
              {listening && (
                <span
                  aria-hidden
                  className="absolute inset-0 rounded-full ring-4 ring-secondary/40 motion-safe:animate-[radar_1.6s_var(--ease-out)_infinite]"
                />
              )}
              {listening ? (
                <Square className="size-7 fill-current" aria-hidden />
              ) : (
                <Mic className="size-8" aria-hidden />
              )}
            </button>
            <p
              role="status"
              className="min-h-5 text-center text-sm font-medium text-muted-foreground"
            >
              {listening
                ? "Listening… just stop talking when you’re done"
                : micError || "Tap to speak, or type below."}
            </p>
          </div>
        )}

        <div className="grid gap-1.5">
          <label htmlFor="want" className="text-sm font-semibold">
            {canListen ? "Or type it" : "Your order"}
          </label>
          <textarea
            id="want"
            name="q"
            required
            rows={2}
            maxLength={200}
            value={order}
            onChange={(e: ChangeEvent<HTMLTextAreaElement>) => {
              setOrder(e.target.value);
              setStatus("");
            }}
            autoComplete="off"
            enterKeyHint="go"
            placeholder="e.g. 2 chai and 2 samosa, under ₹100…"
            className="w-full resize-none rounded-lg border border-input bg-background px-3 py-2.5 text-base transition-[border-color,box-shadow] duration-150 ease-out outline-none placeholder:text-muted-foreground/70 focus-visible:border-primary focus-visible:ring-3 focus-visible:ring-primary/20"
          />
        </div>

        <ul className="flex flex-wrap gap-2">
          {QUICK_PICKS.map((pick) => (
            <li key={pick}>
              <button
                type="button"
                onClick={() => {
                  setOrder(pick);
                  setStatus("");
                }}
                className={`rounded-full border border-input bg-background px-3 py-1.5 text-sm font-medium transition-colors hover:bg-muted ${focusRing}`}
              >
                {pick}
              </button>
            </li>
          ))}
        </ul>

        {status && (
          <p role="status" className="text-sm text-pretty text-muted-foreground">
            {status}
          </p>
        )}
      </form>
    </Sheet>
  );
}
