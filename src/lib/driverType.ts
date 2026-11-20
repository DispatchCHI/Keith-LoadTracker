/** Full Roster driver type. MSW is the default and shows no tag. */

export const DRIVER_TYPES = ["msw", "tanker", "wf"] as const;
export type DriverType = (typeof DRIVER_TYPES)[number];

export const DRIVER_TYPE_LABELS: Record<DriverType, string> = {
  msw: "MSW",
  tanker: "Tanker",
  wf: "Walking-Floor",
};

/** Copy / print suffix. MSW stays unmarked. Screen pills stay "Tanker" / "WF". */
export function driverTypeListSuffix(type: DriverType | null | undefined): string {
  if (type === "tanker") return " - T";
  if (type === "wf") return " - WF";
  return "";
}

function tidyName(name: string): string {
  return name.replace(/\s+/g, " ").trim();
}

export function cleanDriverType(raw: unknown): DriverType | null {
  if (typeof raw !== "string") return null;
  const key = raw.trim().toLowerCase();
  if (key === "msw" || key === "tanker" || key === "wf") return key;
  if (key === "walking-floor" || key === "walking floor" || key === "walkingfloor") return "wf";
  return null;
}

/**
 * Tanker used to be written on the name: "Dan Kasprzycki -T",
 * "Paul Tiemens-T", "Gerald Orr - T".
 */
export function splitTankerSuffix(name: string): { name: string; tanker: boolean } {
  const cleaned = tidyName(name);
  const match = /^(.*?)(?:\s*-\s*t)\s*$/i.exec(cleaned);
  if (!match) return { name: cleaned, tanker: false };
  const base = tidyName(match[1] ?? "");
  if (!base) return { name: cleaned, tanker: false };
  return { name: base, tanker: true };
}

/** Stored type wins. A leftover -T suffix still means Tanker. Otherwise MSW. */
export function resolveStoredDriverType(
  name: string,
  stored: unknown,
): DriverType {
  const explicit = cleanDriverType(stored);
  if (explicit) return explicit;
  return splitTankerSuffix(name).tanker ? "tanker" : "msw";
}

export function displayDriverName(name: string): string {
  return splitTankerSuffix(name).name;
}

export function rosterNameWithType(name: string, type: DriverType | null | undefined): string {
  return `${displayDriverName(name)}${driverTypeListSuffix(type)}`;
}

type TypeRow = {
  kind: string;
  yard: string;
  truckNumber: string | null;
  name: string;
  driverType?: DriverType | null;
};

/** Full Roster type for a name, including a leftover -T on an old string. */
export function driverTypeForName(
  store: { entries: Record<string, TypeRow> },
  name: string,
): DriverType {
  const key = displayDriverName(name).toLowerCase();
  const hits = Object.values(store.entries).filter(
    (row) => row.kind === "full" && displayDriverName(row.name).toLowerCase() === key,
  );
  const marked = hits.find((row) => row.driverType && row.driverType !== "msw");
  if (marked?.driverType) return marked.driverType;
  if (hits[0]?.driverType) return hits[0].driverType;
  return splitTankerSuffix(name).tanker ? "tanker" : "msw";
}

/** Sat rows follow the Full Roster type for the same yard + person. */
export function resolveDriverType(
  store: { entries: Record<string, TypeRow> },
  entry: TypeRow,
): DriverType {
  if (entry.kind === "sat") {
    const name = displayDriverName(entry.name).toLowerCase();
    const emp = entry.truckNumber ?? "";
    const full = Object.values(store.entries).filter((row) => row.kind === "full");
    const sameYard = full.filter(
      (row) => row.yard === entry.yard && displayDriverName(row.name).toLowerCase() === name,
    );
    const hit =
      sameYard.find((row) => (row.truckNumber ?? "") === emp) ??
      sameYard[0] ??
      full.find((row) => displayDriverName(row.name).toLowerCase() === name);
    if (hit) return hit.driverType ?? "msw";
  }
  return entry.driverType ?? "msw";
}
