import { NextResponse } from "next/server";
import { pollSignClaim } from "@/lib/server/sign-claim";

/** Stall sign polls until the shopkeeper enters the OLED code in the app. */
export async function GET(req: Request) {
  const chipId = (new URL(req.url).searchParams.get("chip") ?? "").trim().toLowerCase();
  const result = await pollSignClaim(chipId);
  if ("error" in result) {
    return NextResponse.json(result, { status: result.error === "bad_chip" ? 400 : 500 });
  }
  return NextResponse.json(result);
}
