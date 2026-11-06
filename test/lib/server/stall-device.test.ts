import { createHmac } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/server/db", () => ({
  query: vi.fn(),
}));

import { query } from "@/lib/server/db";
import {
  applyDeviceStatus,
  authorizeDevice,
  stallDeviceToken,
  stallReady,
} from "@/lib/server/stall-device";

const agentId = "agent_078a8df588";

const readyStall = {
  id: "s1",
  name: "Ramesh",
  upi_id: "r@upi",
  lat: 28.6,
  lng: 77.2,
  has_menu: true,
  device_status: "open" as const,
  pause_until: null,
  is_open: true,
};

describe("stall device auth", () => {
  beforeEach(() => {
    vi.stubEnv("SESSION_SECRET", "test-secret-for-stall-device");
    vi.stubEnv("STALL_DEVICE_SECRET", "");
    vi.mocked(query).mockReset();
  });

  it("accepts the HMAC bearer for the agent", () => {
    const token = stallDeviceToken(agentId);
    expect(authorizeDevice(agentId, token)).toBe(true);
    expect(authorizeDevice(agentId, "wrong")).toBe(false);
  });

  it("accepts STALL_DEVICE_SECRET when set", () => {
    vi.stubEnv("STALL_DEVICE_SECRET", "shared-device-secret");
    expect(authorizeDevice(agentId, "shared-device-secret")).toBe(true);
  });

  it("sets is_open false when the sign reports closed", async () => {
    vi.mocked(query)
      .mockResolvedValueOnce([readyStall] as never)
      .mockResolvedValueOnce([{ ...readyStall, device_status: "closed", is_open: false }] as never);

    const state = await applyDeviceStatus(agentId, "closed");
    expect(state?.status).toBe("closed");
    expect(vi.mocked(query).mock.calls[1][1]).toEqual([agentId, "closed", null, false]);
  });

  it("forces closed when the stall checklist is incomplete", async () => {
    const incomplete = { ...readyStall, upi_id: null, has_menu: false, is_open: false };
    vi.mocked(query)
      .mockResolvedValueOnce([incomplete] as never)
      .mockResolvedValueOnce([{ ...incomplete, device_status: "closed", is_open: false }] as never);

    const state = await applyDeviceStatus(agentId, "open");
    expect(state?.status).toBe("closed");
    expect(vi.mocked(query).mock.calls[1][1]).toEqual([agentId, "closed", null, false]);
  });

  it("allows pause when the stall is ready", async () => {
    vi.mocked(query)
      .mockResolvedValueOnce([readyStall] as never)
      .mockResolvedValueOnce([
        {
          ...readyStall,
          device_status: "paused",
          is_open: false,
          pause_until: new Date(Date.now() + 600_000),
        },
      ] as never);

    const state = await applyDeviceStatus(agentId, "paused", 10);
    expect(state?.status).toBe("paused");
    expect(vi.mocked(query).mock.calls[1][1]?.[1]).toBe("paused");
    expect(vi.mocked(query).mock.calls[1][1]?.[3]).toBe(false);
  });
});

describe("stallReady", () => {
  it("needs name, UPI, pin and menu", () => {
    expect(stallReady(readyStall)).toBe(true);
    expect(stallReady({ ...readyStall, name: "" })).toBe(false);
    expect(stallReady({ ...readyStall, upi_id: null })).toBe(false);
    expect(stallReady({ ...readyStall, lat: null })).toBe(false);
    expect(stallReady({ ...readyStall, has_menu: false })).toBe(false);
  });
});

describe("stallDeviceToken", () => {
  it("is stable for the same secret and agent", () => {
    vi.stubEnv("SESSION_SECRET", "abc");
    const expected = createHmac("sha256", "abc")
      .update(`molbhav-device:${agentId}`)
      .digest("hex")
      .slice(0, 32);
    expect(stallDeviceToken(agentId)).toBe(expected);
  });
});
