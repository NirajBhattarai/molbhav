import { NextResponse } from "next/server";
import { pollSignClaim } from "@/lib/server/sign-claim";

const STATUS = { bad_chip: 400, bad_secret: 400, forbidden: 403 } as const;

/**
 * Stall sign polls until the shopkeeper enters the OLED code in the app. The secret travels in a
 * header, never the URL, so it stays out of request logs.
 */
export async function GET(req: Request) {
  const chipId = (new URL(req.url).searchParams.get("chip") ?? "").trim().toLowerCase();
  const secret = (req.headers.get("x-claim-secret") ?? "").trim().toLowerCase();
  const result = await pollSignClaim(chipId, secret);
  if ("error" in result) {
    const status = STATUS[result.error as keyof typeof STATUS] ?? 500;
    return NextResponse.json(result, { status });
  }
  return NextResponse.json(result);
}
