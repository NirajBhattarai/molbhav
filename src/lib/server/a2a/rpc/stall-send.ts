import "server-only";
import { RPC, type Message, type SendMessageConfiguration } from "@/lib/a2a/protocol";
import { type InternalRole } from "@/lib/server/a2a/keys";
import { fail, ok, stream, type Rpc } from "@/lib/server/a2a/rpc/respond";
import { stallTurn, type StallAgent } from "@/lib/server/a2a/stall";
import { shown } from "@/lib/server/a2a/tasks";

/** `params.message` when it is a ROLE_USER message with parts. */
export function userMessageOf(params: Record<string, unknown>): Message | null {
  const message = params.message as Message | undefined;
  return message && message.role === "ROLE_USER" && Array.isArray(message.parts) ? message : null;
}

/** SendMessage / SendStreamingMessage → one stall turn. */
export async function handleStallSend(
  rpc: Rpc,
  agent: StallAgent,
  base: string,
  method: "SendMessage" | "SendStreamingMessage",
  params: Record<string, unknown>,
  from: InternalRole | null,
): Promise<Response> {
  const message = userMessageOf(params);
  const options = (params.configuration ?? {}) as SendMessageConfiguration;
  if (!message)
    return fail(rpc, RPC.invalidParams, "params.message must be a ROLE_USER message with parts");
  const { task } = await stallTurn(agent, base, message, from);
  if (method === "SendMessage") return ok(rpc, { task: shown(task, options.historyLength) });
  return stream(rpc, async (send) => {
    const { id: taskId, contextId } = task;
    send({
      task: shown(
        {
          id: taskId,
          contextId,
          status: { state: "TASK_STATE_WORKING", timestamp: task.status.timestamp },
          history: task.history?.slice(0, -1),
        },
        options.historyLength,
      ),
    });
    for (const artifact of task.artifacts ?? [])
      send({ artifactUpdate: { taskId, contextId, artifact, lastChunk: true } });
    send({ statusUpdate: { taskId, contextId, status: task.status } });
  });
}
