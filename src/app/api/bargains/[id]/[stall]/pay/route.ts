import { revalidatePath } from "next/cache";
import {
  decodePaymentSignatureHeader,
  encodePaymentRequiredHeader,
  encodePaymentResponseHeader,
} from "@x402/core/http";
import { currentSession } from "@/lib/server/auth";
import { isBargainId, refreshChat } from "@/lib/server/bargains";
import { quoteDeal, settleDeal } from "@/lib/server/x402";

/*
 * x402 for one agreed deal (docs/x402.md):
 *   GET   → 402, PAYMENT-REQUIRED: pay the stall `amount` USDC on Hedera (fees on the facilitator)
 *   POST  with PAYMENT-SIGNATURE (the buyer's signed transfer) → 200, PAYMENT-RESPONSE, deal paid
 * Only the buyer of the bargain can see or pay it.
 */

type Ctx = { params: Promise<{ id: string; stall: string }> };

async function who(ctx: Ctx) {
  const { id, stall } = await ctx.params;
  if (!isBargainId(id) || !stall)
    return { error: Response.json({ error: "Not found" }, { status: 404 }) };
  const session = await currentSession();
  if (!session) return { error: Response.json({ error: "Sign in to pay" }, { status: 401 }) };
  return { id, stall, buyer: session.user };
}

export async function GET(_request: Request, ctx: Ctx) {
  const w = await who(ctx);
  if ("error" in w) return w.error;
  const quote = await quoteDeal(w.id, w.stall, w.buyer);
  if (!quote.ok) return Response.json({ error: quote.error }, { status: quote.status });
  return Response.json(quote.required, {
    status: 402,
    headers: {
      "PAYMENT-REQUIRED": encodePaymentRequiredHeader(quote.required),
      "Cache-Control": "private, no-store",
    },
  });
}

export async function POST(request: Request, ctx: Ctx) {
  const w = await who(ctx);
  if ("error" in w) return w.error;
  const header = request.headers.get("PAYMENT-SIGNATURE");
  if (!header) return GET(request, ctx);

  let payment;
  try {
    payment = decodePaymentSignatureHeader(header);
  } catch {
    return Response.json({ error: "That payment couldn't be read." }, { status: 400 });
  }

  const result = await settleDeal(w.id, w.stall, w.buyer, payment).catch((err: unknown) => {
    console.error("x402 settle", w.id, w.stall, err);
    return {
      ok: false as const,
      status: 502,
      error: "The payment service didn't answer. Try again.",
    };
  });
  if (!result.ok) {
    const reason = "reason" in result ? result.reason : undefined;
    return Response.json({ error: result.error, reason }, { status: result.status });
  }

  await refreshChat(w.id, w.stall);
  revalidatePath(`/bargains/${w.id}`);
  revalidatePath(`/bargains/${w.id}/${w.stall}`);
  return Response.json(result, {
    headers: {
      "PAYMENT-RESPONSE": encodePaymentResponseHeader({
        success: true,
        transaction: result.transaction,
        network: result.network,
        payer: result.payer ?? undefined,
        amount: result.amount,
      }),
    },
  });
}
