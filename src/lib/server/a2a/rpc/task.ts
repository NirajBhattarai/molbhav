import "server-only";
import { RPC, type StreamResponse, type Task } from "@/lib/a2a/protocol";
import { fail, ok, stream, type Rpc } from "@/lib/server/a2a/rpc/respond";
import { ended, loadTask, saveTask, shown, type Owner } from "@/lib/server/a2a/tasks";

const FOLLOW_MS = 50_000;
const POLL_MS = 800;

const moving = (t: Task) =>
  t.status.state === "TASK_STATE_SUBMITTED" || t.status.state === "TASK_STATE_WORKING";

/** Poll a working task and push status/artifact updates until it settles or times out. */
export async function followTask(
  owner: Owner,
  first: Task,
  send: (e: StreamResponse) => void,
  signal: AbortSignal,
  historyLength?: unknown,
) {
  send({ task: shown(first, historyLength) });
  const { id: taskId, contextId } = first;
  let last = first;
  const until = Date.now() + FOLLOW_MS;
  while (moving(last) && Date.now() < until && !signal.aborted) {
    await new Promise((r) => setTimeout(r, POLL_MS));
    const now = (await loadTask(owner, taskId))?.task;
    if (!now) return;
    for (const artifact of now.artifacts ?? []) {
      if (!last.artifacts?.some((a) => a.artifactId === artifact.artifactId))
        send({ artifactUpdate: { taskId, contextId, artifact, lastChunk: true } });
    }
    if (now.status.timestamp !== last.status.timestamp)
      send({ statusUpdate: { taskId, contextId, status: now.status } });
    last = now;
  }
}

/** GetTask / SubscribeToTask / CancelTask. Returns null if `method` is something else. */
export async function handleTaskMethod(
  request: Request,
  rpc: Rpc,
  owner: Owner,
  method: string,
  params: Record<string, unknown>,
): Promise<Response | null> {
  if (method !== "GetTask" && method !== "SubscribeToTask" && method !== "CancelTask") return null;
  const stored = await loadTask(owner, params.id);
  if (!stored)
    return fail(rpc, RPC.taskNotFound, `no task ${String(params.id)} at this agent`, {
      taskId: String(params.id),
    });
  const { task } = stored;
  if (method === "GetTask") return ok(rpc, shown(task, params.historyLength));
  if (method === "SubscribeToTask") {
    if (ended(task))
      return fail(rpc, RPC.unsupportedOperation, `the task is already ${task.status.state}`, {
        taskId: task.id,
      });
    return stream(rpc, (send) =>
      followTask(owner, task, send, request.signal, params.historyLength),
    );
  }
  const state = task.status.state;
  const canceled: Task = {
    ...task,
    status: { state: "TASK_STATE_CANCELED", timestamp: new Date().toISOString() },
  };
  if (ended(task) || !(await saveTask(owner, { ...stored, task: canceled }, true))) {
    return fail(rpc, RPC.taskNotCancelable, `the task is already ${state}`, { taskId: task.id });
  }
  return ok(rpc, canceled);
}
