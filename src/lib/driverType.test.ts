import { describe, expect, it } from "vitest";
import { addRosterEntry, emptyDriverRosterStore } from "./driverRoster";
import {
  displayDriverName,
  resolveDriverType,
  resolveStoredDriverType,
  driverTypeListSuffix,
  rosterNameWithType,
  splitTankerSuffix,
} from "./driverType";

describe("splitTankerSuffix", () => {
  it("strips the tanker mark in the forms Keith uses", () => {
    expect(splitTankerSuffix("Dan Kasprzycki -T")).toEqual({
      name: "Dan Kasprzycki",
      tanker: true,
    });
    expect(splitTankerSuffix("Paul Tiemens-T")).toEqual({ name: "Paul Tiemens", tanker: true });
    expect(splitTankerSuffix("Gerald Orr - T")).toEqual({ name: "Gerald Orr", tanker: true });
    expect(splitTankerSuffix("  Bill Vrtis-T  ")).toEqual({ name: "Bill Vrtis", tanker: true });
    expect(splitTankerSuffix("Dave Vanderbilt")).toEqual({
      name: "Dave Vanderbilt",
      tanker: false,
    });
  });

  it("does not treat a name that merely ends in t as a tanker", () => {
    expect(splitTankerSuffix("Matt").tanker).toBe(false);
    expect(splitTankerSuffix("Robert").name).toBe("Robert");
  });
});

describe("driver type defaults", () => {
  it("maps a -T name to Tanker and everyone else to MSW", () => {
    expect(resolveStoredDriverType("Dan Kasprzycki -T", null)).toBe("tanker");
    expect(resolveStoredDriverType("Dave Vanderbilt", undefined)).toBe("msw");
    expect(resolveStoredDriverType("Dan Kasprzycki -T", "wf")).toBe("wf");
  });

  it("stores the stripped name and Tanker when a driver is added", () => {
    const added = addRosterEntry(emptyDriverRosterStore(), {
      kind: "full",
      yard: "burnham",
      truckNumber: "102",
      name: "Dan Kasprzycki -T",
    });
    expect(added.entry?.name).toBe("Dan Kasprzycki");
    expect(added.entry?.driverType).toBe("tanker");
  });

  it("lets Saturday follow the Full Roster type", () => {
    let store = emptyDriverRosterStore();
    store = addRosterEntry(store, {
      kind: "full",
      yard: "burnham",
      truckNumber: "102",
      name: "Dan Kasprzycki",
      driverType: "tanker",
    }).store;
    const sat = addRosterEntry(store, {
      kind: "sat",
      yard: "burnham",
      truckNumber: "102",
      name: "Dan Kasprzycki -T",
    }).entry!;
    expect(sat.name).toBe("Dan Kasprzycki");
    expect(resolveDriverType(store, sat)).toBe("tanker");
    expect(rosterNameWithType(sat.name, resolveDriverType(store, sat))).toBe(
      "Dan Kasprzycki - T",
    );
    expect(rosterNameWithType("Alex Acosta", "wf")).toBe("Alex Acosta - WF");
    expect(displayDriverName("Gerald Orr - T")).toBe("Gerald Orr");
    expect(rosterNameWithType("Dave Vanderbilt", "msw")).toBe("Dave Vanderbilt");
  });

  it("prints tanker as - T and walking floor as - WF", () => {
    expect(driverTypeListSuffix("tanker")).toBe(" - T");
    expect(driverTypeListSuffix("wf")).toBe(" - WF");
    expect(driverTypeListSuffix("msw")).toBe("");
    expect(driverTypeListSuffix(null)).toBe("");
    expect(rosterNameWithType("Bill Vrtis", "tanker")).toBe("Bill Vrtis - T");
    expect(rosterNameWithType("James Carter", "wf")).toBe("James Carter - WF");
    expect(rosterNameWithType("Christopher Washington", "msw")).toBe("Christopher Washington");
  });
});
