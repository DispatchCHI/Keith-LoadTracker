import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import { isNetworkSyncError } from "./syncControl";
import {
  _resetVersionGuardForTests,
  assertCloudWriteAllowed,
  checkVersionOnce,
  CLOUD_WRITE_PAUSED_MESSAGE,
  compareAppVersions,
  evaluateVersion,
  getVersionStatus,
  INITIAL_VERSION_STATUS,
  isCloudWritePaused,
  isCloudWriteRequest,
  parseDeployedVersion,
  setVersionStatus,
  versionJsonUrl,
  type BuildInfo,
} from "./versionGuard";

const running: BuildInfo = { buildId: "1.1.6-abc-1", appVersion: "1.1.6", syncVersion: 1, minSyncVersion: 1 };
const deployed = (patch: Partial<BuildInfo> = {}) => ({ ...running, ...patch });
const REST = "https://x.supabase.co/rest/v1/driver_roster_entries?id=in.(a)";

function jsonFetch(body: unknown, ok = true): typeof fetch {
  return (async () =>
    ({ ok, json: async () => body }) as unknown as Response) as unknown as typeof fetch;
}

afterEach(() => _resetVersionGuardForTests());

describe("evaluateVersion", () => {
  it("same build: nothing to show, writes allowed", () => {
    const s = evaluateVersion(running, deployed(), { desktop: false });
    expect(s.pauseWrites).toBe(false);
    expect(s.softUpdate).toBe(false);
  });

  it("web: different build is a soft reload notice only", () => {
    const s = evaluateVersion(running, deployed({ buildId: "1.1.6-def-2" }), { desktop: false });
    expect(s.softUpdate).toBe(true);
    expect(s.pauseWrites).toBe(false);
  });

  it("pauses writes when this client's syncVersion is below the deployed minSyncVersion", () => {
    const s = evaluateVersion(running, deployed({ buildId: "n", syncVersion: 2, minSyncVersion: 2 }), {
      desktop: false,
    });
    expect(s.pauseWrites).toBe(true);
    const d = evaluateVersion(running, deployed({ appVersion: "1.2.0", syncVersion: 2, minSyncVersion: 2 }), {
      desktop: true,
    });
    expect(d.pauseWrites).toBe(true);
  });

  it("a newer syncVersion that still accepts this client does not pause", () => {
    const s = evaluateVersion(running, deployed({ syncVersion: 2, minSyncVersion: 1 }), { desktop: false });
    expect(s.pauseWrites).toBe(false);
  });

  it("desktop: newer deployed app version is a soft notice, never a web reload", () => {
    const s = evaluateVersion(running, deployed({ buildId: "other", appVersion: "1.1.7" }), { desktop: true });
    expect(s.desktopOutdated).toBe(true);
    expect(s.softUpdate).toBe(false);
    expect(s.pauseWrites).toBe(false);
    const older = evaluateVersion(running, deployed({ appVersion: "1.1.5" }), { desktop: true });
    expect(older.desktopOutdated).toBe(false);
  });

  it("failed check keeps the previous status (never pauses on its own)", () => {
    expect(evaluateVersion(running, null, { desktop: false })).toEqual(INITIAL_VERSION_STATUS);
    const prev = { ...INITIAL_VERSION_STATUS, softUpdate: true };
    expect(evaluateVersion(running, null, { desktop: false, previous: prev })).toBe(prev);
  });

  it("compares dotted versions numerically", () => {
    expect(compareAppVersions("1.1.10", "1.1.9")).toBe(1);
    expect(compareAppVersions("1.1.6", "1.1.6")).toBe(0);
    expect(compareAppVersions("1.0", "1.0.1")).toBe(-1);
  });
});

describe("parseDeployedVersion", () => {
  it("rejects the SPA index.html fallback and junk", () => {
    expect(parseDeployedVersion(null)).toBeNull();
    expect(parseDeployedVersion("<!doctype html>")).toBeNull();
    expect(parseDeployedVersion({ buildId: "x" })).toBeNull();
  });
  it("accepts a real version.json", () => {
    expect(parseDeployedVersion({ ...running, builtAt: "2026-10-11T00:00:00Z" })?.minSyncVersion).toBe(1);
  });
});

describe("central write gate", () => {
  it("blocks only data writes while paused", () => {
    expect(isCloudWriteRequest(REST, "GET")).toBe(false);
    expect(isCloudWriteRequest(REST, "POST")).toBe(true);
    expect(isCloudWriteRequest(REST, "PATCH")).toBe(true);
    expect(isCloudWriteRequest(REST, "DELETE")).toBe(true);
    expect(isCloudWriteRequest("https://x.supabase.co/rest/v1/rpc/delete_roster_rows", "POST")).toBe(true);
    expect(isCloudWriteRequest("https://x.supabase.co/auth/v1/token?grant_type=refresh_token", "POST")).toBe(false);

    expect(() => assertCloudWriteAllowed(REST, "DELETE")).not.toThrow();
    setVersionStatus({ ...INITIAL_VERSION_STATUS, pauseWrites: true });
    expect(isCloudWritePaused()).toBe(true);
    expect(() => assertCloudWriteAllowed(REST, "DELETE")).toThrow(TypeError);
    expect(() => assertCloudWriteAllowed(REST, "POST")).toThrow(CLOUD_WRITE_PAUSED_MESSAGE);
    expect(() => assertCloudWriteAllowed(REST, "GET")).not.toThrow();
    expect(() => assertCloudWriteAllowed("https://x.supabase.co/auth/v1/token", "POST")).not.toThrow();
  });

  it("a paused write is treated as transient so queues keep the change", () => {
    let thrown: unknown;
    setVersionStatus({ ...INITIAL_VERSION_STATUS, pauseWrites: true });
    try {
      assertCloudWriteAllowed(REST, "POST");
    } catch (error) {
      thrown = error;
    }
    expect(isNetworkSyncError(thrown)).toBe(true);
    // postgrest-js wraps fetch failures into { message: "TypeError: ..." }
    expect(isNetworkSyncError({ message: `TypeError: ${CLOUD_WRITE_PAUSED_MESSAGE}` })).toBe(true);
  });

  it("is wired into the one Supabase fetch every store uses", () => {
    const src = readFileSync(new URL("./supabase.ts", import.meta.url), "utf8");
    expect(src).toMatch(/async function supabaseFetch[\s\S]*assertCloudWriteAllowed\(/);
  });
});

describe("checkVersionOnce", () => {
  it("pauses on a sync-breaking deploy and recovers when it is gone", async () => {
    await checkVersionOnce({ desktop: false, running, fetchImpl: jsonFetch(deployed({ minSyncVersion: 2, syncVersion: 2 })) });
    expect(isCloudWritePaused()).toBe(true);
    await checkVersionOnce({ desktop: false, running, fetchImpl: jsonFetch(deployed()) });
    expect(isCloudWritePaused()).toBe(false);
  });

  it("network failure, HTTP error, or HTML never pauses", async () => {
    const boom = (async () => {
      throw new TypeError("Failed to fetch");
    }) as unknown as typeof fetch;
    await checkVersionOnce({ desktop: false, running, fetchImpl: boom });
    expect(getVersionStatus().pauseWrites).toBe(false);
    await checkVersionOnce({ desktop: false, running, fetchImpl: jsonFetch({}, false) });
    expect(getVersionStatus().pauseWrites).toBe(false);
    const html = (async () =>
      ({ ok: true, json: async () => { throw new SyntaxError("Unexpected token <"); } }) as unknown as Response) as unknown as typeof fetch;
    await checkVersionOnce({ desktop: false, running, fetchImpl: html });
    expect(getVersionStatus().pauseWrites).toBe(false);
  });

  it("a failed check while paused stays paused (does not unpause on a blip)", async () => {
    setVersionStatus({ ...INITIAL_VERSION_STATUS, pauseWrites: true });
    await checkVersionOnce({ desktop: false, running, fetchImpl: jsonFetch(null, false) });
    expect(isCloudWritePaused()).toBe(true);
  });

  it("desktop checks the deployed web origin; web checks its own origin", () => {
    expect(versionJsonUrl(true, 1)).toBe("https://keith-load-tracker.pages.dev/version.json?t=1");
    expect(versionJsonUrl(false, 1)).toBe("/version.json?t=1");
  });
});
