/**
 * Stale-build guard. Compares this running build with the deployed
 * /version.json and decides whether cloud writes must pause.
 *
 * - syncVersion < deployed minSyncVersion  -> pause ALL cloud writes/deletes
 *   (central gate in supabase.ts) and show a non-dismissable banner.
 * - web build differs from deployed build  -> soft "Reload to update" banner.
 * - desktop app older than deployed appVersion -> soft "install newest" notice.
 * - version.json fetch / parse failure       -> change nothing (never pause).
 */
import { MIN_SYNC_VERSION, SYNC_VERSION } from "./syncVersion";

export const VERSION_CHECK_INTERVAL_MS = 3 * 60 * 1000;
export const DEPLOYED_WEB_ORIGIN = "https://keith-load-tracker.pages.dev";

export type BuildInfo = {
  buildId: string;
  appVersion: string;
  syncVersion: number;
  minSyncVersion: number;
};

export type DeployedVersion = BuildInfo & { builtAt?: string };

export type VersionStatus = {
  /** Cloud writes are blocked until reload / reinstall. */
  pauseWrites: boolean;
  /** Web: a different build is deployed (reload picks it up). */
  softUpdate: boolean;
  /** Desktop: a newer app version is deployed (install it). */
  desktopOutdated: boolean;
  deployed: DeployedVersion | null;
  checkedAt: string | null;
};

export const INITIAL_VERSION_STATUS: VersionStatus = {
  pauseWrites: false,
  softUpdate: false,
  desktopOutdated: false,
  deployed: null,
  checkedAt: null,
};

declare const __BUILD_ID__: string | undefined;
declare const __APP_VERSION__: string | undefined;

export function runningBuild(): BuildInfo {
  return {
    buildId: typeof __BUILD_ID__ === "string" ? __BUILD_ID__ : "dev",
    appVersion: typeof __APP_VERSION__ === "string" ? __APP_VERSION__ : "0.0.0",
    syncVersion: SYNC_VERSION,
    minSyncVersion: MIN_SYNC_VERSION,
  };
}

/** Strict parse: anything that is not a real version.json (e.g. SPA index.html) is null. */
export function parseDeployedVersion(raw: unknown): DeployedVersion | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.buildId !== "string" || !r.buildId) return null;
  if (typeof r.appVersion !== "string") return null;
  const sync = Number(r.syncVersion);
  const min = Number(r.minSyncVersion);
  if (!Number.isFinite(sync) || !Number.isFinite(min)) return null;
  return {
    buildId: r.buildId,
    appVersion: r.appVersion,
    syncVersion: sync,
    minSyncVersion: min,
    builtAt: typeof r.builtAt === "string" ? r.builtAt : undefined,
  };
}

/** -1 / 0 / 1 for dotted numeric versions ("1.1.6" vs "1.1.10"). */
export function compareAppVersions(a: string, b: string): number {
  const pa = a.split(".").map((part) => parseInt(part, 10) || 0);
  const pb = b.split(".").map((part) => parseInt(part, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i += 1) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d) return d > 0 ? 1 : -1;
  }
  return 0;
}

export function evaluateVersion(
  running: BuildInfo,
  deployed: DeployedVersion | null,
  opts: { desktop: boolean; previous?: VersionStatus; now?: string },
): VersionStatus {
  // Network / parse failure: keep whatever we already knew. Never pause on it.
  if (!deployed) return opts.previous ?? INITIAL_VERSION_STATUS;
  const pauseWrites = running.syncVersion < deployed.minSyncVersion;
  return {
    pauseWrites,
    softUpdate: !opts.desktop && running.buildId !== "dev" && deployed.buildId !== running.buildId,
    desktopOutdated: opts.desktop && compareAppVersions(deployed.appVersion, running.appVersion) > 0,
    deployed,
    checkedAt: opts.now ?? new Date().toISOString(),
  };
}

// ---- central write gate (read by supabase.ts on every request) ----

let status: VersionStatus = INITIAL_VERSION_STATUS;
const listeners = new Set<(s: VersionStatus) => void>();

export function getVersionStatus(): VersionStatus {
  return status;
}

export function setVersionStatus(next: VersionStatus): void {
  status = next;
  for (const fn of listeners) fn(status);
}

export function subscribeVersionStatus(fn: (s: VersionStatus) => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function isCloudWritePaused(): boolean {
  return status.pauseWrites;
}

const READ_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * Data writes the gate blocks: any non-read call to PostgREST (insert /
 * upsert / update / delete / rpc) or Storage. Auth (/auth/v1) and Realtime
 * stay open so a paused desk can still sign in and read.
 */
export function isCloudWriteRequest(url: string, method: string): boolean {
  if (READ_METHODS.has(method.toUpperCase())) return false;
  return /\/(rest|storage)\/v1\//i.test(url);
}

export const CLOUD_WRITE_PAUSED_MESSAGE =
  "Cloud writes paused: this Load Tracker build is out of date. Reload / update to keep syncing.";

/** Throws a TypeError so every queue treats it as transient and keeps the change for later. */
export function assertCloudWriteAllowed(url: string, method: string): void {
  if (isCloudWritePaused() && isCloudWriteRequest(url, method)) {
    throw new TypeError(CLOUD_WRITE_PAUSED_MESSAGE);
  }
}

// ---- checker ----

export function versionJsonUrl(desktop: boolean, now = Date.now()): string {
  const base = desktop ? DEPLOYED_WEB_ORIGIN : "";
  return `${base}/version.json?t=${now}`;
}

export async function fetchDeployedVersion(
  url: string,
  fetchImpl: typeof fetch = fetch,
): Promise<DeployedVersion | null> {
  try {
    const res = await fetchImpl(url, { cache: "no-store" });
    if (!res.ok) return null;
    return parseDeployedVersion(await res.json());
  } catch {
    return null;
  }
}

export async function checkVersionOnce(opts: {
  desktop: boolean;
  fetchImpl?: typeof fetch;
  running?: BuildInfo;
}): Promise<VersionStatus> {
  const deployed = await fetchDeployedVersion(versionJsonUrl(opts.desktop), opts.fetchImpl);
  const next = evaluateVersion(opts.running ?? runningBuild(), deployed, {
    desktop: opts.desktop,
    previous: status,
  });
  if (next !== status) setVersionStatus(next);
  return next;
}

/** Check on load, on focus / tab visible, and every ~3 minutes. Returns a stop fn. */
export function startVersionWatch(opts: { desktop: boolean }): () => void {
  if (typeof window === "undefined") return () => undefined;
  let running = false;
  const run = () => {
    if (running) return;
    running = true;
    void checkVersionOnce({ desktop: opts.desktop }).finally(() => {
      running = false;
    });
  };
  const onVisible = () => {
    if (document.visibilityState === "visible") run();
  };
  run();
  const timer = window.setInterval(run, VERSION_CHECK_INTERVAL_MS);
  window.addEventListener("focus", run);
  document.addEventListener("visibilitychange", onVisible);
  return () => {
    window.clearInterval(timer);
    window.removeEventListener("focus", run);
    document.removeEventListener("visibilitychange", onVisible);
  };
}

/** Test helper — not for app code. */
export function _resetVersionGuardForTests(): void {
  status = INITIAL_VERSION_STATUS;
  listeners.clear();
}
