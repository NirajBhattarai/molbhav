"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { ArrowRight, LoaderCircle, Mail, MailCheck, ShieldCheck, Smartphone } from "lucide-react";
import { LanguagePicker } from "@/components/app/language-picker";
import { BlockPrint } from "@/components/brand/block-print";
import { HaggleDemo } from "@/components/brand/haggle-demo";
import { LogoMark } from "@/components/brand/logo";
import { action, focusRing } from "@/components/ui/styles";
import { startSession } from "@/lib/auth-actions";
import { useT, useTx, type Text } from "@/lib/i18n";
import { OtpError, startEmailOtp, type OtpEvent, type OtpSession } from "@/lib/magic";
import { enterApp } from "@/lib/role";

const CODE_LENGTH = 6;
const RESEND_S = 30;

export default function SignInPage() {
  const t = useT();
  const tx = useTx();
  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  // Kept in English and shown through tx(), so it switches with the app language.
  const [error, setError] = useState<Text>("");
  const [busy, setBusy] = useState(false);
  const [approve, setApprove] = useState(false);
  // Seconds until another code may be sent, and a note after a resend.
  const [cooldown, setCooldown] = useState(0);
  const [resent, setResent] = useState(false);
  // Bumped on each wrong code so the boxes shake again, even for the same message.
  const [shake, setShake] = useState(0);
  const emailRef = useRef<HTMLInputElement>(null);
  const codeRef = useRef<HTMLInputElement>(null);
  const otp = useRef<OtpSession | null>(null);

  function onEvent(e: OtpEvent) {
    switch (e.type) {
      case "code-sent":
        setBusy(false);
        setCooldown(RESEND_S);
        setStep("code");
        return;
      case "invalid-code":
        setBusy(false);
        setCode("");
        setShake((n) => n + 1);
        setError("That code is wrong. Check your email and try again.");
        return codeRef.current?.focus();
      case "expired-code":
        setBusy(false);
        setCode("");
        setStep("email");
        return setError("That code expired. Send a new code.");
      case "approve-device":
        setBusy(false);
        return setApprove(true);
      case "failed":
        setBusy(false);
        return setError(e.message);
      case "done":
        setApprove(false);
        return void startSession(e.token).then((result) => {
          if ("error" in result) {
            setBusy(false);
            setError(result.error);
          } else enterApp();
        });
    }
  }

  useEffect(() => {
    if (step !== "code" || cooldown <= 0) return;
    const id = window.setTimeout(() => setCooldown((s) => s - 1), 1000);
    return () => window.clearTimeout(id);
  }, [step, cooldown]);

  async function sendCode(e: FormEvent) {
    e.preventDefault();
    const address = email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) {
      setError("Enter an email address, like priya@example.com.");
      return emailRef.current?.focus();
    }
    setResent(false);
    await requestCode(address);
  }

  function resend() {
    setCode("");
    setResent(true);
    void requestCode(email.trim()).then(() => codeRef.current?.focus());
  }

  async function requestCode(address: string) {
    setError("");
    setBusy(true);
    otp.current?.cancel();
    try {
      otp.current = await startEmailOtp(address, onEvent);
    } catch (err) {
      setBusy(false);
      setError(err instanceof OtpError ? err.msg : "Sign-in didn't finish. Please try again.");
    }
  }

  function verify(e: FormEvent) {
    e.preventDefault();
    submitCode(code);
  }

  function submitCode(value: string) {
    if (!/^\d{6}$/.test(value)) {
      setShake((n) => n + 1);
      setError("The code has 6 digits. Check your email.");
      return codeRef.current?.focus();
    }
    setError("");
    setResent(false);
    setBusy(true);
    otp.current?.submit(value);
  }

  function changeEmail() {
    otp.current?.cancel();
    otp.current = null;
    setStep("email");
    setCode("");
    setError("");
    setBusy(false);
    setApprove(false);
    setResent(false);
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col">
      <section
        className={`relative overflow-hidden bg-hero px-6 pt-[max(1.5rem,env(safe-area-inset-top))] text-hero-foreground sm:mt-6 sm:rounded-2xl ${
          step === "email" ? "pb-10 short:pb-6" : "pb-6"
        }`}
      >
        <BlockPrint className="pointer-events-none absolute inset-0 text-secondary opacity-15" />
        <div className="relative">
          <div className="flex items-center justify-between gap-3">
            <span
              translate="no"
              className="inline-flex items-center gap-2 font-display text-xl font-bold"
            >
              <LogoMark className="h-7 w-auto" />
              Molbhav
            </span>
            <LanguagePicker className="-mr-2 bg-hero-foreground/10 text-hero-foreground ring-1 ring-hero-foreground/15 hover:bg-hero-foreground/15" />
          </div>
          {step === "email" && (
            <>
              <h1 className="mt-6 font-display text-[1.75rem] leading-[1.1] font-bold tracking-tight text-balance short:mt-4 short:text-2xl">
                {t("Say what you want. Your agent bargains.")}
              </h1>
              <div className="mt-5 short:mt-3">
                <HaggleDemo />
              </div>
            </>
          )}
        </div>
      </section>

      <div className="flex flex-1 flex-col px-6 pt-8 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
        {step === "email" ? (
          <form
            key="email"
            onSubmit={sendCode}
            noValidate
            className="flex flex-1 animate-[rise_300ms_var(--ease-out)] flex-col"
          >
            <h2 className="font-display text-2xl font-bold tracking-tight">
              {t("Sign in or sign up")}
            </h2>
            <p className="mt-1 text-muted-foreground">{t("We email you a 6-digit code.")}</p>
            <label htmlFor="email" className="mt-6 text-sm font-medium short:mt-4">
              {t("Email")}
            </label>
            <div className="relative mt-2">
              <Mail
                aria-hidden
                className={`pointer-events-none absolute top-1/2 left-3.5 size-5 -translate-y-1/2 transition-colors duration-150 ${
                  error ? "text-destructive" : "text-muted-foreground"
                }`}
              />
              <input
                ref={emailRef}
                id="email"
                name="email"
                type="email"
                inputMode="email"
                autoComplete="email"
                autoCapitalize="none"
                spellCheck={false}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                aria-invalid={!!error}
                aria-describedby={error ? "email-error" : undefined}
                placeholder="priya@example.com"
                className={`h-12 w-full rounded-xl border bg-card pr-3 pl-11 text-base shadow-xs transition-[border-color,box-shadow] duration-150 outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/40 ${
                  error ? "border-destructive" : "border-input"
                }`}
              />
            </div>
            {error && (
              <p
                id="email-error"
                role="alert"
                className="mt-2 animate-[fade-in_200ms_var(--ease-out)] text-sm text-destructive"
              >
                {tx(error)}
              </p>
            )}
            <div className="mt-auto grid gap-3 pt-8">
              <button type="submit" disabled={busy} className={`${action.primary} group`}>
                {busy ? <LoaderCircle className="size-5 animate-spin" aria-hidden /> : null}
                {busy ? t("Sending…") : t("Send code")}
                {!busy && (
                  <ArrowRight
                    className="size-5 transition-transform duration-150 ease-out group-hover:translate-x-0.5"
                    aria-hidden
                  />
                )}
              </button>
              <p className="flex items-center justify-center gap-1.5 text-sm text-muted-foreground">
                <ShieldCheck className="size-4 text-success" aria-hidden />
                {t("No password to remember.")}
              </p>
            </div>
          </form>
        ) : (
          <form
            key="code"
            onSubmit={verify}
            noValidate
            className="flex flex-1 animate-[rise_300ms_var(--ease-out)] flex-col"
          >
            <span
              aria-hidden
              className="flex size-14 -rotate-3 animate-[pop_320ms_var(--ease-out)_both] items-center justify-center rounded-2xl bg-secondary text-secondary-foreground shadow-md"
            >
              <MailCheck className="size-7" />
            </span>
            <h1 className="mt-4 font-display text-2xl font-bold tracking-tight">
              {t("Check your email")}
            </h1>
            <p className="mt-1 [overflow-wrap:anywhere] text-muted-foreground">
              {t("Sent to {email}.", { email: email.trim() })}{" "}
              <button
                type="button"
                onClick={changeEmail}
                className={`-my-2 inline-flex min-h-11 items-center rounded-sm font-medium text-primary underline underline-offset-4 ${focusRing}`}
              >
                {t("Change")}
              </button>
            </p>

            <label htmlFor="code" className="mt-5 text-sm font-medium">
              {t("6-digit code")}
            </label>
            <div className="group relative mt-2">
              {/* What you see: six boxes. What you type into: one real field on top, so paste,
                  screen readers and the keyboard's code autofill all work. */}
              <div
                key={shake}
                aria-hidden
                className={`grid grid-cols-6 gap-2 ${shake ? "animate-[shake_320ms_var(--ease-out)]" : ""}`}
              >
                {Array.from({ length: CODE_LENGTH }, (_, i) => {
                  const digit = code[i];
                  // The box the next digit goes in lights up while the field has focus (CSS, so it
                  // also works when the field was focused before the page finished loading).
                  const next = !busy && i === Math.min(code.length, CODE_LENGTH - 1);
                  return (
                    <span
                      key={i}
                      className={`relative flex h-14 items-center justify-center rounded-xl border-2 bg-card font-display text-2xl font-bold tabular-nums transition-[border-color,box-shadow,background-color] duration-150 ease-out ${
                        error
                          ? "border-destructive/70"
                          : `${digit ? "border-primary/35 bg-primary/5" : "border-input/60"} ${
                              next
                                ? "group-has-[input:focus]:border-primary group-has-[input:focus]:ring-3 group-has-[input:focus]:ring-ring/25"
                                : ""
                            }`
                      }`}
                    >
                      {digit ? (
                        <span key={digit} className="animate-[pop_160ms_var(--ease-out)]">
                          {digit}
                        </span>
                      ) : (
                        next && (
                          <span className="hidden h-7 w-0.5 animate-[caret-blink_1s_steps(1)_infinite] rounded-full bg-primary group-has-[input:focus]:block" />
                        )
                      )}
                    </span>
                  );
                })}
              </div>
              <input
                ref={codeRef}
                id="code"
                name="code"
                spellCheck={false}
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={CODE_LENGTH}
                autoFocus
                value={code}
                readOnly={busy}
                onChange={(e) => {
                  const next = e.target.value.replace(/\D/g, "").slice(0, CODE_LENGTH);
                  setCode(next);
                  if (error) setError("");
                  // Six digits in (typed, pasted or autofilled): check it straight away.
                  if (next.length === CODE_LENGTH) submitCode(next);
                }}
                aria-invalid={!!error}
                aria-describedby={error ? "code-error" : "code-hint"}
                className="absolute inset-0 h-full w-full cursor-text bg-transparent text-base text-transparent caret-transparent outline-none selection:bg-transparent"
              />
            </div>
            {error ? (
              <p
                id="code-error"
                role="alert"
                className="mt-2 animate-[fade-in_200ms_var(--ease-out)] text-sm text-destructive"
              >
                {tx(error)}
              </p>
            ) : (
              <p id="code-hint" className="mt-2 text-sm text-muted-foreground">
                {t("It can take a minute. Check spam too.")}
              </p>
            )}

            <p className="mt-3 flex flex-wrap items-center gap-x-1 text-sm text-muted-foreground">
              {t("Didn’t get it?")}
              {cooldown > 0 ? (
                <span className="inline-flex min-h-11 items-center font-medium tabular-nums">
                  {t("Send a new code in {n}s", { n: cooldown })}
                </span>
              ) : (
                <button
                  type="button"
                  onClick={resend}
                  disabled={busy}
                  className={`inline-flex min-h-11 items-center rounded-sm font-medium text-primary underline underline-offset-4 disabled:opacity-50 ${focusRing}`}
                >
                  {t("Send a new code")}
                </button>
              )}
            </p>
            {resent && cooldown > 0 && !error && (
              <p
                role="status"
                className="animate-[fade-in_200ms_var(--ease-out)] text-sm font-medium text-success"
              >
                {t("We sent a new code.")}
              </p>
            )}

            {approve && (
              <p
                role="status"
                className="mt-4 flex animate-[pop_250ms_var(--ease-out)_both] gap-3 rounded-xl bg-secondary/15 p-3 text-sm text-pretty ring-1 ring-secondary/40"
              >
                <Smartphone className="mt-0.5 size-5 shrink-0" aria-hidden />
                {t(
                  "New device: open the link we emailed to approve it. This screen continues on its own.",
                )}
              </p>
            )}
            <div className="mt-auto pt-8">
              <button type="submit" disabled={busy} className={action.primary}>
                {busy && <LoaderCircle className="size-5 animate-spin" aria-hidden />}
                {busy ? t("Checking…") : t("Verify and continue")}
              </button>
            </div>
          </form>
        )}
      </div>
    </main>
  );
}
