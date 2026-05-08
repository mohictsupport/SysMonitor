import { useState, useEffect } from "react";
import { isElectron } from "./electron-notifications";

/**
 * Checks if a NetBird API key is configured in any of the supported storage locations.
 * Returns true if a key exists, false otherwise.
 */
export async function hasConfiguredApiKey(): Promise<boolean> {
  // 1. Check Electron secure storage
  if (isElectron() && window.electronAPI?.hasApiKey) {
    try {
      const result = await window.electronAPI.hasApiKey();
      if (result.hasKey) return true;
    } catch (e) {
      console.error("[Auth] Electron hasApiKey check failed:", e);
    }
  }

  // 2. Check localStorage (browser fallback)
  if (typeof window !== "undefined") {
    const localKey = localStorage.getItem("netbird_api_key");
    if (localKey && localKey.trim().length > 0) return true;

    // Check for hint flag from Electron
    const isConfigured = localStorage.getItem("netbird_api_key_configured");
    if (isConfigured === "true") return true;
  }

  // 3. Check environment variable
  const envKey = import.meta.env.VITE_NETBIRD_API_TOKEN;
  if (envKey && envKey.trim().length > 0) return true;

  return false;
}

/**
 * Sync version for use in hooks that don't support async initialization easily
 * Note: This won't be able to check Electron's async API directly, so it relies on 
 * localStorage flags and env vars.
 */
export function hasConfiguredApiKeySync(): boolean {
  if (typeof window !== "undefined") {
    // Check direct localStorage key
    const localKey = localStorage.getItem("netbird_api_key");
    if (localKey && localKey.trim().length > 0) return true;

    // Check for hint flag from Electron storage
    const isConfigured = localStorage.getItem("netbird_api_key_configured");
    if (isConfigured === "true") return true;
  }

  const envKey = import.meta.env.VITE_NETBIRD_API_TOKEN;
  if (envKey && envKey.trim().length > 0) return true;

  return false;
}

/**
 * Reactive hook to check if an API key is configured.
 * Listens for 'netbird-api-key-changed' events and storage changes.
 */
export function useHasApiKey(): boolean {
  const [hasKey, setHasKey] = useState<boolean>(hasConfiguredApiKeySync());

  useEffect(() => {
    const checkKey = async () => {
      const result = await hasConfiguredApiKey();
      setHasKey(result);
    };

    // Initial check (async)
    checkKey();

    // Listen for custom change events
    const handleKeyChange = () => {
      // Re-run the sync check first for immediate UI update
      setHasKey(hasConfiguredApiKeySync());
      // Then verify with async check
      checkKey();
    };

    window.addEventListener("netbird-api-key-changed", handleKeyChange);
    window.addEventListener("storage", handleKeyChange);

    return () => {
      window.removeEventListener("netbird-api-key-changed", handleKeyChange);
      window.removeEventListener("storage", handleKeyChange);
    };
  }, []);

  return hasKey;
}
