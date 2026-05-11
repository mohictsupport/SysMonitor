import { useState, useEffect, useRef } from "react";
import type { UseQueryResult } from "@tanstack/react-query";

const SYNC_INTERVAL = 60000; // 60 seconds (1 minute)
const STALE_THRESHOLD = 30000; // 30 seconds - matches TanStack Query staleTime (half of sync interval)

interface NetBirdSyncStatusProps {
  query: UseQueryResult<any, any>;
  lastSyncTime?: number;
}

export function NetBirdSyncStatus({ query, lastSyncTime }: NetBirdSyncStatusProps) {
  const [elapsedMs, setElapsedMs] = useState(0);
  const [isMounted, setIsMounted] = useState(false);
  const [isNetworkOnline, setIsNetworkOnline] = useState(navigator.onLine);

  useEffect(() => {
    setIsMounted(true);
    // Force a refetch on mount to ensure the UI and actual sync are aligned
    query.refetch?.();
  }, []);

  // Monitor network connectivity
  useEffect(() => {
    const handleOnline = () => setIsNetworkOnline(true);
    const handleOffline = () => setIsNetworkOnline(false);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  const isFetching = query.isFetching;
  const isLoading = query.isLoading;
  const isError = query.isError || !!query.data?.error; // Also check if data has error from cache fallback
  const fetchFailureCount = query.failureCount;
  const dataUpdatedAt = query.dataUpdatedAt;

  // Get persistent last sync time from localStorage or use query time
  const getLastSyncTime = () => {
    if (lastSyncTime) return lastSyncTime;

    // Try to get from localStorage first
    const stored = localStorage.getItem('sysmonitor.lastNetbirdSync');
    if (stored) {
      const parsed = parseInt(stored, 10);
      if (!isNaN(parsed) && parsed > 0) {
        return parsed;
      }
    }

    // Fallback to query time
    return dataUpdatedAt || 0;
  };

  // Calculate time since last sync
  const lastSync = getLastSyncTime();
  const timeSinceSync = Date.now() - lastSync;
  const secondsSinceSync = Math.floor(timeSinceSync / 1000);

  // Format last sync time
  const formatLastSync = () => {
    if (secondsSinceSync < 5) return "just now";
    if (secondsSinceSync < 60) return `${secondsSinceSync}s ago`;
    if (secondsSinceSync < 3600) return `${Math.floor(secondsSinceSync / 60)}m ago`;
    return `${Math.floor(secondsSinceSync / 3600)}h ago`;
  };

  // Save sync time to localStorage when sync completes successfully
  useEffect(() => {
    if (!isFetching && !isError && dataUpdatedAt > 0) {
      // Only update if this is a fresh sync (not just component remount)
      const now = Date.now();
      const timeSinceUpdate = now - dataUpdatedAt;

      // If data was updated within the last 5 seconds, consider it a fresh sync
      if (timeSinceUpdate < 5000) {
        localStorage.setItem('sysmonitor.lastNetbirdSync', dataUpdatedAt.toString());
      }
    }
  }, [isFetching, isError, dataUpdatedAt]);

  // Sync Timer - calculates accurate millisecond-based progress
  useEffect(() => {
    const updateTimer = () => {
      if (isFetching) {
        setElapsedMs(SYNC_INTERVAL); // Force progress bar to full while syncing
        return;
      }

      // Calculate elapsed time since last sync and predict next one
      const elapsed = (Date.now() - lastSync) % SYNC_INTERVAL;
      setElapsedMs(elapsed);
    };

    updateTimer();
    const interval = setInterval(updateTimer, 100); // 10Hz for smooth progress bar
    return () => clearInterval(interval);
  }, [isFetching, lastSync]);

  // Derived values for UI
  const countdown = Math.max(0, Math.ceil((SYNC_INTERVAL - elapsedMs) / 1000));
  const progressPercent = (elapsedMs / SYNC_INTERVAL) * 100;

  // Status colors - STALE_THRESHOLD (30s) matches TanStack Query config
  const isStale = timeSinceSync > STALE_THRESHOLD;
  const isFailing = fetchFailureCount > 0;

  const getStatusColor = () => {
    if (!isMounted) {
      // Return consistent default state during SSR/hydration
      return "text-amber border-amber/40 bg-amber/10";
    }
    if (!isNetworkOnline) return "text-alert border-alert/40 bg-alert/10";
    if (isError && fetchFailureCount >= 3) return "text-alert border-alert/40 bg-alert/10";
    if (isError) return "text-amber border-amber/40 bg-amber/10";
    if (isFetching) return "text-amber border-amber/40 bg-amber/10";
    if (isStale) return "text-dim border-dim/40 bg-dim/10";
    return "text-phosphor border-phosphor/40 bg-phosphor/10";
  };

  const getPulseColor = () => {
    if (!isMounted) {
      // Return consistent default state during SSR/hydration
      return "bg-amber animate-pulse";
    }
    if (!isNetworkOnline) return "bg-alert";
    if (isError && fetchFailureCount >= 3) return "bg-alert";
    if (isError) return "bg-amber";
    if (isFetching) return "bg-amber animate-pulse";
    if (isStale) return "bg-dim";
    return "bg-phosphor";
  };

  // Get status label based on state
  const getStatusLabel = () => {
    if (!isMounted) {
      // Return consistent default state during SSR/hydration
      return "Syncing...";
    }
    if (!isNetworkOnline) return "No Internet";
    if (isFetching) return "Syncing...";
    if (isError && fetchFailureCount >= 3) return `Sync Failed (${fetchFailureCount})`;
    if (isError) return "Sync Error";
    if (isStale) return "Stale Data";
    return "NetBird Sync";
  };

  // Get detail text
  const getDetailText = () => {
    if (!isNetworkOnline) return "No internet connection";
    if (isFetching) return "Fetching peer data...";
    if (fetchFailureCount > 0 && !isFetching) {
      return `Last sync: ${formatLastSync()} · Retry ${fetchFailureCount} · Next in ${countdown}s`;
    }
    return `Last sync: ${formatLastSync()} · Next in ${countdown}s`;
  };

  return (
    <div className={`flex flex-col rounded border px-3 py-2 ${getStatusColor()}`}>
      <div className="flex items-center gap-3">
        <span className={`size-2 rounded-full ${getPulseColor()}`} />

        <div className="flex flex-col">
          <span className="font-mono text-[10px] uppercase tracking-widest">{getStatusLabel()}</span>
          <span className="font-mono text-[9px] text-dim">{getDetailText()}</span>
        </div>

        {query.data && (
          <span className="ml-auto font-mono text-[9px] text-dim">
            {Array.isArray(query.data.peers) ? `${query.data.peers.length} peers` : "No data"}
          </span>
        )}
      </div>

      {/* Tiny progress bar */}
      <div className="mt-1.5 h-0.5 w-full bg-border rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full ${isFetching ? "bg-amber" : isStale ? "bg-dim" : "bg-phosphor"}`}
          style={{ width: `${progressPercent}%`, transition: "width 0.1s linear" }}
        />
      </div>
    </div>
  );
}

// Compact version for top nav or inline use
export function NetBirdSyncBadge({
  isFetching,
  lastSyncAt,
  isError,
}: {
  isFetching: boolean;
  lastSyncAt: number;
  isError?: boolean;
}) {
  const [isNetworkOnline, setIsNetworkOnline] = useState(navigator.onLine);

  // Monitor network connectivity
  useEffect(() => {
    const handleOnline = () => setIsNetworkOnline(true);
    const handleOffline = () => setIsNetworkOnline(false);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  // Get persistent last sync time from localStorage or use prop
  const getLastSyncTime = () => {
    // Try to get from localStorage first
    const stored = localStorage.getItem('sysmonitor.lastNetbirdSync');
    if (stored) {
      const parsed = parseInt(stored, 10);
      if (!isNaN(parsed) && parsed > 0) {
        return parsed;
      }
    }

    // Fallback to prop time
    return lastSyncAt || Date.now();
  };

  const actualLastSync = getLastSyncTime();
  const timeSince = Date.now() - actualLastSync;
  const isStale = timeSince > STALE_THRESHOLD; // 30 seconds - consistent with full status

  return (
    <div className="flex items-center gap-1.5">
      <span
        className={`size-1.5 rounded-full ${!isNetworkOnline ? "bg-alert" :
          isError ? "bg-amber" :
            isFetching ? "bg-amber animate-pulse" :
              isStale ? "bg-dim" :
                "bg-phosphor"
          }`}
      />
      <span className="font-mono text-[9px] text-dim">
        {!isNetworkOnline ? "offline" :
          isFetching ? "syncing..." :
            isError ? "error" :
              isStale ? "stale" :
                "live"}
      </span>
    </div>
  );
}
