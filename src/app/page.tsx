import { BlockPrint } from "@/components/brand/block-print";
import { Logo } from "@/components/brand/logo";

export default function Home() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center bg-background px-6 py-16 font-sans">
      <main className="flex w-full max-w-lg flex-col gap-8">
        <header className="relative overflow-hidden rounded-2xl bg-hero px-6 py-8 text-hero-foreground">
          <BlockPrint className="pointer-events-none absolute inset-0 text-hero-foreground/10" />
          <div className="relative">
            <Logo className="text-hero-foreground" />
            <h1 className="mt-4 font-display text-3xl font-semibold tracking-tight">
              Bargain like a bazaar. Pay with trust.
            </h1>
            <p className="mt-3 text-sm text-hero-foreground/80">
              Indigo for actions, marigold for offers, emerald after money moves.
            </p>
          </div>
        </header>

        <section className="grid gap-3 rounded-2xl border border-border bg-card p-5 text-card-foreground">
          <div className="flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/brand/molbhav-icon.svg" alt="" width={48} height={48} className="size-12" />
            <div>
              <h2 className="font-display text-base font-semibold">Brand mark</h2>
              <p className="text-sm text-muted-foreground">Two bubbles meet in a deal.</p>
            </div>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <Swatch name="primary" className="bg-primary text-primary-foreground" />
            <Swatch name="secondary" className="bg-secondary text-secondary-foreground" />
            <Swatch name="success" className="bg-success text-success-foreground" />
            <Swatch name="destructive" className="bg-destructive text-destructive-foreground" />
          </div>
        </section>

        <div className="flex flex-col gap-3 sm:flex-row">
          <button
            type="button"
            className="inline-flex h-12 flex-1 items-center justify-center rounded-full bg-primary px-5 text-sm font-semibold text-primary-foreground transition-[transform,background-color] duration-150 ease-out active:scale-[0.97]"
          >
            Primary action
          </button>
          <button
            type="button"
            className="inline-flex h-12 flex-1 items-center justify-center rounded-full border border-input bg-card px-5 text-sm font-semibold text-foreground transition-[transform,background-color] duration-150 ease-out hover:bg-accent active:scale-[0.97]"
          >
            Secondary
          </button>
        </div>

        <p className="text-center text-sm text-muted-foreground">
          See{" "}
          <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">docs/brand.md</code>{" "}
          and{" "}
          <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">docs/colors.md</code>
        </p>
      </main>
    </div>
  );
}

function Swatch({ name, className }: { name: string; className: string }) {
  return (
    <div className={`flex h-14 items-end rounded-xl px-3 py-2 text-xs font-medium ${className}`}>
      {name}
    </div>
  );
}
