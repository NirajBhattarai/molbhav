import "server-only";
import { GeminiRateLimited, geminiConfigured, geminiJSON, type Schema } from "@/lib/server/gemini";

/*
 * Shared Gemini helpers for agent wording: call wrapper, speech schema, price checks.
 * Floor / budget never go in prompts (callers own that).
 */

const QUIET_MS = 60_000;
let quietUntil = 0;

/** Calls Gemini unless it's off or resting after a rate limit; null on any failure. */
export async function ask<T>(opts: Parameters<typeof geminiJSON<T>>[0]): Promise<T | null> {
  if (!geminiConfigured() || Date.now() < quietUntil) return null;
  try {
    return await geminiJSON({ temperature: 0.7, timeoutMs: 10_000, thinking: "low", ...opts });
  } catch (err) {
    if (err instanceof GeminiRateLimited) quietUntil = Date.now() + QUIET_MS;
    return null;
  }
}

/** Strips the fences from the other side's words, so they can't close them early. */
export const fenced = (text: string) => text.replace(/<\/?[a-z_]+>/gi, "").slice(0, 300);

export type Turn = { from: "buyer" | "stall"; text: string };

export const transcript = (turns: Turn[], me: Turn["from"]) =>
  turns
    .slice(-8)
    .map(
      (t) => `${t.from === me ? "You" : me === "stall" ? "Customer" : "Stall"}: ${fenced(t.text)}`,
    )
    .join("\n");

/** The prices a line names (₹2,300 → 2300), ignoring small numbers such as quantities. */
export const pricesIn = (line: string) =>
  (line.replace(/(\d),(?=\d)/g, "$1").match(/\d+/g) ?? []).map(Number).filter((n) => n >= 20);

/**
 * Languages to say a line in. Without them, one line in the other side's language (A2A).
 */
export type Speak = { code: string; name: string }[];
export type Spoken = { line: string; said?: Record<string, string> };

/** The schema for what's said: one `line`, or `said` with one line per language. */
export function saying(speak: Speak | undefined): Record<string, Schema> {
  return speak?.length
    ? {
        said: {
          type: "OBJECT" as const,
          description: "What you say, the same line in each language, each in its own script",
          properties: Object.fromEntries(
            speak.map((l) => [l.code, { type: "STRING" as const, description: `In ${l.name}` }]),
          ),
          required: speak.map((l) => l.code),
        },
      }
    : { line: { type: "STRING" as const, description: "What you say" } };
}

/**
 * Reads what was said, and checks every version names `must` (when given) and no price outside
 * `allowed`; null rejects it (Gemini is then asked once more).
 */
export function spoken(
  v: unknown,
  speak: Speak | undefined,
  must: number | undefined,
  allowed: number[],
): Spoken | null {
  const out = v as { line?: unknown; said?: Record<string, unknown> };
  const lines = speak?.length ? speak.map((l) => out?.said?.[l.code]) : [out?.line];
  const ok = lines.every((t) => {
    if (typeof t !== "string" || !t.trim() || t.length > 400) return false;
    const named = pricesIn(t);
    return (must === undefined || named.includes(must)) && named.every((n) => allowed.includes(n));
  });
  if (!ok) return null;
  const said = speak?.length
    ? Object.fromEntries(speak.map((l, i) => [l.code, (lines[i] as string).trim()]))
    : undefined;
  return { line: (lines[0] as string).trim(), ...(said && { said }) };
}

/** How to talk; `language` says whose language to answer in. */
export const speech = (language: string, speak?: Speak) =>
  `One or two short spoken sentences, at most 25 words, ${
    speak?.length ? `written in each of: ${speak.map((l) => l.name).join(", ")}` : `in ${language}`
  }. Write prices as ₹ and Western digits. No emoji, no stage directions, nothing repeated from ` +
  "earlier in the conversation.";
