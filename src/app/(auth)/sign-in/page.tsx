"use client";

import { useRef, useState, type FormEvent } from "react";
import { ArrowRight } from "lucide-react";
import { BlockPrint } from "@/components/brand/block-print";
import { LogoMark } from "@/components/brand/logo";
import { action, focusRing } from "@/components/ui/styles";
import { startSession } from "@/lib/auth-actions";
import { useT, useTx, type Text } from "@/lib/i18n";
import { OtpError, startEmailOtp, type OtpEvent, type OtpSession } from "@/lib/magic";
import { enterApp } from "@/lib/role";

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
  const emailRef = useRef<HTMLInputElement>(null);
  const codeRef = useRef<HTMLInputElement>(null);
  const otp = useRef<OtpSession | null>(null);

  function onEvent(e: OtpEvent) {
    switch (e.type) {
      case "code-sent":
        setBusy(false);
        setStep("code");
        return;
      case "invalid-code":
        setBusy(false);
        setCode("");
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

  async function sendCode(e: FormEvent) {
    e.preventDefault();
    const address = email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) {
      setError("Enter an email address, like priya@example.com.");
      return emailRef.current?.focus();
    }
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
    if (!/^\d{6}$/.test(code)) {
      setError("The code has 6 digits. Check your email.");
      return codeRef.current?.focus();
    }
    setError("");
    setBusy(true);
    otp.current?.submit(code);
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col">
      <section
        className={`relative overflow-hidden bg-hero px-6 pt-[max(1.5rem,env(safe-area-inset-top))] text-hero-foreground sm:mt-6 sm:rounded-2xl ${
          step === "email" ? "pb-10" : "pb-6"
        }`}
      >
        <BlockPrint className="pointer-events-none absolute inset-0 text-secondary opacity-15" />
        <div className="relative">
          <span
            translate="no"
            className="inline-flex items-center gap-2 font-display text-xl font-bold"
          >
            <LogoMark className="h-7 w-auto" />
            Molbhav
          </span>
          {step === "email" && (
            <h1 className="mt-6 font-display text-[1.75rem] leading-[1.1] font-bold tracking-tight text-balance">
              {t("Say what you want. Your agent bargains.")}
            </h1>
          )}
        </div>
      </section>

      <div className="flex flex-1 flex-col px-6 pt-8 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
        {step === "email" ? (
          <form onSubmit={sendCode} noValidate className="flex flex-1 flex-col">
            <label htmlFor="email" className="text-sm font-medium">
              {t("Email")}
            </label>
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
              className="mt-2 h-12 rounded-lg border border-input bg-card px-3 text-base outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            />
            {error && (
              <p id="email-error" role="alert" className="mt-2 text-sm text-destructive">
                {tx(error)}
              </p>
            )}
            <p className="mt-2 text-sm text-muted-foreground">
              {t("We email you a 6-digit code.")}
            </p>
            <button
              type="submit"
              disabled={busy}
              className={`${action.primary} mt-auto disabled:opacity-60`}
            >
              {busy ? t("Sending…") : t("Send code")}
              {!busy && <ArrowRight className="size-5" aria-hidden />}
            </button>
          </form>
        ) : (
          <form onSubmit={verify} noValidate className="flex flex-1 flex-col">
            <h1 className="font-display text-2xl font-bold">{t("Enter the code")}</h1>
            <p className="mt-1 [overflow-wrap:anywhere] text-muted-foreground">
              {t("Sent to {email}.", { email: email.trim() })}{" "}
              <button
                type="button"
                onClick={() => {
                  otp.current?.cancel();
                  otp.current = null;
                  setStep("email");
                  setCode("");
                  setError("");
                  setBusy(false);
                  setApprove(false);
                }}
                className={`rounded-sm font-medium text-primary underline underline-offset-4 ${focusRing}`}
              >
                {t("Change")}
              </button>
            </p>
            <label htmlFor="code" className="mt-6 text-sm font-medium">
              {t("6-digit code")}
            </label>
            <input
              ref={codeRef}
              id="code"
              name="code"
              spellCheck={false}
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              autoFocus
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
              aria-invalid={!!error}
              aria-describedby={error ? "code-error" : undefined}
              className="mt-2 h-14 rounded-lg border border-input bg-card text-center font-mono text-2xl tracking-[0.5em] outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            />
            {error && (
              <p id="code-error" role="alert" className="mt-2 text-sm text-destructive">
                {tx(error)}
              </p>
            )}
            {approve && (
              <p role="status" className="mt-4 rounded-lg bg-muted p-3 text-sm">
                {t(
                  "New device: open the link we emailed to approve it. This screen continues on its own.",
                )}
              </p>
            )}
            <button
              type="submit"
              disabled={busy}
              className={`${action.primary} mt-auto disabled:opacity-60`}
            >
              {busy ? t("Checking…") : t("Verify and continue")}
            </button>
          </form>
        )}
      </div>
    </main>
  );
}
