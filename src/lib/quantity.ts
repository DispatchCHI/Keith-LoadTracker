export const MIN_LOAD_QTY = 1;
export const MAX_LOAD_QTY = 40;

export function clampLoadQty(value: number): number {
  if (!Number.isFinite(value)) return MIN_LOAD_QTY;
  return Math.min(MAX_LOAD_QTY, Math.max(MIN_LOAD_QTY, Math.floor(value)));
}

/** Unique createdAt stamps one second apart so a batch sorts in entry order. */
export function batchCreatedAt(baseIso: string, index: number): string {
  const t = new Date(baseIso).getTime();
  if (Number.isNaN(t)) return baseIso;
  return new Date(t + index * 1000).toISOString();
}
