import { NextResponse } from "next/server";
import {
  applyDeviceStatus,
  authorizeDevice,
  isDeviceStatus,
  parseBearer,
} from "@/lib/server/stall-device";

/** Stall sign button press → save open/closed/paused for that agent. */
export async function POST(req: Request) {
  const agentId = (req.headers.get("x-agent-id") ?? "").trim().toLowerCase();
  const token = parseBearer(req.headers.get("authorization"));
  if (!authorizeDevice(agentId, token)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { status?: unknown; pauseMinutes?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!isDeviceStatus(body.status)) {
    return NextResponse.json({ error: "status must be open, closed, or paused" }, { status: 400 });
  }

  const state = await applyDeviceStatus(
    agentId,
    body.status,
    typeof body.pauseMinutes === "number" ? body.pauseMinutes : undefined,
  );
  if (!state) return NextResponse.json({ error: "Unknown stall" }, { status: 404 });
  return NextResponse.json(state);
}
