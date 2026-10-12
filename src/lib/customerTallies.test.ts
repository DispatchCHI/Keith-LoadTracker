import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { CustomerLane, CustomerLaneStore } from "./customerLanes";
import {
  activeCounters,
  addCounter,
  askingOn,
  customersAvailableForCounter,
  dispatchedForCustomer,
  emptyCustomerTallies,
  reconcileCustomerTallies,
  removeCounter,
  setAsking,
} from "./customerTallies";

function lane(customer: string, destination: string, commodity = "Trash (MSW)", effectiveDate = "2026-01-01"): CustomerLane {
  return {
    id: `${customer}|${destination}|${commodity}|${effectiveDate}`,
    customer,
    destination,
    commodity,
    effectiveDate,
    tier1: 100,
    tier2: null,
    tier3: null,
    tier4: null,
    tier5: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

function lanes(...rows: CustomerLane[]): CustomerLaneStore {
  return { lanes: Object.fromEntries(rows.map((r) => [r.id, r])) };
}

const store = lanes(
  lane("Batavia", "Prairie View"),
  lane("Evanston", "Prairie View"),
  lane("Hooker Street", "Newton"),
  lane("Northlake", "Prairie View"),
  lane("Melrose Park", "Countryside"),
  lane("Stub Only", ""),
  lane("Future Co", "Newton", "Trash (MSW)", "2027-01-01"),
  lane("Leach Co", "Plant", "Leachate (tanker)"),
);

describe("customersAvailableForCounter", () => {
  it("lists only customers with an open lane, minus Batavia / Evanston / Hooker", () => {
    expect(customersAvailableForCounter(store, emptyCustomerTallies(), "2026-10-11")).toEqual([
      "Leach Co",
      "Melrose Park",
      "Northlake",
    ]);
  });

  it("leaves out customers that already have a counter", () => {
    const added = addCounter(emptyCustomerTallies(), "Northlake", "2026-10-11T01:00:00.000Z").state;
    expect(customersAvailableForCounter(store, added, "2026-10-11")).toEqual([
      "Leach Co",
      "Melrose Park",
    ]);
  });
});

describe("counters", () => {
  it("adds in order, refuses built-ins and duplicates, removes softly", () => {
    let s = addCounter(emptyCustomerTallies(), "Northlake", "2026-10-11T01:00:00.000Z").state;
    s = addCounter(s, "Melrose Park", "2026-10-11T01:01:00.000Z").state;
    expect(addCounter(s, "Northlake").counter).toBeNull();
    expect(addCounter(s, "Evanston").counter).toBeNull();
    expect(addCounter(s, "Hooker Street").counter).toBeNull();
    expect(activeCounters(s).map((c) => c.customer)).toEqual(["Northlake", "Melrose Park"]);
    s = removeCounter(s, "northlake", "2026-10-11T02:00:00.000Z").state;
    expect(activeCounters(s).map((c) => c.customer)).toEqual(["Melrose Park"]);
    expect(s.counters.northlake.removed).toBe(true);
    s = addCounter(s, "Northlake", "2026-10-11T03:00:00.000Z").state;
    expect(activeCounters(s).map((c) => c.customer)).toEqual(["Melrose Park", "Northlake"]);
  });

  it("keeps a per-day asking tally per customer", () => {
    let s = setAsking(emptyCustomerTallies(), "2026-10-11", "northlake", 5).state;
    s = setAsking(s, "2026-10-12", "northlake", 2).state;
    expect(askingOn(s, "2026-10-11", "northlake")).toBe(5);
    expect(askingOn(s, "2026-10-12", "northlake")).toBe(2);
    expect(askingOn(s, "2026-10-13", "northlake")).toBe(0);
    expect(setAsking(s, "2026-10-11", "northlake", -3).tally?.asking).toBe(0);
  });
});

describe("dispatchedForCustomer", () => {
  const day = [
    { pickup: "Northlake", commodity: "Trash (MSW)" },
    { pickup: "northlake", commodity: "Trash (MSW)" },
    { pickup: "Northlake", commodity: "Recycle" },
    { pickup: "Leach Co", commodity: "Leachate (tanker)" },
    { pickup: "Melrose Park", commodity: "Trash (MSW)" },
  ];
  it("counts that day's MSW loads like Evanston / Hooker", () => {
    expect(dispatchedForCustomer(day, "Northlake", store, "2026-10-11")).toBe(2);
  });
  it("counts all loads for a customer with no MSW lane", () => {
    expect(dispatchedForCustomer(day, "Leach Co", store, "2026-10-11")).toBe(1);
  });
});

describe("reconcileCustomerTallies", () => {
  it("last write wins and uploads newer local rows", () => {
    const local = setAsking(
      addCounter(emptyCustomerTallies(), "Northlake", "2026-10-11T05:00:00.000Z").state,
      "2026-10-11",
      "northlake",
      4,
      "2026-10-11T05:00:00.000Z",
    ).state;
    const remote = setAsking(
      removeCounter(
        addCounter(emptyCustomerTallies(), "Northlake", "2026-10-11T04:00:00.000Z").state,
        "northlake",
        "2026-10-11T06:00:00.000Z",
      ).state,
      "2026-10-11",
      "northlake",
      2,
      "2026-10-11T04:30:00.000Z",
    ).state;
    const r = reconcileCustomerTallies(local, remote);
    expect(r.next.counters.northlake.removed).toBe(true);
    expect(r.countersToUpload).toEqual([]);
    expect(askingOn(r.next, "2026-10-11", "northlake")).toBe(4);
    expect(r.talliesToUpload.map((t) => t.asking)).toEqual([4]);
  });

  it("keeps local data when the tables are missing (null pull)", () => {
    const local = addCounter(emptyCustomerTallies(), "Northlake").state;
    const r = reconcileCustomerTallies(local, { counters: null, tallies: null });
    expect(r.next).toEqual(local);
    expect(r.countersToUpload).toEqual([]);
  });
});

describe("Today wiring", () => {
  it("renders the extra counters inside the tally column after Hooker Street", () => {
    const yard = readFileSync(new URL("../screens/YardDeskScreen.tsx", import.meta.url), "utf8");
    const row = readFileSync(new URL("../components/DispatchTalliesRow.tsx", import.meta.url), "utf8");
    expect(yard).toContain("<CustomerTallyChips date={date} dayLoads={dayLoads} />");
    expect(row.indexOf('label="Hooker Street"')).toBeLessThan(row.indexOf("{children}"));
  });
});
