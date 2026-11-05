// Applies db/migrations/*.sql in order, once each: `npm run db:migrate` (reads DATABASE_URL from .env.local).
import { readdir, readFile } from "node:fs/promises";
import { neon } from "@neondatabase/serverless";

process.loadEnvFile?.(".env.local");
const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is not set (see .env.example).");
const sql = neon(url);

await sql.query(
  "CREATE TABLE IF NOT EXISTS migrations (name text PRIMARY KEY, at timestamptz NOT NULL DEFAULT now())",
);
const done = new Set((await sql.query("SELECT name FROM migrations")).map((r) => r.name));
const dir = new URL("../db/migrations/", import.meta.url);

for (const name of (await readdir(dir)).filter((f) => f.endsWith(".sql")).sort()) {
  if (done.has(name)) continue;
  const file = await readFile(new URL(name, dir), "utf8");
  // Neon's HTTP driver runs one statement per query: split on ";" at line ends, all in one transaction.
  const statements = file
    .replace(/--.*$/gm, "")
    .split(/;\s*$/m)
    .map((s) => s.trim())
    .filter(Boolean);
  await sql.transaction([
    ...statements.map((s) => sql.query(s)),
    sql.query("INSERT INTO migrations (name) VALUES ($1)", [name]),
  ]);
  console.log("applied", name);
}
console.log("database is up to date");
