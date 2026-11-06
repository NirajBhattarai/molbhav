import { NextResponse } from "next/server";
import { registerSignChip } from "@/lib/server/sign-claim";

/** Stall sign → after Wi‑Fi: register chip, get a 6-digit claim code (or credentials if already claimed). */
export async function POST(req: Request) {
  let body: { chipId?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const chipId = String(body.chipId ?? "")
    .trim()
    .toLowerCase();
  const result = await registerSignChip(chipId);
  if ("error" in result) {
    const status = result.error === "bad_chip" ? 400 : 500;
    return NextResponse.json(result, { status });
  }
  return NextResponse.json(result);
}
