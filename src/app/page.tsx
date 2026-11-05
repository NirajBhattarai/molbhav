export default function Home() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center bg-background px-6 py-16 font-sans">
      <main className="flex w-full max-w-lg flex-col gap-8">
        <header className="rounded-2xl bg-hero px-6 py-8 text-hero-foreground">
          <p className="text-sm font-medium text-hero-success">MolBhav</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">
            Bargain like a bazaar. Pay with trust.
          </h1>
          <p className="mt-3 text-sm text-hero-foreground/80">
            Indigo for actions, marigold for offers, emerald after money moves.
          </p>
        </header>

        <section className="grid gap-3 rounded-2xl border border-border bg-card p-5 text-card-foreground">
          <h2 className="text-sm font-semibold text-muted-foreground">Palette roles</h2>
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
          See <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">docs/colors.md</code>{" "}
          and{" "}
          <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
            docs/research/color-palette.md
          </code>
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
