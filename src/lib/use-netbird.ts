import { useMemo, useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { listNetbirdPeers, type NetbirdPeerLite } from "./netbird.functions";
import { recordStateChange, calculateUptime, loadHistory, type UptimeHistory } from "./uptime-history";
import { pingBatchCheck, areIcmpChecksEnabled } from "./health-check";
import type { Site, SiteStatus } from "./sites-data";
import { collection, onSnapshot, getFirestore, query } from "firebase/firestore";
import { useFirebase } from "./firebase";

const SITES_CACHE_KEY = "sysmonitor.sitesCache.v1";
const CACHE_MAX_AGE_MS = 5 * 60 * 1000; // 5 minutes

function lastSeenSeconds(iso: string | null): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return null;
  return Math.max(0, Math.round((Date.now() - t) / 1000));
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

function flatHistory(): Site["history"] {
  const t = Date.now();
  return Array.from({ length: 24 }).map((_, i) => ({
    t: t - (23 - i) * 60_000,
    ms: 0,
  }));
}

/**
 * Heuristic to identify NetBird internal service peers (SSH/RDP connections)
 */
export const isServicePeer = (site: { name: string; hostname?: string; tags?: string[] }) => {
  const name = (site.name || "").toLowerCase();
  const hostname = (site.hostname || "").toLowerCase();
  const tags = (site.tags || []).map(t => t.toLowerCase());
  
  // Specific patterns for NetBird service peers (RDP/SSH/RDT/Browser Clients)
  // These often have names exactly matching the service or belong to specific groups
  const servicePatterns = ['rdp', 'ssh', 'rdt', 'browser-client', 'browser', 'interactive', 'app.netbird.io'];
  
  return servicePatterns.some(p => 
    name === p || 
    hostname === p || 
    tags.includes(p) ||
    name.includes(p) || 
    hostname.includes(p) ||
    name.startsWith("chrome-") ||
    hostname.startsWith("chrome-")
  );
};

// Load cached sites from localStorage
function loadCachedSites(): { sites: Site[]; timestamp: number } | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(SITES_CACHE_KEY);
    if (!raw) {
      console.log("[Cache] No cached sites found");
      return null;
    }
    const parsed = JSON.parse(raw) as { sites: Site[]; timestamp: number };
    const age = Date.now() - parsed.timestamp;
    console.log(
      `[Cache] Loaded ${parsed.sites.length} cached sites (age: ${Math.round(age / 1000)}s)`,
    );
    return parsed;
  } catch (error) {
    console.error("[Cache] Failed to load cached sites:", error);
    return null;
  }
}

// Save sites to localStorage
function saveCachedSites(sites: Site[]): void {
  if (typeof window === "undefined") return;
  try {
    const data = {
      sites,
      timestamp: Date.now(),
    };
    localStorage.setItem(SITES_CACHE_KEY, JSON.stringify(data));
    console.log(`[Cache] Saved ${sites.length} sites to cache`);
  } catch (error) {
    console.error("[Cache] Failed to save sites to cache:", error);
  }
}

export function peerToSite(peer: NetbirdPeerLite, history?: UptimeHistory): Site {
  const status: SiteStatus = peer.connected ? "online" : "offline";
  const lastSec = lastSeenSeconds(peer.lastSeen);

  // Calculate real uptime from history, passing current status
  const uptime = calculateUptime(peer.id, undefined, status, history);

  return {
    id: peer.id,
    name: peer.name,
    hostname: peer.hostname,
    region: peer.region,
    ipv4: "—",
    netbirdIp: peer.netbirdIp,
    status,
    uptime,
    latencyMs: 0,
    packetLoss: peer.connected ? 0 : 100,
    netbirdConnected: peer.connected,
    sslDaysLeft: 0,
    lastCheckedAt: Date.now(),
    lastSeen: peer.lastSeen,
    history: flatHistory(),
    checks: [
      {
        type: "tcp",
        label: "NetBird Connection",
        ok: peer.connected,
        detail: peer.connected
          ? `Connected · ${peer.os} ${peer.version}`
          : peer.lastSeen
            ? `Disconnected · last seen ${formatTimeAgo(peer.lastSeen)}`
            : "Disconnected",
      },
    ],
    tags: peer.groups.length > 0 ? peer.groups : ["netbird"],
    os: peer.os,
    version: peer.version,
  };
}

export function useNetbirdPeers() {
  const queryClient = useQueryClient();
  const failureCountRef = useRef(0);

  const query = useQuery({
    queryKey: ["netbird", "peers"],
    queryFn: async () => {
      try {
        const result = await listNetbirdPeers();
        // Save to cache only on successful fetch with data
        if (result.peers && result.peers.length > 0) {
          // Load history once for the whole batch
          const history = loadHistory();
          const sites = result.peers.map((peer) => peerToSite(peer, history));
          saveCachedSites(sites);
        } else if (!result.error) {
          // API returned empty but no error - still try to use cache
          console.log("[Cache] Not saving to cache - no peers returned from API");
          const cached = loadCachedSites();
          if (cached && Date.now() - cached.timestamp < CACHE_MAX_AGE_MS) {
            console.log("[Cache] Using cached data as fallback (empty API response)");
            const peers: NetbirdPeerLite[] = cached.sites.map((site) => {
              let name = site.name;
              const osLower = (site.os || "").toLowerCase();
              if (osLower.includes("pfsense") || osLower.includes("freebsd")) {
                if (!name || name === site.id || name.toLowerCase() === "pfsense" || name.toLowerCase() === "freebsd" || (site.hostname || "").toLowerCase() === "pfsense") {
                  name = "pfSense Router";
                }
              }
              return {
                id: site.id,
                name,
                hostname: site.hostname,
                netbirdIp: site.netbirdIp,
                region: site.region,
                connected: site.status === "online",
                lastSeen: site.lastSeen ?? null,
                os: site.os || "",
                version: site.version || "",
                groups: site.tags,
              };
            });
            return { peers, error: result.error };
          }
        } else {
          // API returned error - use cache if available
          console.log("[Cache] API error, checking for cached data...");
          const cached = loadCachedSites();
          if (cached && Date.now() - cached.timestamp < CACHE_MAX_AGE_MS) {
            console.log("[Cache] Using cached data as fallback (API error)");
            const peers: NetbirdPeerLite[] = cached.sites.map((site) => {
              let name = site.name;
              const osLower = (site.os || "").toLowerCase();
              if (osLower.includes("pfsense") || osLower.includes("freebsd")) {
                if (!name || name === site.id || name.toLowerCase() === "pfsense" || name.toLowerCase() === "freebsd" || (site.hostname || "").toLowerCase() === "pfsense") {
                  name = "pfSense Router";
                }
              }
              return {
                id: site.id,
                name,
                hostname: site.hostname,
                netbirdIp: site.netbirdIp,
                region: site.region,
                connected: site.status === "online",
                lastSeen: site.lastSeen ?? null,
                os: site.os || "",
                version: site.version || "",
                groups: site.tags,
              };
            });
            return { peers, error: result.error };
          }
        }
        return result;
      } catch (error) {
        // Network/API call threw an exception - use cache
        console.log("[Cache] API threw exception, checking for cached data...");
        const cached = loadCachedSites();
        if (cached && Date.now() - cached.timestamp < CACHE_MAX_AGE_MS) {
          console.log("[Cache] Using cached data as fallback (exception)");
          const peers: NetbirdPeerLite[] = cached.sites.map((site) => {
            let name = site.name;
            const osLower = (site.os || "").toLowerCase();
            if (osLower.includes("pfsense") || osLower.includes("freebsd")) {
              if (!name || name === site.id || name.toLowerCase() === "pfsense" || name.toLowerCase() === "freebsd" || (site.hostname || "").toLowerCase() === "pfsense") {
                name = "pfSense Router";
              }
            }
            return {
              id: site.id,
              name,
              hostname: site.hostname,
              netbirdIp: site.netbirdIp,
              region: site.region,
              connected: site.status === "online",
              lastSeen: site.lastSeen ?? null,
              os: site.os || "",
              version: site.version || "",
              groups: site.tags,
            };
          });
          return { peers, error: error instanceof Error ? error.message : "Network error" };
        }
        // No cache available - rethrow the error
        throw error;
      }
    },
    refetchInterval: 300_000, // Auto sync every 300 seconds (5 minutes) - reduced for less CPU/network usage
    staleTime: 290_000, // 290 seconds - slightly less than refetch interval to ensure fresh data
    // Show cached data immediately while fetching in background
    placeholderData: (previousData, previousQuery) => {
      // If previous query had an error, increment failure count
      if (previousQuery?.state.error) {
        failureCountRef.current = Math.min(failureCountRef.current + 1, 10);
      }
      return previousData;
    },
    // Use cached data immediately on mount to prevent empty states
    initialData: () => {
      if (typeof window === "undefined") return undefined;
      const cached = loadCachedSites();
      if (cached && Date.now() - cached.timestamp < CACHE_MAX_AGE_MS) {
        console.log("[Cache] Using cached data as initialData");
        const peers: NetbirdPeerLite[] = cached.sites.map((site) => {
          // Apply pfSense default name logic for cached data too
          let name = site.name;
          const osLower = (site.os || "").toLowerCase();
          const isPfSense = osLower.includes("pfsense") || osLower.includes("freebsd");
          if (isPfSense) {
            const nameLower = (name || "").toLowerCase();
            const hostnameLower = (site.hostname || "").toLowerCase();
            if (!name || name === site.id || nameLower === "pfsense" || nameLower === "freebsd" || hostnameLower === "pfsense" || hostnameLower === "freebsd") {
              name = "pfSense Router";
            }
          }
          return {
            id: site.id,
            name,
            hostname: site.hostname,
            netbirdIp: site.netbirdIp,
            region: site.region,
            connected: site.status === "online",
            lastSeen: site.lastSeen ?? null,
            os: site.os || "",
            version: site.version || "",
            groups: site.tags,
          };
        });
        return { peers, error: null };
      }
      return undefined;
    },
    // Optimize initial load - don't refetch on mount if data is fresh
    refetchOnMount: false,
    refetchOnWindowFocus: true, // Refresh when user switches back to app
    retry: (failureCount, error) => {
      // Retry up to 3 times with exponential backoff
      if (failureCount >= 3) return false;
      // Only retry on network errors, not 4xx errors
      if (error instanceof Error && error.message.includes("NETBIRD_API_TOKEN")) return false;
      return true;
    },
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 10000), // 1s, 2s, 4s, max 10s
  });

  // Hydrate cache from localStorage on client-side only (avoids hydration mismatch)
  useEffect(() => {
    if (typeof window === "undefined") return;

    console.log("[Cache] Hydrating cache from localStorage...");
    const cached = loadCachedSites();
    if (cached && Date.now() - cached.timestamp < CACHE_MAX_AGE_MS) {
      console.log("[Cache] Cache is valid, hydrating query client...");
      // Convert cached sites back to peers format
      const peers: NetbirdPeerLite[] = cached.sites.map((site) => {
        // Apply pfSense default name logic
        let name = site.name;
        const osLower = (site.os || "").toLowerCase();
        const isPfSense = osLower.includes("pfsense") || osLower.includes("freebsd");
        if (isPfSense) {
          const nameLower = (name || "").toLowerCase();
          const hostnameLower = (site.hostname || "").toLowerCase();
          if (!name || name === site.id || nameLower === "pfsense" || nameLower === "freebsd" || hostnameLower === "pfsense" || hostnameLower === "freebsd") {
            name = "pfSense Router";
          }
        }
        return {
          id: site.id,
          name,
          hostname: site.hostname,
          netbirdIp: site.netbirdIp,
          region: site.region,
          connected: site.status === "online",
          lastSeen: site.lastSeen ?? null,
          os: site.os || "",
          version: site.version || "",
          groups: site.tags,
        };
      });

      // Set cached data in query client
      queryClient.setQueryData(["netbird", "peers"], { peers, error: null });
      console.log(`[Cache] Hydrated ${peers.length} peers to query client`);
    } else {
      console.log("[Cache] No valid cache found or cache expired");
    }
  }, [queryClient]);

  // Refetch when page becomes visible (handles browser throttling when minimized)
  useEffect(() => {
    if (typeof window === "undefined") return;

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        console.log("[Visibility] Page visible, refetching...");
        queryClient.invalidateQueries({ queryKey: ["netbird", "peers"] });
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [queryClient]);

  // Monitor status changes and record them (Side Effects moved here from render)
  useEffect(() => {
    const peers = query.data?.peers;
    if (!peers || peers.length === 0) return;

    peers.forEach((peer) => {
      const status: SiteStatus = peer.connected ? "online" : "offline";
      // recordStateChange handles deduplication internally (checks last state)
      // but moving it here ensures it only runs when data actually changes
      recordStateChange(peer.id, status, peer.name, peer.region);
    });
  }, [query.data?.peers]);

  // Reset failure count on successful fetch with real data
  useEffect(() => {
    if (query.data?.peers && query.data.peers.length > 0 && !query.data.error) {
      failureCountRef.current = 0;
    }
  }, [query.data]);

  return {
    ...query,
    failureCount: failureCountRef.current,
  };
}

export function useNetbirdSites() {
  const q = useNetbirdPeers();
  const [icmpEnabled, setIcmpEnabled] = useState(() => areIcmpChecksEnabled());
  const [pingResults, setPingResults] = useState<Record<string, { ok: boolean; latencyMs: number; packetLoss: number }>>(() => {
    // Load from cache to prevent flicker on initial load
    if (typeof window === "undefined") return {};
    try {
      const saved = localStorage.getItem("sysmonitor_ping_results");
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  // Keep icmpEnabled state in sync with localStorage whenever peers list refreshes
  useEffect(() => {
    setIcmpEnabled(areIcmpChecksEnabled());
  }, [q.data?.peers]);

  // Persist ping results to avoid "flicker" on reload
  useEffect(() => {
    localStorage.setItem("sysmonitor_ping_results", JSON.stringify(pingResults));
  }, [pingResults]);

  // Background ping task
  useEffect(() => {
    const peers = q.data?.peers;
    if (!peers || peers.length === 0 || !icmpEnabled) {
      // Clear ping results if ICMP checks are disabled
      if (!icmpEnabled && Object.keys(pingResults).length > 0) {
        setPingResults({});
      }
      return;
    }

    const runPingCheck = async () => {
      // Only ping peers that are "connected" in NetBird and not service peers
      const activePeers = peers.filter(p => p.connected && !isServicePeer(p));
      if (activePeers.length === 0) return;

      console.log(`[Ping] Starting wave for ${activePeers.length} peers...`);
      try {
        const results = await pingBatchCheck(activePeers.map(p => ({
          id: p.id,
          hostname: p.hostname,
          netbirdIp: p.netbirdIp
        } as Site)));

        const resultMap: Record<string, { ok: boolean; latencyMs: number; packetLoss: number }> = {};
        results.forEach(r => {
          resultMap[r.id] = { ok: r.ok, latencyMs: r.latencyMs, packetLoss: r.packetLoss };
        });

        setPingResults(prev => ({ ...prev, ...resultMap }));
        console.log(`[Ping] Wave complete, updated ${results.length} results`);
      } catch (err) {
        console.error("[Ping] Wave failed:", err);
      }
    };

    // Initial check
    runPingCheck();

    // Periodic check every 60 seconds (much faster than NetBird sync)
    const interval = setInterval(runPingCheck, 60_000);
    return () => clearInterval(interval);
  }, [q.data?.peers, icmpEnabled]);

  const sites: Site[] = useMemo(() => {
    const peers = q.data?.peers ?? [];
    if (peers.length === 0) return [];
    
    const history = loadHistory();
    return peers
      .map((peer) => {
        const site = peerToSite(peer, history);
        
        // ONLY perform combined ping check status updates if ICMP checks are enabled
        if (icmpEnabled) {
          const ping = pingResults[peer.id];
          
          if (ping) {
            // Update site with real ping results
            site.latencyMs = ping.latencyMs;
            site.packetLoss = ping.packetLoss;
            
            // Combined status logic: If NetBird is online but Ping fails, mark as offline
            if (site.status === "online" && !ping.ok) {
              site.status = "offline";
              site.netbirdConnected = false; // Update this for consistency across Devices/Tunnels pages
            }
            
            // Update checks array with separate line items
            site.checks = [
              {
                type: "tcp",
                label: "NetBird Connection",
                ok: peer.connected,
                detail: peer.connected ? "Connected to mesh" : "Disconnected from mesh"
              },
              {
                type: "icmp",
                label: "Real-time Ping",
                ok: ping.ok,
                detail: ping.ok 
                  ? `${ping.latencyMs}ms · ${ping.packetLoss}% loss` 
                  : `Unreachable · ${ping.packetLoss}% loss`
              }
            ];
          }
        }
        
        return site;
      })
      .filter((site) => !isServicePeer(site));
  }, [q.data?.peers, pingResults, icmpEnabled]);

  // If the query has data but also an error (from cache fallback), expose the error
  const error = q.error || (q.data?.error ? new Error(q.data.error) : null);
  const isError = !!error || q.failureCount > 0;

  return {
    ...q,
    sites,
    error,
    isError,
    failureCount: q.failureCount,
  };
}

/**
 * Real-time hook using Firebase onSnapshot for devices/sites
 */
export function useNetbirdSitesRealtime() {
  const { db, initialized } = useFirebase();
  const [sites, setSites] = useState<Site[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [isRealtime, setIsRealtime] = useState(false);

  useEffect(() => {
    if (!initialized || !db) {
      // Fallback to polling if Firebase not available
      return;
    }

    const q = query(collection(db, "sites"));
    
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const sitesData: Site[] = [];
        snapshot.forEach((doc) => {
          const data = doc.data();
          sitesData.push({
            id: doc.id,
            name: data.name || "",
            hostname: data.hostname || data.name || "",
            region: data.region || data.location || "",
            ipv4: data.ipv4 || data.ip || "",
            netbirdIp: data.netbirdIp || data.ip || "",
            status: data.status || "offline",
            uptime: data.uptime || 0,
            latencyMs: data.latencyMs || 0,
            packetLoss: data.packetLoss || 0,
            netbirdConnected: data.netbirdConnected || data.connected || false,
            sslDaysLeft: data.sslDaysLeft || 0,
            lastCheckedAt: data.lastCheckedAt || Date.now(),
            lastSeen: data.lastSeen || null,
            history: data.history || [],
            checks: data.checks || [],
            tags: data.tags || [],
            os: data.os || "Unknown",
            version: data.version || "",
            ...data
          } as Site);
        });
        // Filter out service peers from realtime stream too
        setSites(sitesData.filter(site => !isServicePeer(site)));
        setIsLoading(false);
        setIsRealtime(true);
      },
      (err) => {
        console.error("onSnapshot error:", err);
        setError(err);
        setIsLoading(false);
        setIsRealtime(false);
      }
    );

    return () => unsubscribe();
  }, [db, initialized]);

  return { sites, isLoading, error, isRealtime };
}

/**
 * Hook to get global stats from all sites
 */
export function useNetbirdStats() {
  const { sites, isLoading, error } = useNetbirdSites();

  return useMemo(() => {
    if (isLoading || error || sites.length === 0) {
      return { total: 0, online: 0, offline: 0, avgUptime: 0 };
    }

    const total = sites.length;
    const online = sites.filter((s) => s.status === "online").length;
    const offline = total - online;
    const avgUptime = Math.round(sites.reduce((acc, s) => acc + s.uptime, 0) / total);

    return { total, online, offline, avgUptime };
  }, [sites, isLoading, error]);
}
