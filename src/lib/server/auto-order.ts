import "server-only";
import type { AutoOrder } from "@/lib/limits";
import { AUTO_SECONDS } from "@/lib/limits";
import { AUTO_PAY_WINDOW_MS } from "@/lib/limits";
import { query } from "@/lib/server/db";
import { getLimits, payingBreaks } from "@/lib/server/limits";

/*
 * Order and pay for me: once stalls have answered and auto-agree has taken the cheapest deal,
 * wait AUTO_SECONDS so the buyer can stop, then the buyer's agent pays it in real HBAR over x402
 * from the buyer's own Magic Hedera wallet (src/lib/x402-pay.ts, the same as the Pay button).
 * Magic's key lives only in the buyer's browser, so the open bargain page does the paying; the
 * server decides when, claims each payment once, and records how it went.
 *
 *   plan       the cheapest agreed deal within limits, due AUTO_SECONDS from now     bargains.auto
 *   claimPay   at the end of the countdown, once: { paying } (or { error } if it's no longer ok)
 *   settleDeal (server/x402.ts) on success: { done, paid, settleTx }
 *   payFailed  the wallet couldn't pay: { error, payError }; the buyer can still pay by hand
 * A countdown nobody was there to see end (page closed) is not paid later: after
 * AUTO_PAY_WINDOW_MS the buyer pays it themselves.
 */

/** The longest to wait for lines still on their way to the screen. */
const LINES_MS = 30_000;

type State = { autoOrder: boolean; auto: AutoOrder | null; settled: boolean };

async function stateOf(buyerId: string, id: string): Promise<State | null> {
  const [row] = await query<{ auto_order: boolean; auto: AutoOrder | null; settled: boolean }>(
    `SELECT b.auto_order, b.auto,
       NOT EXISTS (SELECT 1 FROM offers o WHERE o.bargain_id = b.id AND o.status = 'haggling')
       AND NOT EXISTS (SELECT 1 FROM turns t WHERE t.bargain_id = b.id AND t.at > now()) AS settled
     FROM bargains b WHERE b.id = $1::uuid AND b.buyer_id = $2`,
    [id, buyerId],
  );
  return row ? { autoOrder: row.auto_order, auto: row.auto, settled: row.settled } : null;
}

/** Whoever plans first is kept. */
async function plan(buyerId: string, id: string) {
  const offers = await query<{
    stall_id: string;
    name: string;
    status: string;
    current: number | null;
  }>(
    `SELECT o.stall_id, s.name, o.status, o.current
     FROM offers o JOIN stalls s ON s.id = o.stall_id WHERE o.bargain_id = $1::uuid`,
    [id],
  );
  const deals = offers.filter((o) => o.status === "agreed" && o.current !== null);
  const best = deals.toSorted((a, b) => a.current! - b.current!)[0];
  const limits = await getLimits(buyerId);
  const on = limits.autoAgree && limits.autoOrder;
  const theirs = !on || offers.some((o) => o.status === "paid");
  const broken = !theirs && best ? await payingBreaks(buyerId, best.current!) : null;
  const auto: AutoOrder =
    theirs || !best
      ? { skipped: "no-deal" }
      : broken
        ? { skipped: broken.kind, limit: broken.limit }
        : {
            at: Date.now() + AUTO_SECONDS * 1000,
            stallId: best.stall_id,
            stall: best.name,
            total: best.current!,
          };
  await query("UPDATE bargains SET auto = $2 WHERE id = $1::uuid AND auto IS NULL", [
    id,
    JSON.stringify(auto),
  ]);
}

type Due = Extract<AutoOrder, { at: number }>;

/**
 * The agent's turn to pay: claims this bargain's payment once, however many tabs ask. Null when it
 * isn't due, was stopped or claimed already, or the deal is no longer one the agent may pay.
 */
export async function claimPay(
  buyerId: string,
  id: string,
): Promise<{ stallId: string; total: number } | null> {
  const now = Date.now();
  const [claimed] = await query<{ auto: Due }>(
    `UPDATE bargains SET auto = auto || '{"paying": true}'
     WHERE id = $1::uuid AND buyer_id = $2 AND auto_order
       AND jsonb_exists(auto, 'at') AND (auto->>'at')::bigint <= $3 AND (auto->>'at')::bigint >= $4
       AND NOT jsonb_exists_any(auto, ARRAY['stopped', 'done', 'error', 'paying'])
     RETURNING auto`,
    [id, buyerId, now + 1000, now - AUTO_PAY_WINDOW_MS],
  );
  if (!claimed) return null;
  const { stallId, total } = claimed.auto;
  const [deal] = await query<{ status: string; current: number | null; paid: boolean }>(
    `SELECT o.status, o.current,
       EXISTS (SELECT 1 FROM offers p WHERE p.bargain_id = o.bargain_id AND p.status = 'paid') AS paid
     FROM offers o WHERE o.bargain_id = $1::uuid AND o.stall_id = $2`,
    [id, stallId],
  );
  if (
    !deal ||
    deal.paid ||
    deal.status !== "agreed" ||
    deal.current !== total ||
    (await payingBreaks(buyerId, total))
  ) {
    await query(
      `UPDATE bargains SET auto = (auto - 'paying') || '{"error": true}' WHERE id = $1::uuid`,
      [id],
    );
    return null;
  }
  return { stallId, total };
}

/** The buyer's wallet couldn't pay the claimed deal; the buyer can still pay it from the chat. */
export async function payFailed(
  buyerId: string,
  id: string,
  payError: string,
  payAccount?: string,
) {
  const why = {
    error: true,
    payError: payError.slice(0, 300),
    payAccount: payAccount?.slice(0, 40),
  };
  await query(
    `UPDATE bargains SET auto = (auto - 'paying') || $3::jsonb
     WHERE id = $1::uuid AND buyer_id = $2 AND jsonb_exists(auto, 'paying')`,
    [id, buyerId, JSON.stringify(why)],
  );
}

/** A settled x402 payment for this bargain's planned deal: the agent's order is done. */
export async function orderPaid(id: string, stallId: string, settleTx: string) {
  await query(
    `UPDATE bargains SET auto = (auto - 'paying' - 'error' - 'payError' - 'payAccount') || $3::jsonb
     WHERE id = $1::uuid AND jsonb_exists(auto, 'at') AND auto->>'stallId' = $2`,
    [id, stallId, JSON.stringify({ done: true, paid: true, settleTx, x402: true })],
  );
}

/** Plans this bargain's order once the agents have finished (`talked`), if it has none yet. */
export async function autoOrderStep(buyerId: string, id: string, talked = false) {
  const state = await stateOf(buyerId, id);
  if (!state?.autoOrder || state.auto) return;
  if (talked || state.settled) await plan(buyerId, id);
}

/** Run after the talk: waits for the last lines, then plans the order (the page pays it). */
export async function orderForBuyer(buyerId: string, id: string) {
  const until = Date.now() + LINES_MS;
  let state = await stateOf(buyerId, id);
  if (!state?.autoOrder) return;
  while (!state?.settled && Date.now() < until) {
    await new Promise((r) => setTimeout(r, 500));
    state = await stateOf(buyerId, id);
  }
  await autoOrderStep(buyerId, id, true);
}

/** The buyer stops their agent ordering this bargain. */
export async function stopOrder(buyerId: string, id: string) {
  await query(
    `UPDATE bargains SET auto = auto || '{"stopped": true}'
     WHERE id = $1::uuid AND buyer_id = $2 AND jsonb_exists(auto, 'at')
       AND NOT jsonb_exists_any(auto, ARRAY['done', 'paying'])`,
    [id, buyerId],
  );
}
