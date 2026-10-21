import { describe, expect, it } from "vitest";
import { destinationsFor } from "../data/stations";
import {
  SPECIALTY_STATIONS,
  addSpecialtySlot,
  consumeSpecialtyOpensAny,
  countSpecialtyOpensAny,
  resolveSpecialtyBoardMatch,
  specialtyChipMode,
  specialtyDestinationsFor,
  type SpecialtyStore,
} from "./specialtyBoard";

const date = "2026-10-21";
const KEYS = ["Yard Waste", "Recycle", "Residual", "Glass", "Cardboard", "Wood", "C&D", "Leachate", "Tires"];

function dispatch(store: SpecialtyStore, stationId: string, pickup: string, dest: string, commodity: string) {
  const lane = resolveSpecialtyBoardMatch(stationId, pickup, dest, commodity);
  if (!lane) return { store, lane };
  return { store: consumeSpecialtyOpensAny(store, date, lane.specialtyId, lane.chips, 1), lane };
}

function loadFor(id: string, chip: string): { dest: string; commodity: string } {
  if (specialtyChipMode(id) === "commodity") {
    return { commodity: chip, dest: destinationsFor(id, chip)[0] ?? "Somewhere" };
  }
  const k = KEYS.find((key) => destinationsFor(id, key).includes(chip));
  if (k) return { dest: chip, commodity: k };
  if (id === "hodgkins") return { dest: chip, commodity: "Residual" };
  if (id === "liberty-tank" || id === "grayslake") return { dest: chip, commodity: "Leachate" };
  return { dest: chip, commodity: "Recycle" };
}

describe("1.1.47 every specialty tally clears on a dispatch for its lane", () => {
  const named = SPECIALTY_STATIONS.filter((s) => !s.id.startsWith("custom-"));
  for (const station of named) {
    for (const chip of specialtyDestinationsFor(station.id)) {
      it(`${station.name}: ${chip}`, () => {
        let store: SpecialtyStore = addSpecialtySlot({}, date, station.id, chip);
        store = addSpecialtySlot(store, date, station.id, chip);
        const { dest, commodity } = loadFor(station.id, chip);
        const out = dispatch(store, station.id, station.name, dest, commodity);
        expect(out.lane, `${commodity} -> ${dest}`).not.toBeNull();
        expect(countSpecialtyOpensAny(out.store, date, out.lane!.specialtyId, out.lane!.chips)).toBe(1);
      });
    }
  }
});

describe("1.1.47 Arc yard waste (Keith, truck 2765)", () => {
  const four = (label: string) => {
    let s: SpecialtyStore = {};
    for (let i = 0; i < 4; i++) s = addSpecialtySlot(s, date, "arc", label);
    return s;
  };
  const left = (s: SpecialtyStore, dest: string) => {
    const lane = resolveSpecialtyBoardMatch("arc", "Arc", dest, "Yard Waste")!;
    return countSpecialtyOpensAny(s, date, "arc", lane.chips);
  };
  it("Thelens tally, load logged Arc -> Organix: 4 -> 3", () => {
    const out = dispatch(four("Thelens"), "arc", "Arc", "Organix", "Yard Waste");
    expect(left(out.store, "Organix")).toBe(3);
  });
  it("Thelens tally, load to Thelens / Thelen's: 4 -> 3", () => {
    expect(left(dispatch(four("Thelens"), "arc", "Arc", "Thelens", "Yard Waste").store, "Thelens")).toBe(3);
    expect(left(dispatch(four("Thelens"), "arc", "Arc", "Thelen's", "Yard Waste").store, "Thelens")).toBe(3);
  });
  it("commodity-typed tally ('Yard waste' / 'Yard waste - Thelens') clears too", () => {
    expect(left(dispatch(four("Yard waste"), "arc", "Arc", "Thelens", "Yard Waste").store, "Thelens")).toBe(3);
    expect(left(dispatch(four("Yard waste - Thelens"), "arc", "Arc", "Organix", "Yard Waste").store, "Organix")).toBe(3);
  });
  it("exact destination burns first", () => {
    let s = addSpecialtySlot({}, date, "arc", "Thelens");
    s = addSpecialtySlot(s, date, "arc", "Organix");
    const out = dispatch(s, "arc", "Arc", "Organix", "Yard Waste");
    expect(Object.values(out.store).flat().map((x) => x.destination)).toEqual(["Thelens"]);
  });
  it("a trash load never burns a yard tally", () => {
    const out = dispatch(four("Thelens"), "arc", "Arc", "Organix", "Trash (MSW)");
    expect(out.lane).toBeNull();
  });
});
