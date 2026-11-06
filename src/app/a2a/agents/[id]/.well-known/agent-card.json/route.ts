import { originOf, preflight, publicJson } from "@/lib/server/a2a/http";
import { agentCard, stallAgent } from "@/lib/server/a2a/stall";

/** One stall agent's A2A Agent Card (under the agent's `.well-known`). */
export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const agent = await stallAgent((await ctx.params).id);
  if (!agent)
    return Response.json(
      { error: "no stall agent at this address" },
      { status: 404, headers: { "Access-Control-Allow-Origin": "*" } },
    );
  return publicJson(request, agentCard(agent, originOf(request)));
}

export const OPTIONS = preflight;
