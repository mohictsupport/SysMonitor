// Desktop Notification API wrapper
// Provides enhanced native notifications for the desktop app (Electron)

interface NotificationOptions {
  title?: string;
  body: string;
  icon?: string;
  silent?: boolean;
  actions?: Array<{
    text: string;
    action: string;
  }>;
  data?: Record<string, unknown>;
  onClick?: () => void;
  onAction?: (action: string, notification: unknown) => void;
}

interface NotificationResult {
  success: boolean;
  id?: string;
  error?: string;
}

// Check if running in desktop app (Electron)
export const isElectron = (): boolean => {
  return (
    typeof window !== "undefined" &&
    window.electronAPI !== undefined &&
    window.electronAPI.isElectron === true
  );
};

// Notification preferences
const NOTIFICATIONS_ENABLED_KEY = "sysmonitor.notificationsEnabled";
const NOTIFICATION_HISTORY_KEY = "sysmonitor.notificationHistory.v1";
const HISTORY_MAX_AGE_MS = 300000; // 5 minutes
const HISTORY_MAX_SIZE = 100;

interface NotificationHistoryEntry {
  id: string;
  title: string;
  body: string;
  timestamp: number;
}

export function areNotificationsEnabled(): boolean {
  if (typeof window === "undefined") return true; // Default to enabled on server
  try {
    const stored = localStorage.getItem(NOTIFICATIONS_ENABLED_KEY);
    return stored === null ? true : stored === "true"; // Default to enabled
  } catch {
    return true;
  }
}

export function setNotificationsEnabled(enabled: boolean): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(NOTIFICATIONS_ENABLED_KEY, String(enabled));
  } catch {
    // ignore quota errors
  }
}

// Notification history to prevent duplicates
function getLocalNotificationHistory(): NotificationHistoryEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(NOTIFICATION_HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as NotificationHistoryEntry[];
    return parsed || [];
  } catch {
    return [];
  }
}

function saveLocalNotificationHistory(history: NotificationHistoryEntry[]): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(NOTIFICATION_HISTORY_KEY, JSON.stringify(history));
  } catch {
    // ignore quota errors
  }
}

function cleanOldHistory(history: NotificationHistoryEntry[]): NotificationHistoryEntry[] {
  const now = Date.now();
  return history.filter((entry) => now - entry.timestamp < HISTORY_MAX_AGE_MS);
}

function isDuplicateNotification(title: string, body: string): boolean {
  const history = getLocalNotificationHistory();
  const now = Date.now();

  // Check for exact match within 5 minutes
  const isDuplicate = history.some(
    (entry) =>
      entry.title === title && entry.body === body && now - entry.timestamp < HISTORY_MAX_AGE_MS,
  );

  return isDuplicate;
}

function addToNotificationHistory(title: string, body: string): void {
  const history = getLocalNotificationHistory();
  const cleaned = cleanOldHistory(history);

  // Add new entry
  cleaned.push({
    id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    title,
    body,
    timestamp: Date.now(),
  });

  // Keep only most recent entries
  const trimmed = cleaned.slice(-HISTORY_MAX_SIZE);
  saveLocalNotificationHistory(trimmed);
}

// Show a native notification
export const showNotification = async (
  options: NotificationOptions & { skipDedup?: boolean },
): Promise<NotificationResult> => {
  // Check if notifications are disabled
  if (!areNotificationsEnabled()) {
    return { success: false, error: "Notifications disabled" };
  }

  // Check for duplicate notification (unless skipped)
  if (!options.skipDedup) {
    const title = options.title || "SysMonitor";
    const body = options.body;
    if (isDuplicateNotification(title, body)) {
      return { success: false, error: "Duplicate notification" };
    }
  }

  if (!isElectron()) {
    // Fallback to browser notifications
    if ("Notification" in window && Notification.permission === "granted") {
      const notification = new Notification(options.title || "SysMonitor", {
        body: options.body,
        icon: options.icon,
        silent: options.silent,
      });

      notification.onclick = () => {
        options.onClick?.();
      };

      // Add to history after successful display
      addToNotificationHistory(options.title || "SysMonitor", options.body);
      return { success: true };
    }
    return { success: false, error: "Notifications not available" };
  }

  // Use Tauri or Electron native notifications
  try {
    const result = await window.electronAPI?.showNotification({
      title: options.title || "SysMonitor",
      body: options.body,
      icon: options.icon,
      silent: options.silent ?? false,
      actions: options.actions || [],
      data: options.data || {},
      skipDedup: options.skipDedup ?? false,
    });

    // Add to history after successful display
    if (result?.success) {
      addToNotificationHistory(options.title || "SysMonitor", options.body);
    }

    // Set up event listeners for this notification (Electron only)
    if (window.electronAPI) {
      if (options.onClick && window.electronAPI.onNotificationClick) {
        window.electronAPI.onNotificationClick((data: unknown) => {
          if (
            data &&
            typeof data === "object" &&
            (data as { body?: string }).body === options.body
          ) {
            options.onClick?.();
          }
        });
      }

      if (options.onAction && window.electronAPI.onNotificationAction) {
        window.electronAPI.onNotificationAction((action: string, data: unknown) => {
          options.onAction?.(action, data);
        });
      }
    }

    return result ?? { success: false, error: "Notification failed" };
  } catch (error) {
    console.error("Failed to show notification:", error);
    return { success: false, error: String(error) };
  }
};

// Check notification permission
export const checkNotificationPermission = async (): Promise<string> => {
  if (!isElectron()) {
    if ("Notification" in window) {
      return Notification.permission;
    }
    return "denied";
  }

  return await window.electronAPI?.checkNotificationPermission() ?? "denied";
};

// Request notification permission (browser only, Electron is always granted)
export const requestNotificationPermission = async (): Promise<string> => {
  if (!isElectron()) {
    if ("Notification" in window) {
      return Notification.requestPermission();
    }
    return "denied";
  }

  // In Electron, notifications are always available
  return "granted";
};

// Get notification history
export const getNotificationHistory = async (): Promise<
  Array<{
    id: string;
    title: string;
    body: string;
    timestamp: string;
    data: Record<string, unknown>;
  }>
> => {
  if (!isElectron()) {
    return [];
  }

  return (await window.electronAPI?.getNotificationHistory() ?? []) as Array<{ id: string; title: string; body: string; timestamp: string; data: Record<string, unknown> }>;
};

// Clear notification history
export const clearNotificationHistory = async (): Promise<{ success: boolean }> => {
  if (!isElectron()) {
    return { success: false };
  }

  return await window.electronAPI?.clearNotificationHistory() ?? { success: false };
};

// Show alert notification for site issues
export const showSiteAlert = async (
  siteName: string,
  alertType: "down" | "warning" | "critical",
  message: string,
) => {
  const titles: Record<string, string> = {
    down: "🔴 Site Down Alert",
    warning: "⚠️ Site Warning",
    critical: "🚨 Critical Alert",
  };

  const urgencyColors: Record<string, string> = {
    down: "#ef4444",
    warning: "#f59e0b",
    critical: "#dc2626",
  };

  return showNotification({
    title: titles[alertType] || "Site Alert",
    body: `${siteName}: ${message}`,
    silent: alertType === "warning",
    actions: [
      { text: "View Site", action: "view-site" },
      { text: "Dismiss", action: "dismiss" },
    ],
    data: {
      type: "site-alert",
      siteName,
      alertType,
      timestamp: Date.now(),
    },
    onClick: () => {
      console.log("Site alert clicked:", siteName);
      // Navigate to site detail would happen here
    },
    onAction: (action) => {
      if (action === "view-site") {
        window.electronAPI?.focusWindow();
        // Navigate to site would happen here
      }
    },
  });
};

// Show NetBird sync status notification
export const showSyncNotification = async (
  status: "success" | "error" | "stale",
  message: string,
) => {
  const titles: Record<string, string> = {
    success: "✅ NetBird Sync Complete",
    error: "❌ NetBird Sync Failed",
    stale: "⚠️ Sync Data Stale",
  };

  return showNotification({
    title: titles[status] || "NetBird Sync",
    body: message,
    silent: status === "success",
    data: {
      type: "netbird-sync",
      status,
      timestamp: Date.now(),
    },
  });
};

// Show onboarding notification
export const showOnboardingNotification = async (pendingCount: number) => {
  return showNotification({
    title: "🆕 New Sites Pending",
    body: `${pendingCount} new site${pendingCount > 1 ? "s" : ""} waiting for approval`,
    actions: [
      { text: "Review", action: "review-sites" },
      { text: "Auto-approve", action: "auto-approve" },
    ],
    data: {
      type: "onboarding",
      pendingCount,
      timestamp: Date.now(),
    },
    onClick: () => {
      window.electronAPI?.focusWindow();
    },
    onAction: (action) => {
      if (action === "review-sites") {
        window.electronAPI?.focusWindow();
        // Navigate to onboarding panel would happen here
      }
    },
  });
};

// Window focus helper
export const focusWindow = async (): Promise<void> => {
  if (isElectron() && window.electronAPI?.focusWindow) {
    await window.electronAPI.focusWindow();
  }
};

// Telegram notification deduplication and rate limiting
const notifiedOfflineSites = new Set<string>(); // Sites we've already notified as offline
let lastSummaryNotification = 0;
const SUMMARY_COOLDOWN_MS = 6 * 60 * 60 * 1000; // 6 hours

// Send Telegram notification
export const sendTelegramNotification = async (message: string): Promise<boolean> => {
  if (!isElectron()) {
    return false;
  }

  try {
    // Load settings to get chat ID and enabled state
    const settingsResult = await window.electronAPI?.loadSettings();
    if (!settingsResult?.success || !settingsResult.settings) {
      return false;
    }

    const settings = settingsResult.settings;

    // Check if Telegram notifications are enabled (default to true if not set)
    if (settings.telegramEnabled === false) {
      console.log("[Telegram] Notifications disabled, skipping");
      return false;
    }

    const chatId = settings.telegramChatId as string | undefined;

    if (!chatId) {
      return false; // Telegram not linked
    }

    const result = await window.electronAPI?.sendTelegramMessage(chatId, message);
    return result?.success ?? false;
  } catch (error) {
    console.error("Failed to send Telegram notification:", error);
    return false;
  }
};

// Send site status change notification (with deduplication)
export const sendSiteStatusNotification = async (
  siteId: string,
  siteName: string,
  status: "online" | "offline",
  siteLocation?: string,
): Promise<boolean> => {
  const displayName = siteName || siteId;
  const locationText = siteLocation ? ` from ${siteLocation}` : "";

  if (status === "offline") {
    // Check if we already notified about this site being offline
    if (notifiedOfflineSites.has(siteId)) {
      console.log(`[Telegram] Skipping duplicate offline notification for ${displayName}`);
      return false; // Already notified, don't spam
    }

    // Mark as notified
    notifiedOfflineSites.add(siteId);

    const message = `🔴 <b>${displayName}</b>${locationText} went offline`;
    return sendTelegramNotification(message);
  } else {
    // Site is back online
    // Remove from notified set so we can notify again if it goes offline later
    notifiedOfflineSites.delete(siteId);

    const message = `🟢 <b>${displayName}</b>${locationText} came back online`;
    return sendTelegramNotification(message);
  }
};

// Batch notification queue
interface BatchedSiteChange {
  siteId: string;
  siteName: string;
  status: "online" | "offline";
  siteLocation?: string;
}

let batchQueue: BatchedSiteChange[] = [];
let batchTimeout: ReturnType<typeof setTimeout> | null = null;
const BATCH_DELAY_MS = 3000; // Wait 3 seconds to collect more changes

// Send batched Telegram notification
export const sendBatchedSiteNotifications = async (
  changes: BatchedSiteChange[],
): Promise<boolean> => {
  if (changes.length === 0) return false;

  if (changes.length === 1) {
    // Single change - use individual notification
    const change = changes[0];
    return sendSiteStatusNotification(
      change.siteId,
      change.siteName,
      change.status,
      change.siteLocation,
    );
  }

  // Multiple changes - create batch message
  const offlineSites = changes.filter((c) => c.status === "offline");
  const onlineSites = changes.filter((c) => c.status === "online");

  let message = "";
  
  if (offlineSites.length > 0) {
    message += `🔴 <b>${offlineSites.length} site(s) went offline:</b>\n`;
    offlineSites.forEach((site) => {
      const displayName = site.siteName || site.siteId;
      const locationText = site.siteLocation ? ` (${site.siteLocation})` : "";
      message += `• ${displayName}${locationText}\n`;
    });
  }

  if (onlineSites.length > 0) {
    if (message) message += "\n";
    message += `🟢 <b>${onlineSites.length} site(s) came back online:</b>\n`;
    onlineSites.forEach((site) => {
      const displayName = site.siteName || site.siteId;
      const locationText = site.siteLocation ? ` (${site.siteLocation})` : "";
      message += `• ${displayName}${locationText}\n`;
    });
  }

  // Update deduplication state for offline sites
  offlineSites.forEach((site) => {
    if (!notifiedOfflineSites.has(site.siteId)) {
      notifiedOfflineSites.add(site.siteId);
    }
  });

  // Remove online sites from deduplication set
  onlineSites.forEach((site) => {
    notifiedOfflineSites.delete(site.siteId);
  });

  return sendTelegramNotification(message);
};

// Queue a site status change for batched notification
export const queueSiteStatusNotification = (
  siteId: string,
  siteName: string,
  status: "online" | "offline",
  siteLocation?: string,
): void => {
  batchQueue.push({ siteId, siteName, status, siteLocation });

  // Clear existing timeout
  if (batchTimeout) {
    clearTimeout(batchTimeout);
  }

  // Set new timeout to send batch
  batchTimeout = setTimeout(async () => {
    const changes = [...batchQueue];
    batchQueue = [];
    batchTimeout = null;
    await sendBatchedSiteNotifications(changes);
  }, BATCH_DELAY_MS);
};

// Send summary notification (rate limited to every 6 hours)
export const sendSummaryNotification = async (
  alertCount: number,
  criticalCount: number,
  warningCount: number,
): Promise<boolean> => {
  const now = Date.now();

  // Check if we've sent a summary recently
  if (now - lastSummaryNotification < SUMMARY_COOLDOWN_MS) {
    console.log(
      `[Telegram] Skipping summary notification (sent ${Math.round((now - lastSummaryNotification) / 60000)}m ago)`,
    );
    return false;
  }

  // Update last notification time
  lastSummaryNotification = now;

  const emoji = criticalCount > 0 ? "🚨" : "⚠️";
  const message = `${emoji} <b>${alertCount} New Alerts</b>\n\n• ${criticalCount} Critical\n• ${warningCount} Warning\n\nCheck the app for details.`;

  return sendTelegramNotification(message);
};

// Setup navigation listener from main process
export const setupNavigationHandler = (navigate: (path: string) => void): (() => void) => {
  if (!isElectron() || !window.electronAPI?.onNavigate) {
    return () => {}; // No-op cleanup
  }

  window.electronAPI.onNavigate((path: string) => {
    console.log("Navigation requested from main process:", path);
    navigate(path);
  });

  // Return cleanup function
  return () => {
    // Note: ipcRenderer listeners are automatically cleaned up on page reload
    // In a real app, you'd want to properly remove the listener
  };
};

// Secure Storage Helpers
export const secureStorage = {
  saveApiKey: async (apiKey: string) => {
    if (!isElectron()) return { success: false, error: "Not in desktop app" };
    return await window.electronAPI?.saveApiKey(apiKey) ?? { success: false, error: "API not available" };
  },
  loadApiKey: async () => {
    if (!isElectron()) return { success: false, error: "Not in desktop app" };
    return await window.electronAPI?.loadApiKey() ?? { success: false, error: "API not available" };
  },
  deleteApiKey: async () => {
    if (!isElectron()) return { success: false, error: "Not in desktop app" };
    return await window.electronAPI?.deleteApiKey() ?? { success: false, error: "API not available" };
  },
  hasApiKey: async () => {
    if (!isElectron()) return { hasKey: false };
    return await window.electronAPI?.hasApiKey() ?? { hasKey: false };
  },
};

// Type declarations for window.electronAPI
declare global {
  interface Window {
    electronAPI?: {
      isElectron: boolean;
      showNotification: (options: unknown) => Promise<NotificationResult>;
      onNotificationClick: (callback: (data: unknown) => void) => void;
      onNotificationAction: (callback: (action: string, data: unknown) => void) => void;
      checkNotificationPermission: () => Promise<string>;
      getNotificationHistory: () => Promise<unknown[]>;
      clearNotificationHistory: () => Promise<{ success: boolean }>;
      focusWindow: () => Promise<void>;
      // Secure Storage
      saveApiKey: (apiKey: string) => Promise<{ success: boolean; error?: string }>;
      loadApiKey: () => Promise<{ success: boolean; apiKey?: string; error?: string }>;
      deleteApiKey: () => Promise<{ success: boolean; error?: string }>;
      hasApiKey: () => Promise<{ hasKey: boolean }>;
      // Settings
      saveSettings: (
        settings: Record<string, unknown>,
      ) => Promise<{ success: boolean; error?: string }>;
      loadSettings: () => Promise<{
        success: boolean;
        settings?: Record<string, unknown>;
        error?: string;
      }>;
      // Navigation
      onNavigate: (callback: (path: string) => void) => void;
      // External links
      openExternal: (url: string) => Promise<{ success: boolean }>;
      // Health checks (TCP port checks via main process)
      healthBatchCheck: (data: {
        sites: Array<{ id: string; hostname: string; netbirdConnected: boolean }>;
        concurrency?: number;
        timeoutMs?: number;
      }) => Promise<{
        results: Array<{
          id: string;
          hostname: string;
          ok: boolean;
          latencyMs: number;
          detail: string;
          skipped: boolean;
        }>;
        summary: {
          total: number;
          checked: number;
          skipped: number;
          passed: number;
          failed: number;
          avgLatencyMs: number;
        };
      }>;
      // Telegram Bot API (embedded token)
      getTelegramBotInfo: () => Promise<{
        success: boolean;
        username?: string;
        token?: string;
        error?: string;
      }>;
      checkTelegramUpdates: (expectedToken: string) => Promise<{
        success: boolean;
        chatId?: string;
        username?: string;
        error?: string;
      }>;
      sendTelegramMessage: (
        chatId: string,
        message: string,
      ) => Promise<{
        success: boolean;
        messageId?: number;
        error?: string;
      }>;
      // HTTP probe (bypasses CSP via main process)
      httpProbe: (url: string) => Promise<{
        success: boolean;
        ok?: boolean;
        status?: number | null;
        latencyMs?: number;
        detail?: string;
      }>;
    };
  }
}

// HTTP probe helper (uses main process to bypass CSP)
export const httpProbe = async (url: string): Promise<{
  success: boolean;
  ok?: boolean;
  status?: number | null;
  latencyMs?: number;
  detail?: string;
}> => {
  if (!isElectron()) {
    return { success: false, detail: "HTTP probe only available in desktop app" };
  }
  return await window.electronAPI?.httpProbe(url) ?? { success: false, detail: "API not available" };
};

export default {
  isElectron,
  showNotification,
  checkNotificationPermission,
  requestNotificationPermission,
  getNotificationHistory,
  clearNotificationHistory,
  showSiteAlert,
  showSyncNotification,
  showOnboardingNotification,
  focusWindow,
  sendTelegramNotification,
  sendSiteStatusNotification,
  sendSummaryNotification,
  setupNavigationHandler,
  secureStorage,
  httpProbe,
};
