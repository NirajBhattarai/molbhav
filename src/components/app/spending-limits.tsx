"use client";

import { startTransition, useActionState, useState, type FormEvent } from "react";
import { action, focusRing } from "@/components/ui/styles";
import { useT, type Msg } from "@/lib/i18n";
import { saveSpendingLimits } from "@/lib/limit-actions";
import { AUTO_SECONDS, type Limits } from "@/lib/limits";
import { useRole } from "@/lib/role";

/** The most a buyer lets themselves pay, on Profile. */
export function SpendingLimits({ limits }: { limits: Limits }) {
  const t = useT();
  const role = useRole();
  const [result, save, saving] = useActionState(saveSpendingLimits, null);
  // Paying needs agreeing: Pay on turns Agree on, and Agree off turns Pay off.
  const [autoAgree, setAutoAgree] = useState(limits.autoAgree);
  const [autoOrder, setAutoOrder] = useState(limits.autoAgree && limits.autoOrder);
  const agree = (on: boolean) => {
    setAutoAgree(on);
    if (!on) setAutoOrder(false);
  };
  const pay = (on: boolean) => {
    setAutoOrder(on);
    if (on) setAutoAgree(true);
  };
  if (role !== "buyer") return null;

  // Not `action={save}`: React resets a form after that, and what they typed would vanish.
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fields = new FormData(e.currentTarget);
    startTransition(() => save(fields));
  }

  return (
    <form onSubmit={submit} className="mt-6 grid gap-4 rounded-xl border border-border bg-card p-4">
      <div>
        <h2 className="font-medium">{t("Spending limits")}</h2>
        <p className="text-sm text-pretty text-muted-foreground">
          {t(
            "Your agent stays within these, and you can’t pay over them. Leave one empty for no limit.",
          )}
        </p>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Rupees name="perOrder" label="Most for one order" value={limits.perOrder} />
        <Rupees name="perDay" label="Most in one day" value={limits.perDay} />
      </div>
      <div className="grid gap-4 border-t border-border pt-4">
        <Toggle
          id="auto-agree"
          name="autoAgree"
          on={autoAgree}
          onChange={agree}
          label={t("Agree the cheapest deal")}
          hint={t(
            "Your agent says yes to the cheapest stall for you. Off, it brings the price down and you decide.",
          )}
        />
        <div className="ml-1 border-l-2 border-border pl-3">
          <Toggle
            id="auto-order"
            name="autoOrder"
            on={autoOrder}
            onChange={pay}
            label={t("Pay for me")}
            hint={t(
              "Then your agent pays for that deal in HBAR by x402, within your limits. You get {seconds} seconds to stop it.",
              { seconds: AUTO_SECONDS },
            )}
          />
        </div>
      </div>
      {!saving && result && "error" in result && (
        <p role="alert" className="text-sm font-medium text-destructive">
          {t(result.error)}
        </p>
      )}
      {!saving && result && "saved" in result && (
        <p role="status" className="text-sm font-medium text-success">
          {t("Limits saved.")}
        </p>
      )}
      <button type="submit" disabled={saving} className={`${action.outline} disabled:opacity-60`}>
        {t(saving ? "Saving…" : "Save limits")}
      </button>
    </form>
  );
}

/** One switch with its label and what it lets the agent do; posted as a hidden "on" field. */
function Toggle({
  id,
  name,
  on,
  onChange,
  label,
  hint,
}: {
  id: string;
  name: string;
  on: boolean;
  onChange: (on: boolean) => void;
  label: string;
  hint: string;
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <span className="min-w-0">
        <span id={id} className="block font-medium">
          {label}
        </span>
        <span id={`${id}-hint`} className="block text-sm text-pretty text-muted-foreground">
          {hint}
        </span>
      </span>
      <input type="hidden" name={name} value={on ? "on" : ""} />
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-labelledby={id}
        aria-describedby={`${id}-hint`}
        onClick={() => onChange(!on)}
        className={`${focusRing} relative inline-flex h-5 w-9 shrink-0 items-center rounded-full border border-transparent transition-colors ${
          on ? "bg-primary" : "bg-input"
        }`}
      >
        <span
          aria-hidden
          className={`block size-4 rounded-full bg-background shadow transition-transform ${
            on ? "translate-x-4" : "translate-x-0.5"
          }`}
        />
      </button>
    </div>
  );
}

function Rupees({ name, label, value }: { name: string; label: Msg; value: number | null }) {
  const t = useT();
  return (
    <label className="grid gap-1.5 text-sm font-semibold">
      {t(label)}
      <span className="flex h-12 items-center gap-1 rounded-lg border border-input bg-background px-3 focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50">
        <span aria-hidden className="text-base font-normal text-muted-foreground">
          ₹
        </span>
        <input
          name={name}
          defaultValue={value ?? ""}
          inputMode="numeric"
          autoComplete="off"
          enterKeyHint="done"
          className="w-full min-w-0 bg-transparent text-base font-normal tabular-nums outline-none"
        />
      </span>
    </label>
  );
}
