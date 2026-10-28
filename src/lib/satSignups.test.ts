import { describe, expect, it } from "vitest";
import { matchSatSignups, parseCsv, parseSatSignups, signupDateToISO, stripZeros } from "./satSignups";
import type { DriverRosterEntry } from "./driverRoster";

const csv = `Timestamp,Date ,Driver Number,Driver Name
10/27/2026 12:04:00,10/31/2026,032008,Daniel Alvarado
10/28/2026 2:23:49,10/31/2026,040467,Crandall Wells 
10/28/2026 6:18:54,10/31/2026,036673,Laurentino mendoza
10/28/2026 7:27:46,10/31/2026,000100,Francisco
10/28/2026 8:00:00,11/7/2026,032008,Daniel Alvarado
10/28/2026 9:00:00,10/31/2026,099999,"Nobody, Known"
bad row,,,
`;

let n = 0;
const entry = (truckNumber: string | null, name: string, kind: "sat" | "full" = "sat"): DriverRosterEntry =>
  ({ id: `e${n++}`, kind, yard: "burnham", truckNumber, name } as unknown as DriverRosterEntry);

describe("sat sign-up sheet", () => {
  it("parses rows, quotes and dates", () => {
    expect(parseCsv('a,"b,c",d\r\n"x ""y""",2,3\n')).toEqual([["a", "b,c", "d"], ['x "y"', "2", "3"]]);
    expect(signupDateToISO("10/31/2026")).toBe("2026-10-31");
    expect(stripZeros("032008")).toBe("32008");
    const rows = parseSatSignups(csv);
    expect(rows).toHaveLength(6);
    expect(rows[1]).toEqual({ date: "2026-10-31", number: "40467", name: "Crandall Wells" });
    expect(rows[3]).toEqual({ date: "2026-10-31", number: "100", name: "Francisco" });
  });

  it("matches number + loose name, ignores other Saturdays, lists unmatched", () => {
    const signups = parseSatSignups(csv);
    const daniel = entry("32008", "Daniel Alvarado");
    const wells = entry("040467", "Wells, Crandall");
    const laur = entry("36673", "Laurentino Mendoza");
    const fran = entry("100", "Francisco Ruiz");
    const wrongName = entry("32008", "Somebody Else"); // same number, name mismatch
    const noNumber = entry(null, "Crandall WELLS");
    const other = entry("555", "Not Signed Up");
    const shown = [daniel, wells, laur, fran, wrongName, noNumber, other];
    const out = matchSatSignups(signups, "2026-10-31", shown, shown);
    expect([...out.signedUpIds].sort()).toEqual([daniel.id, wells.id, laur.id, fran.id, noNumber.id].sort());
    expect(out.unmatched.map((s) => s.name)).toEqual(["Nobody, Known"]);
    expect(matchSatSignups(signups, "2026-11-07", shown, shown).signedUpIds.size).toBe(1);
  });

  it("empty or garbage CSV never throws", () => {
    expect(parseSatSignups("")).toEqual([]);
    expect(parseSatSignups("<html>nope</html>")).toEqual([]);
  });
});