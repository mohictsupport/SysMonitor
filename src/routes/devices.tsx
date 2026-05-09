import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { TopNav } from "@/components/TopNav";
import { OSIcon } from "@/components/OSIcon";
import { useNetbirdSites } from "@/lib/use-netbird";
import { ApiKeyGate } from "@/components/ApiKeyGate";
import { useHasApiKey } from "@/lib/auth-utils";
import {
  Monitor,
  Smartphone,
  Tablet,
  Search,
  Wifi,
  WifiOff,
  Clock,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Laptop,
  X,
  MapPin,
} from "lucide-react";
import { formatTimeAgo } from "@/lib/utils";

export const Route = createFileRoute("/devices")({
  component: DevicesPage,
});

// Helper to check if OS is a device (Android, iOS, Windows, macOS)
const isDeviceOS = (os?: string) => {
  if (!os) return false;
  const osLower = os.toLowerCase();
  return (
    osLower.includes("android") ||
    osLower.includes("ios") ||
    osLower.includes("windows") ||
    osLower.includes("mac") ||
    osLower.includes("darwin") ||
    osLower.includes("ubuntu") ||
    osLower.includes("linux")
  );
};

// Get device icon based on OS
const getDeviceIcon = (os?: string) => {
  if (!os) return Monitor;
  const osLower = os.toLowerCase();
  if (osLower.includes("android") || osLower.includes("ios")) {
    return Smartphone;
  }
  if (osLower.includes("ipad")) {
    return Tablet;
  }
  if (osLower.includes("mac") || osLower.includes("darwin")) {
    return Laptop;
  }
  return Monitor;
};

type SortField = "name" | "region" | "os" | "status" | "lastSeen";
type SortDirection = "asc" | "desc";

function DevicesPage() {
  const { sites, isLoading } = useNetbirdSites();
  const hasApiKey = useHasApiKey();
  const [searchTerm, setSearchTerm] = useState("");
  const [sortField, setSortField] = useState<SortField>("lastSeen");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");

  // Filter to only devices (not infrastructure)
  const devices = useMemo(() => {
    return sites.filter((site) => isDeviceOS(site.os));
  }, [sites]);

  // Filter by search
  const filteredDevices = useMemo(() => {
    if (!searchTerm.trim()) return devices;
    const term = searchTerm.toLowerCase();
    return devices.filter(
      (d) =>
        d.name.toLowerCase().includes(term) ||
        d.hostname?.toLowerCase().includes(term) ||
        d.os?.toLowerCase().includes(term) ||
        d.netbirdIp?.includes(term)
    );
  }, [devices, searchTerm]);

  // Sort devices
  const sortedDevices = useMemo(() => {
    const sorted = [...filteredDevices];
    sorted.sort((a, b) => {
      let comparison = 0;
      switch (sortField) {
        case "name":
          comparison = a.name.localeCompare(b.name);
          break;
        case "region":
          comparison = (a.region || "").localeCompare(b.region || "");
          break;
        case "os":
          comparison = (a.os || "").localeCompare(b.os || "");
          break;
        case "status":
          comparison = Number(b.netbirdConnected) - Number(a.netbirdConnected);
          break;
        case "lastSeen":
          const aTime = a.lastSeen ? new Date(a.lastSeen).getTime() : 0;
          const bTime = b.lastSeen ? new Date(b.lastSeen).getTime() : 0;
          comparison = bTime - aTime;
          break;
      }
      return sortDirection === "asc" ? -comparison : comparison;
    });
    return sorted;
  }, [filteredDevices, sortField, sortDirection]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDirection("desc");
    }
  };

  const getSortIcon = (field: SortField) => {
    if (sortField !== field) return <ArrowUpDown className="w-3 h-3 text-dim" />;
    return sortDirection === "asc" ? <ArrowUp className="w-3 h-3 text-phosphor" /> : <ArrowDown className="w-3 h-3 text-phosphor" />;
  };

  // Stats
  const stats = useMemo(() => {
    const total = devices.length;
    const online = devices.filter((d) => d.netbirdConnected).length;
    const offline = total - online;
    return { total, online, offline };
  }, [devices]);

  if (!hasApiKey) {
    return (
      <div className="flex flex-col min-h-screen">
        <TopNav />
        <main className="flex-1 p-6">
          <ApiKeyGate />
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-background text-foreground">
      <TopNav />
      <main className="mx-auto max-w-[1600px] p-6">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-dim">
              Remote Access Peers · synced from NetBird
            </p>
            <h1 className="mt-1 text-2xl font-medium tracking-tight">User Devices</h1>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-2 gap-px border border-border bg-border md:grid-cols-4">
          <Tile label="Total Devices" value={stats.total.toString()} />
          <Tile label="Online" value={stats.online.toString()} unit={`/ ${stats.total}`} color="phosphor" />
          <Tile label="Offline" value={stats.offline.toString()} color="alert" />
          <Tile label="Source" value="NetBird" />
        </div>

        {/* Search */}
        <div className="mt-6 mb-4 flex items-center gap-2 border border-border bg-panel p-3">
          <Search className="w-4 h-4 text-dim ml-2" />
          <input
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search devices..."
            className="min-w-[220px] flex-1 bg-transparent px-2 py-1 font-mono text-[11px] text-foreground outline-hidden"
          />
          {searchTerm && (
            <button
              type="button"
              onClick={() => setSearchTerm("")}
              className="text-dim hover:text-foreground"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Devices Table */}
        <div className="border border-border bg-panel">
          {/* Column Headers */}
          <div className="hidden grid-cols-12 gap-4 border-b border-border bg-panel-2 px-4 py-2 font-mono text-[10px] uppercase tracking-widest text-dim md:grid">
            <button
              type="button"
              onClick={() => handleSort("name")}
              className="col-span-3 flex items-center gap-2 hover:text-foreground transition-colors text-left"
            >
              <Monitor className="w-3 h-3" />
              Device
              {getSortIcon("name")}
            </button>
            <button
              type="button"
              onClick={() => handleSort("region")}
              className="col-span-2 flex items-center gap-2 hover:text-foreground transition-colors text-left"
            >
              <MapPin className="w-3 h-3" />
              Location
              {getSortIcon("region")}
            </button>
            <button
              type="button"
              onClick={() => handleSort("os")}
              className="col-span-2 flex items-center gap-2 hover:text-foreground transition-colors text-left"
            >
              <Monitor className="w-3 h-3" />
              OS
              {getSortIcon("os")}
            </button>
            <button
              type="button"
              onClick={() => handleSort("status")}
              className="col-span-2 flex items-center gap-2 hover:text-foreground transition-colors text-left"
            >
              <Wifi className="w-3 h-3" />
              Status
              {getSortIcon("status")}
            </button>
            <button
              type="button"
              onClick={() => handleSort("lastSeen")}
              className="col-span-3 flex items-center gap-2 hover:text-foreground transition-colors text-left"
            >
              <Clock className="w-3 h-3" />
              Last Seen
              {getSortIcon("lastSeen")}
            </button>
          </div>
          <div className="divide-y divide-border">
            {sortedDevices.length === 0 && (
              <div className="px-4 py-12 text-center font-mono text-[11px] text-dim">
                {searchTerm ? "No devices match your search." : "No devices found."}
              </div>
            )}
            {sortedDevices.map((device) => {
              const Icon = getDeviceIcon(device.os);
              return (
                <div
                  key={device.id}
                  className="grid grid-cols-1 items-center gap-4 px-4 py-4 transition-colors hover:bg-panel-2 md:grid-cols-12 border-b border-border/50"
                >
                  <div className="col-span-3 flex items-center gap-3">
                    <div className="bg-muted p-2 rounded-md">
                      <Icon className="w-4 h-4 text-dim" />
                    </div>
                    <div>
                      <span className="block text-sm font-medium text-foreground">{device.name}</span>
                      {device.hostname && device.hostname !== device.name && (
                        <code className="font-mono text-[10px] text-dim">{device.hostname}</code>
                      )}
                    </div>
                  </div>
                  <div className="col-span-2 font-mono text-[11px] text-dim">
                    {device.region || "—"}
                  </div>
                  <div className="col-span-2">
                    <OSIcon os={device.os} size="sm" showLabel />
                  </div>
                  <div className="col-span-2">
                    {device.netbirdConnected ? (
                      <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full bg-phosphor/10 text-phosphor font-mono text-[10px]">
                        <Wifi className="w-3 h-3" />
                        Online
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full bg-alert/10 text-alert font-mono text-[10px]">
                        <WifiOff className="w-3 h-3" />
                        Offline
                      </span>
                    )}
                  </div>
                  <div className="col-span-3 flex items-center gap-1.5 font-mono text-[11px] text-dim">
                    <Clock className="w-3 h-3" />
                    {device.lastSeen
                      ? formatTimeAgo(device.lastSeen)
                      : "Never"}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </main>
    </div>
  );
}

function Tile({
  label,
  value,
  unit,
  color = "neutral",
}: {
  label: string;
  value: string;
  unit?: string;
  color?: "neutral" | "phosphor" | "alert" | "amber";
}) {
  const colorClass =
    color === "phosphor"
      ? "text-phosphor"
      : color === "alert"
        ? "text-alert"
        : color === "amber"
          ? "text-amber"
          : "text-foreground";
  return (
    <div className="bg-panel p-4">
      <div className="font-mono text-[9px] uppercase tracking-widest text-dim">{label}</div>
      <div className={`mt-1 font-mono text-base tabular-nums ${colorClass}`}>
        {value}
        {unit && <span className="ml-1 text-xs text-dim">{unit}</span>}
      </div>
    </div>
  );
}
