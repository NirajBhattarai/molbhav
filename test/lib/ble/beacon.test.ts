import { describe, expect, it } from "vitest";
import { agentInAdvert, stallInAdvert } from "@/lib/ble/beacon";

const id = "agent_078a8df588";
const data = (status: number, agent = id, version = 1) =>
  Uint8Array.from([version, status, ...new TextEncoder().encode(agent)]);

describe("a stall's beacon", () => {
  it("reads the agent id from manufacturer data when open", () => {
    expect(agentInAdvert({ data: [data(1)] })).toBe(id);
    expect(stallInAdvert({ data: [data(1)] })).toEqual({ id, askable: true });
  });

  it("reads an in-deal stall", () => {
    expect(agentInAdvert({ data: [data(3)] })).toBe(id);
  });

  it("does not offer from the name alone (status unknown)", () => {
    expect(agentInAdvert({ name: `MolbhavA-${id}`, data: [] })).toBeNull();
    expect(stallInAdvert({ name: `MolbhavA-${id}`, data: [] })).toBeNull();
  });

  it("marks closed and paused as not askable", () => {
    expect(stallInAdvert({ data: [data(0)] })).toEqual({ id, askable: false });
    expect(stallInAdvert({ data: [data(2)] })).toEqual({ id, askable: false });
    expect(agentInAdvert({ data: [data(0)] })).toBeNull();
    expect(agentInAdvert({ data: [data(2)] })).toBeNull();
  });

  it("does not offer a closed stall via its name after seeing closed payload", () => {
    expect(agentInAdvert({ name: `MolbhavA-${id}`, data: [data(0)] })).toBeNull();
  });

  it("ignores everything else in the air", () => {
    expect(agentInAdvert({ name: "AirPods Pro", data: [] })).toBeNull();
    expect(agentInAdvert({ data: [Uint8Array.from([76, 0, 2])] })).toBeNull();
    expect(agentInAdvert({ data: [data(1, id, 2)] })).toBeNull();
    expect(agentInAdvert({ data: [data(1, "agent_NOT-HEX000")] })).toBeNull();
  });
});
