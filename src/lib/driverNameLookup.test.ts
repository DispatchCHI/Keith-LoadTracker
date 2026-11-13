import { describe, expect, it } from "vitest";
import {
  formatDriverNameChoice,
  searchDriversForLogLoad,
  truckFieldIsNameQuery,
} from "./driverNameLookup";
import { addRosterEntry, emptyDriverRosterStore, type DriverRosterStore } from "./driverRoster";

function roster(): DriverRosterStore {
  let store = emptyDriverRosterStore();
  store = addRosterEntry(store, {
    kind: "full",
    yard: "rockford",
    truckNumber: "30210",
    assignedTruck: "207",
    name: "Maria Lopez",
  }, { id: "maria" }).store;
  store = addRosterEntry(store, {
    kind: "full",
    yard: "pontiac",
    truckNumber: "30555",
    assignedTruck: null,
    name: "Mark Mills",
  }, { id: "mark" }).store;
  store = addRosterEntry(store, {
    kind: "full",
    yard: "burnham",
    truckNumber: "31147",
    assignedTruck: "418",
    name: "Buddy Johnson",
  }, { id: "buddy" }).store;
  store = addRosterEntry(store, {
    kind: "sat",
    yard: "rockford",
    truckNumber: "40000",
    name: "Saturday Sam",
  }, { id: "sat" }).store;
  store = addRosterEntry(store, {
    kind: "full",
    yard: "zion",
    truckNumber: "30001",
    assignedTruck: "90",
    name: "Dale Alan",
  }, { id: "dale" }).store;
  store = addRosterEntry(store, {
    kind: "full",
    yard: "arc",
    truckNumber: "30002",
    assignedTruck: "91",
    name: "Ralph Stone",
  }, { id: "ralph" }).store;
  return store;
}

const goneOnly = { name: "Gone Gary", employeeNumber: "99999" };
const rehireHistory = { name: "Buddy Johnson", employeeNumber: "31147" };

describe("truckFieldIsNameQuery", () => {
  it("keeps digits and known broker codes on the truck path", () => {
    expect(truckFieldIsNameQuery("207")).toBe(false);
    expect(truckFieldIsNameQuery("207, 214")).toBe(false);
    expect(truckFieldIsNameQuery("")).toBe(false);
    expect(truckFieldIsNameQuery("VZ")).toBe(false);
    expect(truckFieldIsNameQuery("g2")).toBe(false);
    expect(truckFieldIsNameQuery("VZ, 207")).toBe(false);
    expect(truckFieldIsNameQuery("CGH")).toBe(false);
  });

  it("treats other letters as a driver name", () => {
    expect(truckFieldIsNameQuery("maria")).toBe(true);
    expect(truckFieldIsNameQuery("Lopez")).toBe(true);
    expect(truckFieldIsNameQuery("ma")).toBe(true);
    expect(truckFieldIsNameQuery("AB12")).toBe(true);
  });
});

describe("searchDriversForLogLoad", () => {
  const store = roster();
  const gone = [goneOnly, rehireHistory];

  it("matches first or last name, prefix or contains, ignoring case", () => {
    expect(searchDriversForLogLoad(store, gone, "mar").map((row) => row.name)).toEqual([
      "Maria Lopez",
      "Mark Mills",
    ]);
    expect(searchDriversForLogLoad(store, gone, "LOPEZ").map((row) => row.name)).toEqual([
      "Maria Lopez",
    ]);
    expect(searchDriversForLogLoad(store, gone, "ria").map((row) => row.name)).toEqual([
      "Maria Lopez",
    ]);
    expect(searchDriversForLogLoad(store, gone, "ill").map((row) => row.name)).toEqual([
      "Mark Mills",
    ]);
    expect(searchDriversForLogLoad(store, gone, "mark m").map((row) => row.name)).toEqual([
      "Mark Mills",
    ]);
  });

  it("ranks a name prefix ahead of a contains match", () => {
    expect(searchDriversForLogLoad(store, gone, "al").map((row) => row.name)).toEqual([
      "Dale Alan",
      "Ralph Stone",
    ]);
  });

  it("skips Saturday rows and Gone-only drivers, and still suggests a rehire", () => {
    expect(searchDriversForLogLoad(store, gone, "sat")).toEqual([]);
    expect(searchDriversForLogLoad(store, gone, "gary")).toEqual([]);
    expect(searchDriversForLogLoad(store, gone, "buddy").map((row) => row.name)).toEqual([
      "Buddy Johnson",
    ]);
  });

  it("returns an unassigned driver and formats truck plus yard", () => {
    const mark = searchDriversForLogLoad(store, gone, "mills")[0];
    expect(mark?.assignedTruck).toBeNull();
    expect(formatDriverNameChoice(mark!)).toBe("Mark Mills (no truck) · Pontiac");
    const maria = searchDriversForLogLoad(store, gone, "maria")[0];
    expect(formatDriverNameChoice(maria!)).toBe("Maria Lopez (truck 207) · Rockford");
  });

  it("returns nothing for a blank query", () => {
    expect(searchDriversForLogLoad(store, gone, "   ")).toEqual([]);
  });
});
