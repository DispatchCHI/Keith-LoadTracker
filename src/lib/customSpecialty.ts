/** Four dispatcher-named specialty cards for odd-ball requested loads. */

export const CUSTOM_SPECIALTY_IDS = [
  "custom-1",
  "custom-2",
  "custom-3",
  "custom-4",
] as const;

export type CustomSpecialtyId = (typeof CUSTOM_SPECIALTY_IDS)[number];

export const CUSTOM_SPECIALTY_DEFAULT_NAMES: Record<CustomSpecialtyId, string> = {
  "custom-1": "Odd-ball 1",
  "custom-2": "Odd-ball 2",
  "custom-3": "Odd-ball 3",
  "custom-4": "Odd-ball 4",
};

export const CUSTOM_SPECIALTY_LOAD_TYPES = [
  "Leachate",
  "C&D",
  "Recycle",
  "Yard Waste",
] as const;

export type CustomSpecialtyLoadType = (typeof CUSTOM_SPECIALTY_LOAD_TYPES)[number];

export const SPECIALTY_CUSTOM_NAMES_EVENT = "klt-specialty-names";
export const SPECIALTY_CUSTOM_NAMES_FLUSH_EVENT = "klt-specialty-names-flush";

const NAMES_KEY = "chitrader.load-tracker.specialty-custom-names.v1";
const NAMES_META_KEY = "chitrader.load-tracker.specialty-custom-names.meta.v1";

const CUSTOM_ID_RE = /^custom-([1-9]\d*)$/;

/** Original four slots plus any later card added from the specialty board. */
export function isCustomSpecialtyId(id: string): boolean {
  return CUSTOM_ID_RE.test(id);
}

export function customSpecialtyNumber(id: string): number {
  const match = CUSTOM_ID_RE.exec(id);
  return match ? Number(match[1]) : 0;
}

export function customSpecialtyDefaultName(id: string): string {
  if ((CUSTOM_SPECIALTY_IDS as readonly string[]).includes(id)) {
    return CUSTOM_SPECIALTY_DEFAULT_NAMES[id as CustomSpecialtyId];
  }
  return "Odd-ball";
}

export function nextCustomSpecialtyId(extra: readonly string[] = []): string {
  let max = 0;
  for (const id of [...Object.keys(readCustomSpecialtyNames()), ...extra]) {
    const n = customSpecialtyNumber(id);
    if (n > max) max = n;
  }
  return `custom-${max + 1}`;
}

function cleanLabel(raw: string): string {
  return raw.replace(/\s+/g, " ").trim();
}

export function readCustomSpecialtyNames(): Record<string, string> {
  const next: Record<string, string> = { ...CUSTOM_SPECIALTY_DEFAULT_NAMES };
  try {
    const raw = localStorage.getItem(NAMES_KEY);
    if (!raw) return next;
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    for (const [id, value] of Object.entries(parsed)) {
      if (!isCustomSpecialtyId(id) || typeof value !== "string") continue;
      next[id] = value;
    }
  } catch {
    /* keep defaults */
  }
  return next;
}

export function readCustomSpecialtyNamesUpdatedAt(): string {
  try {
    const raw = localStorage.getItem(NAMES_META_KEY);
    if (!raw) return "";
    const parsed = JSON.parse(raw) as { updatedAt?: unknown };
    return typeof parsed.updatedAt === "string" ? parsed.updatedAt : "";
  } catch {
    return "";
  }
}

function writeNamesMeta(updatedAt: string): void {
  try {
    localStorage.setItem(NAMES_META_KEY, JSON.stringify({ updatedAt }));
  } catch {
    /* private mode */
  }
}

export function namesHaveCustomLabels(
  names: Record<string, string> = readCustomSpecialtyNames(),
): boolean {
  return Object.keys(names).some(
    (id) => isCustomSpecialtyId(id) && isCustomSpecialtyRenamed(id, names[id]),
  );
}

/** Bump the shared clock so a day-pin change uploads with the name book. */
export function touchCustomSpecialtyNamesClock(): void {
  writeNamesMeta(new Date().toISOString());
}

export function applyCustomSpecialtyNames(
  incoming: Record<string, unknown>,
  updatedAt: string,
): Record<string, string> {
  const next: Record<string, string> = { ...CUSTOM_SPECIALTY_DEFAULT_NAMES };
  for (const [id, value] of Object.entries(incoming)) {
    if (!isCustomSpecialtyId(id) || typeof value !== "string") continue;
    next[id] = value;
  }
  try {
    localStorage.setItem(NAMES_KEY, JSON.stringify(next));
  } catch {
    /* private mode */
  }
  writeNamesMeta(updatedAt);
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(SPECIALTY_CUSTOM_NAMES_EVENT));
  }
  return next;
}

export function readCustomSpecialtyNameField(id: string): string {
  const names = readCustomSpecialtyNames();
  if (Object.prototype.hasOwnProperty.call(names, id)) return names[id] ?? "";
  return customSpecialtyDefaultName(id);
}

export function writeCustomSpecialtyName(id: string, name: string): void {
  if (!isCustomSpecialtyId(id)) return;
  const names = readCustomSpecialtyNames();
  names[id] = name;
  try {
    localStorage.setItem(NAMES_KEY, JSON.stringify(names));
  } catch {
    /* private mode */
  }
  writeNamesMeta(new Date().toISOString());
}

export function isCustomSpecialtyRenamed(
  id: string,
  name = readCustomSpecialtyNames()[id],
): boolean {
  if (!isCustomSpecialtyId(id)) return false;
  const cleaned = cleanLabel(name ?? "");
  if (!cleaned) return false;
  return cleaned.toLowerCase() !== customSpecialtyDefaultName(id).toLowerCase();
}

export function customSpecialtyDisplayName(id: string): string {
  if (!isCustomSpecialtyId(id)) return id;
  return cleanLabel(readCustomSpecialtyNames()[id] ?? "") || customSpecialtyDefaultName(id);
}

export function lookupCustomSpecialtyIdByName(raw: string): string | null {
  const name = cleanLabel(raw).toLowerCase();
  if (!name) return null;
  if (isCustomSpecialtyId(name)) return name;
  const names = readCustomSpecialtyNames();
  const ids = Object.keys(names)
    .filter((id) => isCustomSpecialtyId(id))
    .sort((a, b) => customSpecialtyNumber(a) - customSpecialtyNumber(b));
  for (const id of ids) {
    const stored = cleanLabel(names[id] ?? "");
    if (stored.toLowerCase() === name) return id;
    if (
      !isCustomSpecialtyRenamed(id, stored) &&
      customSpecialtyDefaultName(id).toLowerCase() === name
    ) {
      return id;
    }
  }
  return null;
}

export function isCustomSpecialtyLoadType(raw: string): raw is CustomSpecialtyLoadType {
  return (CUSTOM_SPECIALTY_LOAD_TYPES as readonly string[]).includes(raw);
}

export function formatCustomSpecialtyChip(
  loadType: CustomSpecialtyLoadType,
  destination: string,
): string {
  const dest = cleanLabel(destination);
  return dest ? `${loadType} · ${dest}` : loadType;
}

export function parseCustomSpecialtyChip(raw: string): {
  loadType: CustomSpecialtyLoadType | null;
  destination: string;
} {
  const text = cleanLabel(raw);
  const sep = text.indexOf(" · ");
  if (sep > 0) {
    const left = text.slice(0, sep);
    const right = text.slice(sep + 3);
    if (isCustomSpecialtyLoadType(left)) {
      return { loadType: left, destination: right };
    }
  }
  if (isCustomSpecialtyLoadType(text)) {
    return { loadType: text, destination: "" };
  }
  return { loadType: null, destination: text };
}

export function customSpecialtyLaneChips(
  destination: string,
  commodity: string,
): string[] {
  const parsed = parseCustomSpecialtyChip(destination);
  const typeFromCommodity = commodityLoadType(commodity);
  const loadType = parsed.loadType ?? typeFromCommodity;
  const dest = parsed.destination || cleanLabel(destination);
  const chips: string[] = [];
  if (loadType && dest) chips.push(formatCustomSpecialtyChip(loadType, dest));
  if (dest) chips.push(dest);
  if (loadType) chips.push(loadType);
  return chips;
}

export function commodityLoadType(commodity: string): CustomSpecialtyLoadType | null {
  const key = commodity.replace(/\s+/g, " ").trim().toLowerCase();
  if (!key) return null;
  if (key.includes("leach")) return "Leachate";
  if (key.includes("trash") || key.includes("msw")) return null;
  if (key.includes("c&d") || key.includes("c and d")) return "C&D";
  if (key.includes("recycle")) return "Recycle";
  if (key.includes("yard")) return "Yard Waste";
  return null;
}

export function isCustomSpecialtyCommodity(commodity: string, destination: string): boolean {
  if (parseCustomSpecialtyChip(destination).loadType) return true;
  return commodityLoadType(commodity) !== null;
}
