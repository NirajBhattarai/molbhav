import { NextResponse } from "next/server";
import { registerSignChip } from "@/lib/server/sign-claim";

const STATUS = { bad_chip: 400, bad_secret: 400, forbidden: 403 } as const;

/**
 * Stall sign → after Wi‑Fi: register chip, get a 6-digit claim code (or credentials if already
 * claimed). The sign proves it is the same chip with `X-Claim-Secret`.
 */
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
  const secret = (req.headers.get("x-claim-secret") ?? "").trim().toLowerCase();
  const result = await registerSignChip(chipId, secret);
  if ("error" in result) {
    const status = STATUS[result.error as keyof typeof STATUS] ?? 500;
    return NextResponse.json(result, { status });
  }
  return NextResponse.json(result);
}
