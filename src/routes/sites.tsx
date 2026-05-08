import { createFileRoute, Link, useLocation, useNavigate } from "@tanstack/react-router";
import { useMemo, useState, useEffect, useCallback, useRef, memo } from "react";
import { TopNav } from "@/components/TopNav";
import { StatusDot, statusLabel, StatusBadge } from "@/components/StatusIndicator";
import { OSIcon } from "@/components/OSIcon";
import { NetBirdSyncBadge } from "@/components/NetBirdSyncStatus";
import { useNetbirdSites } from "@/lib/use-netbird";
import { useAllSitesUptime } from "@/lib/use-site-uptime";
import { useHasApiKey } from "@/lib/auth-utils";
import { ApiKeyGate } from "@/components/ApiKeyGate";
import { AccessCodeModal } from "@/components/AccessCodeModal";
import { useAccessKey } from "@/lib/use-access-key";
import { shouldNotifyStatusChange, updateAlertState } from "@/lib/alert-state";
import { isElectron, showNotification, queueSiteStatusNotification } from "@/lib/electron-notifications";
import type { SiteStatus, Site } from "@/lib/sites-data";
import { useSites } from "@/lib/use-sites";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Pencil,
  Check,
  X,
  Plus,
  Copy,
  Loader2,
  ArrowLeft,
  Terminal,
  Server,
  Monitor,
  Router,
  Wifi,
  Clock,
  CheckCircle2,
  ArrowRight,
  ChevronRight,
  ChevronLeft,
  Info,
  ExternalLink,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Trash2,
  AlertTriangle,
} from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { updateNetbirdPeer, probeHttp, type ProbeResult, listNetbirdPeers, listNetbirdGroups, createNetbirdGroup } from "@/lib/netbird.functions";
import { createSetupKey } from "@/lib/netbird-api";
import { addPendingSite } from "@/lib/site-onboarding";
import { toast } from "sonner";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

import { z } from "zod";
import facilities from "@/data/facilities.json";

const sitesSearchSchema = z.object({
  add: z.string().optional(),
});

export const Route = createFileRoute("/sites")({
  head: () => ({
    meta: [
      { title: "Sites — SysMonitor" },
      {
        name: "description",
        content:
          "All registered sites in your SysMonitor mesh, with status and Netbird connectivity.",
      },
      { property: "og:title", content: "Sites — SysMonitor" },
      {
        property: "og:description",
        content:
          "All registered sites in your SysMonitor mesh, with status and Netbird connectivity.",
      },
    ],
  }),
  validateSearch: sitesSearchSchema,
  component: SitesPage,
});

const FILTERS: Array<{ id: "all" | SiteStatus; label: string }> = [
  { id: "all", label: "All" },
  { id: "online", label: "Online" },
  { id: "offline", label: "Offline" },
];

// Memoized site row to prevent unnecessary re-renders
const SiteRow = memo(({ site, onClick, onDelete }: { site: Site; onClick: () => void; onDelete: (e: React.MouseEvent) => void }) => {
  return (
    <div
      className="grid grid-cols-1 items-center gap-4 px-4 py-4 transition-colors hover:bg-panel-2 md:grid-cols-12 cursor-pointer"
    >
      <div className="col-span-3 flex items-center gap-3" onClick={onClick}>
        <StatusDot status={site.status} />
        <div className="min-w-0">
          <span className="block truncate text-sm font-medium text-foreground hover:text-phosphor">
            {site.name}
          </span>
          <code className="font-mono text-[10px] text-dim">{site.hostname || site.id}</code>
        </div>
      </div>
      <div className="col-span-2 font-mono text-[11px] text-dim" onClick={onClick}>{site.region}</div>
      <div className="col-span-1" onClick={onClick}>
        <OSIcon os={site.os} size="sm" showLabel />
      </div>
      {/* NetBird IP hidden for security - showing status instead */}
      <div className={`col-span-2 font-mono text-[11px] ${site.netbirdConnected ? "text-phosphor" : "text-alert"}`} onClick={onClick}>
        {site.netbirdConnected ? "● Connected" : "● Disconnected"}
      </div>
      <div className="col-span-2 font-mono text-[10px] text-dim" onClick={onClick}>
        {site.netbirdConnected ? "Online now" : formatTimeAgo(site.lastSeen)}
      </div>
      <div className="col-span-2 text-right">
        <button
          type="button"
          onClick={onDelete}
          className="inline-flex items-center justify-center w-8 h-8 rounded border border-border bg-panel text-dim hover:text-alert hover:border-alert transition-colors"
          title="Delete site"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
});

function SitesPage() {
  const hasApiKey = useHasApiKey();
  const {
    sites: netbirdSites,
    loading,
    error,
    refetch,
    isFetching,
    dataUpdatedAt,
    isError,
  } = useNetbirdSites();

  // Get accurate uptime data from Firestore (with caching)
  const deviceNames = useMemo(() => netbirdSites.map(s => s.name), [netbirdSites]);
  const { uptimes, loading: uptimeLoading } = useAllSitesUptime(deviceNames, 30);
  // Merge sites with accurate uptime data
  const sites = useMemo(() => {
    return netbirdSites.map(site => {
      const uptimeData = uptimes.get(site.name);
      if (uptimeData && !uptimeData.loading) {
        return {
          ...site,
          uptime: uptimeData.uptime,
          accurateUptime: true,
        };
      }
      return site;
    });
  }, [netbirdSites, uptimes]);
  
  const { removeSite } = useSites();
  const location = useLocation();
  const search = Route.useSearch();
  const navigate = useNavigate();
  const [filter, setFilter] = useState<"all" | SiteStatus>("all");
  const [query, setQuery] = useState("");
  const [selectedSite, setSelectedSite] = useState<Site | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isAddSiteModalOpen, setIsAddSiteModalOpen] = useState(false);
  const [sortBy, setSortBy] = useState<"lastSeen">("lastSeen");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [siteToDelete, setSiteToDelete] = useState<Site | null>(null);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);

  // Use a ref to track previous sites to avoid unnecessary iterations
  const prevSitesRef = useRef<Site[]>([]);

  // Auto-open Add Site modal if navigated with ?add=true
  useEffect(() => {
    if (search.add === "true") {
      setIsAddSiteModalOpen(true);
      // Clear the search param so it doesn't reopen on refresh
      navigate({ to: "/sites", search: {} });
    }
  }, [search.add, navigate]);

  // Monitor NetBird connection status changes
  useEffect(() => {
    if (!isElectron() || sites.length === 0) return;

    const prevSites = prevSitesRef.current;
    prevSitesRef.current = sites;

    // Only check sites that actually changed status
    sites.forEach((site) => {
      const prevSite = prevSites.find((s) => s.id === site.id);
      // Skip if status hasn't changed
      if (prevSite && prevSite.status === site.status) return;

      const currentStatus: SiteStatus = site.status;
      const { shouldNotify } = shouldNotifyStatusChange(site.id, currentStatus);

      if (shouldNotify) {
        // Show native notification
        showNotification({
          title: currentStatus === "online" ? "🟢 Site Online" : "🔴 Site Offline",
          body: `${site.name} is now ${currentStatus}`,
          icon: "/icon.png",
          silent: false,
        });

        // Queue Telegram notification (batched)
        queueSiteStatusNotification(site.id, site.name, currentStatus, site.region);
      }
    });
  }, [sites]);

  const filteredSites = useMemo(() => {
    return sites.filter((s) => {
      if (filter === "all") return true;
      return s.status === filter;
    });
  }, [sites, filter]);

  const searchedSites = useMemo(() => {
    let sites = filteredSites;
    if (query) {
      const q = query.toLowerCase();
      sites = filteredSites.filter(
        (s) =>
          s.name.toLowerCase().includes(q) ||
          s.hostname.toLowerCase().includes(q) ||
          s.region.toLowerCase().includes(q) ||
          s.netbirdIp.toLowerCase().includes(q),
      );
    }
    // Sort by lastSeen
    return [...sites].sort((a, b) => {
      const aTime = a.lastSeen ? new Date(a.lastSeen).getTime() : 0;
      const bTime = b.lastSeen ? new Date(b.lastSeen).getTime() : 0;
      return sortOrder === "desc" ? bTime - aTime : aTime - bTime;
    });
  }, [filteredSites, query, sortOrder]);

  // If no API key, show the gate
  if (!hasApiKey) {
    return (
      <div className="min-h-dvh bg-background text-foreground">
        <TopNav />
        <main className="mx-auto max-w-[1600px] p-6">
          <ApiKeyGate />
        </main>
      </div>
    );
  }

  return (

    <div className="min-h-dvh bg-background text-foreground">
      <TopNav onAddSite={() => setIsAddSiteModalOpen(true)} />
      <main className="mx-auto max-w-[1600px] p-6">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-dim">
              Site Inventory · synced from NetBird
            </p>
            <h1 className="mt-1 text-2xl font-medium tracking-tight">Registered Sites</h1>
          </div>
          <div className="flex items-center gap-3">
            <NetBirdSyncBadge
              isFetching={isFetching}
              lastSyncAt={dataUpdatedAt || Date.now()}
              isError={isError}
            />
            <button
              type="button"
              onClick={() => refetch()}
              disabled={isFetching}
              className="inline-flex items-center gap-2 border border-phosphor/40 bg-phosphor/10 px-3 py-2 font-mono text-[11px] uppercase tracking-widest text-phosphor transition-colors hover:bg-phosphor/20 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
            >
              {isFetching ? "⟳ Syncing..." : "↻ Sync Now"}
            </button>
          </div>
        </div>

        {error && (
          <div className="mt-4 border border-alert/40 bg-alert/10 px-4 py-3 font-mono text-[11px] text-alert">
            {(() => {
              const errMsg = typeof error === "string" ? error : error.message || String(error);
              const errMsgLower = errMsg.toLowerCase();

              // API Key / Authentication errors
              const isAuthError = errMsgLower.includes("unauthorized") ||
                errMsgLower.includes("authentication") ||
                errMsgLower.includes("api key") ||
                errMsgLower.includes("token") ||
                errMsgLower.includes("expired") ||
                errMsgLower.includes("invalid") ||
                errMsgLower.includes("iso-8859") ||
                errMsgLower.includes("headers") ||
                errMsgLower.includes("401") ||
                errMsgLower.includes("403");

              if (isAuthError) {
                return `API key error: Your API key may be invalid, expired, or missing. Please check your API key in Settings.`;
              }

              // Network errors
              const isNetworkError = (errMsgLower.includes("failed to fetch") ||
                errMsgLower.includes("networkerror") ||
                errMsgLower.includes("network request failed") ||
                errMsgLower.includes("econnrefused") ||
                errMsgLower.includes("etimedout") ||
                errMsgLower.includes("enotfound") ||
                errMsgLower.includes("offline")) &&
                !navigator.onLine;

              if (isNetworkError || !navigator.onLine) {
                return `No internet connection. Please check your network and try again.`;
              }

              return `NetBird API error: ${errMsg}`;
            })()}
          </div>
        )}

        {/* Filter bar */}
        <div className="mb-4 flex flex-wrap items-center gap-2 border border-border bg-panel p-3">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name, hostname, region, IP…"
            className="min-w-[220px] flex-1 border border-border bg-void px-3 py-1.5 font-mono text-[11px] text-foreground outline-hidden focus:border-phosphor"
          />
          <div className="flex flex-wrap gap-1">
            {FILTERS.map((f) => {
              const active = filter === f.id;
              return (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setFilter(f.id)}
                  className={`border px-3 py-1.5 font-mono text-[10px] uppercase tracking-widest transition-colors ${
                    active
                      ? "border-phosphor bg-phosphor/10 text-phosphor"
                      : "border-border bg-void text-dim hover:text-foreground"
                  }`}
                >
                  {f.label}
                </button>
              );
            })}
          </div>
          <div className="flex items-center gap-1 border-l border-border pl-2">
            <span className="font-mono text-[10px] uppercase tracking-widest text-dim mr-1">Sort:</span>
            <button
              type="button"
              onClick={() => setSortOrder("asc")}
              className={`border px-2 py-1.5 font-mono text-[10px] uppercase tracking-widest transition-colors ${
                sortOrder === "asc"
                  ? "border-phosphor bg-phosphor/10 text-phosphor"
                  : "border-border bg-void text-dim hover:text-foreground"
              }`}
              title="Sort by last seen (oldest first)"
            >
              <ArrowUp className="w-3 h-3 inline" />
            </button>
            <button
              type="button"
              onClick={() => setSortOrder("desc")}
              className={`border px-2 py-1.5 font-mono text-[10px] uppercase tracking-widest transition-colors ${
                sortOrder === "desc"
                  ? "border-phosphor bg-phosphor/10 text-phosphor"
                  : "border-border bg-void text-dim hover:text-foreground"
              }`}
              title="Sort by last seen (newest first)"
            >
              <ArrowDown className="w-3 h-3 inline" />
            </button>
          </div>
        </div>

        {/* Table */}
        <div className="border border-border bg-panel">
          <div className="hidden grid-cols-12 gap-4 border-b border-border bg-panel-2 px-4 py-2 font-mono text-[10px] uppercase tracking-widest text-dim md:grid">
            <div className="col-span-3">Site</div>
            <div className="col-span-2">Region</div>
            <div className="col-span-1">OS</div>
            <div className="col-span-2">Status</div>
            <div className="col-span-2">Last Seen</div>
            <div className="col-span-2 text-right">Actions</div>
          </div>
          <div className="divide-y divide-border">
            {loading && netbirdSites.length === 0 && (
              <div className="px-4 py-12 text-center font-mono text-[11px] text-dim">
                Connecting to NetBird API…
              </div>
            )}
            {!loading && searchedSites.length === 0 && (
              <div className="px-4 py-12 text-center font-mono text-[11px] text-dim">
                No peers match the current filter.
              </div>
            )}
            {searchedSites.map((s) => (
              <SiteRow
                key={s.id}
                site={s}
                onClick={() => {
                  setSelectedSite(s);
                  setIsModalOpen(true);
                }}
                onDelete={(e) => {
                  e.stopPropagation();
                  setSiteToDelete(s);
                  setIsDeleteModalOpen(true);
                }}
              />
            ))}
          </div>
        </div>

        {/* Site Detail Modal */}
        <SiteDetailModal
          site={selectedSite}
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
        />

        {/* Add Site Modal */}
        <AddSiteModal isOpen={isAddSiteModalOpen} onClose={() => setIsAddSiteModalOpen(false)} />

        {/* Delete Confirmation Modal */}
        <DeleteConfirmModal
          site={siteToDelete}
          isOpen={isDeleteModalOpen}
          onClose={() => {
            setIsDeleteModalOpen(false);
            setSiteToDelete(null);
          }}
          onConfirm={() => {
            if (siteToDelete) {
              // Remove from local storage
              removeSite(siteToDelete.id);
              // Refetch NetBird data
              refetch();
              toast.success(`Site "${siteToDelete.name}" deleted successfully`);
            }
            setIsDeleteModalOpen(false);
            setSiteToDelete(null);
          }}
        />
      </main>
    </div>
  );
}

// Delete Confirmation Modal Component
function DeleteConfirmModal({
  site,
  isOpen,
  onClose,
  onConfirm,
}: {
  site: Site | null;
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  if (!site) return null;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="sr-only">Confirm Delete</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col items-center text-center pt-4 pb-2">
          <div className="w-12 h-12 rounded-full bg-red-500/10 flex items-center justify-center mb-4">
            <AlertTriangle className="w-6 h-6 text-red-500" />
          </div>
          <h3 className="font-medium text-foreground mb-2">Delete Site?</h3>
          <p className="text-sm text-dim mb-6">
            Are you sure you want to delete <span className="text-foreground font-medium">{site.name}</span>? This action cannot be undone and will remove all monitoring data for this site.
          </p>
          <div className="flex items-center gap-3 w-full">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 border border-border bg-panel px-4 py-2 font-mono text-[11px] uppercase tracking-widest text-dim transition-colors hover:text-foreground"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={onConfirm}
              className="flex-1 bg-red-500 hover:bg-red-600 px-4 py-2 font-mono text-[11px] uppercase tracking-widest text-white transition-colors"
            >
              Delete
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// Site Detail Modal Component
export function SiteDetailModal({
  site,
  isOpen,
  onClose,
}: {
  site: Site | null;
  isOpen: boolean;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(site?.name || "");
  const [probeUrl, setProbeUrl] = useState("");
  const [probeResult, setProbeResult] = useState<ProbeResult | null>(null);

  // Access code protection for opening site
  const [isAccessModalOpen, setIsAccessModalOpen] = useState(false);
  const [accessError, setAccessError] = useState<string | null>(null);
  const [pendingSiteUrl, setPendingSiteUrl] = useState<string | null>(null);
  const { verifyAccessKey } = useAccessKey();

  // Reset edit state when site changes
  useEffect(() => {
    setEditName(site?.name || "");
    setIsEditing(false);
    setProbeUrl("");
    setProbeResult(null);
  }, [site]);

  const updateMutation = useMutation({
    mutationFn: async (newName: string) => {
      if (!site) throw new Error("No site selected");
      const result = await updateNetbirdPeer({ peerId: site.id, name: newName });
      if (!result.success) {
        throw new Error(result.error || "Failed to update");
      }
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["netbird", "peers"] });
      setIsEditing(false);
    },
  });

  const probeMutation = useMutation({
    mutationFn: (url: string) => probeHttp({ url }),
    onSuccess: (res) => setProbeResult(res),
    onError: (err) =>
      setProbeResult({
        ok: false,
        status: null,
        latencyMs: 0,
        detail: err instanceof Error ? err.message : "Probe failed",
      }),
  });

  const handleSave = useCallback(() => {
    if (editName.trim() && editName !== site?.name) {
      updateMutation.mutate(editName.trim());
    } else {
      setIsEditing(false);
      setEditName(site?.name || "");
    }
  }, [editName, site?.name, updateMutation]);

  const handleCancel = useCallback(() => {
    setIsEditing(false);
    setEditName(site?.name || "");
  }, [site?.name]);

  if (!site) return null;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="sr-only">Site Details</DialogTitle>
        </DialogHeader>

        {/* Header */}
        <div className="flex flex-wrap items-end justify-between gap-4 border-b border-border pb-6">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-dim">
              {site.region} · NetBird Peer
            </p>
            {isEditing ? (
              <div className="mt-1 flex items-center gap-2">
                <Input
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="h-9 text-lg w-64"
                  disabled={updateMutation.isPending}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleSave();
                    if (e.key === "Escape") handleCancel();
                  }}
                  autoFocus
                />
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-9 w-9 cursor-pointer"
                  onClick={handleSave}
                  disabled={updateMutation.isPending}
                >
                  {updateMutation.isPending ? (
                    <div className="h-5 w-5 animate-spin rounded-full border-2 border-current border-t-transparent" />
                  ) : (
                    <Check className="h-5 w-5" />
                  )}
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-9 w-9 cursor-pointer"
                  onClick={handleCancel}
                  disabled={updateMutation.isPending}
                >
                  <X className="h-5 w-5" />
                </Button>
              </div>
            ) : (
              <h1 className="mt-1 flex items-center gap-3 text-2xl font-medium tracking-tight group">
                {site.name}
                <OSIcon os={site.os} size="md" />
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                  onClick={() => setIsEditing(true)}
                >
                  <Pencil className="h-4 w-4" />
                </Button>
                <StatusBadge status={site.status} />
              </h1>
            )}
            <code className="mt-2 block font-mono text-[11px] text-dim">
              {site.hostname || site.id}
            </code>
          </div>
          <button
            type="button"
            onClick={() => {
              setPendingSiteUrl(`http://${site.netbirdIp}`);
              setIsAccessModalOpen(true);
              setAccessError(null);
            }}
            className="inline-flex items-center gap-2 border border-border bg-panel px-3 py-2 font-mono text-[11px] uppercase tracking-widest text-dim transition-colors hover:border-phosphor hover:text-phosphor cursor-pointer"
          >
            <ExternalLink className="h-4 w-4" />
            Open Site
          </button>
        </div>

        {/* Metrics */}
        <div className="mt-6 grid grid-cols-2 gap-px border border-border bg-border md:grid-cols-5">
          <Tile
            label="Tunnel"
            value={site.netbirdConnected ? "Connected" : "Down"}
            tone={site.netbirdConnected ? "ok" : "alert"}
          />
          {/* NetBird IP hidden for security */}
          <Tile label="Region" value={site.region} />
          <Tile label="OS" value={site.os || "—"} />
          <Tile label="Tags" value={site.tags.slice(0, 2).join(", ") || "—"} />
          <Tile
            label="Last Seen"
            value={site.netbirdConnected ? "Online now" : site.lastSeen ? new Date(site.lastSeen).toLocaleDateString() : "—"}
            tone={site.netbirdConnected ? "ok" : "neutral"}
          />
        </div>

        {/* Two-col: probes + peer */}
        <div className="mt-8 grid grid-cols-1 gap-8 lg:grid-cols-3">
          <section className="lg:col-span-2">
            <h2 className="mb-3 font-mono text-[11px] font-bold uppercase tracking-widest text-dim">
              NetBird Status
            </h2>
            <div className="divide-y divide-border border border-border bg-panel">
              {site.checks.map((c) => (
                <div
                  key={c.label}
                  className="flex items-center justify-between gap-4 px-4 py-3 font-mono text-[11px]"
                >
                  <div className="flex items-center gap-3">
                    <span className={`size-2 rounded-full ${c.ok ? "bg-phosphor" : "bg-alert"}`} />
                    <span className="text-foreground">{c.label}</span>
                    <span className="text-[10px] uppercase tracking-widest text-dim">
                      [{c.type}]
                    </span>
                  </div>
                  <span className={c.ok ? "text-phosphor" : "text-alert"}>{c.detail}</span>
                </div>
              ))}
            </div>

            <h2 className="mt-8 mb-3 font-mono text-[11px] font-bold uppercase tracking-widest text-dim">
              On-demand HTTP probe
            </h2>
            <div className="border border-border bg-panel p-4">
              <p className="mb-3 font-mono text-[10px] text-dim">
                Probes run from SysMonitor's edge — public endpoints only.
              </p>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (probeUrl.trim()) probeMutation.mutate(probeUrl.trim());
                }}
                className="flex flex-wrap gap-2"
              >
                <input
                  value={probeUrl}
                  onChange={(e) => setProbeUrl(e.target.value)}
                  placeholder="https://example.com/health"
                  className="min-w-[260px] flex-1 border border-border bg-void px-3 py-2 font-mono text-[11px] text-foreground outline-hidden focus:border-phosphor"
                />
                <button
                  type="submit"
                  disabled={probeMutation.isPending || !probeUrl.trim()}
                  className="border border-phosphor/40 bg-phosphor/10 px-4 py-2 font-mono text-[10px] uppercase tracking-widest text-phosphor transition-colors hover:bg-phosphor/20 disabled:opacity-50"
                >
                  {probeMutation.isPending ? "Probing…" : "Run probe"}
                </button>
              </form>
              {probeResult && (
                <div
                  className={`mt-3 border px-3 py-2 font-mono text-[11px] ${
                    probeResult.ok
                      ? "border-phosphor/40 bg-phosphor/10 text-phosphor"
                      : "border-alert/40 bg-alert/10 text-alert"
                  }`}
                >
                  {probeResult.ok ? "OK · " : "FAIL · "}
                  {probeResult.detail}
                </div>
              )}
            </div>
          </section>

          <aside className="space-y-6">
            <div className="border border-border bg-panel p-4">
              <h3 className="font-mono text-[10px] font-bold uppercase tracking-widest text-dim">
                Netbird Peer
              </h3>
              <div className="mt-3 space-y-2 font-mono text-[11px]">
                <Row
                  k="State"
                  v={site.netbirdConnected ? "Connected" : "Disconnected"}
                  tone={site.netbirdConnected ? "ok" : "alert"}
                />
                <Row k="OS" v={site.os || "—"} />
                <Row k="Version" v={site.version || "—"} />
                {/* Peer IP hidden for security */}
                <Row k="Tunnel" v="WireGuard / UDP 51820" />
                <Row k="Encryption" v="ChaCha20-Poly1305" />
                <Row k="Peer ID" v={site.id.slice(0, 16) + "…"} />
              </div>
            </div>

            <div className="border border-border bg-panel p-4">
              <h3 className="font-mono text-[10px] font-bold uppercase tracking-widest text-dim">
                Groups
              </h3>
              <div className="mt-3 flex flex-wrap gap-1">
                {site.tags.map((t) => (
                  <span
                    key={t}
                    className="border border-border bg-void px-2 py-0.5 font-mono text-[10px] uppercase tracking-widest text-dim"
                  >
                    {t}
                  </span>
                ))}
              </div>
            </div>
          </aside>
        </div>

        {/* Access Code Modal for Open Site */}
        <AccessCodeModal
          isOpen={isAccessModalOpen}
          onClose={() => {
            setIsAccessModalOpen(false);
            setAccessError(null);
            setPendingSiteUrl(null);
          }}
          onVerify={(password) => {
            if (verifyAccessKey(password)) {
              setIsAccessModalOpen(false);
              setAccessError(null);
              if (pendingSiteUrl) {
                window.open(pendingSiteUrl, "_blank", "noopener,noreferrer");
              }
              setPendingSiteUrl(null);
            } else {
              setAccessError("Incorrect access code");
            }
          }}
          error={accessError}
          title="Open Site - Access Required"
          description="Please enter the access code to open this site."
        />
      </DialogContent>
    </Dialog>
  );
}

function Tile({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string;
  tone?: "neutral" | "ok" | "amber" | "alert";
}) {
  const cls =
    tone === "alert"
      ? "text-alert"
      : tone === "amber"
        ? "text-amber"
        : tone === "ok"
          ? "text-phosphor"
          : "text-foreground";
  return (
    <div className="bg-panel p-4">
      <div className="font-mono text-[9px] uppercase tracking-widest text-dim">{label}</div>
      <div className={`mt-1 font-mono text-base tabular-nums ${cls}`}>{value}</div>
    </div>
  );
}

// Smart time ago formatter
function formatTimeAgo(isoString: string | null): string {
  if (!isoString) return "—";

  const date = new Date(isoString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();

  // Future date (shouldn't happen, but handle it)
  if (diffMs < 0) return "just now";

  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);
  const diffWeek = Math.floor(diffDay / 7);
  const diffMonth = Math.floor(diffDay / 30);

  if (diffSec < 60) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHour < 24) return `${diffHour}h ago`;
  if (diffDay < 7) return `${diffDay}d ago`;
  if (diffWeek < 4) return `${diffWeek}w ago`;
  if (diffMonth < 12) return `${diffMonth}mo ago`;

  const diffYear = Math.floor(diffMonth / 12);
  return `${diffYear}y ago`;
}

function Row({
  k,
  v,
  tone = "neutral",
}: {
  k: string;
  v: string;
  tone?: "neutral" | "ok" | "alert";
}) {
  const cls = tone === "alert" ? "text-alert" : tone === "ok" ? "text-phosphor" : "text-foreground";
  return (
    <div className="flex items-center justify-between">
      <span className="text-dim">{k}</span>
      <span className={cls}>{v}</span>
    </div>
  );
}

// Add Site Modal Component
interface ProvisioningData {
  siteName: string;
  location: string;
  setupKey: string;
  hostname: string;
}

type DeviceType = "pfsense" | "linux" | "windows" | "docker" | "router" | "generic";
type WizardStep = "info" | "generating" | "wizard" | "command" | "waiting";

interface WizardStepConfig {
  title: string;
  description: string;
  commands?: string[];
  showCredentials?: boolean;
  note?: string;
  verifyAction?: string;
}

interface DeviceConfig {
  id: DeviceType;
  name: string;
  icon: React.ReactNode;
  description: string;
  useWizard: boolean;
  wizardSteps?: WizardStepConfig[];
}

// Phase 1: Installation steps (before connection)
const pfsenseInstallSteps: WizardStepConfig[] = [
  {
    title: "SSH into pfSense",
    description: "Access your pfSense system via SSH or the Web UI shell",
    commands: ["ssh admin@<pfsense-ip>"],
    note: "Or use Diagnostics > Command Prompt in the Web UI",
  },
  {
    title: "Download NetBird Agent",
    description: "Download the NetBird client package for FreeBSD",
    commands: [
      "fetch https://github.com/netbirdio/pfsense-netbird/releases/download/v0.1.34/netbird-0.69.0-{arch}.pkg",
    ],
  },
  {
    title: "Download pfSense Package",
    description: "Download the NetBird pfSense integration package",
    commands: [
      "fetch https://github.com/netbirdio/pfsense-netbird/releases/download/v0.1.34/pfSense-pkg-NetBird-0.2.2-{arch}.pkg",
    ],
  },
  {
    title: "Install Packages",
    description: "Install both packages using pkg",
    commands: ["pkg add -f netbird-0.69.0-{arch}.pkg", "pkg add -f pfSense-pkg-NetBird-0.2.2-{arch}.pkg"],
    verifyAction: "NetBird GUI should appear under Services → NetBird",
  },
  {
    title: "Authenticate NetBird",
    description: "Enter these credentials in the pfSense NetBird interface (Services → NetBird)",
    showCredentials: true,
    note: "Copy the Setup Key last — the wizard will auto-proceed 3 seconds after you copy it.",
  },
];

// Phase 2: Configuration steps (after connection)
const pfsenseConfigSteps: WizardStepConfig[] = [
  {
    title: "Assign NetBird Interface",
    description: "Add the wt0 interface in pfSense",
    commands: [
      "1. Go to Interfaces > Assignments",
      "2. Under Available network ports, select wt0(wt0)",
      "3. Click Add",
    ],
  },
  {
    title: "Enable NetBird Interface",
    description: "Configure and enable the interface",
    commands: [
      "1. Go to Interfaces > OPT1 (or the new interface)",
      "2. Check: Enable Interface",
      "3. Description: NetBird",
      "4. Click Save, then Apply Changes",
    ],
  },
  {
    title: "Configure Firewall Rules",
    description: "Allow traffic on the NetBird interface",
    commands: [
      "1. Go to Firewall > Rules > NetBird",
      "2. Click Add",
      "3. Action: Pass, Protocol: Any",
      "4. Source: Any, Destination: Any",
      "5. Description: Allow all on NetBird",
      "6. Click Save, then Apply Changes",
    ],
    note: "This allows NetBird to handle all access control",
  },
];

// Combined steps for reference
const pfsenseWizardSteps: WizardStepConfig[] = [...pfsenseInstallSteps, ...pfsenseConfigSteps];

const devices: DeviceConfig[] = [
  {
    id: "pfsense",
    name: "pfSense",
    icon: <Router className="w-4 h-4" />,
    description: "FreeBSD firewall/router",
    useWizard: true,
    wizardSteps: pfsenseWizardSteps,
  },
  {
    id: "linux",
    name: "Linux Server",
    icon: <Server className="w-4 h-4" />,
    description: "Ubuntu, Debian, CentOS, etc.",
    useWizard: false,
  },
  {
    id: "windows",
    name: "Windows",
    icon: <Monitor className="w-4 h-4" />,
    description: "Windows 10/11 or Server",
    useWizard: false,
  },
  {
    id: "docker",
    name: "Docker",
    icon: <Server className="w-4 h-4" />,
    description: "Docker container",
    useWizard: false,
  },
  {
    id: "router",
    name: "OpenWrt",
    icon: <Router className="w-4 h-4" />,
    description: "OpenWrt router",
    useWizard: false,
  },
  {
    id: "generic",
    name: "Other",
    icon: <Server className="w-4 h-4" />,
    description: "Generic install",
    useWizard: false,
  },
];

function AddSiteModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const [step, setStep] = useState<WizardStep>("info");
  const [wizardStepIndex, setWizardStepIndex] = useState(0);
  const [isDeviceConnected, setIsDeviceConnected] = useState(false);
  const [connectionCheckAttempts, setConnectionCheckAttempts] = useState(0);
  const [hasCompletedWaiting, setHasCompletedWaiting] = useState(false);
  const [autoAdvanceCountdown, setAutoAdvanceCountdown] = useState<number | null>(null);
  const [siteName, setSiteName] = useState("");
  const [location, setLocation] = useState("");
  const [facilitySearch, setFacilitySearch] = useState("");
  const [facilityOpen, setFacilityOpen] = useState(false);

  // Memoize filtered facilities for better performance
  const filteredFacilities = useMemo(() => {
    if (!facilitySearch.trim()) return [];
    const search = facilitySearch.toLowerCase();
    return facilities
      .filter(f => 
        f.name.toLowerCase().includes(search) ||
        f.region.toLowerCase().includes(search)
      )
      .slice(0, 10);
  }, [facilitySearch]);
  const [deviceType, setDeviceType] = useState<DeviceType>("pfsense");
  const [activeTab, setActiveTab] = useState<DeviceType>("pfsense");
  const [pfsenseArch, setPfSenseArch] = useState<"x86_64" | "aarch64">("x86_64");
  const [provisioningData, setProvisioningData] = useState<ProvisioningData | null>(null);
  const [copied, setCopied] = useState(false);
  const [hasApiKey, setHasApiKey] = useState(false);

  useEffect(() => {
    const checkApiKey = async () => {
      // Check window.electronAPI (Tauri or Electron desktop app)
      if (window.electronAPI?.hasApiKey) {
        try {
          const result = await window.electronAPI.hasApiKey();
          if (result.hasKey) {
            setHasApiKey(true);
            return;
          }
        } catch {
          // API failed, continue to fallbacks
        }
      }

      // Check localStorage (browser fallback)
      const localKey = localStorage.getItem("netbird_api_key");
      if (localKey) {
        setHasApiKey(true);
        return;
      }

      // Check env variable
      const envKey = import.meta.env.VITE_NETBIRD_API_TOKEN;
      setHasApiKey(!!envKey);
    };
    checkApiKey();
  }, []);

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setStep("info");
      setSiteName("");
      setLocation("");
      setDeviceType("pfsense");
      setActiveTab("pfsense");
      setPfSenseArch("x86_64");
      setProvisioningData(null);
      setCopied(false);
      setWizardStepIndex(0);
      setIsDeviceConnected(false);
      setConnectionCheckAttempts(0);
      setHasCompletedWaiting(false);
      setAutoAdvanceCountdown(null);
    }
  }, [isOpen]);

  // Handle auto-advance countdown
  useEffect(() => {
    if (autoAdvanceCountdown === null) return;

    if (autoAdvanceCountdown <= 0) {
      // Auto advance to waiting step
      setStep("waiting");
      setAutoAdvanceCountdown(null);
      return;
    }

    const timer = setTimeout(() => {
      setAutoAdvanceCountdown((prev) => (prev !== null ? prev - 1 : null));
    }, 1000);

    return () => clearTimeout(timer);
  }, [autoAdvanceCountdown]);

  // Poll for device connection when in waiting state
  useEffect(() => {
    if (step !== "waiting" || !provisioningData) return;

    const checkConnection = async () => {
      try {
        const result = await listNetbirdPeers();
        const peers = result.peers;
        const hostname = provisioningData.hostname;

        // Look for peer with matching hostname or name
        const connectedPeer = peers.find(
          (peer: any) =>
            peer.name === hostname ||
            peer.hostname === hostname ||
            peer.name.includes(siteName) ||
            (peer.dns_label && peer.dns_label.includes(hostname)),
        );

        if (connectedPeer) {
          setIsDeviceConnected(true);
          toast.success(`${siteName} has connected successfully!`);

          // Auto-create region group and assign peer
          const region = provisioningData?.location;
          if (region) {
            try {
              // Check if group exists
              const groupsResult = await listNetbirdGroups();
              let regionGroup = groupsResult.groups?.find((g: any) => g.name === region);
              let groupId = regionGroup?.id;

              // Create group if it doesn't exist
              if (!groupId) {
                const createResult = await createNetbirdGroup({ name: region });
                if (createResult.success && createResult.groupId) {
                  groupId = createResult.groupId;
                  toast.success(`Created group "${region}"`);
                }
              }

              // Assign peer to region group
              if (groupId) {
                const updateResult = await updateNetbirdPeer({
                  peerId: connectedPeer.id,
                  groups: [groupId],
                });
                if (updateResult.success) {
                  toast.success(`Assigned to ${region} group`);
                }
              }
            } catch (err) {
              console.error("Failed to auto-assign region group:", err);
            }
          }

          // Continue to config steps or close after delay
          setTimeout(() => {
            if (deviceType === "pfsense") {
              setHasCompletedWaiting(true);
              setStep("wizard");
              setWizardStepIndex(0); // Start config phase
            } else {
              onClose();
              window.location.reload();
            }
          }, 2000);
        } else {
          setConnectionCheckAttempts((prev) => prev + 1);
        }
      } catch (error) {
        console.error("Failed to check peer status:", error);
      }
    };

    // Check immediately, then every 5 seconds
    checkConnection();
    const interval = setInterval(checkConnection, 5000);

    return () => clearInterval(interval);
  }, [step, provisioningData, siteName, onClose]);

  const getInstallCommands = (device: DeviceType, setupKey: string, hostname: string) => {
    const commands: Record<DeviceType, { steps: string[]; command: string }> = {
      pfsense: {
        steps: [
          "1. SSH into your pfSense box",
          "2. Install the NetBird package",
          "3. Run the setup command",
        ],
        command: `pkg install netbird && netbird up --setup-key ${setupKey} --management-url https://api.netbird.io:443`,
      },
      linux: {
        steps: [
          "1. Run the install script",
          "2. Start the NetBird daemon",
          "3. Connect with your setup key",
        ],
        command: `curl -fsSL https://pkgs.netbird.io/install.sh | sh && netbird up --setup-key ${setupKey} --management-url https://api.netbird.io:443`,
      },
      windows: {
        steps: [
          "1. Download NetBird from netbird.io",
          "2. Run the installer",
          "3. Open PowerShell and run:",
        ],
        command: `netbird up --setup-key ${setupKey} --management-url https://api.netbird.io:443`,
      },
      docker: {
        steps: ["1. Pull the NetBird image", "2. Run with your setup key"],
        command: `docker run -d --name netbird \\n  --network host --privileged \\n  -e NB_SETUP_KEY=${setupKey} \\n  -e NB_MANAGEMENT_URL=https://api.netbird.io:443 \\n  netbirdio/netbird:latest`,
      },
      router: {
        steps: ["1. SSH into your OpenWrt router", "2. Install NetBird package", "3. Run setup:"],
        command: `opkg update && opkg install netbird && netbird up --setup-key ${setupKey} --management-url https://api.netbird.io:443`,
      },
      generic: {
        steps: ["1. Install NetBird for your platform", "2. Run the setup command:"],
        command: `netbird up --setup-key ${setupKey} --management-url https://api.netbird.io:443`,
      },
    };
    return commands[device];
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!siteName.trim()) {
      toast.error("Please enter a site name");
      return;
    }

    if (!location.trim()) {
      toast.error("Please select a region");
      return;
    }

    if (!hasApiKey) {
      toast.error("NetBird API key required");
      return;
    }

    setStep("generating");

    try {
      const setupKey = await createSetupKey(siteName.trim());

      const hostname = siteName.trim().toLowerCase().replace(/\s+/g, "-");

      const data: ProvisioningData = {
        siteName: siteName.trim(),
        location: location.trim(),
        setupKey,
        hostname,
      };

      // Store provisioning request
      addPendingSite({
        name: data.siteName,
        location: data.location,
        setupKey: data.setupKey,
        status: "provisioning",
      });

      setProvisioningData(data);

      // Check if device uses wizard
      const device = devices.find((d) => d.id === deviceType);
      if (device?.useWizard && device?.wizardSteps) {
        setStep("wizard");
        setWizardStepIndex(0);
      } else {
        setStep("command");
      }

      toast.success(`Setup key generated for ${data.siteName}`);
    } catch (error) {
      toast.error("Failed to generate setup key");
      setStep("info");
    }
  };

  const handleBack = () => {
    if (step === "wizard" && wizardStepIndex > 0) {
      setWizardStepIndex(wizardStepIndex - 1);
    } else if (step === "wizard" && !hasCompletedWaiting) {
      setStep("info");
      setWizardStepIndex(0);
    } else if (step === "wizard" && hasCompletedWaiting) {
      setStep("waiting");
    } else if (step === "waiting") {
      // Go back to the last install wizard step
      setStep("wizard");
      setWizardStepIndex(pfsenseInstallSteps.length - 1);
    } else if (step === "command") {
      setStep("info");
      setProvisioningData(null);
      setWizardStepIndex(0);
    } else {
      onClose();
    }
  };

  const handleNextWizardStep = () => {
    const device = devices.find((d) => d.id === deviceType);
    const installSteps = pfsenseInstallSteps.length;
    const configSteps = pfsenseConfigSteps.length;

    if (!hasCompletedWaiting) {
      // In install phase
      if (wizardStepIndex < installSteps - 1) {
        setWizardStepIndex(wizardStepIndex + 1);
      } else {
        // Finished install phase, go to waiting
        setStep("waiting");
      }
    } else {
      // In config phase
      if (wizardStepIndex < configSteps - 1) {
        setWizardStepIndex(wizardStepIndex + 1);
      } else {
        // Finished all steps
        onClose();
        window.location.reload();
      }
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      toast.success("Copied to clipboard!");
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const handleCommandCopy = (cmd: string, stepIndex: number, isInstallPhase: boolean) => {
    const text = cmd.includes("<SETUP_KEY>")
      ? cmd.replace("<SETUP_KEY>", provisioningData?.setupKey || "")
      : cmd;
    copyToClipboard(text);

    // Start countdown if on the last install step (Authenticate NetBird)
    if (isInstallPhase && stepIndex === pfsenseInstallSteps.length - 1) {
      setAutoAdvanceCountdown(3);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-6xl max-h-[95vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="sr-only">Add New Site</DialogTitle>
        </DialogHeader>

        {/* Header */}
        <div className="flex items-center gap-4 border-b border-border pb-4 mb-4">
          <Button variant="ghost" size="sm" onClick={handleBack} className="gap-2 cursor-pointer">
            <ArrowLeft className="w-4 h-4" />
            {step === "info" ? "Cancel" : "Back"}
          </Button>
          <div className="h-6 w-px bg-border" />
          <h1 className="text-lg font-semibold">
            {step === "info" && "Add New Site"}
            {step === "generating" && "Generating Setup Key..."}
            {step === "wizard" && "Installation Wizard"}
            {step === "command" && "Installation Commands"}
            {step === "waiting" && "Waiting for Device"}
          </h1>
          {(step === "wizard" || step === "waiting") && (
            <Badge variant="secondary" className="ml-auto">
              {step === "wizard" &&
                `Step ${hasCompletedWaiting ? pfsenseInstallSteps.length + wizardStepIndex + 1 : wizardStepIndex + 1} of ${devices.find((d) => d.id === deviceType)?.wizardSteps?.length || 0}`}
              {step === "waiting" && `Checking... ${connectionCheckAttempts}`}
            </Badge>
          )}
        </div>

        {!hasApiKey && (
          <Card className="mb-6 border-amber-500/50 bg-amber-500/10">
            <CardContent className="p-4">
              <p className="text-sm text-amber-600">
                <strong>API Key Required:</strong> Please configure your NetBird API key in Settings
                to add new sites.
              </p>
            </CardContent>
          </Card>
        )}

        {step === "info" && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-xl">
                <Plus className="w-5 h-5 text-phosphor" />
                Site Information
              </CardTitle>
              <CardDescription>
                Enter the details for the new site you want to provision
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2 relative">
                    <Label htmlFor="site-name">Site Name</Label>
                    <Input
                      id="site-name"
                      value={siteName}
                      onChange={(e) => {
                        setSiteName(e.target.value);
                        setFacilitySearch(e.target.value);
                        if (e.target.value) {
                          setFacilityOpen(true);
                        }
                      }}
                      onFocus={() => siteName && setFacilityOpen(true)}
                      placeholder="Type health facility name..."
                      className="font-mono"
                      autoComplete="off"
                    />
                    {facilityOpen && filteredFacilities.length > 0 && (
                      <div className="absolute z-50 w-full mt-1 border border-border bg-panel rounded-md shadow-lg max-h-60 overflow-auto">
                        {filteredFacilities.map((facility) => (
                            <div
                              key={`${facility.name}-${facility.region}`}
                              className="px-3 py-2 cursor-pointer hover:bg-foreground/10 border-b border-border/50 last:border-0"
                              onClick={() => {
                                setSiteName(facility.name);
                                setLocation(facility.region);
                                setFacilitySearch("");
                                setFacilityOpen(false);
                              }}
                            >
                              <div className="flex flex-col">
                                <span className="font-mono text-sm">{facility.name}</span>
                                <span className="text-xs text-muted-foreground">{facility.region}</span>
                              </div>
                            </div>
                          ))}
                      </div>
                    )}
                    <p className="text-xs text-muted-foreground">
                      Type to search from list or enter custom name
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="location">Location (Region)</Label>
                    <Select value={location} onValueChange={setLocation}>
                      <SelectTrigger id="location" className="w-full">
                        <SelectValue placeholder="Select a region" />
                      </SelectTrigger>
                      <SelectContent>
                        {[
                          "Western One",
                          "Western Two",
                          "Lower River Region",
                          "North Bank Region East",
                          "North Bank Region West",
                          "Central River Region",
                          "Upper River Region",
                          "Central Level",
                          "Others",
                        ].map((region) => (
                          <SelectItem key={region} value={region}>
                            {region}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="device-type">Device Type</Label>
                  <Select value={deviceType} onValueChange={(v) => setDeviceType(v as DeviceType)}>
                    <SelectTrigger id="device-type" className="w-full md:w-[400px]">
                      <SelectValue placeholder="Select device type" />
                    </SelectTrigger>
                    <SelectContent>
                      {devices.map((device) => (
                        <SelectItem key={device.id} value={device.id}>
                          <div className="flex items-center gap-2">
                            {device.icon}
                            <span>{device.name}</span>
                            <span className="text-xs text-muted-foreground ml-2">
                              {device.description}
                            </span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Installation commands will be tailored for{" "}
                    {devices.find((d) => d.id === deviceType)?.name}
                  </p>
                </div>

                <div className="flex gap-4 pt-4 border-t border-border">
                  <Button type="button" variant="outline" onClick={onClose} className="flex-1 cursor-pointer">
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    className="flex-1 bg-phosphor hover:bg-phosphor/90 text-void cursor-pointer"
                    disabled={!siteName.trim() || !location.trim() || !hasApiKey}
                  >
                    {devices.find((d) => d.id === deviceType)?.useWizard
                      ? "Start Installation Wizard"
                      : "Generate Setup Key"}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        )}

        {step === "generating" && (
          <Card>
            <CardContent className="p-12 text-center">
              <Loader2 className="w-12 h-12 animate-spin mx-auto mb-4 text-phosphor" />
              <p className="text-lg font-medium">Generating setup key...</p>
              <p className="text-sm text-muted-foreground mt-2">
                Creating NetBird setup key for {siteName}
              </p>
            </CardContent>
          </Card>
        )}

        {step === "wizard" && provisioningData && (
          <div className="space-y-4">
            <Card>
              <CardContent className="p-4">
                {(() => {
                  const currentSteps = hasCompletedWaiting
                    ? pfsenseConfigSteps
                    : pfsenseInstallSteps;
                  const currentStep = currentSteps[wizardStepIndex];

                  if (!currentStep) return null;

                  return (
                    <div className="space-y-4">
                      {/* Header with phase indicator */}
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className="flex items-center justify-center w-6 h-6 rounded-full bg-phosphor text-void font-semibold text-xs shrink-0">
                            {hasCompletedWaiting ? pfsenseInstallSteps.length + wizardStepIndex + 1 : wizardStepIndex + 1}
                          </div>
                          <div>
                            <h3 className="font-semibold text-base">{currentStep.title}</h3>
                            <p className="text-xs text-muted-foreground">
                              {currentStep.description}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge
                            variant={hasCompletedWaiting ? "secondary" : "default"}
                            className="text-xs"
                          >
                            {hasCompletedWaiting ? "Phase 2" : "Phase 1"}
                          </Badge>
                          {hasCompletedWaiting && (
                            <span className="flex items-center gap-1 text-green-600 text-xs">
                              <CheckCircle2 className="w-3 h-3" />
                              Connected
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Architecture selector and Documentation button */}
                      {!hasCompletedWaiting && (
                        <div className="flex items-center justify-between bg-muted/50 p-2 rounded-md">
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-muted-foreground">Architecture:</span>
                            <div className="flex rounded border border-input overflow-hidden">
                              <button
                                onClick={() => setPfSenseArch("x86_64")}
                                className={`px-2 py-0.5 text-xs font-mono ${
                                  pfsenseArch === "x86_64"
                                    ? "bg-phosphor text-black"
                                    : "bg-muted hover:bg-muted/80"
                                }`}
                              >
                                x86_64
                              </button>
                              <button
                                onClick={() => setPfSenseArch("aarch64")}
                                className={`px-2 py-0.5 text-xs font-mono ${
                                  pfsenseArch === "aarch64"
                                    ? "bg-phosphor text-black"
                                    : "bg-muted hover:bg-muted/80"
                                }`}
                              >
                                aarch64
                              </button>
                            </div>
                          </div>
                          <Dialog>
                            <DialogTrigger asChild>
                              <Button variant="ghost" size="sm" className="gap-1 text-xs h-7 cursor-pointer">
                                <Info className="w-3 h-3" />
                                Documentation
                              </Button>
                            </DialogTrigger>
                            <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
                              <DialogHeader>
                                <DialogTitle className="flex items-center gap-2">
                                  <Info className="w-5 h-5" />
                                  pfSense NetBird Installation Guide
                                </DialogTitle>
                                <DialogDescription>
                                  Complete guide for installing NetBird on pfSense firewalls
                                </DialogDescription>
                              </DialogHeader>
                              <div className="space-y-4 text-sm">
                                <section className="space-y-2">
                                  <h4 className="font-semibold">Download the NetBird Packages</h4>
                                  <p className="text-muted-foreground">
                                    Go to the{" "}
                                    <a
                                      href="https://github.com/netbirdio/pfsense-netbird/releases/latest"
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="text-phosphor hover:underline inline-flex items-center gap-1"
                                    >
                                      latest pfSense NetBird release
                                      <ExternalLink className="w-3 h-3" />
                                    </a>
                                    . Pick files matching your architecture ({pfsenseArch}):
                                  </p>
                                  <ul className="list-disc list-inside text-muted-foreground space-y-1 ml-2">
                                    <li>
                                      <strong>x86_64</strong> — Intel/AMD-based pfSense (most common)
                                    </li>
                                    <li>
                                      <strong>aarch64</strong> — ARM-based pfSense installations
                                    </li>
                                  </ul>
                                </section>

                                <section className="space-y-2">
                                  <h4 className="font-semibold">Download Commands</h4>
                                  <p className="text-muted-foreground">
                                    From a shell on your pfSense system:
                                  </p>
                                  <div className="bg-muted p-3 rounded-md font-mono text-xs space-y-1">
                                    <p className="text-phosphor">
                                      fetch https://github.com/netbirdio/pfsense-netbird/releases/download/v0.1.34/netbird-0.69.0-{pfsenseArch}.pkg
                                    </p>
                                    <p className="text-phosphor">
                                      fetch https://github.com/netbirdio/pfsense-netbird/releases/download/v0.1.34/pfSense-pkg-NetBird-0.2.2-{pfsenseArch}.pkg
                                    </p>
                                  </div>
                                </section>

                                <section className="space-y-2">
                                  <h4 className="font-semibold">Install the Packages</h4>
                                  <div className="bg-muted p-3 rounded-md font-mono text-xs space-y-1">
                                    <p className="text-phosphor">
                                      pkg add -f netbird-0.69.0-{pfsenseArch}.pkg
                                    </p>
                                    <p className="text-phosphor">
                                      pkg add -f pfSense-pkg-NetBird-0.2.2-{pfsenseArch}.pkg
                                    </p>
                                  </div>
                                </section>

                                <section className="space-y-2">
                                  <h4 className="font-semibold">Post-Installation</h4>
                                  <ul className="list-disc list-inside text-muted-foreground space-y-1 ml-2">
                                    <li>Continue with the wizard steps above</li>
                                    <li>Access via pfSense UI: Services → NetBird</li>
                                    <li>
                                      Check status from shell: <code>netbird status</code>
                                    </li>
                                    <li>
                                      View logs: <code>clog /var/log/netbird.log</code>
                                    </li>
                                  </ul>
                                </section>

                                <div className="pt-2 border-t">
                                  <a
                                    href="https://github.com/netbirdio/pfsense-netbird/blob/main/README.md"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-phosphor hover:underline inline-flex items-center gap-1 text-xs"
                                  >
                                    <ExternalLink className="w-3 h-3" />
                                    View full documentation on GitHub
                                  </a>
                                </div>
                              </div>
                            </DialogContent>
                          </Dialog>
                        </div>
                      )}

                      {/* Progress indicator */}
                      <div className="flex items-center gap-1">
                        {currentSteps.map((_, idx) => (
                          <div
                            key={idx}
                            className={`h-1 flex-1 rounded-full transition-colors ${
                              idx <= wizardStepIndex ? "bg-phosphor" : "bg-muted"
                            }`}
                          />
                        ))}
                      </div>

                      {/* Commands */}
                      {currentStep.commands && currentStep.commands.length > 0 && (
                        <div className="space-y-2">
                          <p className="text-xs font-medium">Commands to run:</p>
                          <div className="space-y-2">
                            {currentStep.commands.map((cmd, idx) => {
                              let displayCmd = cmd;
                              if (cmd.includes("<SETUP_KEY>")) {
                                displayCmd = cmd.replace("<SETUP_KEY>", provisioningData.setupKey);
                              }
                              if (displayCmd.includes("{arch}")) {
                                displayCmd = displayCmd.replace("{arch}", pfsenseArch);
                              }
                              return (
                                <div key={idx} className="relative group">
                                  <pre className="bg-void p-2 rounded-md overflow-x-auto text-xs font-mono">
                                    {displayCmd}
                                  </pre>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity h-6 px-2 cursor-pointer"
                                    onClick={() =>
                                      handleCommandCopy(displayCmd, wizardStepIndex, !hasCompletedWaiting)
                                    }
                                  >
                                    <Copy className="w-3 h-3" />
                                  </Button>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {/* Credentials for pfSense NetBird interface */}
                      {currentStep.showCredentials && provisioningData && (
                        <div className="space-y-3">
                          <p className="text-xs font-medium">Credentials to copy:</p>
                          <div className="space-y-2">
                            {/* Management URL */}
                            <div className="relative group">
                              <div className="bg-void p-3 rounded-md border border-border">
                                <div className="flex items-center justify-between mb-1">
                                  <span className="text-[10px] uppercase tracking-wider text-dim">Management URL</span>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="h-6 px-2 cursor-pointer"
                                    onClick={() => copyToClipboard("https://api.netbird.io:443")}
                                  >
                                    <Copy className="w-3 h-3" />
                                  </Button>
                                </div>
                                <code className="text-xs font-mono text-phosphor">https://api.netbird.io:443</code>
                              </div>
                            </div>
                            {/* Setup Key */}
                            <div className="relative group">
                              <div className="bg-void p-3 rounded-md border border-border">
                                <div className="flex items-center justify-between mb-1">
                                  <span className="text-[10px] uppercase tracking-wider text-dim">Setup Key</span>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="h-6 px-2 cursor-pointer"
                                    onClick={() => copyToClipboard(provisioningData.setupKey)}
                                  >
                                    <Copy className="w-3 h-3" />
                                  </Button>
                                </div>
                                <code className="text-xs font-mono text-phosphor break-all">{provisioningData.setupKey}</code>
                              </div>
                            </div>
                            {/* Hostname */}
                            <div className="relative group">
                              <div className="bg-void p-3 rounded-md border border-border">
                                <div className="flex items-center justify-between mb-1">
                                  <span className="text-[10px] uppercase tracking-wider text-dim">Hostname</span>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="h-6 px-2 cursor-pointer"
                                    onClick={() => {
                                      copyToClipboard(provisioningData.hostname);
                                      // Start countdown after copying hostname
                                      if (!hasCompletedWaiting) {
                                        setAutoAdvanceCountdown(3);
                                      }
                                    }}
                                  >
                                    <Copy className="w-3 h-3" />
                                  </Button>
                                </div>
                                <div className="space-y-2">
                                  <div>
                                    <span className="text-[9px] uppercase tracking-wider text-dim block mb-0.5">Hostname (copy this):</span>
                                    <code className="text-xs font-mono text-phosphor break-all">{provisioningData.hostname}</code>
                                  </div>
                                </div>
                                <p className="text-[10px] text-dim mt-2">
                                  <strong>Important:</strong> Paste the hostname in the <strong>Hostname</strong> field to replace the default pfSense name.
                                </p>
                              </div>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Verify action */}
                      {currentStep.verifyAction && (
                        <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-2">
                          <p className="text-xs text-green-600 flex items-center gap-2">
                            <CheckCircle2 className="w-3 h-3" />
                            {currentStep.verifyAction}
                          </p>
                        </div>
                      )}

                      {/* Note */}
                      {currentStep.note && (
                        <p className="text-xs text-amber-600 bg-amber-500/10 p-2 rounded-lg">
                          <strong>Note:</strong> {currentStep.note}
                        </p>
                      )}

                      {/* Navigation buttons */}
                      <div className="flex gap-2 pt-2 border-t border-border">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={handleBack}
                          className="cursor-pointer flex-1"
                          disabled={wizardStepIndex === 0 && !hasCompletedWaiting}
                        >
                          <ChevronLeft className="w-3 h-3 mr-1" />
                          Previous
                        </Button>
                        <Button
                          size="sm"
                          onClick={handleNextWizardStep}
                          className="flex-1 bg-phosphor hover:bg-phosphor/90 text-void cursor-pointer"
                          disabled={autoAdvanceCountdown !== null}
                        >
                          {!hasCompletedWaiting &&
                          wizardStepIndex === pfsenseInstallSteps.length - 1 ? (
                            <>
                              {autoAdvanceCountdown !== null ? (
                                <>Proceeding in {autoAdvanceCountdown}s...</>
                              ) : (
                                <>
                                  Authenticate & Monitor
                                  <Wifi className="w-3 h-3 ml-1" />
                                </>
                              )}
                            </>
                          ) : hasCompletedWaiting &&
                            wizardStepIndex === pfsenseConfigSteps.length - 1 ? (
                            <>
                              Finish Setup
                              <CheckCircle2 className="w-3 h-3 ml-1" />
                            </>
                          ) : (
                            <>
                              Next Step
                              <ChevronRight className="w-3 h-3 ml-1" />
                            </>
                          )}
                        </Button>
                      </div>
                    </div>
                  );
                })()}
              </CardContent>
            </Card>
          </div>
        )}

        {step === "waiting" && provisioningData && (
          <div className="space-y-4">
            <Card>
              <CardContent className="p-4 text-center">
                {isDeviceConnected ? (
                  <div className="space-y-3">
                    <div className="w-12 h-12 bg-green-500/20 rounded-full flex items-center justify-center mx-auto">
                      <CheckCircle2 className="w-6 h-6 text-green-500" />
                    </div>
                    <div>
                      <h3 className="text-lg font-semibold text-green-600">Device Connected!</h3>
                      <p className="text-sm text-muted-foreground mt-1">
                        {provisioningData.siteName} has successfully joined the network
                      </p>
                    </div>
                    <div className="flex gap-3 justify-center pt-2">
                      <Button variant="outline" onClick={onClose} className="cursor-pointer">
                        Close
                      </Button>
                      <Button
                        onClick={() => {
                          setHasCompletedWaiting(true);
                          setStep("wizard");
                          setWizardStepIndex(0);
                        }}
                        className="bg-phosphor hover:bg-phosphor/90 text-void"
                      >
                        Continue Setup
                        <ArrowRight className="w-4 h-4 ml-2" />
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="relative">
                      <div className="w-12 h-12 border-4 border-phosphor/30 border-t-phosphor rounded-full animate-spin mx-auto" />
                      <Wifi className="w-5 h-5 text-phosphor absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
                    </div>

                    <div>
                      <h3 className="text-lg font-semibold">Waiting for Device...</h3>
                      <p className="text-sm text-muted-foreground mt-1 max-w-sm mx-auto">
                        Monitoring for <strong>{provisioningData.siteName}</strong> to connect.
                      </p>
                    </div>

                    <div className="bg-amber-500/10 rounded-lg p-3 max-w-sm mx-auto">
                      <p className="text-[10px] text-amber-600 mb-1">Setup Key:</p>
                      <button
                        onClick={() => copyToClipboard(provisioningData.setupKey)}
                        className="w-full font-mono text-[10px] text-orange-500 bg-void px-2 py-1 rounded hover:bg-void/80 cursor-pointer transition-colors text-left break-all"
                      >
                        {provisioningData.setupKey}
                      </button>
                      {copied && (
                        <p className="text-[10px] text-green-600 mt-2 flex items-center gap-1">
                          <Check className="w-3 h-3" />
                          key copied
                        </p>
                      )}
                    </div>

                    <div className="flex items-center justify-center gap-3 text-xs text-muted-foreground">
                      <div className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        <span>Checking every 5s</span>
                      </div>
                      <div className="h-3 w-px bg-border" />
                      <div>
                        Attempts: <span className="font-mono">{connectionCheckAttempts}</span>
                      </div>
                    </div>

                    <div className="flex gap-2 justify-center pt-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setHasCompletedWaiting(true);
                          setStep("wizard");
                          setWizardStepIndex(pfsenseInstallSteps.length - 1);
                        }}
                        className="cursor-pointer"
                      >
                        <ArrowLeft className="w-3 h-3 mr-1" />
                        Back
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          copyToClipboard(provisioningData.setupKey)
                        }
                        className="cursor-pointer"
                      >
                        {copied ? (
                          <Check className="w-3 h-3 mr-1" />
                        ) : (
                          <Copy className="w-3 h-3 mr-1" />
                        )}
                        Copy Setup Key
                      </Button>
                      {connectionCheckAttempts >= 10 ? (
                        <Button
                          onClick={() => {
                            setHasCompletedWaiting(true);
                            setStep("wizard");
                            setWizardStepIndex(0);
                          }}
                          className="cursor-pointer bg-phosphor hover:bg-phosphor/90 text-void"
                        >
                          Continue Setup
                          <ArrowRight className="w-3 h-3 ml-1" />
                        </Button>
                      ) : (
                        <Button size="sm" variant="outline" onClick={onClose} className="cursor-pointer">
                          Close
                        </Button>
                      )}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}

        {step === "command" && provisioningData && (
          <div className="space-y-4">
            <Card>
              <CardContent className="p-4">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                  <div>
                    <p className="text-muted-foreground text-[10px]">Name</p>
                    <p className="font-medium">{provisioningData.siteName}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground text-[10px]">Location</p>
                    <p className="font-medium">{provisioningData.location}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground text-[10px]">Hostname</p>
                    <p className="font-medium font-mono">{provisioningData.hostname}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground text-[10px]">Setup Key</p>
                    <p className="font-medium font-mono text-[10px] truncate">
                      {provisioningData.setupKey}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as DeviceType)}>
              <TabsList className="grid w-full grid-cols-3 lg:grid-cols-6">
                {devices.map((device) => (
                  <TabsTrigger key={device.id} value={device.id} className="gap-2 text-xs">
                    {device.icon}
                    <span className="hidden sm:inline">{device.name}</span>
                  </TabsTrigger>
                ))}
              </TabsList>

              {devices.map((device) => {
                const install = getInstallCommands(
                  device.id,
                  provisioningData.setupKey,
                  provisioningData.hostname,
                );
                return (
                  <TabsContent key={device.id} value={device.id}>
                    <Card>
                      <CardContent className="p-4 space-y-3">
                        <div className="flex items-center gap-2">
                          <Terminal className="w-4 h-4" />
                          <h3 className="font-semibold text-sm">Installation for {device.name}</h3>
                        </div>

                        <div className="space-y-2">
                          <p className="text-xs font-medium">Installation Steps:</p>
                          <ol className="text-xs text-muted-foreground space-y-1 list-decimal list-inside">
                            {install.steps.map((step, i) => (
                              <li key={i}>{step}</li>
                            ))}
                          </ol>
                        </div>

                        <div className="space-y-2">
                          <p className="text-xs font-medium">Command:</p>
                          <div className="relative">
                            <pre className="bg-void p-2 rounded-md overflow-x-auto text-xs font-mono">
                              {install.command}
                            </pre>
                            <Button
                              size="sm"
                              variant="outline"
                              className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity h-6 px-2 cursor-pointer"
                              onClick={() => copyToClipboard(install.command)}
                            >
                              <Copy className="w-3 h-3" />
                            </Button>
                          </div>
                        </div>

                        <div className="flex gap-2 pt-2 border-t border-border">
                          <Button
                            size="sm"
                            onClick={() => setStep("waiting")}
                            variant="outline"
                            className="cursor-pointer flex-1 gap-1"
                          >
                            <Wifi className="w-3 h-3" />
                            Monitor
                          </Button>
                          <Button
                            size="sm"
                            onClick={() => {
                              setStep("info");
                              setProvisioningData(null);
                            }}
                            variant="outline"
                            className="cursor-pointer flex-1"
                          >
                            New Site
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  </TabsContent>
                );
              })}
            </Tabs>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
