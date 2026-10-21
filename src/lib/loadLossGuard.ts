/**
 * Hard guard (1.1.46): a cloud read must never make loads vanish from the
 * screen. Incremental pulls never remove anything (absence is normal there).
 * After a FULL pull, a load this device shows but the cloud did not return is
 * kept and marked "suspect"; it is dropped only when a later full pull,
 * at least MIN_CONFIRM_GAP_MS later, still lacks it AND that pull looks
 * complete (not empty, not far smaller than this device). Explicit deletes
 * (this desk's queue / tombstones / realtime DELETE) are unaffected.
 */
import type { Load } from "../types";

export const MIN_CONFIRM_GAP_MS = 20_000;
/** A full pull smaller than this share of the device's real loads is not trusted to remove anything. */
export const MIN_COMPLETE_RATIO = 0.9;

export type Suspects = Map<string, number>;

export type LossGuardInput = {
  merged: Load[];
  /** Loads this device was showing before the pull. */
  device: Load[];
  remoteIds: ReadonlySet<string>;
  remoteCount: number;
  /** Explicit deletes / tombstones: allowed to disappear. */
  deleted: ReadonlySet<string>;
  suspects: Suspects;
  now: number;
};

export type LossGuardResult = {
  merged: Load[];
  suspects: Suspects;
  kept: Load[];
  confirmedGone: string[];
  /** Dates where the cloud returned fewer loads than this device showed. */
  thinDates: string[];
  trustworthy: boolean;
  needsFullRepull: boolean;
};

export function guardFullPullLoss(input: LossGuardInput): LossGuardResult {
  const realDevice = input.device.filter((l) => !l.seeded && !input.deleted.has(l.id));
  const trustworthy =
    input.remoteCount > 0 && input.remoteCount >= Math.floor(realDevice.length * MIN_COMPLETE_RATIO);
  const mergedIds = new Set(input.merged.map((l) => l.id));
  const out = [...input.merged];
  const suspects: Suspects = new Map();
  const kept: Load[] = [];
  const confirmedGone: string[] = [];
  for (const load of realDevice) {
    if (input.remoteIds.has(load.id) || mergedIds.has(load.id)) continue;
    const firstSeen = input.suspects.get(load.id);
    const confirmed =
      trustworthy && firstSeen !== undefined && input.now - firstSeen >= MIN_CONFIRM_GAP_MS;
    if (confirmed) {
      confirmedGone.push(load.id);
      continue;
    }
    kept.push(load);
    out.push(load);
    suspects.set(load.id, firstSeen ?? input.now);
  }
  const deviceByDate = new Map<string, number>();
  for (const l of realDevice) deviceByDate.set(l.date, (deviceByDate.get(l.date) ?? 0) + 1);
  const remoteByDate = new Map<string, number>();
  for (const l of input.merged) {
    if (input.remoteIds.has(l.id)) remoteByDate.set(l.date, (remoteByDate.get(l.date) ?? 0) + 1);
  }
  const thinDates = [...deviceByDate]
    .filter(([date, n]) => (remoteByDate.get(date) ?? 0) < n)
    .map(([date]) => date)
    .sort();
  return {
    merged: out,
    suspects,
    kept,
    confirmedGone,
    thinDates,
    trustworthy,
    needsFullRepull: kept.length > 0,
  };
}
