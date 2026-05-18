import { createLazyFileRoute } from "@tanstack/react-router";
import { useMemo, useState, useEffect } from "react";
import { TopNav } from "@/components/TopNav";
import { OSIcon } from "@/components/OSIcon";
import { useNetbirdSites } from "@/lib/use-netbird";
import { ApiKeyGate } from "@/components/ApiKeyGate";
import { useHasApiKey } from "@/lib/auth-utils";
import { Dialog, DialogContent, DialogTitle, DialogHeader } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
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
  Trash2,
  AlertTriangle,
  Loader2,
} from "lucide-react";
import { formatTimeAgo } from "@/lib/utils";
import { useQueryClient } from "@tanstack/react-query";
import { deleteNetbirdPeer } from "@/lib/netbird.functions";
import { toast } from "sonner";
import { AccessCodeModal } from "@/components/AccessCodeModal";
import { useAccessKey } from "@/lib/use-access-key";

export const Route = createLazyFileRoute("/devices")({
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
  const { sites, isLoading, refetch, isFetching } = useNetbirdSites();
  const hasApiKey = useHasApiKey();
  const [searchTerm, setSearchTerm] = useState("");
  const [sortField, setSortField] = useState<SortField>("lastSeen");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");

  // Selected device for detail modal
  const [selectedDevice, setSelectedDevice] = useState<NetBirdSite | null>(null);
  const [detailModalOpen, setDetailModalOpen] = useState(false);

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
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            disabled={isFetching}
            className="font-mono text-[11px] inline-flex items-center gap-2"
          >
            {isFetching ? "⟳ Syncing..." : "↻ Sync Now"}
          </Button>
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
                  onClick={() => {
                    setSelectedDevice(device);
                    setDetailModalOpen(true);
                  }}
                  className="grid grid-cols-1 items-center gap-4 px-4 py-4 transition-colors hover:bg-panel-2 md:grid-cols-12 border-b border-border/50 cursor-pointer"
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
                    {device.netbirdConnected ? (
                      <span className="text-phosphor">Online now</span>
                    ) : device.lastSeen ? (
                      formatTimeAgo(device.lastSeen)
                    ) : (
                      "Never"
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </main>

      {/* Device Detail Modal */}
      <DeviceDetailModal
        device={selectedDevice}
        open={detailModalOpen}
        onClose={() => {
          setDetailModalOpen(false);
          setSelectedDevice(null);
        }}
        allSites={sites}
      />
    </div>
  );
}

export function DeviceDetailModal({
  device,
  open,
  onClose,
  allSites = [],
}: {
  device: NetBirdSite | null;
  open: boolean;
  onClose: () => void;
  allSites?: NetBirdSite[];
}) {
  const queryClient = useQueryClient();
  const [isConfirmDeleteOpen, setIsConfirmDeleteOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isAccessModalOpen, setIsAccessModalOpen] = useState(false);
  const [accessError, setAccessError] = useState<string | null>(null);
  const { verifyAccessKey } = useAccessKey();

  // Find all peer info for this device - prioritize fresh data from allSites
  const peer = useMemo(() => {
    if (!device) return null;
    // Try to find matching peer in allSites (fresh data from NetBird API)
    const match = allSites.find((s) => 
      (device.peerId && s.peerId === device.peerId) || 
      (device.name && s.name === device.name) ||
      (device.id && s.id === device.id)
    );
    // Return match if found (fresh data), otherwise fall back to device prop
    return match || device;
  }, [device, allSites]);

  // Reset deletion states when device/modal opens
  useEffect(() => {
    if (open) {
      setIsConfirmDeleteOpen(false);
      setIsDeleting(false);
      setIsAccessModalOpen(false);
      setAccessError(null);
    }
  }, [open, device]);

  // Safe values that work even when device is null
  // Note: use netbirdConnected from API/site data, fall back to connected for compatibility
  const deviceOS = peer?.os || device?.os || "Unknown";
  const lastSeen = peer?.lastSeen || device?.lastSeen || "Never";
  const connected = peer?.netbirdConnected ?? peer?.connected ?? device?.netbirdConnected ?? device?.connected ?? false;
  const version = peer?.version || device?.version || "-";
  const groups = peer?.groups || device?.groups || [];
  const deviceName = device?.name || "Unknown Device";

  // Format last seen
  const formattedLastSeen = useMemo(() => {
    if (!lastSeen || lastSeen === "Never") return "Never";
    try {
      const date = new Date(lastSeen);
      if (isNaN(date.getTime())) return "Unknown";
      return date.toLocaleString("en-US", {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return "Unknown";
    }
  }, [lastSeen]);


  // Early return AFTER all hooks are called
  if (!device) return null;

  // Debug logging to trace data mismatch
  console.log('[DeviceDetailModal] Device:', device?.name, 'connected:', device?.connected, 'netbirdConnected:', device?.netbirdConnected);
  console.log('[DeviceDetailModal] Peer:', peer?.name, 'connected:', peer?.connected, 'netbirdConnected:', peer?.netbirdConnected);
  console.log('[DeviceDetailModal] Final connected:', connected);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-4xl bg-panel border-border p-0 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-border bg-background">
          <div>
            <DialogTitle className="text-xl font-semibold flex items-center gap-2">
              <Monitor className="w-5 h-5 text-phosphor" />
              {device.name}
            </DialogTitle>
            <p className="text-sm text-dim mt-1">
              Device • {deviceOS} • {connected ? "Connected" : "Disconnected"}
            </p>
          </div>
        </div>

        {/* Content */}
        <div className="p-6">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Left: Device Info */}
              <div className="lg:col-span-2 space-y-6">
                {/* Status Cards */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <Tile
                    label="Status"
                    value={connected ? "Online" : "Offline"}
                    color={connected ? "phosphor" : "alert"}
                  />
                  <Tile label="OS" value={deviceOS} />
                  <Tile label="Version" value={version} />
                </div>

                {/* Connected Since / Last Seen */}
                <div className="bg-panel p-4 rounded-lg border border-border">
                  <h4 className="text-sm font-medium text-dim uppercase tracking-wide mb-3">
                    {connected ? "Connected Since" : "Last Seen"}
                  </h4>
                  <div className="flex items-center gap-3">
                    <div className={`w-3 h-3 rounded-full ${connected ? "bg-phosphor" : "bg-alert"}`} />
                    <span className="text-lg font-mono">{formattedLastSeen}</span>
                    {connected && <span className="text-sm text-phosphor">(Online)</span>}
                  </div>
                </div>

                {/* Groups */}
                {groups.length > 0 && (
                  <div className="bg-panel p-4 rounded-lg border border-border">
                    <h4 className="text-sm font-medium text-dim uppercase tracking-wide mb-3">
                      Groups
                    </h4>
                    <div className="flex flex-wrap gap-2">
                      {groups.map((group) => (
                        <span
                          key={group}
                          className="px-2 py-1 text-xs bg-background border border-border rounded"
                        >
                          {group}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Right: Peer Info Sidebar */}
              <div className="space-y-4">
                <div className="bg-panel p-4 rounded-lg border border-border">
                  <h4 className="text-sm font-medium text-dim uppercase tracking-wide mb-3">
                    Peer Details
                  </h4>
                  <div className="space-y-3 text-sm">
                    <div className="flex justify-between">
                      <span className="text-dim">Connection</span>
                      <span className={connected ? "text-phosphor" : "text-alert"}>
                        {connected ? "Established" : "Not Connected"}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-dim">Operating System</span>
                      <span>{deviceOS}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-dim">NetBird Version</span>
                      <span className="font-mono">{version}</span>
                    </div>
                  </div>
                </div>

                <div className="border border-red-500/20 bg-red-500/5 p-4 rounded-lg">
                  <h4 className="text-sm font-medium text-red-500 uppercase tracking-wide flex items-center gap-1.5 mb-2">
                    <AlertTriangle className="w-4 h-4" />
                    Danger Zone
                  </h4>
                  <p className="text-xs text-dim leading-relaxed">
                    Permanently delete this device from the NetBird network. This stops connection status freezes but severs the connection.
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setIsAccessModalOpen(true);
                      setAccessError(null);
                    }}
                    className="mt-3 w-full border border-red-500/40 bg-red-500/10 px-3 py-2 font-mono text-[10px] uppercase tracking-widest text-red-500 hover:bg-red-500/20 transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Delete Device Peer
                  </button>
                </div>
              </div>
            </div>
          </div>
        </DialogContent>

        {/* Deletion confirmation dialog */}
        <Dialog open={isConfirmDeleteOpen} onOpenChange={(open) => !open && !isDeleting && setIsConfirmDeleteOpen(false)}>
          <DialogContent className="max-w-md bg-panel border-border">
            <DialogHeader>
              <DialogTitle className="sr-only">Confirm NetBird Peer Deletion</DialogTitle>
            </DialogHeader>
            <div className="flex flex-col items-center text-center pt-4 pb-2">
              <div className="w-12 h-12 rounded-full bg-red-500/10 flex items-center justify-center mb-4">
                <AlertTriangle className="w-6 h-6 text-red-500" />
              </div>
              <h3 className="font-medium text-foreground mb-2">Delete Device Peer?</h3>
              <p className="text-sm text-dim mb-6">
                Are you sure you want to permanently delete the peer <strong className="text-foreground">{device.name}</strong> from NetBird Cloud? This will immediately disconnect the device and cannot be undone.
              </p>
              <div className="flex items-center gap-3 w-full">
                <button
                  type="button"
                  onClick={() => setIsConfirmDeleteOpen(false)}
                  className="flex-1 border border-border bg-panel px-4 py-2 font-mono text-[11px] uppercase tracking-widest text-dim transition-colors hover:text-foreground cursor-pointer"
                  disabled={isDeleting}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    setIsDeleting(true);
                    const deletingToast = toast.loading(`Deleting peer "${device.name}" from NetBird...`);
                    try {
                      // Note: device.id corresponds to peer id in NetBird API
                      const res = await deleteNetbirdPeer(device.id);
                      if (res.success) {
                        toast.success(`Device peer "${device.name}" successfully deleted from NetBird Cloud.`);
                        queryClient.invalidateQueries({ queryKey: ["netbird", "peers"] });
                        setIsConfirmDeleteOpen(false);
                        onClose();
                      } else {
                        toast.error(`Deletion failed: ${res.error || "Unknown error"}`);
                      }
                    } catch (err) {
                      console.error(err);
                      toast.error("Failed to delete peer from NetBird");
                    } finally {
                      toast.dismiss(deletingToast);
                      setIsDeleting(false);
                    }
                  }}
                  className="flex-1 bg-red-500 hover:bg-red-600 px-4 py-2 font-mono text-[11px] uppercase tracking-widest text-white transition-colors cursor-pointer flex items-center justify-center gap-2"
                  disabled={isDeleting}
                >
                  {isDeleting ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      Deleting...
                    </>
                  ) : (
                    "Delete Peer"
                  )}
                </button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Access Code Modal */}
        <AccessCodeModal
          isOpen={isAccessModalOpen}
          onClose={() => {
            setIsAccessModalOpen(false);
            setAccessError(null);
          }}
          onVerify={(password) => {
            if (verifyAccessKey(password)) {
              setIsAccessModalOpen(false);
              setAccessError(null);
              setIsConfirmDeleteOpen(true);
            } else {
              setAccessError("Incorrect access code");
            }
          }}
          error={accessError}
          title="Delete Device Peer - Access Required"
          description="Please enter the access code to delete this device peer."
        />
      </Dialog>
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
