import type { Msg } from "@/lib/i18n/catalog";

/** The agent's last line when a price is ready for the buyer: the chat shows Agree after it. */
export const HANDED_OFF =
  "I've brought it down to {price}. It's your call now: tap Agree to take it." satisfies Msg;

export type OfferStatus = "waiting" | "haggling" | "declined" | "agreed" | "paid";

/** How an offer's status reads to the buyer: a label and its chip colour. */
export function statusChip(status: OfferStatus, best: boolean): { label: Msg; className: string } {
  switch (status) {
    case "agreed":
      return { label: "Deal agreed", className: "bg-success text-success-foreground" };
    case "paid":
      return { label: "Paid", className: "bg-success text-success-foreground" };
    case "declined":
      return { label: "Said no", className: "bg-muted text-muted-foreground" };
    default:
      return best
        ? { label: "Best offer", className: "bg-success text-success-foreground" }
        : { label: "Haggling", className: "bg-secondary text-secondary-foreground" };
  }
}

/** Still being talked over. */
export const isOpen = (status: OfferStatus) => status === "waiting" || status === "haggling";

/** Lowest price among offers still going or agreed. */
export function bestPrice(offers: { status: OfferStatus; current: number | null }[]) {
  const prices = offers
    .filter((o) => o.status !== "declined" && o.current !== null)
    .map((o) => o.current as number);
  return prices.length ? Math.min(...prices) : null;
}
