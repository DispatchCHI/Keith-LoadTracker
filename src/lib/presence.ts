/**
 * Small fixed crew list + a Supabase Realtime Presence channel so everyone
 * can see who else currently has the app open (green dot) vs not (red dot).
 * "Online" means "has this app open in a browser tab right now" — not
 * clocked-in status or anything else.
 *
 * One shared channel per browser. Remounting CrewPresenceList must not
 * open a second presence socket.
 */

import type { RealtimeChannel } from "@supabase/supabase-js";
import { getSupabase } from "./supabase";

/** Keep in sync with Auth users on the live Supabase project. */
export const CREW_ROSTER: { email: string; name: string }[] = [
  { email: "klawson@mrbults.com", name: "K Lawson" },
  { email: "treyling@mrbults.com", name: "T Reyling" },
  { email: "mburklow@mrbults.com", name: "M Burklow" },
  { email: "myork@mrbults.com", name: "M York" },
];

export function crewDisplayName(email: string): string {
  const match = CREW_ROSTER.find(
    (person) => person.email.toLowerCase() === email.toLowerCase(),
  );
  return match?.name ?? email.split("@")[0];
}

const PRESENCE_CHANNEL_NAME = "crew-presence";

type PresenceListener = (onlineEmails: Set<string>) => void;

let presenceChannel: RealtimeChannel | null = null;
let presenceKey: string | null = null;
let presenceRefs = 0;
const presenceListeners = new Set<PresenceListener>();
let tracked = false;

function emitState(): void {
  if (!presenceChannel) return;
  const state = presenceChannel.presenceState();
  const emails = new Set(Object.keys(state));
  for (const listener of presenceListeners) listener(emails);
}

/**
 * Joins the shared presence channel as `email`, and calls `onChange` with the
 * set of currently-online emails whenever presence state changes. Returns an
 * unsubscribe function.
 */
export function joinCrewPresence(
  email: string,
  onChange: (onlineEmails: Set<string>) => void,
): () => void {
  const supabase = getSupabase();
  if (!supabase) return () => {};
  const key = email.toLowerCase();

  presenceListeners.add(onChange);
  presenceRefs += 1;

  if (!presenceChannel || presenceKey !== key) {
    if (presenceChannel) {
      void supabase.removeChannel(presenceChannel);
      tracked = false;
    }
    presenceKey = key;
    presenceChannel = supabase.channel(PRESENCE_CHANNEL_NAME, {
      config: { presence: { key } },
    });
    presenceChannel
      .on("presence", { event: "sync" }, emitState)
      .on("presence", { event: "join" }, emitState)
      .on("presence", { event: "leave" }, emitState)
      .subscribe((status) => {
        if (status === "SUBSCRIBED" && !tracked) {
          tracked = true;
          void presenceChannel?.track({ online_at: new Date().toISOString() });
        }
      });
  } else {
    emitState();
  }

  return () => {
    presenceListeners.delete(onChange);
    presenceRefs -= 1;
    if (presenceRefs > 0) return;
    if (presenceChannel) {
      void supabase.removeChannel(presenceChannel);
      presenceChannel = null;
    }
    presenceKey = null;
    tracked = false;
  };
}
