import type { Load } from "../types";

export const QUEUE_KEY = "chitrader.load-tracker.queue.v1";

export type QueueOp =
  | { opId: string; kind: "upsert"; load: Load; queuedAt: string }
  | { opId: string; kind: "delete"; loadId: string; queuedAt: string };

export function readQueue(): QueueOp[] {
  try {
    const raw = localStorage.getItem(QUEUE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as QueueOp[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function writeQueue(ops: QueueOp[]): void {
  localStorage.setItem(QUEUE_KEY, JSON.stringify(ops));
}

export function enqueueUpsert(load: Load): QueueOp[] {
  const next = readQueue().filter((op) => {
    if (op.kind === "upsert") return op.load.id !== load.id;
    if (op.kind === "delete") return op.loadId !== load.id;
    return true;
  });
  next.push({
    opId: crypto.randomUUID(),
    kind: "upsert",
    load,
    queuedAt: new Date().toISOString(),
  });
  writeQueue(next);
  return next;
}

export function enqueueDelete(loadId: string): QueueOp[] {
  const next = readQueue().filter((op) => {
    if (op.kind === "upsert") return op.load.id !== loadId;
    if (op.kind === "delete") return op.loadId !== loadId;
    return true;
  });
  next.push({
    opId: crypto.randomUUID(),
    kind: "delete",
    loadId,
    queuedAt: new Date().toISOString(),
  });
  writeQueue(next);
  return next;
}

export function pendingIds(ops = readQueue()): Set<string> {
  const ids = new Set<string>();
  for (const op of ops) {
    if (op.kind === "upsert") ids.add(op.load.id);
    else ids.add(op.loadId);
  }
  return ids;
}
