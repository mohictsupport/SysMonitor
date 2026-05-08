// Alert state tracking to prevent duplicate notifications
// Stores the last known state of each site to only notify on state changes

const STORAGE_KEY = "sysmonitor.alertState.v1";
const NOTIFICATION_COOLDOWN_MS = 60000; // 1 minute cooldown between notifications for same site

export interface SiteAlertState {
  siteId: string;
  lastStatus: "online" | "offline" | "unknown";
  lastNotifiedAt: number; // timestamp of last notification
  lastCheckedAt: number; // timestamp of last check
}

export function loadAlertStates(): Record<string, SiteAlertState> {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, SiteAlertState>;
    return parsed || {};
  } catch {
    return {};
  }
}

export function saveAlertStates(states: Record<string, SiteAlertState>) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(states));
  } catch {
    // ignore quota errors
  }
}

export function getAlertState(siteId: string): SiteAlertState | null {
  const states = loadAlertStates();
  return states[siteId] || null;
}

export function updateAlertState(siteId: string, status: "online" | "offline" | "unknown") {
  const states = loadAlertStates();
  const now = Date.now();

  states[siteId] = {
    siteId,
    lastStatus: status,
    lastNotifiedAt: now,
    lastCheckedAt: now,
  };

  saveAlertStates(states);
}

export function shouldNotifyStatusChange(
  siteId: string,
  currentStatus: "online" | "offline" | "unknown",
): { shouldNotify: boolean; previousStatus: "online" | "offline" | "unknown" | null } {
  const state = getAlertState(siteId);
  const previousStatus = state?.lastStatus || null;
  const now = Date.now();

  // No previous state - this is the first check, don't notify
  if (!previousStatus) {
    return { shouldNotify: false, previousStatus };
  }

  // Status hasn't changed - don't notify
  if (previousStatus === currentStatus) {
    return { shouldNotify: false, previousStatus };
  }

  // Check cooldown - don't notify if last notification was too recent
  if (state && state.lastNotifiedAt) {
    const timeSinceLastNotification = now - state.lastNotifiedAt;
    if (timeSinceLastNotification < NOTIFICATION_COOLDOWN_MS) {
      return { shouldNotify: false, previousStatus };
    }
  }

  // Status changed and cooldown passed - notify
  return { shouldNotify: true, previousStatus };
}

export function clearAlertState(siteId: string) {
  const states = loadAlertStates();
  delete states[siteId];
  saveAlertStates(states);
}

export function clearAllAlertStates() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(STORAGE_KEY);
}
