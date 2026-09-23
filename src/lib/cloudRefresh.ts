/**
 * Shared cloud-refresh gating for the app.
 *
 * Previous behavior let every provider schedule its own refresh independently.
 * On flaky Wi-Fi / VPN / Tauri desktop sessions, those refreshes can pile up
 * and trigger a sync storm (failed-to-fetch + ERR_INSUFFICIENT_RESOURCES).
 *
 * This module now centralizes refresh scheduling across the app so repeated
 * focus/visibility/online events collapse into a single debounced run.
 */

import {
  CLOUD_REFRESH_DEBOUNCE_MS,
  isNetworkSyncBackoffActive,
} from "./syncControl";
import { getSupabase } from "./supabase";

export const CLOUD_REFRESH_INTERVAL_MS = 90_000;

type CloudRefreshFn = () => void | Promise<void>;

const GLOBAL_REFRESHES = new Set<CloudRefreshFn>();
let globalDebounceTimer: ReturnType<typeof setTimeout> | null = null;
let globalInFlight: Promise<void> | null = null;

function queueGlobalRefresh(): void {
  if (globalDebounceTimer !== null) clearTimeout(globalDebounceTimer);

  globalDebounceTimer = setTimeout(() => {
    globalDebounceTimer = null;
    if (isNetworkSyncBackoffActive() || globalInFlight) return;

    const queued = [...GLOBAL_REFRESHES];
    if (!queued.length) return;

    GLOBAL_REFRESHES.clear();
    globalInFlight = Promise.allSettled(
      queued.map((refresh) => Promise.resolve(refresh())),
    )
      .then(() => undefined)
      .finally(() => {
        globalInFlight = null;
        if (GLOBAL_REFRESHES.size > 0) queueGlobalRefresh();
      });
  }, CLOUD_REFRESH_DEBOUNCE_MS);
}

/**
 * Schedule a refresh, but only run one debounced refresh across the app at a time.
 * Multiple contexts can call this safely without creating a sync storm.
 */
export function scheduleCloudRefresh(refresh: CloudRefreshFn): void {
  GLOBAL_REFRESHES.add(refresh);
  queueGlobalRefresh();
}

export function attachCloudRefresh(
  refresh: CloudRefreshFn,
  intervalMs = CLOUD_REFRESH_INTERVAL_MS,
): () => void {
  const run = () => {
    if (isNetworkSyncBackoffActive()) return;
    scheduleCloudRefresh(refresh);
  };

  const onVisible = () => {
    if (document.visibilityState === "visible") run();
  };

  document.addEventListener("visibilitychange", onVisible);
  window.addEventListener("focus", onVisible);
  window.addEventListener("online", run);

  const pollId = window.setInterval(() => {
    if (document.visibilityState === "visible") run();
  }, intervalMs);

  return () => {
    document.removeEventListener("visibilitychange", onVisible);
    window.removeEventListener("focus", onVisible);
    window.removeEventListener("online", run);
    window.clearInterval(pollId);
  };
}

/**
 * Subscribe to postgres_changes on crew tables so other desks see edits
 * immediately. Events are funneled through scheduleCloudRefresh so a burst
 * of row writes collapses into one pull instead of a sync storm.
 * Tables must already be in the supabase_realtime publication.
 */
export function attachCrewTableRealtime(
  channelName: string,
  tables: string[],
  onChange: CloudRefreshFn,
): () => void {
  const supabase = getSupabase();
  if (!supabase || !tables.length) return () => {};

  let channel = supabase.channel(channelName);
  for (const table of tables) {
    channel = channel.on(
      "postgres_changes",
      { event: "*", schema: "public", table },
      () => {
        scheduleCloudRefresh(onChange);
      },
    );
  }
  channel.subscribe();

  return () => {
    void supabase.removeChannel(channel);
  };
}
