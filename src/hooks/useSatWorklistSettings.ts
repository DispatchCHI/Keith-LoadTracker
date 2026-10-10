import { useCallback, useEffect, useRef, useState } from "react";
import { attachCloudRefresh } from "../lib/cloudRefresh";
import { DRIVER_ROSTER_POLL_TABS, pollWhenTabs } from "../lib/cloudRefreshTabs";
import type { WorklistPrefix } from "../lib/satWorklist";
import {
  fetchCloudFooter,
  mergeFooter,
  readSatWorklistSettings,
  setPrefixForSaturday,
  upsertCloudFooter,
  writeSatWorklistSettings,
  type SatWorklistSettings,
} from "../lib/satWorklistSettings";
import { useAuth } from "../store/AuthContext";

/** Shared Sat Worklist footer (synced) and per-week title prefix (this desk). */
export function useSatWorklistSettings() {
  const { configured, session, user } = useAuth();
  const cloud = configured && !!session;
  const [settings, setSettings] = useState<SatWorklistSettings>(readSatWorklistSettings);
  const ref = useRef(settings);
  ref.current = settings;

  const save = useCallback((next: SatWorklistSettings) => {
    ref.current = next;
    writeSatWorklistSettings(next);
    setSettings(next);
  }, []);

  const refresh = useCallback(async () => {
    if (!cloud) return;
    const pulled = await fetchCloudFooter();
    // No cloud read, no upload: this desk only writes after it has seen the cloud.
    if (!pulled.ok) return;
    const merged = mergeFooter(readSatWorklistSettings(), pulled.footer);
    save({ ...merged.next, prefixBySaturday: ref.current.prefixBySaturday });
    if (merged.upload) await upsertCloudFooter(merged.upload, user?.id ?? null);
  }, [cloud, save, user?.id]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!cloud) return;
    return attachCloudRefresh(() => void refresh(), {
      shouldPoll: pollWhenTabs(DRIVER_ROSTER_POLL_TABS),
    });
  }, [cloud, refresh]);

  const setFooter = useCallback(
    (footer: string) => {
      const text = footer.replace(/\r\n?/g, "\n").trim();
      if (text === ref.current.footer.trim()) return;
      const updatedAt = new Date().toISOString();
      save({ ...ref.current, footer: text, footerUpdatedAt: updatedAt });
      if (cloud) void upsertCloudFooter({ footer: text, updatedAt }, user?.id ?? null);
    },
    [cloud, save, user?.id],
  );

  const setPrefix = useCallback(
    (saturday: string, prefix: WorklistPrefix) => {
      save(setPrefixForSaturday(ref.current, saturday, prefix));
    },
    [save],
  );

  const prefixFor = useCallback(
    (saturday: string): WorklistPrefix => settings.prefixBySaturday[saturday] ?? "",
    [settings.prefixBySaturday],
  );

  return { footer: settings.footer, setFooter, prefixFor, setPrefix };
}