import { useEffect, useState } from "react";
import { isTauriRuntime } from "../lib/layout";
import {
  getVersionStatus,
  startVersionWatch,
  subscribeVersionStatus,
  type VersionStatus,
} from "../lib/versionGuard";

export function versionBannerText(
  status: VersionStatus,
  desktop: boolean,
): { text: string; hard: boolean } | null {
  if (status.pauseWrites) {
    return desktop
      ? {
          text: "This desktop app is out of date \u2014 install the newest version. Syncing is paused until you do.",
          hard: true,
        }
      : { text: "A newer version of Load Tracker is available. Reload to keep syncing.", hard: true };
  }
  if (desktop && status.desktopOutdated) {
    return { text: "This desktop app is out of date \u2014 install the newest version.", hard: false };
  }
  if (!desktop && status.softUpdate) {
    return { text: "A newer version of Load Tracker is available. Reload to update.", hard: false };
  }
  return null;
}

export function VersionBanner() {
  const [desktop] = useState(() => isTauriRuntime());
  const [status, setStatus] = useState<VersionStatus>(() => getVersionStatus());
  const [dismissedBuild, setDismissedBuild] = useState<string | null>(null);

  useEffect(() => {
    const unsub = subscribeVersionStatus(setStatus);
    if (import.meta.env.DEV) return unsub;
    const stop = startVersionWatch({ desktop });
    return () => {
      unsub();
      stop();
    };
  }, [desktop]);

  const banner = versionBannerText(status, desktop);
  if (!banner) return null;
  const deployedId = status.deployed?.buildId ?? null;
  if (!banner.hard && dismissedBuild && dismissedBuild === deployedId) return null;

  return (
    <div
      className={banner.hard ? "version-banner is-hard" : "version-banner"}
      role={banner.hard ? "alert" : "status"}
    >
      <span className="version-banner-text">{banner.text}</span>
      {desktop ? null : (
        <button type="button" className="version-banner-btn" onClick={() => window.location.reload()}>
          Reload
        </button>
      )}
      {banner.hard ? null : (
        <button
          type="button"
          className="version-banner-later"
          onClick={() => setDismissedBuild(deployedId)}
        >
          Later
        </button>
      )}
    </div>
  );
}
