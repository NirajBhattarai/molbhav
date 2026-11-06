import { describe, expect, it } from "vitest";
import {
  BEACON_ENS_PARENT,
  agentInAdvert,
  asBytes,
  beaconLabel,
  ensInName,
  stallInAdvert,
} from "@/lib/ble/beacon";
import { ENS_PARENT_DEFAULT } from "@/lib/ens";

const id = "agent_078a8df588";
const payload = (status: number, agent = id, version = 1) =>
  Uint8Array.from([version, status, ...new TextEncoder().encode(agent)]);
const withCompany = (status: number) => Uint8Array.from([0xab, 0x0b, ...payload(status)]);

describe("a stall's beacon", () => {
  it("reads open and in-deal as askable", () => {
    expect(stallInAdvert({ data: [payload(1)] })).toEqual({ id, askable: true, ens: null });
    expect(stallInAdvert({ data: [payload(3)] })).toEqual({ id, askable: true, ens: null });
    expect(agentInAdvert({ data: [payload(1)] })).toBe(id);
  });

  it("marks closed and paused as not askable", () => {
    expect(stallInAdvert({ data: [payload(0)] })).toEqual({ id, askable: false, ens: null });
    expect(stallInAdvert({ data: [payload(2)] })).toEqual({ id, askable: false, ens: null });
    expect(agentInAdvert({ data: [payload(0)] })).toBeNull();
  });

  it("accepts payloads that still include the company id", () => {
    expect(stallInAdvert({ data: [withCompany(1)] })).toEqual({ id, askable: true, ens: null });
    expect(stallInAdvert({ data: [withCompany(0)] })).toEqual({ id, askable: false, ens: null });
  });

  it("reads Capacitor DataViews", () => {
    const view = new DataView(payload(1).buffer);
    expect(asBytes(view)).toEqual(payload(1));
    expect(stallInAdvert({ data: [view] })).toEqual({ id, askable: true, ens: null });
  });

  it("never offers from the name alone", () => {
    expect(agentInAdvert({ name: `MolbhavA-${id}`, data: [] })).toBeNull();
  });

  it("ignores noise", () => {
    expect(agentInAdvert({ name: "AirPods Pro", data: [] })).toBeNull();
    expect(agentInAdvert({ data: [Uint8Array.from([76, 0, 2])] })).toBeNull();
  });
});

describe("the ENS label in a sign's name", () => {
  it("adds the stall's ENS name to a stall the manufacturer data found", () => {
    expect(stallInAdvert({ name: "mohd-soyeb-khan", data: [payload(1)] })).toEqual({
      id,
      askable: true,
      ens: "mohd-soyeb-khan.molbhav.eth",
    });
  });

  it("is never enough on its own", () => {
    expect(stallInAdvert({ name: "mohd-soyeb-khan", data: [] })).toBeNull();
  });

  it("gives no name for the MolbhavA- name or noise", () => {
    expect(ensInName(`MolbhavA-${id}`)).toBeNull();
    expect(ensInName("AirPods Pro")).toBeNull();
    expect(ensInName("chai--point")).toBeNull();
    expect(ensInName("-chai")).toBeNull();
    expect(ensInName(null)).toBeNull();
  });

  it("fits labels in the scan response (29 bytes) or leaves them out", () => {
    expect(beaconLabel("sri-lakshmi-tiffin-centre")).toBe("sri-lakshmi-tiffin-centre"); // 25
    expect(beaconLabel("a".repeat(29))).toBe("a".repeat(29));
    expect(beaconLabel("a".repeat(30))).toBeNull();
    expect(beaconLabel("shree-ganesh-vada-pav-and-chinese-corner")).toBeNull(); // 40
    expect(beaconLabel("ab")).toBeNull();
  });

  it("uses the market's ENS name", () => {
    expect(BEACON_ENS_PARENT).toBe(ENS_PARENT_DEFAULT);
  });
});
