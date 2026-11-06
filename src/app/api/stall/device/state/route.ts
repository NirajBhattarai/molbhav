import { NextResponse } from "next/server";
import { authorizeDevice, parseBearer, readDeviceState } from "@/lib/server/stall-device";

export const runtime = "nodejs";

/** Stall sign poll: current status, name, UPI, deal. */
export async function GET(req: Request) {
  const agentId = (req.headers.get("x-agent-id") ?? "").trim().toLowerCase();
  const token = parseBearer(req.headers.get("authorization"));
  if (!authorizeDevice(agentId, token)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const state = await readDeviceState(agentId);
  if (!state) return NextResponse.json({ error: "Unknown stall" }, { status: 404 });
  return NextResponse.json(state);
}
