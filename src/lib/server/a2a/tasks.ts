import "server-only";
import { TERMINAL, type Task } from "@/lib/a2a/protocol";
import { query } from "@/lib/server/db";
import { redis, redisConfigured } from "@/lib/server/redis";
import type { Stored } from "@/lib/server/a2a/stall";

/*
 * A2A tasks: Postgres durable; Redis in front when configured.
 */

const TASK_TTL_SECONDS = 3600;

/** Whose task: a stall's id. */
export type Owner = string | null;

type Cached = Stored & { owner: Owner };

const TERMINAL_SQL = TERMINAL.map((s) => `'${s}'`).join(", ");
const taskKey = (taskId: string) => `a2a-task:${taskId}`;

export async function loadTask(owner: Owner, taskId: unknown): Promise<Stored | undefined> {
  if (typeof taskId !== "string" || !taskId) return undefined;

  if (redisConfigured()) {
    try {
      const raw = await (await redis()).get(taskKey(taskId));
      if (raw) {
        const cached = JSON.parse(raw) as Cached;
        if ((cached.owner ?? null) === (owner ?? null)) {
          return { task: cached.task, state: cached.state };
        }
      }
    } catch {
      /* fall through to Postgres */
    }
  }

  const [row] = await query<Stored>(
    `SELECT task, state FROM a2a_tasks
     WHERE id = $1 AND stall_id IS NOT DISTINCT FROM $2 AND expires_at > now()`,
    [taskId, owner],
  );
  if (!row) return undefined;
  if (redisConfigured()) {
    await (
      await redis()
    )
      .set(taskKey(taskId), JSON.stringify({ ...row, owner } satisfies Cached), {
        EX: TASK_TTL_SECONDS,
      })
      .catch(() => {});
  }
  return row;
}

export async function saveTask(owner: Owner, stored: Stored, unlessEnded = false) {
  const rows = await query<{ id: string }>(
    `INSERT INTO a2a_tasks (id, stall_id, context_id, task, state, expires_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, now() + make_interval(secs => $6), now())
     ON CONFLICT (id) DO UPDATE SET task = EXCLUDED.task, state = EXCLUDED.state,
       expires_at = EXCLUDED.expires_at, updated_at = now()
     ${unlessEnded ? `WHERE a2a_tasks.task->'status'->>'state' NOT IN (${TERMINAL_SQL})` : ""}
     RETURNING id`,
    [
      stored.task.id,
      owner,
      stored.task.contextId,
      JSON.stringify(stored.task),
      stored.state && JSON.stringify(stored.state),
      TASK_TTL_SECONDS,
    ],
  );
  if (Math.random() < 0.01) await query("DELETE FROM a2a_tasks WHERE expires_at < now()");
  if (!rows.length) return false;
  if (redisConfigured()) {
    await (
      await redis()
    )
      .set(taskKey(stored.task.id), JSON.stringify({ ...stored, owner } satisfies Cached), {
        EX: TASK_TTL_SECONDS,
      })
      .catch(() => {});
  }
  return true;
}

export function shown(task: Task, historyLength?: unknown): Task {
  const n =
    typeof historyLength === "number" && historyLength >= 0 ? Math.floor(historyLength) : undefined;
  if (n === undefined) return task;
  const { history, ...rest } = task;
  return n === 0 ? rest : { ...rest, history: history?.slice(-n) };
}

export const ended = (task: Task) => TERMINAL.includes(task.status.state);
