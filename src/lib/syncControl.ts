/**
 * Shared sync storm guards: network-error detection, outbound concurrency,
 * backoff after Failed-to-fetch, and single-flight helpers.
 *
 * Keeps Chrome from exhausting its connection pool
 * (net::ERR_INSUFFICIENT_RESOURCES / TypeError: Failed to fetch) when a large
 * outbound queue meets overlapping refresh/flush/focus handlers.
 *
 * Auth token refresh MUST bypass the data-fetch gate — otherwise a nested
 * /auth/v1/token call waits for a slot the parent request already holds and
 * every flush/refresh hangs forever at "Syncing…".
 */

export const HUGE_QUEUE_THRESHOLD = 500;
export const MAX_CLOUD_FETCH_IN_FLIGHT = 2;
export const FLUSH_OP_GAP_MS = 30;
/** Consecutive upserts per HTTP call — one connection, much faster drain. */
export const FLUSH_UPSERT_BATCH_SIZE = 25;
export const MAX_FLUSH_ATTEMPTS_TRANSIENT = 2;
export const NETWORK_BACKOFF_MS = 20_000;
export const CLOUD_REFRESH_DEBOUNCE_MS = 800;
/** Abort hung Supabase data fetches so slots cannot stick forever. */
export const CLOUD_FETCH_TIMEOUT_MS = 45_000;
/** Fail waiters instead of deadlocking when both slots are stuck. */
export const CLOUD_FETCH_SLOT_WAIT_MS = 30_000;

const NETWORK_ERROR_RE =
  /failed to fetch|networkerror|network request failed|load failed|err_insufficient|insufficient.resources|error sending request|timed?\s*out|econnreset|enotfound|fetch failed|slot wait timed out|cloud fetch timed out/i;

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

/** Supabase GoTrue paths — must never take a data-fetch slot (nested deadlock). */
export function isAuthSupabaseUrl(url: string): boolean {
  return /\/auth\/v1\//i.test(url);
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
  return `Large sync queue (${queued}). Draining safely — keep this tab open; do not spam Sync.`;
}

type Waiter = { resolve: () => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> };

let inFlight = 0;
const waiters: Waiter[] = [];

function pumpWaiters(): void {
  while (inFlight < MAX_CLOUD_FETCH_IN_FLIGHT && waiters.length) {
    const next = waiters.shift();
    if (!next) break;
    clearTimeout(next.timer);
    inFlight += 1;
    next.resolve();
  }
}

/** Cap concurrent Supabase *data* HTTP calls app-wide (browser + Tauri). */
export async function withCloudFetchSlot<T>(fn: () => Promise<T>): Promise<T> {
  if (inFlight < MAX_CLOUD_FETCH_IN_FLIGHT) {
    inFlight += 1;
  } else {
    await new Promise<void>((resolve, reject) => {
      const waiter: Waiter = {
        resolve,
        reject,
        timer: setTimeout(() => {
          const idx = waiters.indexOf(waiter);
          if (idx >= 0) waiters.splice(idx, 1);
          reject(new TypeError("Cloud fetch slot wait timed out"));
        }, CLOUD_FETCH_SLOT_WAIT_MS),
      };
      waiters.push(waiter);
    });
  }
  try {
    return await fn();
  } finally {
    inFlight = Math.max(0, inFlight - 1);
    pumpWaiters();
  }
}

/**
 * Run `fetch` (or Tauri invoke wrapper) with an AbortSignal timeout so a hung
 * TCP socket cannot pin a cloud-fetch slot forever.
 */
export async function fetchWithCloudTimeout(
  fetchImpl: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>,
  input: RequestInfo | URL,
  init?: RequestInit,
  timeoutMs = CLOUD_FETCH_TIMEOUT_MS,
): Promise<Response> {
  const controller = new AbortController();
  const upstream = init?.signal;
  const onAbort = () => controller.abort();
  if (upstream) {
    if (upstream.aborted) controller.abort();
    else upstream.addEventListener("abort", onAbort, { once: true });
  }
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new TypeError("Cloud fetch timed out"));
    }, timeoutMs);
  });
  try {
    return await Promise.race([
      fetchImpl(input, { ...init, signal: controller.signal }),
      timeoutPromise,
    ]);
  } catch (error) {
    if (
      error instanceof TypeError &&
      /cloud fetch timed out/i.test(error.message)
    ) {
      throw error;
    }
    if (controller.signal.aborted && !(upstream && upstream.aborted)) {
      throw new TypeError("Cloud fetch timed out");
    }
    throw error;
  } finally {
    if (timer !== undefined) clearTimeout(timer);
    if (upstream) upstream.removeEventListener("abort", onAbort);
  }
}

/** Test helper — not for app code. */
export function _resetCloudFetchGateForTests(): void {
  for (const waiter of waiters) clearTimeout(waiter.timer);
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
