import { createHmac } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/server/db", () => ({
  query: vi.fn(),
}));

import { query } from "@/lib/server/db";
import { applyDeviceStatus, authorizeDevice, stallDeviceToken } from "@/lib/server/stall-device";

const agentId = "agent_078a8df588";

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
      .mockResolvedValueOnce([
        {
          id: "s1",
          name: "Ramesh",
          upi_id: "r@upi",
          device_status: "open",
          pause_until: null,
          is_open: true,
        },
      ] as never)
      .mockResolvedValueOnce([
        {
          id: "s1",
          name: "Ramesh",
          upi_id: "r@upi",
          device_status: "closed",
          pause_until: null,
          is_open: false,
        },
      ] as never);

    const state = await applyDeviceStatus(agentId, "closed");
    expect(state?.status).toBe("closed");
    expect(vi.mocked(query).mock.calls[1][1]).toEqual([agentId, "closed", null, false]);
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
