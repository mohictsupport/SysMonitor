import { createLazyFileRoute } from "@tanstack/react-router";
import { TopNav } from "@/components/TopNav";
import { useState, useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  areAlertSoundsEnabled,
  setAlertSoundsEnabled,
  testAlertSound,
  ensureAudioContext,
} from "@/lib/alert-sounds";
import { areNotificationsEnabled, setNotificationsEnabled, isElectron } from "@/lib/electron-notifications";
import { NetBirdApiSettings } from "@/components/NetBirdApiSettings";
import { clearAllSites } from "@/lib/use-sites";
import { TelegramSettings } from "@/components/TelegramSettings";
import { areIcmpChecksEnabled, setIcmpChecksEnabled } from "@/lib/health-check";
import { auth, onAuthStateChanged, signOut, type User } from "@/lib/firebase";
import { getUserPreferences, saveUserPreferences } from "@/lib/firebase-store";
import { loadPeerStatusHistory } from "@/lib/peer-status-history";

// Check auth state helper - TEMPORARILY DISABLED
// function getCurrentUser(): Promise<User | null> {
//   return new Promise((resolve) => {
//     const unsubscribe = onAuthStateChanged(auth, (user) => {
//       unsubscribe();
//       resolve(user);
//     });
//   });
// }

export const Route = createLazyFileRoute("/settings")({
  // beforeLoad temporarily removed - will restore login later
  // beforeLoad: async () => {
  //   const user = await getCurrentUser();
  //   if (!user) {
  //     throw redirect({ to: "/login" });
  //   }
  //   return { user };
  // },
  beforeLoad: async () => {
    // No auth check for now
    return { user: null };
  },
  head: () => ({
    meta: [
      { title: "Settings — SysMonitor" },
      {
        name: "description",
        content: "Configure application settings.",
      },
    ],
  }),
  component: SettingsPage,
});

function SettingsPage() {
  const { user: routeUser } = Route.useRouteContext();
  const queryClient = useQueryClient();
  const [alertSounds, setAlertSounds] = useState(false);
  const [notifications, setNotifications] = useState(false);
  const [icmpChecks, setIcmpChecks] = useState(false);
  const [isCheckingUpdate, setIsCheckingUpdate] = useState(false);
  const [updateStatus, setUpdateStatus] = useState<{
    checking: boolean;
    available: boolean;
    downloaded: boolean;
    error: string | null;
    version: string | null;
  } | null>(null);
  const hasMounted = useRef(false);
  const lastNotifiedUpdateVersion = useRef<string | null>(null);

  useEffect(() => {
    const loadPreferences = async () => {
      // Load from local storage first (for speed)
      setAlertSounds(areAlertSoundsEnabled());
      setNotifications(areNotificationsEnabled());
      setIcmpChecks(areIcmpChecksEnabled());

      const user = auth.currentUser;
      if (!user) return;

      // Then sync with Firestore
      try {
        const prefs = await getUserPreferences(user.uid);
        if (prefs?.notificationSettings) {
          if (prefs.notificationSettings.desktopEnabled !== undefined) {
            setNotifications(prefs.notificationSettings.desktopEnabled);
            setNotificationsEnabled(prefs.notificationSettings.desktopEnabled);
          }
        }
      } catch (error) {
        console.error("Failed to load preferences from Firestore:", error);
      }
    };

    loadPreferences();
    hasMounted.current = true;

    // Auto-signout when leaving settings page - TEMPORARILY DISABLED
    // return () => {
    //   if (auth.currentUser) {
    //     signOut(auth).catch(() => {});
    //   }
    // };
  }, []);

  const handleToggleAlertSounds = async () => {
    const newValue = !alertSounds;
    setAlertSounds(newValue);
    setAlertSoundsEnabled(newValue);

    if (newValue) {
      await ensureAudioContext();
    }

    // Sync to Firestore
    const user = auth.currentUser;
    if (user) {
      try {
        await saveUserPreferences(user.uid, {
          notificationSettings: {
            desktopEnabled: notifications,
          },
        });
      } catch (error) {
        console.error("Failed to save preferences to Firestore:", error);
      }
    }
  };

  const handleToggleNotifications = async () => {
    const newValue = !notifications;
    setNotifications(newValue);
    setNotificationsEnabled(newValue);

    // Sync to Firestore
    const user = auth.currentUser;
    if (user) {
      try {
        await saveUserPreferences(user.uid, {
          notificationSettings: {
            desktopEnabled: newValue,
          },
        });
      } catch (error) {
        console.error("Failed to save preferences to Firestore:", error);
      }
    }
  };

  const handleToggleIcmpChecks = () => {
    const newValue = !icmpChecks;
    setIcmpChecks(newValue);
    setIcmpChecksEnabled(newValue);
    
    // Invalidate and refetch peers immediately to update status representation
    queryClient.invalidateQueries({ queryKey: ["netbird", "peers"] });
    toast.success(newValue ? "ICMP Ping Checks Enabled" : "ICMP Ping Checks Disabled");
  };



  const handleClearCache = () => {
    if (
      !confirm(
        "Are you sure you want to clear all local cache and data? This will remove sites cache, uptime history, and other local data.",
      )
    ) {
      return;
    }

    // Clear all sysmonitor localStorage items
    const keysToRemove = [
      "sysmonitor.sitesCache.v1",
      "sysmonitor.uptimeHistory.v1",
      "sysmonitor.peerStatusHistory.v1",
      "sysmonitor.pendingSites.v1",
      "sysmonitor.autoApproveSites",
      "sysmonitor.alertSoundsEnabled",
      "sysmonitor.notificationsEnabled",
      "sysmonitor.notificationHistory.v1",
      // Also clear uptime caches
      ...Object.keys(localStorage).filter(key => key.startsWith("sysmonitor.siteUptime.v1")),
    ];

    keysToRemove.forEach((key) => {
      localStorage.removeItem(key);
      console.log(`[Clear Cache] Removed: ${key}`);
    });

    // Reload to clear React Query cache
    window.location.reload();
  };

  const clearCacheAndRefetch = () => {
    // Clear cache without confirmation (called after API key changes)
    const keysToRemove = [
      "sysmonitor.sitesCache.v1",
      "sysmonitor.uptimeHistory.v1",
      "sysmonitor.peerStatusHistory.v1",
      "sysmonitor.pendingSites.v1",
      "sysmonitor.lastNetbirdSync",
      // Also clear uptime caches
      ...Object.keys(localStorage).filter(key => key.startsWith("sysmonitor.siteUptime.v1")),
    ];

    keysToRemove.forEach((key) => {
      localStorage.removeItem(key);
      console.log(`[API Key Change] Removed cache: ${key}`);
    });

    // Remove React Query cache completely (not just invalidate) to clear all data
    queryClient.removeQueries({ queryKey: ["netbird", "peers"] });
    queryClient.removeQueries({ queryKey: ["current_stats"] });
    queryClient.removeQueries({ queryKey: ["daily_stats"] });
    
    // Also invalidate to trigger refetch if queries are re-mounted
    queryClient.invalidateQueries({ queryKey: ["netbird", "peers"] });
    queryClient.invalidateQueries({ queryKey: ["current_stats"] });
    queryClient.invalidateQueries({ queryKey: ["daily_stats"] });
  };

  // Format update error messages to be user-friendly
  const formatUpdateError = (error: string): string => {
    if (error.includes("Cannot download") || error.includes("status 404")) {
      return "Update file not found. The release may still be publishing.";
    }
    if (error.includes("net::ERR") || error.includes("network")) {
      return "Network connection failed.";
    }
    if (error.includes("certificate") || error.includes("SSL")) {
      return "Security certificate error.";
    }
    return "Update check failed. Please try again later.";
  };

  const handleCheckForUpdates = async () => {
    if (!isElectron()) {
      toast.error("Updates are only available in the desktop app");
      return;
    }

    if (!window.electronAPI?.checkForUpdates) {
      toast.error("Update checker not available");
      return;
    }

    setIsCheckingUpdate(true);
    setUpdateStatus(null);

    try {
      // Subscribe to status updates
      const unsubscribe = window.electronAPI.onUpdateStatus?.((status) => {
        setUpdateStatus(status);
        
        if (status.downloaded) {
          toast.success(`Version ${status.version} is ready to install`);
          setIsCheckingUpdate(false);
        } else if (status.error) {
          toast.error(formatUpdateError(status.error));
          setIsCheckingUpdate(false);
        } else if (status.available && !status.checking) {
          if (status.version && lastNotifiedUpdateVersion.current !== status.version) {
            toast.info(`Update available: ${status.version}`);
            lastNotifiedUpdateVersion.current = status.version;
          }
        }
      });

      // Trigger the check
      const result = await window.electronAPI.checkForUpdates();
      
      if (!result.success && result.error) {
        toast.error(result.error);
        setIsCheckingUpdate(false);
      }

      // Cleanup subscription after 30 seconds
      setTimeout(() => {
        setIsCheckingUpdate(false);
      }, 30000);
    } catch (error: any) {
      toast.error(`Failed to check for updates: ${error?.message || "Unknown error"}`);
      setIsCheckingUpdate(false);
    }
  };

  const handleInstallUpdate = async () => {
    if (!window.electronAPI?.installUpdate) {
      toast.error("Installer not available");
      return;
    }

    try {
      const result = await window.electronAPI.installUpdate();
      if (result.success) {
        toast.success("Installing update and restarting...");
      } else {
        toast.error(result.error || "Failed to install update");
      }
    } catch (error: any) {
      toast.error(`Failed to install update: ${error?.message || "Unknown error"}`);
    }
  };

  return (
    <div className="min-h-dvh bg-background text-foreground">
      <TopNav />
      <main className="mx-auto max-w-[800px] p-6">
        {/* Header */}
        <div className="mb-8">
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-dim">Configuration</p>
          <h1 className="mt-1 text-2xl font-medium tracking-tight">Settings</h1>
        </div>

        {/* NetBird API Configuration */}
        <div className="mb-8">
          <NetBirdApiSettings
            onSave={() => {
              // Clear all cached sites from localStorage
              clearAllSites();
              // Clear React Query cache and refetch NetBird data
              queryClient.removeQueries({ queryKey: ["netbird", "peers"] });
              queryClient.invalidateQueries({ queryKey: ["netbird", "peers"] });
              queryClient.refetchQueries({ queryKey: ["netbird", "peers"], exact: true });
              toast.success("API key saved! Cleared old sites and syncing with new key...");
            }}
            onClearCacheAndRefetch={() => {
              clearCacheAndRefetch();
              toast.success("API key updated! Cleared cache and fetching fresh sites...");
            }}
          />
        </div>

        {/* Telegram Notifications */}
        <div className="mb-8">
          <TelegramSettings />
        </div>

        {/* Notifications */}
        <div className="mb-8 border border-border bg-panel p-6">
          <h2 className="mb-4 font-mono text-[11px] font-bold uppercase tracking-widest text-dim">
            Notifications
          </h2>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-mono text-[10px] text-dim">
                  Show desktop notifications for site status changes
                </p>
                <p className="font-mono text-[10px] text-dim/60">
                  Site online/offline · Health alerts · Provisioning
                </p>
              </div>
              <button
                onClick={handleToggleNotifications}
                className={`border px-4 py-2 font-mono text-[11px] uppercase tracking-widest transition-colors ${
                  notifications
                    ? "border-phosphor/40 bg-phosphor/10 text-phosphor hover:bg-phosphor/20"
                    : "border-border text-dim hover:text-foreground"
                }`}
              >
                {notifications ? "● Enabled" : "○ Disabled"}
              </button>
            </div>
          </div>
        </div>

        {/* Alert Sounds */}
        <div className="mb-8 border border-border bg-panel p-6">
          <h2 className="mb-4 font-mono text-[11px] font-bold uppercase tracking-widest text-dim">
            Alert Sounds
          </h2>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-mono text-[10px] text-dim">Play sound when alerts trigger</p>
                <p className="font-mono text-[10px] text-dim/60">
                  Warning: gentle beep · Critical: double beep
                </p>
              </div>
              <button
                onClick={handleToggleAlertSounds}
                className={`border px-4 py-2 font-mono text-[11px] uppercase tracking-widest transition-colors ${
                  alertSounds
                    ? "border-phosphor/40 bg-phosphor/10 text-phosphor hover:bg-phosphor/20"
                    : "border-border text-dim hover:text-foreground"
                }`}
              >
                {alertSounds ? "● Enabled" : "○ Disabled"}
              </button>
            </div>
            {alertSounds && (
              <div className="flex items-center gap-2 border-t border-border pt-4">
                <span className="font-mono text-[10px] text-dim">Test:</span>
                <button
                  onClick={() => testAlertSound("warn")}
                  className="border border-amber/40 bg-amber/10 px-3 py-1 font-mono text-[10px] uppercase text-amber transition-colors hover:bg-amber/20"
                >
                  Warning Sound
                </button>
                <button
                  onClick={() => testAlertSound("critical")}
                  className="border border-alert/40 bg-alert/10 px-3 py-1 font-mono text-[10px] uppercase text-alert transition-colors hover:bg-alert/20"
                >
                  Critical Sound
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Network Status Checks */}
        <div className="mb-8 border border-border bg-panel p-6">
          <h2 className="mb-4 font-mono text-[11px] font-bold uppercase tracking-widest text-dim">
            Network Status Checks
          </h2>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-mono text-[10px] text-dim">
                  Enable real-time ICMP ping checks
                </p>
                <p className="font-mono text-[10px] text-dim/60">
                  Combine NetBird mesh connectivity with ping waves to determine online status (Disabled by default)
                </p>
              </div>
              <button
                onClick={handleToggleIcmpChecks}
                className={`border px-4 py-2 font-mono text-[11px] uppercase tracking-widest transition-colors ${
                  icmpChecks
                    ? "border-phosphor/40 bg-phosphor/10 text-phosphor hover:bg-phosphor/20"
                    : "border-border text-dim hover:text-foreground"
                }`}
              >
                {icmpChecks ? "● Enabled" : "○ Disabled"}
              </button>
            </div>
          </div>
        </div>

        {/* Data Management */}
        <div className="mb-8 border border-border bg-panel p-6">
          <h2 className="mb-4 font-mono text-[11px] font-bold uppercase tracking-widest text-dim">
            Data Management
          </h2>
          <div className="space-y-4">
            <div className="flex items-start justify-between pt-4 border-t border-border">
              <div>
                <p className="font-mono text-[10px] text-dim">Clear local cache and storage</p>
                <p className="font-mono text-[10px] text-dim/60">
                  Sites cache · Uptime history · Notification history
                </p>
              </div>
              <button
                onClick={handleClearCache}
                className="border border-alert/40 bg-alert/10 px-4 py-2 font-mono text-[11px] uppercase tracking-widest text-alert transition-colors hover:bg-alert/20"
              >
                ✕ Clear Cache
              </button>
            </div>
          </div>
        </div>

        {/* Software Updates */}
        <div className="mb-8 border border-border bg-panel p-6">
          <h2 className="mb-4 font-mono text-[11px] font-bold uppercase tracking-widest text-dim">
            Software Updates
          </h2>
          <div className="space-y-4">
            <div className="flex items-start justify-between">
              <div>
                <p className="font-mono text-[10px] text-dim">Check for new version updates</p>
                <p className="font-mono text-[10px] text-dim/60">
                  Auto-download and install on restart
                </p>
                {updateStatus && (
                  <p className={`font-mono text-[10px] mt-2 ${updateStatus.error ? "text-alert" : updateStatus.downloaded ? "text-phosphor" : "text-dim"}`}>
                    {updateStatus.downloaded 
                      ? `Version ${updateStatus.version} ready to install`
                      : updateStatus.available 
                        ? `Downloading ${updateStatus.version}...`
                        : updateStatus.error 
                          ? formatUpdateError(updateStatus.error)
                          : updateStatus.checking 
                            ? "Checking..."
                            : "No updates available"}
                  </p>
                )}
              </div>
              <div className="flex gap-2">
                <button
                  onClick={handleCheckForUpdates}
                  disabled={isCheckingUpdate}
                  className="border border-phosphor/40 bg-phosphor/10 px-4 py-2 font-mono text-[11px] uppercase tracking-widest text-phosphor transition-colors hover:bg-phosphor/20 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isCheckingUpdate ? "⟳ Checking..." : "↻ Check for Updates"}
                </button>
                {updateStatus?.downloaded && (
                  <button
                    onClick={handleInstallUpdate}
                    className="border border-amber/40 bg-amber/10 px-4 py-2 font-mono text-[11px] uppercase tracking-widest text-amber transition-colors hover:bg-amber/20"
                  >
                    ↻ Install Now
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
