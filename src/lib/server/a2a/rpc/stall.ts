import "server-only";
import { RPC } from "@/lib/a2a/protocol";
import { extensionUri } from "@/lib/a2a/extensions";
import { originOf } from "@/lib/server/a2a/http";
import { A2aError, type StallAgent } from "@/lib/server/a2a/stall";
import { readRpc } from "@/lib/server/a2a/rpc/read";
import { fail } from "@/lib/server/a2a/rpc/respond";
import { handleStallSend } from "@/lib/server/a2a/rpc/stall-send";
import { handleTaskMethod } from "@/lib/server/a2a/rpc/task";

const NOT_OFFERED: Record<string, [number, string]> = {
  SetTaskPushNotificationConfig: [
    RPC.pushNotificationNotSupported,
    "push notifications aren't supported",
  ],
  GetTaskPushNotificationConfig: [
    RPC.pushNotificationNotSupported,
    "push notifications aren't supported",
  ],
  ListTaskPushNotificationConfig: [
    RPC.pushNotificationNotSupported,
    "push notifications aren't supported",
  ],
  DeleteTaskPushNotificationConfig: [
    RPC.pushNotificationNotSupported,
    "push notifications aren't supported",
  ],
};

/** One stall agent's JSON-RPC endpoint. */
export async function stallRpc(request: Request, agent: StallAgent): Promise<Response> {
  const base = originOf(request);
  const read = await readRpc(request, extensionUri(base, "bargain"));
  if (read instanceof Response) return read;
  const { rpc, method, params, from } = read;

  try {
    const taskReply = await handleTaskMethod(request, rpc, agent.stallId, method, params);
    if (taskReply) return taskReply;

    if (method === "SendMessage" || method === "SendStreamingMessage")
      return handleStallSend(rpc, agent, base, method, params, from);

    const [code, why] = NOT_OFFERED[method] ?? [RPC.methodNotFound, `unknown method ${method}`];
    return fail(rpc, code, why);
  } catch (err) {
    if (err instanceof A2aError) return fail(rpc, err.code, err.message, err.metadata);
    console.error("a2a stall", agent.agentId, err);
    return fail(rpc, RPC.internal, "the agent failed; try again");
  }
}
