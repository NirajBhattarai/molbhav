import { A2A_VERSION } from "@/lib/a2a/protocol";
import { preflight } from "@/lib/server/a2a/http";
import { stallAgent } from "@/lib/server/a2a/stall";

/**
 * Stall agent JSON-RPC endpoint. Card discovery is live; bargaining methods land next.
 * Outside agents get a clear -32601 until SendMessage is wired.
 */
export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const agent = await stallAgent((await ctx.params).id);
  let id: string | number | null = null;
  try {
    const body = (await request.json()) as { id?: string | number | null };
    if (body && "id" in body) id = body.id ?? null;
  } catch {
    /* ignore bad JSON; still answer JSON-RPC shape */
  }
  if (!agent) {
    return Response.json(
      {
        jsonrpc: "2.0",
        id,
        error: { code: -32601, message: "no stall agent at this address" },
      },
      { status: 404, headers: { "Access-Control-Allow-Origin": "*", "A2A-Version": A2A_VERSION } },
    );
  }
  return Response.json(
    {
      jsonrpc: "2.0",
      id,
      error: {
        code: -32601,
        message: "stall bargaining over A2A is not enabled yet; Agent Card discovery works",
      },
    },
    {
      status: 501,
      headers: { "Access-Control-Allow-Origin": "*", "A2A-Version": A2A_VERSION },
    },
  );
}

export const OPTIONS = preflight;
