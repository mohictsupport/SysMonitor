import { useEffect, useState, useMemo, useRef, useCallback } from "react";
import { db } from "./firebase";
import { collection, query, where, getDocs, orderBy, limit } from "firebase/firestore";
import { hasConfiguredApiKeySync } from "./auth-utils";

interface CachedUptimeData {
  timestamp: number;
  uptime: number;
  totalChecks: number;
  onlineChecks: number;
  period: string;
}

const CACHE_KEY_PREFIX = "sysmonitor.siteUptime.v1";
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes cache

/**
 * Get cache key for a site
 */
function getCacheKey(deviceName: string): string {
  return `${CACHE_KEY_PREFIX}.${deviceName}`;
}

/**
 * Load cached uptime data from localStorage
 */
function loadCachedUptime(deviceName: string): CachedUptimeData | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(getCacheKey(deviceName));
    if (!raw) return null;
    
    const cached = JSON.parse(raw) as CachedUptimeData;
    const age = Date.now() - cached.timestamp;
    
    // Check if cache is still valid
    if (age < CACHE_TTL_MS) {
      console.log(`[UptimeCache] Loaded cached uptime for ${deviceName} (age: ${Math.round(age / 1000)}s)`);
      return cached;
    }
    return null;
  } catch (error) {
    console.error(`[UptimeCache] Failed to load cache for ${deviceName}:`, error);
    return null;
  }
}

/**
 * Save uptime data to localStorage cache
 */
function saveCachedUptime(deviceName: string, data: Omit<CachedUptimeData, "timestamp">): void {
  if (typeof window === "undefined") return;
  try {
    const cacheData: CachedUptimeData = {
      ...data,
      timestamp: Date.now(),
    };
    localStorage.setItem(getCacheKey(deviceName), JSON.stringify(cacheData));
    console.log(`[UptimeCache] Saved uptime for ${deviceName}: ${data.uptime.toFixed(2)}%`);
  } catch (error) {
    console.error(`[UptimeCache] Failed to save cache for ${deviceName}:`, error);
  }
}

/**
 * Calculate date range for last N days
 */
function getDateRange(days: number): { startDate: string; endDate: string } {
  const end = new Date();
  const start = new Date();
  start.setDate(end.getDate() - days);
  
  return {
    startDate: start.toISOString().split("T")[0],
    endDate: end.toISOString().split("T")[0],
  };
}

interface SiteUptimeResult {
  uptime: number;
  totalChecks: number;
  onlineChecks: number;
  loading: boolean;
  error: string | null;
  lastUpdated: number | null;
}

/**
 * Hook to fetch accurate uptime data from Firestore for a specific site
 * Uses temporary caching to prevent excessive Firestore reads
 */
export function useSiteUptime(deviceName: string, days: number = 30): SiteUptimeResult {
  const [result, setResult] = useState<SiteUptimeResult>(() => {
    // Initialize with cached data if available
    const cached = loadCachedUptime(deviceName);
    if (cached) {
      return {
        uptime: cached.uptime,
        totalChecks: cached.totalChecks,
        onlineChecks: cached.onlineChecks,
        loading: false,
        error: null,
        lastUpdated: cached.timestamp,
      };
    }
    return {
      uptime: 0,
      totalChecks: 0,
      onlineChecks: 0,
      loading: true,
      error: null,
      lastUpdated: null,
    };
  });

  const fetchingRef = useRef(false);

  const fetchUptime = useCallback(async () => {
    // Prevent concurrent fetches
    if (fetchingRef.current) return;
    
    // Check if we have fresh cached data
    const cached = loadCachedUptime(deviceName);
    if (cached) {
      setResult({
        uptime: cached.uptime,
        totalChecks: cached.totalChecks,
        onlineChecks: cached.onlineChecks,
        loading: false,
        error: null,
        lastUpdated: cached.timestamp,
      });
      return;
    }

    // Gate: Don't fetch if no API key
    if (!hasConfiguredApiKeySync()) {
      setResult(prev => ({ ...prev, loading: false, error: "API Key Required" }));
      return;
    }

    fetchingRef.current = true;
    console.log(`[useSiteUptime] Fetching uptime for ${deviceName} from Firestore...`);

    try {
      const { startDate, endDate } = getDateRange(days);
      
      const q = query(
        collection(db, "daily_stats"),
        where("device_name", "==", deviceName),
        where("date", ">=", startDate),
        where("date", "<=", endDate),
        orderBy("date", "desc")
      );

      const snapshot = await getDocs(q);
      
      let totalChecks = 0;
      let onlineChecks = 0;
      
      snapshot.forEach((doc) => {
        const data = doc.data();
        totalChecks += (data.total_checks || 0);
        onlineChecks += (data.online_checks || 0);
      });

      const uptime = totalChecks > 0 
        ? Math.round((onlineChecks / totalChecks) * 10000) / 100 
        : 0;

      // Save to cache
      saveCachedUptime(deviceName, {
        uptime,
        totalChecks,
        onlineChecks,
        period: `${startDate} to ${endDate}`,
      });

      setResult({
        uptime,
        totalChecks,
        onlineChecks,
        loading: false,
        error: null,
        lastUpdated: Date.now(),
      });
    } catch (err) {
      console.error(`[useSiteUptime] Error fetching uptime for ${deviceName}:`, err);
      setResult(prev => ({
        ...prev,
        loading: false,
        error: err instanceof Error ? err.message : "Failed to fetch uptime",
      }));
    } finally {
      fetchingRef.current = false;
    }
  }, [deviceName, days]);

  useEffect(() => {
    fetchUptime();
    
    // Refresh every 5 minutes
    const interval = setInterval(fetchUptime, CACHE_TTL_MS);
    return () => clearInterval(interval);
  }, [fetchUptime]);

  return result;
}

interface AllSitesUptimeResult {
  uptimes: Map<string, SiteUptimeResult>;
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

/**
 * Hook to fetch accurate uptime data for multiple sites
 * Uses batch fetching with caching
 */
export function useAllSitesUptime(deviceNames: string[], days: number = 30): AllSitesUptimeResult {
  const [uptimes, setUptimes] = useState<Map<string, SiteUptimeResult>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const refetch = useCallback(() => {
    setRefreshKey(prev => prev + 1);
  }, []);

  useEffect(() => {
    const fetchAllUptimes = async () => {
      if (deviceNames.length === 0) {
        setLoading(false);
        return;
      }

      // Gate: Don't fetch if no API key
      if (!hasConfiguredApiKeySync()) {
        setLoading(false);
        setError("API Key Required");
        return;
      }

      setLoading(true);
      setError(null);

      const { startDate, endDate } = getDateRange(days);
      const results = new Map<string, SiteUptimeResult>();

      // Check cache first for all sites
      const uncachedSites: string[] = [];
      deviceNames.forEach(name => {
        const cached = loadCachedUptime(name);
        if (cached) {
          results.set(name, {
            uptime: cached.uptime,
            totalChecks: cached.totalChecks,
            onlineChecks: cached.onlineChecks,
            loading: false,
            error: null,
            lastUpdated: cached.timestamp,
          });
        } else {
          uncachedSites.push(name);
        }
      });

      // Only fetch from Firestore if we have uncached sites
      if (uncachedSites.length > 0) {
        try {
          console.log(`[useAllSitesUptime] Fetching uptime for ${uncachedSites.length} uncached sites...`);
          
          // Fetch all daily stats in one query
          const q = query(
            collection(db, "daily_stats"),
            where("date", ">=", startDate),
            where("date", "<=", endDate),
            orderBy("date", "desc")
          );

          const snapshot = await getDocs(q);
          
          // Group by device_name
          const siteData = new Map<string, { total: number; online: number }>();
          
          snapshot.forEach((doc) => {
            const data = doc.data();
            const name = data.device_name;
            
            if (!uncachedSites.includes(name)) return;
            
            const current = siteData.get(name) || { total: 0, online: 0 };
            current.total += (data.total_checks || 0);
            current.online += (data.online_checks || 0);
            siteData.set(name, current);
          });

          // Process results and cache them
          uncachedSites.forEach(name => {
            const data = siteData.get(name);
            const uptime = data && data.total > 0 
              ? Math.round((data.online / data.total) * 10000) / 100 
              : 0;
            
            const result: SiteUptimeResult = {
              uptime,
              totalChecks: data?.total || 0,
              onlineChecks: data?.online || 0,
              loading: false,
              error: null,
              lastUpdated: Date.now(),
            };
            
            results.set(name, result);
            
            // Save to cache
            if (data) {
              saveCachedUptime(name, {
                uptime,
                totalChecks: data.total,
                onlineChecks: data.online,
                period: `${startDate} to ${endDate}`,
              });
            }
          });
        } catch (err) {
          console.error("[useAllSitesUptime] Error fetching uptimes:", err);
          setError(err instanceof Error ? err.message : "Failed to fetch uptimes");
        }
      }

      setUptimes(results);
      setLoading(false);
    };

    fetchAllUptimes();
  }, [deviceNames, days, refreshKey]);

  return { uptimes, loading, error, refetch };
}

/**
 * Clear all uptime caches (useful for logout/reset)
 */
export function clearAllUptimeCaches(): void {
  if (typeof window === "undefined") return;
  try {
    Object.keys(localStorage).forEach(key => {
      if (key.startsWith(CACHE_KEY_PREFIX)) {
        localStorage.removeItem(key);
      }
    });
    console.log("[UptimeCache] All caches cleared");
  } catch (error) {
    console.error("[UptimeCache] Failed to clear caches:", error);
  }
}
