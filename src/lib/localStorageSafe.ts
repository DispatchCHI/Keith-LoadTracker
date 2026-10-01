/** localStorage.setItem that never throws (QuotaExceeded / private mode). */

const CLOUD_CACHE_KEY = "chitrader.load-tracker.cloud-cache.v1";

function isQuotaError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as DOMException;
  return (
    e.name === "QuotaExceededError" ||
    e.name === "NS_ERROR_DOM_QUOTA_REACHED" ||
    // Legacy WebKit / IE codes
    (e as { code?: number }).code === 22 ||
    (e as { code?: number }).code === 1014
  );
}

/** Drop oversized / duplicate keys so a critical write can land. */
function pruneForQuota(keepKey: string): void {
  try {
    if (keepKey !== CLOUD_CACHE_KEY) localStorage.removeItem(CLOUD_CACHE_KEY);
    const oversized: Array<{ key: string; size: number }> = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key || key === keepKey) continue;
      if (!key.startsWith("chitrader.load-tracker.")) continue;
      const size = (localStorage.getItem(key) ?? "").length;
      if (size >= 8_000) oversized.push({ key, size });
    }
    oversized.sort((a, b) => b.size - a.size);
    for (const { key } of oversized) {
      // Prefer caches / duplicates over primary day stores
      if (key.includes("cloud-cache") || key.includes(".queue") || key.endsWith(".bak")) {
        localStorage.removeItem(key);
      }
    }
  } catch {
    /* ignore prune failures */
  }
}

/**
 * Try setItem; on QuotaExceeded prune then retry once.
 * Never throws — returns false and console.warns if still failing.
 */
export function safeSetItem(key: string, value: string): boolean {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch (err) {
    if (!isQuotaError(err)) {
      console.warn("[localStorageSafe] setItem failed", key, err);
      return false;
    }
    pruneForQuota(key);
    try {
      localStorage.setItem(key, value);
      return true;
    } catch (retryErr) {
      console.warn("[localStorageSafe] QuotaExceeded after prune", key, retryErr);
      return false;
    }
  }
}
