// Module-level singleton — lives in the browser JS module cache, survives
// Next.js client-side route changes. Settings page seeds from this on mount
// and writes back on every render so navigating away and returning restores
// the last-known sync status.

export interface SyncSnapshot {
  syncStatus: Record<string, string>;
  loading: Record<string, boolean>;
  syncAllRunning: boolean;
}

const snapshot: SyncSnapshot = {
  syncStatus: {},
  loading: {},
  syncAllRunning: false,
};

export function getSyncSnapshot(): SyncSnapshot {
  return snapshot;
}

export function saveSyncSnapshot(s: SyncSnapshot) {
  snapshot.syncStatus    = { ...s.syncStatus };
  snapshot.loading       = { ...s.loading };
  snapshot.syncAllRunning = s.syncAllRunning;
}
