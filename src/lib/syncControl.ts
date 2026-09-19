/**
 * Shared sync storm guards: network-error detection, outbound concurrency,
 * backoff after Failed-to-fetch, and single-flight helpers.
 *
 * Keeps Chrome from exhausting its connection pool
 * (net::ERR_INSUFFICIENT_RESOURCES / TypeError: Failed to fetch) when a large
 * outbound queue meets overlapping refresh/flush/focus handlers.
 */

export const HUGE_QUEUE_THRESHOLD = 500;
export const MAX_CLOUD_FETCH_IN_FLIGHT = 2;
export const FLUSH_OP_GAP_MS = 30;
export const MAX_FLUSH_ATTEMPTS_TRANSIENT = 2;
export const NETWORK_BACKOFF_MS = 20_000;
export const CLOUD_REFRESH_DEBOUNCE_MS = 800;

const NETWORK_ERROR_RE =
  /failed to fetch|networkerror|network request failed|load failed|err_insufficient|insufficient.resources|error sending request|timed?\s*out|econnreset|enotfound|fetch failed/i;

export function errorText(error: unknown): string {
  if (error && typeof error === "object" && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) return message;
  }
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "string") return error;
  return "";
}

export function isNetworkSyncError(error: unknown): boolean {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return true;
  if (error instanceof TypeError) return true;
  const text = errorText(error);
  return text.length > 0 && NETWORK_ERROR_RE.test(text);
}

let backoffUntilMs = 0;

export function noteNetworkSyncFailure(error?: unknown): void {
  if (
    error !== undefined &&
    !isNetworkSyncError(error) &&
    (typeof navigator === "undefined" || navigator.onLine)
  ) {
    return;
  }
  backoffUntilMs = Math.max(backoffUntilMs, Date.now() + NETWORK_BACKOFF_MS);
}

export function clearNetworkSyncBackoff(): void {
  backoffUntilMs = 0;
}

export function networkSyncBackoffRemainingMs(now = Date.now()): number {
  return Math.max(0, backoffUntilMs - now);
}

export function isNetworkSyncBackoffActive(now = Date.now()): boolean {
  return networkSyncBackoffRemainingMs(now) > 0;
}

export function hugeQueueMessage(queued: number): string | null {
  if (queued < HUGE_QUEUE_THRESHOLD) return null;
  return `Large sync queue (${queued}). Draining safely one at a time — keep this tab open; do not spam Sync.`;
}

type Waiter = { resolve: () => void };

let inFlight = 0;
const waiters: Waiter[] = [];

function pumpWaiters(): void {
  while (inFlight < MAX_CLOUD_FETCH_IN_FLIGHT && waiters.length) {
    const next = waiters.shift();
    if (!next) break;
    inFlight += 1;
    next.resolve();
  }
}

/** Cap concurrent Supabase HTTP calls app-wide (browser + Tauri). */
export async function withCloudFetchSlot<T>(fn: () => Promise<T>): Promise<T> {
  if (inFlight < MAX_CLOUD_FETCH_IN_FLIGHT) {
    inFlight += 1;
  } else {
    await new Promise<void>((resolve) => {
      waiters.push({ resolve });
    });
  }
  try {
    return await fn();
  } finally {
    inFlight = Math.max(0, inFlight - 1);
    pumpWaiters();
  }
}

/** Test helper — not for app code. */
export function _resetCloudFetchGateForTests(): void {
  inFlight = 0;
  waiters.length = 0;
  backoffUntilMs = 0;
}

export function createSingleFlight<TArgs extends unknown[], TResult>(
  run: (...args: TArgs) => Promise<TResult>,
): (...args: TArgs) => Promise<TResult> {
  let current: Promise<TResult> | null = null;
  return (...args: TArgs) => {
    if (current) return current;
    current = Promise.resolve()
      .then(() => run(...args))
      .finally(() => {
        current = null;
      });
    return current;
  };
}

export function sleepMs(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
