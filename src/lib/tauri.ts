// Tauri integration utilities

import { invoke } from "@tauri-apps/api/core";

// Check if running in Tauri desktop app
export function isTauri(): boolean {
  return typeof window !== "undefined" && !!(window as any).__TAURI_INTERNALS__;
}

// Tauri command wrappers
export const tauri = {
  // Get app version
  getVersion: () => invoke<string>("get_app_version"),

  // Window controls
  showWindow: () => invoke("show_main_window"),
  hideWindow: () => invoke("hide_main_window"),
  isVisible: () => invoke<boolean>("is_window_visible"),
};

// Desktop-specific features
export async function notify(title: string, body: string) {
  if (!isTauri()) {
    // Fallback to browser notifications
    if ("Notification" in window && Notification.permission === "granted") {
      new Notification(title, { body });
    }
    return;
  }

  // Use Tauri notifications
  const { sendNotification } = await import("@tauri-apps/plugin-notification");
  sendNotification({ title, body });
}

// Request notification permission
export async function requestNotificationPermission() {
  if (!isTauri()) {
    if ("Notification" in window) {
      return await Notification.requestPermission();
    }
    return "denied";
  }

  const { requestPermission } = await import("@tauri-apps/plugin-notification");
  return await requestPermission();
}
