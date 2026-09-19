/**
 * Realtime postgres_changes websockets die silently (sleep/wake, VPN, Tauri,
 * backgrounded phone). LoadsContext already polls + refreshes on focus.
 * Other crew tables used mount+Realtime only, so device B stayed stale until
 * a hard reload. Same fallbacks, no remote deletes.
 *
 * Debounced + single-flight so focus/visibility/online/poll across many
 * providers cannot stampede Supabase (ERR_INSUFFICIENT_RESOURCES).
 */

import {
  CLOUD_REFRESH_DEBOUNCE_MS,
  isNetworkSyncBackoffActive,
} from "./syncControl";

export const CLOUD_REFRESH_INTERVAL_MS = 90_000;

export function attachCloudRefresh(
  refresh: () => void | Promise<void>,
  intervalMs = CLOUD_REFRESH_INTERVAL_MS,
): () => void {
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  let inFlight: Promise<void> | null = null;

  const pull = () => {
    if (isNetworkSyncBackoffActive()) return;
    if (debounceTimer !== null) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      debounceTimer = null;
      if (inFlight) return;
      // Invoke refresh synchronously so callers/tests observe it when the
      // debounce timer fires; still track the promise for single-flight.
      try {
        const result = refresh();
        inFlight = Promise.resolve(result)
          .then(() => undefined)
          .catch(() => undefined)
          .finally(() => {
            inFlight = null;
          });
      } catch {
        inFlight = null;
      }
    }, CLOUD_REFRESH_DEBOUNCE_MS);
  };

  const onVisible = () => {
    if (document.visibilityState === "visible") pull();
  };
  document.addEventListener("visibilitychange", onVisible);
  window.addEventListener("focus", onVisible);
  window.addEventListener("online", pull);
  const pollId = window.setInterval(() => {
    if (document.visibilityState === "visible") pull();
  }, intervalMs);
  return () => {
    if (debounceTimer !== null) clearTimeout(debounceTimer);
    document.removeEventListener("visibilitychange", onVisible);
    window.removeEventListener("focus", onVisible);
    window.removeEventListener("online", pull);
    window.clearInterval(pollId);
  };
}
