import { useState, useEffect } from "react";
import { Download, RefreshCw, CheckCircle, AlertCircle, X } from "lucide-react";
import { isElectron } from "@/lib/electron-notifications";

interface UpdateStatus {
  checking: boolean;
  available: boolean;
  downloaded: boolean;
  error: string | null;
  version: string | null;
  percent: number;
}

export function UpdateNotification() {
  const [status, setStatus] = useState<UpdateStatus | null>(null);
  const [isVisible, setIsVisible] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (!isElectron()) return;

    // Get initial status
    window.electronAPI?.getUpdateStatus?.().then((initialStatus: UpdateStatus) => {
      setStatus(initialStatus);
      if (initialStatus?.available || initialStatus?.downloaded) {
        setIsVisible(true);
      }
    });

    // Listen for update status changes
    const unsubscribe = window.electronAPI?.onUpdateStatus?.((newStatus: UpdateStatus) => {
      setStatus(newStatus);
      
      // Show notification when update is available or downloaded
      if (newStatus.available || newStatus.downloaded) {
        setIsVisible(true);
        setDismissed(false);
      }
    });

    return () => {
      if (unsubscribe) {
        // Cleanup if needed
      }
    };
  }, []);

  const handleInstall = async () => {
    if (!window.electronAPI?.installUpdate) return;
    
    try {
      const result = await window.electronAPI.installUpdate();
      if (result.success) {
        // App will quit and install
      }
    } catch (err) {
      console.error("Failed to install update:", err);
    }
  };

  const handleDismiss = () => {
    setDismissed(true);
    setIsVisible(false);
  };

  const handleCheckNow = async () => {
    if (!window.electronAPI?.checkForUpdates) return;
    
    try {
      await window.electronAPI.checkForUpdates();
    } catch (err) {
      console.error("Failed to check for updates:", err);
    }
  };

  // Don't show if not in Electron, dismissed, or no status
  if (!isElectron() || dismissed || !isVisible || !status) {
    return null;
  }

  // Update downloaded - show restart prompt
  if (status.downloaded) {
    return (
      <div className="fixed bottom-4 right-4 z-50 max-w-sm">
        <div className="rounded-lg border border-phosphor bg-panel-2 p-4 shadow-lg">
          <div className="flex items-start gap-3">
            <div className="rounded-full bg-phosphor/20 p-2">
              <CheckCircle className="h-5 w-5 text-phosphor" />
            </div>
            <div className="flex-1">
              <h4 className="font-medium text-foreground">Update Ready</h4>
              <p className="mt-1 text-sm text-dim">
                Version {status.version} has been downloaded. Restart to apply the update.
              </p>
              <div className="mt-3 flex gap-2">
                <button
                  onClick={handleInstall}
                  className="rounded bg-phosphor px-3 py-1.5 text-sm font-medium text-void hover:bg-phosphor/90 transition-colors"
                >
                  Restart Now
                </button>
                <button
                  onClick={handleDismiss}
                  className="rounded border border-border bg-transparent px-3 py-1.5 text-sm text-dim hover:bg-panel transition-colors"
                >
                  Later
                </button>
              </div>
            </div>
            <button
              onClick={handleDismiss}
              className="rounded p-1 text-dim hover:bg-panel hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Update available - downloading
  if (status.available && !status.downloaded) {
    return (
      <div className="fixed bottom-4 right-4 z-50 max-w-sm">
        <div className="rounded-lg border border-amber/50 bg-panel-2 p-4 shadow-lg">
          <div className="flex items-start gap-3">
            <div className="rounded-full bg-amber/20 p-2">
              <Download className="h-5 w-5 text-amber" />
            </div>
            <div className="flex-1">
              <h4 className="font-medium text-foreground">Update Available</h4>
              <p className="mt-1 text-sm text-dim">
                Version {status.version} is being downloaded...
              </p>
              {/* Progress bar */}
              <div className="mt-3 h-1.5 w-full rounded-full bg-border">
                <div
                  className="h-full rounded-full bg-amber transition-all duration-300"
                  style={{ width: `${status.percent}%` }}
                />
              </div>
              <p className="mt-1 text-xs text-dim">{status.percent}% complete</p>
            </div>
            <button
              onClick={handleDismiss}
              className="rounded p-1 text-dim hover:bg-panel hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Checking for updates
  if (status.checking) {
    return (
      <div className="fixed bottom-4 right-4 z-50 max-w-sm">
        <div className="rounded-lg border border-border bg-panel-2 p-4 shadow-lg">
          <div className="flex items-center gap-3">
            <RefreshCw className="h-5 w-5 animate-spin text-dim" />
            <span className="text-sm text-dim">Checking for updates...</span>
          </div>
        </div>
      </div>
    );
  }

  // Format error message to be user-friendly
  const formatErrorMessage = (error: string): string => {
    // Hide URLs and technical details
    if (error.includes("Cannot download") || error.includes("status 404")) {
      return "Update file not found. The release may still be publishing. Please try again in a few minutes.";
    }
    if (error.includes("net::ERR") || error.includes("network")) {
      return "Network connection failed. Please check your internet connection and try again.";
    }
    if (error.includes("certificate") || error.includes("SSL")) {
      return "Security certificate error. Please try again later.";
    }
    if (error.includes("access denied") || error.includes("403")) {
      return "Access denied. Please contact your administrator.";
    }
    // Generic fallback - remove URLs
    return error.replace(/https?:\/\/[^\s"]+/g, "[...]");
  };

  // Error
  if (status.error) {
    return (
      <div className="fixed bottom-4 right-4 z-50 max-w-sm">
        <div className="rounded-lg border border-alert/50 bg-panel-2 p-4 shadow-lg">
          <div className="flex items-start gap-3">
            <div className="rounded-full bg-alert/20 p-2">
              <AlertCircle className="h-5 w-5 text-alert" />
            </div>
            <div className="flex-1">
              <h4 className="font-medium text-foreground">Update Error</h4>
              <p className="mt-1 text-sm text-dim">{formatErrorMessage(status.error)}</p>
              <button
                onClick={handleCheckNow}
                className="mt-2 text-sm text-phosphor hover:underline"
              >
                Try Again
              </button>
            </div>
            <button
              onClick={handleDismiss}
              className="rounded p-1 text-dim hover:bg-panel hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    );
  }

  return null;
}

// Compact version for top nav
export function UpdateBadge() {
  const [status, setStatus] = useState<UpdateStatus | null>(null);

  useEffect(() => {
    if (!isElectron()) return;

    window.electronAPI?.getUpdateStatus?.().then((initialStatus: UpdateStatus) => {
      setStatus(initialStatus);
    });

    window.electronAPI?.onUpdateStatus?.((newStatus: UpdateStatus) => {
      setStatus(newStatus);
    });
  }, []);

  if (!isElectron() || !status?.downloaded) {
    return null;
  }

  return (
    <button
      onClick={() => window.electronAPI?.installUpdate?.()}
      className="flex items-center gap-1.5 rounded bg-phosphor/20 px-2 py-1 text-xs font-medium text-phosphor hover:bg-phosphor/30 transition-colors"
      title="Update ready - Click to restart"
    >
      <RefreshCw className="h-3 w-3" />
      <span>Restart to Update</span>
    </button>
  );
}
