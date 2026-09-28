/**
 * Shared cloud-refresh gating for the app.
 *
 * Previous behavior let every provider schedule its own refresh independently.
 * On flaky Wi-Fi / VPN / Tauri desktop sessions, those refreshes can pile up
 * and trigger a sync storm (failed-to-fetch + ERR_INSUFFICIENT_RESOURCES).
 *
 * This module centralizes refresh scheduling across the app so repeated
 * focus/visibility/online events collapse into a single debounced run.
 *
 * Optional `shouldPoll` gates interval/focus/online pulls (and tab-change
 * nudges) so cold tables only hit the network while their screen is active.
 * Callers still own the mount-time first fetch.
 */

import { subscribeActiveTab } from "./activeTab";
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

export type CloudRefreshOptions = {
  intervalMs?: number;
  /**
   * When false, skip interval / focus / visibility / online pulls.
   * Becoming true (e.g. user opens that tab) triggers a pull while visible.
   */
  shouldPoll?: () => boolean;
  /** Override for tests; defaults to App's active-tab signal. */
  subscribeTab?: (listener: () => void) => () => void;
};

export function attachCloudRefresh(
  refresh: CloudRefreshFn,
  intervalOrOptions: number | CloudRefreshOptions = CLOUD_REFRESH_INTERVAL_MS,
): () => void {
  const options: CloudRefreshOptions =
    typeof intervalOrOptions === "number"
      ? { intervalMs: intervalOrOptions }
      : intervalOrOptions ?? {};
  const intervalMs = options.intervalMs ?? CLOUD_REFRESH_INTERVAL_MS;
  const shouldPoll = options.shouldPoll ?? (() => true);
  const subscribeTab = options.subscribeTab ?? subscribeActiveTab;

  const run = () => {
    if (isNetworkSyncBackoffActive()) return;
    scheduleCloudRefresh(refresh);
  };

  const pullIfAllowed = () => {
    if (!shouldPoll()) return;
    if (document.visibilityState !== "visible") return;
    run();
  };

  const onVisible = () => {
    if (document.visibilityState === "visible") pullIfAllowed();
  };
  const onOnline = () => {
    pullIfAllowed();
  };

  document.addEventListener("visibilitychange", onVisible);
  window.addEventListener("focus", onVisible);
  window.addEventListener("online", onOnline);

  const pollId = window.setInterval(() => {
    pullIfAllowed();
  }, intervalMs);

  const stopTab = subscribeTab(() => {
    pullIfAllowed();
  });

  return () => {
    document.removeEventListener("visibilitychange", onVisible);
    window.removeEventListener("focus", onVisible);
    window.removeEventListener("online", onOnline);
    window.clearInterval(pollId);
    stopTab();
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
