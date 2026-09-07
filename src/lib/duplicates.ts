import type { Load } from "../types";

export const NEAR_DUPLICATE_WINDOW_MS = 4 * 60 * 1000;

function norm(value: string): string {
  return value.trim().toLowerCase();
}

export function sameDispatch(a: {
  truck: string;
  pickup: string;
  commodity: string;
  destination: string;
}, b: {
  truck: string;
  pickup: string;
  commodity: string;
  destination: string;
}): boolean {
  return (
    norm(a.truck) === norm(b.truck) &&
    norm(a.pickup) === norm(b.pickup) &&
    norm(a.commodity) === norm(b.commodity) &&
    norm(a.destination) === norm(b.destination)
  );
}

/** Another load (any dispatcher) with the same truck + route within ~4 minutes. */
export function findNearDuplicate(
  loads: Load[],
  candidate: {
    id?: string;
    truck: string;
    pickup: string;
    commodity: string;
    destination: string;
    createdAt: string;
  },
  windowMs = NEAR_DUPLICATE_WINDOW_MS,
): Load | null {
  const t = new Date(candidate.createdAt).getTime();
  if (Number.isNaN(t)) return null;
  let best: Load | null = null;
  let bestDelta = Infinity;
  for (const load of loads) {
    if (candidate.id && load.id === candidate.id) continue;
    if (!sameDispatch(load, candidate)) continue;
    const other = new Date(load.createdAt).getTime();
    if (Number.isNaN(other)) continue;
    const delta = Math.abs(t - other);
    if (delta <= windowMs && delta < bestDelta) {
      best = load;
      bestDelta = delta;
    }
  }
  return best;
}
