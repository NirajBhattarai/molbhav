import "server-only";
import { neon, type NeonQueryFunction } from "@neondatabase/serverless";

// Postgres on Neon over HTTP: one request per query. Parameterised SQL only.

let client: NeonQueryFunction<false, false> | undefined;

function sql() {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) throw new Error("DATABASE_URL is not set (see .env.example).");
  return (client ??= neon(url));
}

export async function query<T>(text: string, params: unknown[] = []): Promise<T[]> {
  return (await sql().query(text, params)) as T[];
}

/** Runs the statements in order, in one transaction. */
export async function transaction(statements: { text: string; params?: unknown[] }[]) {
  const s = sql();
  await s.transaction(statements.map((st) => s.query(st.text, st.params ?? [])));
}
