import "server-only";
import { agreeOfferFor } from "@/lib/server/bargains";
import { query } from "@/lib/server/db";
import { payingBreaks } from "@/lib/server/limits";

/*
 * After stall seeds hand off, auto-agree takes the cheapest held price (or leaves them for the buyer).
 * Does not port preview's live takeover / mid-talk join — only the post-seed decide step.
 */

/** Agree the cheapest handed-off deal when this bargain was started with auto_agree. */
export async function decideBargain(bargainId: string, buyerId: string) {
  const [b] = await query<{ auto_agree: boolean; agreed: boolean }>(
    `SELECT b.auto_agree,
            EXISTS (
              SELECT 1 FROM offers o
              WHERE o.bargain_id = b.id AND o.status IN ('agreed', 'paid')
            ) AS agreed
     FROM bargains b WHERE b.id = $1::uuid AND b.buyer_id = $2`,
    [bargainId, buyerId],
  );
  if (!b?.auto_agree || b.agreed) return;

  const [best] = await query<{ stall_id: string; current: number }>(
    `SELECT stall_id, current FROM offers
     WHERE bargain_id = $1::uuid AND status = 'haggling' AND current IS NOT NULL
     ORDER BY current, stall_id
     LIMIT 1`,
    [bargainId],
  );
  if (!best) return;
  if (await payingBreaks(buyerId, best.current)) return;

  await agreeOfferFor(buyerId, bargainId, best.stall_id);
}
