import { useAuth } from "../store/AuthContext";
import { useLoads } from "../store/LoadsContext";
import { HUGE_QUEUE_THRESHOLD, hugeQueueMessage } from "../lib/syncControl";
import { CrewPresenceList } from "./CrewPresenceList";
import { ThemeToggle } from "./ThemeToggle";

export function SessionBar() {
  const { configured, user, displayName, signOut } = useAuth();
  const {
    syncStatus,
    queuedCount,
    lastSyncError,
    uploadLocalLoads,
    localPendingCount,
    pushAllLoadsToCloud,
    flushPendingQueue,
  } = useLoads();

  if (!configured) {
    return (
      <div className="session-bar">
        <span>This device only · set Supabase env to share</span>
        <span className="session-actions">
          <ThemeToggle />
        </span>
      </div>
    );
  }

  const statusLabel =
    syncStatus === "local"
      ? "This device only · set Supabase env to share"
      : syncStatus === "offline"
        ? queuedCount
          ? `Offline · ${queuedCount} queued`
          : "Offline"
        : syncStatus === "syncing"
          ? queuedCount
            ? `Syncing… · ${queuedCount} queued`
            : "Syncing…"
          : syncStatus === "error"
            ? queuedCount
              ? `Sync error · ${queuedCount} queued${lastSyncError ? ` · ${lastSyncError}` : ""}`
              : lastSyncError
                ? `Sync error · ${lastSyncError}`
                : "Sync error"
            : queuedCount
              ? `${queuedCount} queued`
              : "Live";

  const hugeNotice = hugeQueueMessage(queuedCount);
  const statusWithHuge = hugeNotice ? `${statusLabel} · ${hugeNotice}` : statusLabel;
  const hugeQueue = queuedCount >= HUGE_QUEUE_THRESHOLD;
  const needsDrain = queuedCount > 0 || syncStatus === "error";
  const pushLabel = needsDrain ? "Sync now" : "Push all to cloud";

  return (
    <div className="session-bar">
      <div className="session-info">
        <span className={syncStatus === "error" ? "session-status is-error" : undefined}>
          {displayName}
          {user?.email ? ` · ${user.email}` : ""} · {statusWithHuge}
        </span>
        <CrewPresenceList />
      </div>
      <span className="session-actions">
        <ThemeToggle />
        {localPendingCount > 0 && !hugeQueue ? (
          <button
            type="button"
            className="text-btn amber"
            onClick={() => void uploadLocalLoads()}
            disabled={syncStatus === "syncing"}
          >
            Upload {localPendingCount} local
          </button>
        ) : null}
        <button
          type="button"
          className="text-btn amber"
          onClick={() => {
            // Pending ops: flush only. Refresh/re-merge fights a large drain.
            // Stay clickable while Syncing so a recovered/timed-out drain can
            // be nudged — flushQueue single-flights overlapping clicks.
            if (needsDrain) void flushPendingQueue();
            else void pushAllLoadsToCloud();
          }}
        >
          {pushLabel}
        </button>
        <button type="button" className="text-btn amber" onClick={() => void signOut()}>
          Log out
        </button>
      </span>
    </div>
  );
}
