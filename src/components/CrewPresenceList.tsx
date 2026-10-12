import { useEffect, useState } from "react";
import { crewDisplayName, joinCrewPresence } from "../lib/presence";
import { useAuth } from "../store/AuthContext";

/** Shows only crew members who are signed in with the app open right now. */
export function CrewPresenceList() {
  const { configured, user } = useAuth();
  const [onlineEmails, setOnlineEmails] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!configured || !user?.email) return;
    return joinCrewPresence(user.email, setOnlineEmails);
  }, [configured, user?.email]);

  if (!configured || !user?.email) return null;

  const me = user.email.toLowerCase();
  const others = [...onlineEmails]
    .filter((email) => email && email !== me)
    .sort((a, b) => crewDisplayName(a).localeCompare(crewDisplayName(b)));
  if (!others.length) return null;

  return (
    <div className="crew-presence">
      {others.map((email) => (
        <span key={email} className="crew-presence-row">
          <span className="crew-dot is-online" aria-hidden="true" />
          {crewDisplayName(email)}
          <span className="sr-only"> (online)</span>
        </span>
      ))}
    </div>
  );
}