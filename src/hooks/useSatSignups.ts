import { useEffect, useState } from "react";
import { SAT_SIGNUP_REFRESH_MS, fetchSatSignups, type SatSignup } from "../lib/satSignups";

/**
 * Sat Roster sign-ups from Keith's Google Form sheet. Pulls when `enabled`
 * turns on (Sat Roster opens) and every few minutes while it stays open.
 * Failures keep the last good list; display only, never touches roster data.
 */
export function useSatSignups(enabled: boolean): { signups: SatSignup[]; error: boolean } {
  const [signups, setSignups] = useState<SatSignup[]>([]);
  const [error, setError] = useState(false);
  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    const pull = () => {
      fetchSatSignups()
        .then((rows) => {
          if (!alive) return;
          setSignups(rows);
          setError(false);
        })
        .catch(() => {
          if (alive) setError(true);
        });
    };
    pull();
    const id = window.setInterval(() => {
      if (document.visibilityState !== "hidden") pull();
    }, SAT_SIGNUP_REFRESH_MS);
    return () => {
      alive = false;
      window.clearInterval(id);
    };
  }, [enabled]);
  return { signups, error };
}