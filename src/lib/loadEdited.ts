import { CREW_ROSTER, crewDisplayName } from "./presence";

/** Crew name to store on a load when this person saves an edit. */
export function editorNameForUser(displayName: string, email?: string | null): string {
  const trimmed = displayName.trim();
  if (email) {
    const crew = crewDisplayName(email);
    const local = email.split("@")[0] ?? "";
    if (crew && crew.toLowerCase() !== local.toLowerCase()) return crew;
  }
  const byLocal = CREW_ROSTER.find(
    (person) => person.email.split("@")[0].toLowerCase() === trimmed.toLowerCase(),
  );
  if (byLocal) return byLocal.name;
  const byName = CREW_ROSTER.find((person) => person.name.toLowerCase() === trimmed.toLowerCase());
  return byName?.name ?? trimmed;
}

/** Two-letter mark for the person who last changed the load. */
export function editorInitials(name: string | null | undefined): string {
  const source = (name ?? "").trim();
  if (!source) return "";
  const parts = source.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0][0] ?? ""}${parts[parts.length - 1][0] ?? ""}`.toUpperCase();
  }
  const word = parts[0] ?? "";
  if (word.length <= 2) return word.toUpperCase();
  return word.slice(0, 2).toUpperCase();
}

/**
 * Last-writer-wins, but a payload that never had `editedBy` (column not
 * deployed yet) must not wipe a name already stored on the other side.
 */
export function keepLoadEditedBy<T extends { editedBy?: string | null }>(winner: T, loser: T): T {
  if (winner.editedBy !== undefined) return winner;
  if (loser.editedBy === undefined) return winner;
  return { ...winner, editedBy: loser.editedBy };
}
