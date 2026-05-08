// Uptime history tracking system
// Stores connection state transitions to calculate real uptime percentage
import { sendSiteStatusNotification } from "./electron-notifications";
import {
  saveUptimeHistory,
  batchSaveUptimeHistory,
  cleanupOldUptimeHistory,
} from "./firebase-store";
import { auth } from "./firebase";

const STORAGE_KEY = "sysmonitor.uptimeHistory.v1";
const HISTORY_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const UPTIME_WINDOW_MS = 24 * 60 * 60 * 1000; // 24 hours for uptime calculation

// Batch sync queue
let syncQueue: Array<{ siteId: string; siteName: string; status: "online" | "offline" }> = [];
let syncTimer: NodeJS.Timeout | null = null;
const SYNC_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
const MAX_QUEUE_SIZE = 100;

export interface UptimeEvent {
  siteId: string;
  status: "online" | "offline";
  timestamp: number;
}

export interface UptimeHistory {
  events: UptimeEvent[];
}

export function loadHistory(): UptimeHistory {
  if (typeof window === "undefined") return { events: [] };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { events: [] };
    const parsed = JSON.parse(raw) as UptimeHistory;
    return parsed || { events: [] };
  } catch {
    return { events: [] };
  }
}

function saveHistory(history: UptimeHistory): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
  } catch {
    // ignore quota errors
  }
}

function cleanOldHistory(history: UptimeHistory): UptimeHistory {
  const now = Date.now();
  return {
    events: history.events.filter((event) => now - event.timestamp < HISTORY_MAX_AGE_MS),
  };
}

// Process batch sync to Firestore
async function processBatchSync(): Promise<void> {
  if (syncQueue.length === 0) return;

  const user = auth.currentUser;
  if (!user) {
    syncQueue = [];
    return;
  }

  const entriesToSync = [...syncQueue];
  syncQueue = [];

  try {
    const entries = entriesToSync.map((entry) => ({
      siteId: entry.siteId,
      siteName: entry.siteName,
      status: entry.status,
      userId: user.uid,
    }));

    const result = await batchSaveUptimeHistory(entries);
    console.log(`[Batch Sync] Synced ${result.success} uptime entries, ${result.failed} failed`);

    // Cleanup old entries after successful sync
    await cleanupOldUptimeHistory(user.uid);
  } catch (error) {
    console.error("[Batch Sync] Failed to sync uptime history:", error);
  }
}

// Schedule batch sync
function scheduleBatchSync(): void {
  if (syncTimer) {
    clearTimeout(syncTimer);
  }

  syncTimer = setTimeout(() => {
    processBatchSync();
    scheduleBatchSync(); // Reschedule
  }, SYNC_INTERVAL_MS);
}

// Add to sync queue
function addToSyncQueue(siteId: string, siteName: string, status: "online" | "offline"): void {
  syncQueue.push({ siteId, siteName, status });

  // Sync immediately if queue is full
  if (syncQueue.length >= MAX_QUEUE_SIZE) {
    processBatchSync();
  }

  // Start timer if not running
  if (!syncTimer) {
    scheduleBatchSync();
  }
}

export function recordStateChange(
  siteId: string,
  status: "online" | "offline",
  siteName?: string,
  siteLocation?: string,
): void {
  const history = loadHistory();
  const cleaned = cleanOldHistory(history);

  // Only add event if status changed from last event for this site
  const lastEvent = cleaned.events
    .filter((e) => e.siteId === siteId)
    .sort((a, b) => b.timestamp - a.timestamp)[0];

  if (lastEvent && lastEvent.status === status) {
    // No change, don't record
    return;
  }

  cleaned.events.push({
    siteId,
    status,
    timestamp: Date.now(),
  });

  saveHistory(cleaned);

  // Send deduplicated Telegram notification for state change
  sendSiteStatusNotification(siteId, siteName || siteId, status, siteLocation);

  // Queue for batch sync to Firestore if user is authenticated
  const user = auth.currentUser;
  if (user && siteName) {
    addToSyncQueue(siteId, siteName, status);
  }
}

export function calculateUptime(
  siteId: string,
  windowMs: number = UPTIME_WINDOW_MS,
  currentStatus?: "online" | "offline",
  historyOverride?: UptimeHistory,
): number {
  const history = historyOverride || loadHistory();
  const now = Date.now();
  const windowStart = now - windowMs;

  // Get events for this site within the window
  const siteEvents = history.events
    .filter((e) => e.siteId === siteId && e.timestamp >= windowStart)
    .sort((a, b) => a.timestamp - b.timestamp);

  // If no events in window, check if we have any prior state
  if (siteEvents.length === 0) {
    // Check if there was state before the window
    const eventsBeforeWindow = history.events
      .filter((e) => e.siteId === siteId && e.timestamp < windowStart)
      .sort((a, b) => b.timestamp - a.timestamp);

    if (eventsBeforeWindow.length > 0) {
      // We have prior state - let the normal calculation handle it
      // The calculation below will use this as the starting state
    } else {
      // No history at all - use current status
      if (currentStatus === "offline") {
        return 0; // Site has never been up
      }
      // Site appears to be up but we have no history
      // Don't assume 100% - return 100 only if we truly have no info
      return 100; // Default for new sites with no data
    }
  }

  let onlineTime = 0;
  let lastTimestamp = windowStart;
  let lastStatus: "online" | "offline" = "offline";

  // Find the state at the start of the window
  const eventsBeforeWindow = history.events
    .filter((e) => e.siteId === siteId && e.timestamp < windowStart)
    .sort((a, b) => b.timestamp - a.timestamp);

  if (eventsBeforeWindow.length > 0) {
    lastStatus = eventsBeforeWindow[0].status;
  }

  // Process events within the window
  for (const event of siteEvents) {
    const duration = event.timestamp - lastTimestamp;
    if (lastStatus === "online") {
      onlineTime += duration;
    }
    lastTimestamp = event.timestamp;
    lastStatus = event.status;
  }

  // Add time from last event to now
  const remainingTime = now - lastTimestamp;
  if (lastStatus === "online") {
    onlineTime += remainingTime;
  }

  const uptimePercentage = (onlineTime / windowMs) * 100;
  return Math.max(0, Math.min(100, Math.round(uptimePercentage)));
}

export function clearUptimeHistory(siteId?: string): void {
  const history = loadHistory();
  if (siteId) {
    history.events = history.events.filter((e) => e.siteId !== siteId);
  } else {
    history.events = [];
  }
  saveHistory(history);
}
