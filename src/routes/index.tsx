import { createFileRoute } from "@tanstack/react-router";
import { TopNav } from "@/components/TopNav";
import { SiteCard } from "@/components/SiteCard";
import { NetBirdSyncStatus } from "@/components/NetBirdSyncStatus";
import { useNetbirdSites } from "@/lib/use-netbird";
import { useAllSitesUptime } from "@/lib/use-site-uptime";
import { useHasApiKey } from "@/lib/auth-utils";
import { ApiKeyGate } from "@/components/ApiKeyGate";
import { SiteDetailModal } from "./sites";
import { useMemo, useState, useEffect } from "react";
import type { SiteStatus, Site } from "@/lib/sites-data";
import { Plus, Server, ChevronDown, ChevronUp } from "lucide-react";
import { Link } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Dashboard — SysMonitor" },
      {
        name: "description",
        content:
          "Real-time dashboard of every site in your network, with Netbird tunnel status, latency, and incidents.",
      },
      { property: "og:title", content: "Dashboard — SysMonitor" },
      {
        property: "og:description",
        content:
          "Real-time dashboard of every site in your network, with Netbird tunnel status, latency, and incidents.",
      },
    ],
  }),
  component: IndexPage,
});

const REGIONS = [
  "Western One",
  "Western Two",
  "Lower River Region",
  "North Bank Region East",
  "North Bank Region West",
  "Central River Region",
  "Upper River Region",
  "Central Level",
  "Others",
] as const;

function IndexPage() {
  const hasApiKey = useHasApiKey();
  const { sites, loading, error, refetch, isFetching, dataUpdatedAt } = useNetbirdSites();
  const [showAllSites, setShowAllSites] = useState(false);
  const [siteFilter, setSiteFilter] = useState<SiteStatus | "all">("all");
  const [selectedSite, setSelectedSite] = useState<Site | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [expandedRegions, setExpandedRegions] = useState<Set<string>>(new Set(REGIONS));

  // Get accurate uptime data from Firestore (with caching)
  const deviceNames = useMemo(() => sites.map(s => s.name), [sites]);
  const { uptimes, loading: uptimeLoading } = useAllSitesUptime(deviceNames, 30);

  // Merge sites with accurate uptime data
  const sitesWithAccurateUptime = useMemo(() => {
    return sites.map(site => {
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
  }, [sites, uptimes]);

  const filteredSites = useMemo(() => {
    if (siteFilter === "all") return sitesWithAccurateUptime;
    return sitesWithAccurateUptime.filter((s) => s.status === siteFilter);
  }, [sitesWithAccurateUptime, siteFilter]);

  // Helper to check if OS is a device (Android, iOS, Windows)
  const isDeviceOS = (os?: string) => {
    if (!os) return false;
    const osLower = os.toLowerCase();
    return osLower.includes("android") || osLower.includes("ios") || osLower.includes("windows");
  };

  // Group sites by region (Devices group for Android/iOS/Windows)
  const sitesByRegion = useMemo(() => {
    const grouped: Record<string, Site[]> = {};
    filteredSites.forEach(site => {
      // Check if it's a device OS (Android, iOS, Windows)
      const region = isDeviceOS(site.os) ? "Devices" : (site.region || "Other");
      if (!grouped[region]) {
        grouped[region] = [];
      }
      grouped[region].push(site);
    });
    // Sort regions in the predefined order, then any others alphabetically
    // Put "Devices" last (after all other regions)
    const sortedRegions: Array<{ name: string; sites: Site[] }> = [];
    // Save Devices for later
    const devicesGroup = grouped["Devices"];
    delete grouped["Devices"];
    // Add predefined regions first
    REGIONS.forEach(region => {
      if (grouped[region]) {
        sortedRegions.push({ name: region, sites: grouped[region] });
        delete grouped[region];
      }
    });
    // Add any remaining regions alphabetically
    Object.keys(grouped).sort().forEach(region => {
      sortedRegions.push({ name: region, sites: grouped[region] });
    });
    // Add Devices group last if it exists
    if (devicesGroup) {
      sortedRegions.push({ name: "Devices", sites: devicesGroup });
    }
    return sortedRegions;
  }, [filteredSites]);

  const toggleRegion = (region: string) => {
    setExpandedRegions(prev => {
      const next = new Set(prev);
      if (next.has(region)) {
        next.delete(region);
      } else {
        next.add(region);
      }
      return next;
    });
  };

  // Auto-expand all regions when sites are loaded
  useEffect(() => {
    if (sitesByRegion.length > 0) {
      setExpandedRegions(new Set(sitesByRegion.map(r => r.name)));
    }
  }, [sitesByRegion]);

  const stats = useMemo(() => {
    const total = sitesWithAccurateUptime.length || 1;
    const online = sitesWithAccurateUptime.filter((s) => s.status === "online").length;
    const degraded = sitesWithAccurateUptime.filter((s) => s.status === "degraded").length;
    const offline = sitesWithAccurateUptime.filter((s) => s.status === "offline").length;
    const tunnels = sitesWithAccurateUptime.filter((s) => s.netbirdConnected).length;
    const latencyPool = sitesWithAccurateUptime.filter((s) => s.status !== "offline" && s.latencyMs > 0);
    const avgLatency =
      latencyPool.length > 0
        ? latencyPool.reduce((acc, s) => acc + s.latencyMs, 0) / latencyPool.length
        : 0;
    
    // Use accurate uptime from Firestore if available, fallback to local calculation
    const avgUptime = sitesWithAccurateUptime.reduce((acc, s) => acc + s.uptime, 0) / total;
    
    return {
      online,
      degraded,
      offline,
      tunnels,
      total: sitesWithAccurateUptime.length,
      avgLatency: Math.round(avgLatency * 10) / 10,
      uptime: avgUptime,
      uptimeLoading,
    };
  }, [sitesWithAccurateUptime, uptimeLoading]);

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
      <TopNav />
      <main className="mx-auto max-w-[1600px] p-6">
        {/* Header */}
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-dim">
              Network Operations · Dashboard
            </p>
            <h1 className="mt-1 text-2xl font-medium tracking-tight">Mission Control</h1>
          </div>
          <div className="flex items-center gap-2">
            <NetBirdSyncStatus
              query={
                {
                  isFetching,
                  isLoading: loading,
                  isError: !!error,
                  failureCount: 0,
                  dataUpdatedAt,
                  refetch,
                  data: { peers: sites, error: error ? (typeof error === "string" ? error : error.message) : null },
                } as any
              }
            />
          </div>
        </div>

        {error && (
          <div className="mb-4 border border-alert/40 bg-alert/10 px-4 py-3 font-mono text-[11px] text-alert">
            {(() => {
              const errMsg = (typeof error === "string" ? error : error?.message || String(error));
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

              // Network errors - only true network failures
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

              // All other errors are API errors
              return `NetBird API error: ${errMsg}`;
            })()}
          </div>
        )}

        {/* Metrics */}
        <div className="mb-8 grid grid-cols-2 gap-px bg-border md:grid-cols-4 border border-border">
          <Metric
            label="Mean Latency"
            value={`${stats.avgLatency}`}
            unit="ms"
            footer={`across ${stats.total} sites`}
            glow
          />
          <Metric
            label="Active Tunnels"
            value={`${stats.tunnels}`}
            footer={`of ${stats.total} netbird peers`}
          />
          <Metric
            label="Global Uptime"
            value={stats.uptimeLoading ? "..." : `${stats.uptime.toFixed(2)}%`}
            footer={stats.uptimeLoading ? "calculating..." : "30-day average"}
            glow={!stats.uptimeLoading}
          />
          <Metric
            label="Site Health"
            value={`${stats.online}`}
            unit={`/ ${stats.total}`}
            footer={
              stats.offline > 0
                ? `${stats.offline} offline · ${stats.degraded} degraded`
                : `${stats.degraded} degraded`
            }
            tone={stats.offline > 0 ? "alert" : stats.degraded > 0 ? "amber" : "ok"}
          />
        </div>

        {/* Sticky Sites Header */}
        <div className="sticky top-14 z-30 -mx-6 mb-4 border-b border-border bg-background/95 px-6 py-3 backdrop-blur-sm">
          <div className="flex items-center justify-between">
            <h2 className="font-mono text-[11px] font-bold uppercase tracking-widest text-dim">
              Active Sites
            </h2>
            <div className="flex items-center gap-1">
              {/* Filter buttons */}
              {[
                { id: "all", label: "All" },
                { id: "online", label: "Online" },
                { id: "offline", label: "Offline" },
              ].map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setSiteFilter(f.id as SiteStatus | "all")}
                  className={`px-2 py-1 font-mono text-[9px] uppercase tracking-wider transition-colors ${
                    siteFilter === f.id
                      ? "bg-phosphor text-void"
                      : "border border-border bg-panel text-dim hover:text-foreground"
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {loading && sites.length === 0 ? (
          <>
            {/* Stats Skeletons */}
            <div className="mb-8 grid grid-cols-2 gap-px bg-border md:grid-cols-4 border border-border">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="bg-panel p-4">
                  <div className="h-3 w-24 animate-pulse rounded bg-border" />
                  <div className="mt-2 h-8 w-20 animate-pulse rounded bg-border" />
                  <div className="mt-3 h-2 w-32 animate-pulse rounded bg-border" />
                </div>
              ))}
            </div>
            {/* Site Cards Skeletons */}
            <div className="mb-10 grid grid-cols-1 gap-px border border-border bg-border sm:grid-cols-2 lg:grid-cols-3">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="bg-panel p-5">
                  <div className="mb-4 flex items-start justify-between">
                    <div className="min-w-0">
                      <div className="h-4 w-32 animate-pulse rounded bg-border" />
                      <div className="mt-2 h-3 w-24 animate-pulse rounded bg-border" />
                    </div>
                    <div className="h-5 w-16 animate-pulse rounded bg-border" />
                  </div>
                  <div className="mb-4 h-12 w-full animate-pulse rounded bg-border" />
                  <div className="grid grid-cols-4 gap-3">
                    {[...Array(4)].map((_, j) => (
                      <div key={j} className="h-8 animate-pulse rounded bg-border" />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </>
        ) : sitesByRegion.length === 0 ? (
          <EmptyState hasSites={sites.length > 0} />
        ) : (
          <>
            {sitesByRegion.map(({ name: region, sites: regionSites }) => {
            const isExpanded = expandedRegions.has(region);
            
            return (
              <div key={region} className="mb-6">
                <button
                  type="button"
                  onClick={() => toggleRegion(region)}
                  className="mb-3 flex items-center gap-2 font-mono text-[11px] font-bold uppercase tracking-widest text-foreground hover:text-phosphor transition-colors"
                >
                  {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                  {region} ({regionSites.length})
                </button>
                {isExpanded && (
                  <div className="mb-10 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
                    {regionSites.map((s, index) => (
                      <div
                        key={s.id}
                        className="border-b border-r border-border"
                        style={{
                          borderTop: index < 3 ? '1px solid var(--border)' : 'none',
                          borderLeft: index % 3 === 0 ? '1px solid var(--border)' : 'none',
                        }}
                      >
                        <SiteCard
                          site={s}
                          onClick={() => {
                            setSelectedSite(s);
                            setIsModalOpen(true);
                          }}
                        />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
          </>
        )}

        {/* Site Detail Modal */}
        <SiteDetailModal
          site={selectedSite}
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
        />
      </main>
    </div>
  );
}

function Metric({
  label,
  value,
  unit,
  footer,
  glow,
  tone = "neutral",
}: {
  label: string;
  value: string;
  unit?: string;
  footer?: string;
  glow?: boolean;
  tone?: "neutral" | "ok" | "amber" | "alert";
}) {
  const toneClass =
    tone === "alert"
      ? "text-alert"
      : tone === "amber"
        ? "text-amber"
        : tone === "ok"
          ? "text-phosphor"
          : "text-foreground";
  return (
    <div className="bg-panel p-4">
      <div className="font-mono text-[10px] uppercase tracking-widest text-dim">{label}</div>
      <div
        className={`mt-1 font-mono text-2xl tabular-nums ${toneClass} ${glow ? "glow-phosphor" : ""}`}
      >
        {value}
        {unit && <span className="ml-1 text-xs text-dim">{unit}</span>}
      </div>
      {footer && (
        <div className="mt-3 font-mono text-[10px] uppercase tracking-widest text-dim">
          {footer}
        </div>
      )}
    </div>
  );
}

function EmptyState({ hasSites }: { hasSites: boolean }) {
  if (hasSites) {
    // Filter returned no results
    return (
      <div className="mb-10 flex flex-col items-center justify-center border border-border bg-panel py-16 px-6 text-center">
        <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-border">
          <Server className="h-8 w-8 text-dim" />
        </div>
        <h3 className="mb-2 font-mono text-sm font-medium text-foreground">
          No sites match this filter
        </h3>
        <p className="mb-6 max-w-sm font-mono text-[11px] text-dim">
          Try selecting a different filter or check back later when site statuses change.
        </p>
      </div>
    );
  }

  // No sites at all - onboarding
  return (
    <div className="mb-10 flex flex-col items-center justify-center border border-border bg-panel py-16 px-6 text-center">
      <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-phosphor/10 ring-2 ring-phosphor/20">
        <Server className="h-10 w-10 text-phosphor" />
      </div>
      <h3 className="mb-3 font-mono text-lg font-medium text-foreground">
        Welcome to SysMonitor
      </h3>
      <p className="mb-6 max-w-md font-mono text-[11px] leading-relaxed text-dim">
        No NetBird peers found. Get started by adding your first site to monitor network uptime, latency, and tunnel health.
      </p>
      <Link
        to="/sites"
        search={{ add: "true" }}
        className="inline-flex items-center justify-center gap-2 rounded bg-phosphor px-4 py-2 font-mono text-[11px] font-medium uppercase tracking-wider text-void transition-colors hover:bg-phosphor/90"
      >
        <Plus className="h-4 w-4" />
        Add Your First Site
      </Link>
    </div>
  );
}
