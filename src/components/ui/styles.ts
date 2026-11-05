const base =
  "inline-flex h-12 w-full items-center justify-center gap-2 rounded-full px-5 text-base font-semibold transition-[transform,background-color] duration-150 ease-out outline-none select-none focus-visible:ring-3 focus-visible:ring-ring/50 active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50";

export const action = {
  primary: `${base} bg-primary text-primary-foreground hover:bg-primary/90`,
  secondary: `${base} bg-secondary text-secondary-foreground hover:bg-secondary/90`,
  outline: `${base} border border-input bg-card text-foreground hover:bg-muted`,
};

export const focusRing = "outline-none focus-visible:ring-3 focus-visible:ring-ring/50";

export const pressable = `transition-[transform,background-color] duration-150 ease-out hover:bg-muted/40 active:scale-[0.98] ${focusRing}`;

const roleBase =
  "inline-flex h-12 items-center justify-center gap-2 rounded-lg px-5 font-semibold transition-[transform,background-color,opacity] duration-150 ease-out active:scale-[0.97] disabled:pointer-events-none disabled:opacity-60";

export const primaryButton = `${roleBase} bg-primary text-primary-foreground hover:bg-primary/90`;
export const outlineButton = `${roleBase} border border-input bg-card text-card-foreground hover:bg-accent`;
