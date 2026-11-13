/** Log Load truck field: digits stay a truck; letters can pick a Full Roster driver. */

import type { DriverGoneEntry } from "./driverGone";
import {
  cleanDriverName,
  driverRosterYardLabel,
  type DriverRosterEntry,
  type DriverRosterStore,
  type DriverRosterYard,
} from "./driverRoster";
import { KNOWN_BROKER_CODES, sanitizeTruck } from "./truck";

const KNOWN_BROKER = new Set<string>(KNOWN_BROKER_CODES);

export type DriverNameMatch = {
  id: string;
  name: string;
  assignedTruck: string | null;
  yard: DriverRosterYard;
};

/**
 * True when the truck field should search drivers.
 * Pure digits, and lists of unit numbers or known broker codes (VZ, G2), stay trucks.
 */
export function truckFieldIsNameQuery(raw: string): boolean {
  if (!/[A-Za-z]/.test(raw)) return false;
  const parts = raw
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length === 0) return false;
  return !parts.every((part) => {
    const cleaned = sanitizeTruck(part);
    if (!cleaned) return false;
    if (/^\d+$/.test(cleaned)) return true;
    return KNOWN_BROKER.has(cleaned);
  });
}

function fold(raw: string): string {
  return cleanDriverName(raw)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function personKey(name: string, employeeNumber: string | null | undefined): string {
  const emp = (employeeNumber ?? "").replace(/\D/g, "");
  if (emp) return `emp:${emp}`;
  return `name:${fold(name)}`;
}

/** Lower score is a closer match. -1 means no match. */
function scoreName(name: string, query: string): number {
  const full = fold(name);
  const parts = full.split(" ").filter(Boolean);
  const q = fold(query);
  if (!q || !full || parts.length === 0) return -1;
  if (full === q) return 0;
  const words = q.split(" ").filter(Boolean);
  const first = parts[0] ?? "";
  const last = parts.length > 1 ? parts[parts.length - 1]! : "";

  if (words.length > 1) {
    const pool = [...parts];
    const allPrefix = words.every((word) => {
      const index = pool.findIndex((part) => part.startsWith(word));
      if (index < 0) return false;
      pool.splice(index, 1);
      return true;
    });
    if (allPrefix) return 1;
    const pool2 = [...parts];
    const allContains = words.every((word) => {
      const index = pool2.findIndex((part) => part.includes(word));
      if (index < 0) return false;
      pool2.splice(index, 1);
      return true;
    });
    return allContains ? 5 : -1;
  }

  const word = words[0]!;
  if (first.startsWith(word) || (last && last.startsWith(word))) return 2;
  if (full.startsWith(word)) return 3;
  if (first.includes(word) || (last && last.includes(word))) return 4;
  if (parts.some((part) => part.includes(word))) return 5;
  if (full.includes(word)) return 6;
  return -1;
}

/**
 * Full Roster name matches for the Log Load truck field.
 * Gone-only drivers are not in the hired list, so they are not suggested.
 * A rehire who is on the Full Roster is suggested even if Gone still has history.
 */
export function searchDriversForLogLoad(
  store: DriverRosterStore,
  goneEntries: readonly Pick<DriverGoneEntry, "name" | "employeeNumber">[],
  query: string,
  limit = 8,
): DriverNameMatch[] {
  const q = fold(query);
  if (!q) return [];
  const full = Object.values(store.entries).filter(
    (entry) => entry.kind === "full" && cleanDriverName(entry.name),
  );
  const hired = new Set(full.map((entry) => personKey(entry.name, entry.truckNumber)));
  // Gone is not a suggestion source. Counting gone-only rows keeps that explicit.
  const goneOnly = goneEntries.filter(
    (entry) => !hired.has(personKey(entry.name, entry.employeeNumber)),
  );
  void goneOnly;

  const scored: { entry: DriverRosterEntry; score: number }[] = [];
  for (const entry of full) {
    const score = scoreName(entry.name, q);
    if (score >= 0) scored.push({ entry, score });
  }
  scored.sort(
    (a, b) =>
      a.score - b.score ||
      a.entry.name.localeCompare(b.entry.name, "en", { sensitivity: "base" }),
  );
  return scored.slice(0, limit).map(({ entry }) => ({
    id: entry.id,
    name: cleanDriverName(entry.name),
    assignedTruck: entry.assignedTruck,
    yard: entry.yard,
  }));
}

export function formatDriverNameChoice(match: DriverNameMatch): string {
  const truck = match.assignedTruck ? `truck ${match.assignedTruck}` : "no truck";
  return `${match.name} (${truck}) · ${driverRosterYardLabel(match.yard)}`;
}
