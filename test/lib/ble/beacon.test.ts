import { describe, expect, it } from "vitest";
import { agentInAdvert, asBytes, stallInAdvert } from "@/lib/ble/beacon";

const id = "agent_078a8df588";
const payload = (status: number, agent = id, version = 1) =>
  Uint8Array.from([version, status, ...new TextEncoder().encode(agent)]);
const withCompany = (status: number) => Uint8Array.from([0xab, 0x0b, ...payload(status)]);

describe("a stall's beacon", () => {
  it("reads open and in-deal as askable", () => {
    expect(stallInAdvert({ data: [payload(1)] })).toEqual({ id, askable: true });
    expect(stallInAdvert({ data: [payload(3)] })).toEqual({ id, askable: true });
    expect(agentInAdvert({ data: [payload(1)] })).toBe(id);
  });

  it("marks closed and paused as not askable", () => {
    expect(stallInAdvert({ data: [payload(0)] })).toEqual({ id, askable: false });
    expect(stallInAdvert({ data: [payload(2)] })).toEqual({ id, askable: false });
    expect(agentInAdvert({ data: [payload(0)] })).toBeNull();
  });

  it("accepts payloads that still include the company id", () => {
    expect(stallInAdvert({ data: [withCompany(1)] })).toEqual({ id, askable: true });
    expect(stallInAdvert({ data: [withCompany(0)] })).toEqual({ id, askable: false });
  });

  it("reads Capacitor DataViews", () => {
    const view = new DataView(payload(1).buffer);
    expect(asBytes(view)).toEqual(payload(1));
    expect(stallInAdvert({ data: [view] })).toEqual({ id, askable: true });
  });

  it("never offers from the name alone", () => {
    expect(agentInAdvert({ name: `MolbhavA-${id}`, data: [] })).toBeNull();
  });

  it("ignores noise", () => {
    expect(agentInAdvert({ name: "AirPods Pro", data: [] })).toBeNull();
    expect(agentInAdvert({ data: [Uint8Array.from([76, 0, 2])] })).toBeNull();
  });
});
