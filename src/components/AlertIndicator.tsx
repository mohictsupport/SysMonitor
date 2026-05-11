import { useState, useEffect, useRef, useMemo } from "react";
import { Link } from "@tanstack/react-router";
import type { Site } from "@/lib/sites-data";
import { evaluateAlertingRules, loadAlertingRules } from "@/lib/use-sites";
import { playAlertSound, ensureAudioContext } from "@/lib/alert-sounds";
import {
  showSiteAlert,
  isElectron,
  sendTelegramNotification,
  sendSummaryNotification,
  showNotification,
} from "@/lib/electron-notifications";

interface AlertIndicatorProps {
  sites: Site[];
  isNetworkOnline?: boolean;
  apiError?: Error | null;
  isLoading?: boolean;
}

export function AlertIndicator({ sites, isNetworkOnline = true, apiError, isLoading }: AlertIndicatorProps) {
  const [activeAlerts, setActiveAlerts] = useState<{ count: number; critical: boolean }>({
    count: 0,
    critical: false,
  });
  const prevAlertIdsRef = useRef<string[]>([]);
  const [isMounted, setIsMounted] = useState(false);

  // Helper to check if OS is a device (Android, iOS, Windows, macOS, Linux - user devices)
  const isDeviceOS = (os?: string) => {
    if (!os) return false;
    const osLower = os.toLowerCase();
    return (
      osLower.includes("android") ||
      osLower.includes("ios") ||
      osLower.includes("iphone") ||
      osLower.includes("ipad") ||
      (osLower.includes("windows") && !osLower.includes("server")) ||
      osLower.includes("macos") ||
      osLower.includes("darwin") ||
      osLower.includes("linux") // Linux laptops/desktops are devices
    );
  };

  // Filter out devices - only count infrastructure sites
  const infrastructureSites = sites.filter((s) => !isDeviceOS(s.os));

  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    /* Temporarily disabled to isolate freeze issue
    if (sites.length === 0) return;
    ...
    */
  }, [sites]);

  // Determine connection status based on network and API
  const getConnectionStatus = () => {
    if (!isMounted) {
      // Return consistent default state during SSR/hydration
      return {
        text: "Connecting",
        subtext: "...",
        color: { text: "text-amber", bg: "bg-amber", border: "border-amber/40", bgLight: "bg-amber/10" }
      };
    }
    if (!isNetworkOnline) {
      return {
        text: "Offline",
        subtext: "No network",
        color: { text: "text-alert", bg: "bg-alert", border: "border-alert/40", bgLight: "bg-alert/10" }
      };
    }
    if (apiError) {
      return {
        text: "Offline",
        subtext: "API error",
        color: { text: "text-alert", bg: "bg-alert", border: "border-alert/40", bgLight: "bg-alert/10" }
      };
    }
    if (isLoading && sites.length === 0) {
      return {
        text: "Connecting",
        subtext: "...",
        color: { text: "text-amber", bg: "bg-amber", border: "border-amber/40", bgLight: "bg-amber/10" }
      };
    }
    return {
      text: "Online",
      subtext: `${infrastructureSites.filter(s => s.status === "online").length} sites up`,
      color: { text: "text-phosphor", bg: "bg-phosphor", border: "border-phosphor/40", bgLight: "bg-phosphor/10" }
    };
  };

  const status = getConnectionStatus();

  if (activeAlerts.count === 0) {
    return (
      <div className={`hidden items-center gap-2 rounded-full border ${status.color.border} ${status.color.bgLight} px-3 py-1 sm:flex`}>
        <span className={`status-pulse size-1.5 rounded-full ${status.color.bg}`} />
        <span className={`font-mono text-[10px] uppercase tracking-widest ${status.color.text}`}>
          {status.text}
        </span>
        <span className="font-mono text-[10px] text-dim">
          {status.subtext}
        </span>
      </div>
    );
  }

  return (
    <Link
      to="/alerting"
      className={`hidden items-center gap-2 rounded-full border px-3 py-1 transition-colors hover:opacity-80 sm:flex ${
        activeAlerts.critical ? "border-alert/40 bg-alert/10" : "border-amber/40 bg-amber/10"
      }`}
      onClick={() => {
        // Initialize audio context on user interaction
        ensureAudioContext();
      }}
    >
      <span
        className={`status-pulse size-1.5 rounded-full ${
          activeAlerts.critical ? "bg-alert" : "bg-amber"
        }`}
      />
      <span
        className={`font-mono text-[10px] uppercase tracking-widest ${
          activeAlerts.critical ? "text-alert" : "text-amber"
        }`}
      >
        {activeAlerts.critical ? "CRITICAL" : "WARNING"}: {activeAlerts.count} Alert
        {activeAlerts.count > 1 ? "s" : ""}
      </span>
    </Link>
  );
}
