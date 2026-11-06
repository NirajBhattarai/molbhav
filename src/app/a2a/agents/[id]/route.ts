import { RPC } from "@/lib/a2a/protocol";
import { preflight, stallRpc } from "@/lib/server/a2a/rpc";
import { stallAgent } from "@/lib/server/a2a/stall";

/**
 * One stall agent's A2A endpoint (JSON-RPC 2.0: SendMessage, SendStreamingMessage, GetTask,
 * SubscribeToTask, CancelTask).
 */
export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const agent = await stallAgent((await ctx.params).id);
  if (!agent) {
    return Response.json(
      {
        jsonrpc: "2.0",
        id: null,
        error: { code: RPC.methodNotFound, message: "no stall agent at this address" },
      },
      { status: 404, headers: { "Access-Control-Allow-Origin": "*" } },
    );
  }
  return stallRpc(request, agent);
}

export const OPTIONS = preflight;
