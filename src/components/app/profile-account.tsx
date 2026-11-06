"use client";

import { useEffect, useState } from "react";
import { ShieldCheck } from "lucide-react";
import { BlockPrint } from "@/components/brand/block-print";
import { CopyButton } from "@/components/ui/copy-button";
import { useT } from "@/lib/i18n";
import { hashscanAccountUrl, hederaNetwork, hederaWalletAddress, shortAddress } from "@/lib/magic";

/** Account hero + Hedera wallet — same layout as the customer profile in molbhav-old. */
export function ProfileAccount({ email }: { email: string }) {
  const t = useT();
  const [wallet, setWallet] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const network = hederaNetwork();
  const initial = email.charAt(0).toUpperCase() || "?";

  useEffect(() => {
    let live = true;
    hederaWalletAddress()
      .then((addr) => {
        if (live) setWallet(addr);
      })
      .finally(() => {
        if (live) setLoaded(true);
      });
    return () => {
      live = false;
    };
  }, []);

  return (
    <>
      <section
        aria-label={t("Account")}
        className="relative isolate grid animate-[rise_400ms_var(--ease-out)] gap-4 overflow-hidden rounded-3xl bg-hero p-5 text-hero-foreground"
      >
        <BlockPrint className="pointer-events-none absolute inset-0 -z-10 text-secondary opacity-[0.08]" />
        <div className="flex items-center gap-4">
          <span
            aria-hidden
            className="flex size-16 shrink-0 items-center justify-center rounded-full bg-secondary font-display text-2xl font-bold text-secondary-foreground ring-4 ring-hero-foreground/15"
          >
            {initial}
          </span>
          <div className="grid min-w-0 gap-0.5">
            <p className="truncate text-lg font-semibold">{email}</p>
            <p className="text-sm text-hero-foreground/75">{t("Signed in with an email code")}</p>
          </div>
        </div>
        {wallet && (
          <div className="flex items-center justify-between gap-3 rounded-2xl bg-hero-foreground/10 py-1 pr-1 pl-4">
            <a
              href={hashscanAccountUrl(wallet, network)}
              target="_blank"
              rel="noreferrer"
              className="grid min-w-0 flex-1 rounded-xl py-1 transition-colors hover:bg-hero-foreground/10"
            >
              <span className="text-xs text-hero-foreground/75">
                {network === "testnet"
                  ? t("Wallet · Hedera testnet · HashScan")
                  : t("Wallet · Hedera · HashScan")}
              </span>
              <span
                translate="no"
                className="truncate font-mono font-semibold underline-offset-2 hover:underline"
              >
                {shortAddress(wallet)}
              </span>
            </a>
            <CopyButton
              value={wallet}
              label={t("Copy wallet address")}
              className="hover:bg-hero-foreground/15"
            />
          </div>
        )}
        {loaded && !wallet && (
          <p className="text-sm text-hero-foreground/75">
            {t("Your Hedera wallet will show here once Magic has created it for this sign-in.")}
          </p>
        )}
      </section>

      <section className="mt-6">
        <h2 className="mb-2 text-sm font-medium text-muted-foreground">{t("Wallet")}</h2>
        <ul className="divide-y divide-border rounded-xl border border-border bg-card">
          {wallet && (
            <li className="flex items-center gap-3 px-4 py-3">
              <span className="grid min-w-0 flex-1 gap-0.5">
                <span className="text-sm text-muted-foreground">{t("Full address")}</span>
                <a
                  href={hashscanAccountUrl(wallet, network)}
                  target="_blank"
                  rel="noreferrer"
                  translate="no"
                  className="font-mono text-sm break-all underline-offset-2 hover:underline"
                >
                  {wallet}
                </a>
              </span>
              <CopyButton
                value={wallet}
                label={t("Copy full wallet address")}
                className="text-muted-foreground hover:bg-accent"
              />
            </li>
          )}
          <li className="flex items-center gap-3 px-4 py-3">
            <ShieldCheck className="size-5 shrink-0 text-success" aria-hidden />
            <span className="grid min-w-0 flex-1 gap-0.5">
              <span className="font-medium">{t("Only you can spend from it")}</span>
              <span className="text-sm text-muted-foreground">
                {t("Molbhav never sees your keys.")}
              </span>
            </span>
          </li>
        </ul>
        {network === "testnet" && (
          <p className="mt-3 rounded-2xl bg-secondary/15 p-4 text-sm text-pretty">
            {t(
              "You’re on Hedera testnet: everything uses test money, so nothing here costs real funds.",
            )}{" "}
            {t("Need test HBAR?")}{" "}
            <a
              href="https://portal.hedera.com/faucet"
              target="_blank"
              rel="noreferrer"
              className="font-semibold underline underline-offset-2"
            >
              {t("Claim from the Hedera faucet")}
            </a>
            {wallet ? ` — ${t("paste your wallet address there.")}` : "."}
          </p>
        )}
      </section>
    </>
  );
}
