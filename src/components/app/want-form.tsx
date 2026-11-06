"use client";

import {
  useEffect,
  useEffectEvent,
  useRef,
  useState,
  useSyncExternalStore,
  type ChangeEvent,
  type FormEvent,
} from "react";
import { ArrowRight, Bluetooth, Loader2, MapPin, Mic, Square } from "lucide-react";
import { Chip } from "@/components/ui/chip";
import { Sheet } from "@/components/ui/sheet";
import { action, focusRing } from "@/components/ui/styles";
import { useNearbyStalls } from "@/lib/ble/scan";
import { useLang } from "@/lib/app-lang";
import { useDiscoveryMode } from "@/lib/discovery";
import { LANG } from "@/lib/languages";
import { rupees, type HeardWant } from "@/lib/want";
import { readWant } from "@/lib/want-actions";

const QUICK_PICKS = ["2 chai and 2 samosa", "Tomatoes & onions", "Pani puri for 4"];
/** Seconds after hearing a spoken order before search starts (buyer can Stop). */
const COUNTDOWN = 3;

type RecognitionResult = {
  isFinal?: boolean;
  0?: { transcript?: string };
  length: number;
};
type Recognition = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  maxAlternatives?: number;
  start(): void;
  stop(): void;
  onresult: ((e: { results: ArrayLike<RecognitionResult>; resultIndex: number }) => void) | null;
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
  // Scan BLE stall beacons while this sheet is open and discovery is "nearby".
  const nearby = useNearbyStalls(discovery === "nearby");
  const form = useRef<HTMLFormElement>(null);
  const [order, setOrder] = useState("");
  const [listening, setListening] = useState(false);
  const [reading, setReading] = useState(false);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);
  const [micError, setMicError] = useState("");
  const [error, setError] = useState("");
  const [heard, setHeard] = useState<HeardWant | null>(null);
  const [countdown, setCountdown] = useState<number | null>(null);
  const recognition = useRef<Recognition | null>(null);
  const saidRef = useRef("");
  const openRef = useRef(true);
  /** Bumps when the buyer starts over so a late `readWant` can’t restore old chips. */
  const turnRef = useRef(0);
  const canListen = useSyncExternalStore(
    noSubscribe,
    () => !!recognitionCtor(),
    () => false,
  );

  useEffect(() => {
    openRef.current = true;
    return () => {
      openRef.current = false;
      recognition.current?.stop();
    };
  }, []);

  /** Wipe previous hearing: chips, countdown, search result, and (optionally) the text. */
  function clearHearing({ clearText }: { clearText: boolean }) {
    turnRef.current += 1;
    setHeard(null);
    setCountdown(null);
    setSearched(false);
    setSearching(false);
    setReading(false);
    setError("");
    setMicError("");
    if (clearText) {
      setOrder("");
      saidRef.current = "";
    }
  }

  /**
   * Read an order via Gemini on the server (every case). Show “Reading…” until that returns.
   */
  async function read(text: string) {
    if (!text.trim()) return;
    const turn = ++turnRef.current;
    setError("");
    setSearched(false);
    setCountdown(null);
    setHeard(null);
    setReading(true);

    try {
      const fields = new FormData(form.current ?? undefined);
      fields.set("q", text);
      const r = await readWant(fields);
      if (!openRef.current || turn !== turnRef.current) return;
      if ("error" in r) {
        setHeard(null);
        setError(r.error);
        return;
      }
      setHeard(r);
      setOrder(r.english || text);
      setCountdown(COUNTDOWN);
    } catch {
      if (openRef.current && turn === turnRef.current) {
        setError("Couldn’t read that order. Try typing it.");
      }
    } finally {
      if (openRef.current && turn === turnRef.current) setReading(false);
    }
  }

  function listen() {
    if (listening) {
      recognition.current?.stop();
      return;
    }
    const Ctor = recognitionCtor();
    if (!Ctor) return;
    // Fresh take — don’t keep last transcript / “Your agent heard” chips.
    clearHearing({ clearText: true });
    const rec = new Ctor();
    rec.lang = LANG[lang].locale;
    rec.interimResults = true;
    rec.continuous = false;
    if (typeof rec.maxAlternatives === "number") rec.maxAlternatives = 3;
    saidRef.current = "";
    let finals = "";

    rec.onresult = (e) => {
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const row = e.results[i];
        // Prefer the highest-confidence alternative when the API provides several.
        let best = row[0]?.transcript ?? "";
        for (let a = 1; a < row.length; a++) {
          const t = (row as RecognitionResult & Record<number, { transcript?: string }>)[a]
            ?.transcript;
          if (t && /\d/.test(t) && !/\d/.test(best)) best = t;
        }
        if (row.isFinal) {
          finals = (finals ? `${finals} ${best}` : best).trim();
          saidRef.current = finals;
          setOrder(finals);
        } else {
          interim += best;
        }
      }
      if (interim) {
        const live = (finals ? `${finals} ${interim}` : interim).trim();
        saidRef.current = live;
        setOrder(live);
      }
    };
    rec.onerror = (e) =>
      setMicError(
        e.error === "not-allowed" || e.error === "service-not-allowed"
          ? "Microphone access is off. Allow it in Settings, or type your order."
          : e.error === "no-speech"
            ? "Didn’t catch that. Tap the mic and try again."
            : "Couldn’t listen just now. Type your order instead.",
      );
    // Buyer stopped talking (or tapped stop): parse and start the search countdown.
    rec.onend = () => {
      setListening(false);
      const said = (saidRef.current || finals).trim();
      if (said) void read(said);
    };
    recognition.current = rec;
    setListening(true);
    rec.start();
  }

  function startSearch() {
    if (!heard) return;
    setSearching(true);
    setCountdown(null);
    window.setTimeout(() => {
      if (!openRef.current) return;
      setSearching(false);
      setSearched(true);
    }, 600);
  }

  const searchNow = useEffectEvent(() => startSearch());
  useEffect(() => {
    if (countdown === null) return;
    // Tick down each second; on the last tick start the search instead of showing 0.
    const timer = window.setTimeout(
      () => (countdown <= 1 ? searchNow() : setCountdown(countdown - 1)),
      1000,
    );
    return () => window.clearTimeout(timer);
  }, [countdown]);

  function onType(e: ChangeEvent<HTMLTextAreaElement>) {
    // Typing is a new draft — drop chips / countdown from the last hear.
    clearHearing({ clearText: false });
    setOrder(e.target.value);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const q = order.trim();
    if (!q || listening || reading || searching) return;
    if (heard && searched) return;
    if (heard && heard.english === q) {
      startSearch();
      return;
    }
    await read(q);
  }

  const showStart =
    !canListen || (!!order.trim() && !listening && !reading && countdown === null && !searching);

  return (
    <Sheet
      onClose={onClose}
      title="What do you want?"
      description="Say it like you would to a shopkeeper. Your agent bargains with every open stall."
      footer={
        showStart || searching ? (
          <button
            type="submit"
            form="want-form"
            disabled={searching || reading || !order.trim()}
            className={`${action.primary} disabled:opacity-60`}
          >
            {searching || reading ? (
              <>
                <Loader2 className="size-5 animate-spin" aria-hidden />
                {reading ? "Reading your order…" : "Finding stalls…"}
              </>
            ) : (
              <>
                Start bargaining <ArrowRight className="size-5" aria-hidden />
              </>
            )}
          </button>
        ) : null
      }
    >
      <form id="want-form" ref={form} onSubmit={onSubmit} className="grid gap-4">
        <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
          {discovery === "nearby" ? (
            <Bluetooth
              className={`size-4 shrink-0 ${nearby.agents.length ? "text-primary" : ""}`}
              aria-hidden
            />
          ) : (
            <MapPin className="size-4 shrink-0 text-primary" aria-hidden />
          )}
          {discovery === "nearby"
            ? nearby.native
              ? nearby.blocked
                ? "Turn on Bluetooth to find stalls nearby."
                : nearby.agents.length
                  ? `Stalls heard nearby: ${nearby.agents.length}`
                  : "Looking for stalls nearby…"
              : "Finding stalls via nearby agents (change in Profile). Open the iPhone app to hear beacons."
            : "Finding stalls by location (change in Profile)."}
        </p>
        <input type="hidden" name="discovery" value={discovery} />
        <input type="hidden" name="lang" value={lang} />
        {nearby.agents.length > 0 && (
          <input type="hidden" name="agents" value={nearby.agents.join(",")} />
        )}

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
                : reading
                  ? "Reading your order…"
                  : micError || "Tap to speak. Searching starts when you stop."}
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
            onChange={onType}
            autoComplete="off"
            enterKeyHint="go"
            placeholder="e.g. 2 chai and 2 samosa, under ₹100…"
            className="w-full resize-none rounded-lg border border-input bg-background px-3 py-2.5 text-base transition-[border-color,box-shadow] duration-150 ease-out outline-none placeholder:text-muted-foreground/70 focus-visible:border-primary focus-visible:ring-3 focus-visible:ring-primary/20"
          />
        </div>

        {heard && heard.items.length > 0 && (
          <div className="grid animate-[rise_200ms_var(--ease-out)_both] gap-2.5 rounded-xl border border-border p-3">
            <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              Your agent heard
            </p>
            <ul className="flex flex-wrap gap-1.5">
              {heard.items.map((item) => (
                <li key={item}>
                  <Chip>{item}</Chip>
                </li>
              ))}
              {heard.budget !== null && (
                <li>
                  <Chip tone="marigold">Under {rupees(heard.budget)}</Chip>
                </li>
              )}
            </ul>
            {countdown !== null && (
              <div className="grid animate-[rise_200ms_var(--ease-out)_both] gap-1.5">
                <div className="flex items-center justify-between gap-3">
                  <p role="status" className="text-sm font-medium tabular-nums">
                    Searching in {countdown}…
                  </p>
                  <button
                    type="button"
                    onClick={() => setCountdown(null)}
                    className={`min-h-11 rounded-lg px-4 text-sm font-semibold text-primary transition-[background-color,transform] duration-150 ease-out hover:bg-accent active:scale-[0.97] ${focusRing}`}
                  >
                    Stop
                  </button>
                </div>
                <span aria-hidden className="h-1 overflow-hidden rounded-full bg-muted">
                  <span
                    style={{ animationDuration: `${COUNTDOWN}s` }}
                    className="block h-full origin-left bg-primary motion-safe:animate-[drain_linear_forwards]"
                  />
                </span>
              </div>
            )}
            {searched && (
              <p role="status" className="text-sm text-pretty text-muted-foreground">
                {heard.stalls.length
                  ? `Found ${heard.stalls.length} open stall${heard.stalls.length === 1 ? "" : "s"}: ${heard.stalls
                      .map((s) => s.name)
                      .join(", ")}. Full bargaining comes next.`
                  : `Heard “${heard.english}”, but no open stall sells that yet. Ask a shop to open, or try other words.`}
              </p>
            )}
          </div>
        )}

        {!(heard && heard.items.length > 0) && (
          <ul aria-label="Quick picks" className="flex flex-wrap gap-2">
            {QUICK_PICKS.map((pick) => (
              <li key={pick}>
                <button
                  type="button"
                  onClick={() => {
                    setOrder(pick);
                    setCountdown(null);
                    setHeard(null);
                    setSearched(false);
                    void read(pick);
                  }}
                  className={`min-h-11 rounded-full border border-input px-3.5 text-sm font-medium transition-[background-color,transform] duration-150 ease-out hover:bg-accent active:scale-[0.97] ${focusRing}`}
                >
                  {pick}
                </button>
              </li>
            ))}
          </ul>
        )}

        {error && (
          <p role="alert" className="text-sm font-medium text-destructive">
            {error}
          </p>
        )}
      </form>
    </Sheet>
  );
}
