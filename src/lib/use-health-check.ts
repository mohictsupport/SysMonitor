import { useCallback, useRef, useState } from "react";
import { batchHealthCheck, type HealthCheckResult } from "./health-check";
import type { Site } from "./sites-data";

interface HealthCheckState {
  results: Map<string, HealthCheckResult>;
  isChecking: boolean;
  lastCheckAt: number | null;
  summary: {
    total: number;
    checked: number;
    skipped: number;
    passed: number;
    failed: number;
    avgLatencyMs: number;
  } | null;
}

interface UseHealthCheckOptions {
  concurrency?: number; // Default: 25
  timeoutMs?: number; // Default: 5000 (5s)
  intervalMs?: number; // Default: 60000 (60s)
  skipOffline?: boolean; // Default: true - skip HTTP checks for NetBird offline sites
}

export function useHealthCheck(options: UseHealthCheckOptions = {}) {
  const { concurrency = 25, timeoutMs = 5000, skipOffline = true } = options;

  const [state, setState] = useState<HealthCheckState>({
    results: new Map(),
    isChecking: false,
    lastCheckAt: null,
    summary: null,
  });

  const abortRef = useRef<AbortController | null>(null);

  // Run health check on all sites
  const checkSites = useCallback(async (sites: Site[]) => {
    if (sites.length === 0) return;

    // Cancel any in-progress check
    if (abortRef.current) {
      abortRef.current.abort();
    }
    abortRef.current = new AbortController();

    setState((prev) => ({ ...prev, isChecking: true }));

    try {
      const response = await batchHealthCheck({
        data: {
          sites: sites.map((s) => ({
            id: s.id,
            hostname: s.hostname,
            netbirdConnected: s.netbirdConnected,
          })),
          concurrency,
          timeoutMs,
        },
      });

      // Build results map
      const resultsMap = new Map<string, HealthCheckResult>();
      response.results.forEach((r) => {
        resultsMap.set(r.id, r);
      });

      setState({
        results: resultsMap,
        isChecking: false,
        lastCheckAt: Date.now(),
        summary: response.summary,
      });

      return response;
    } catch (err) {
      console.error("Health check failed:", err);
      setState((prev) => ({ ...prev, isChecking: false }));
      throw err;
    }
  }, [concurrency, timeoutMs]);

  // Get result for a specific site
  const getSiteHealth = useCallback(
    (siteId: string): HealthCheckResult | undefined => {
      return state.results.get(siteId);
    },
    [state.results],
  );

  // Check if a site is healthy (passes health check or is skipped due to being offline)
  const isSiteHealthy = useCallback(
    (siteId: string): boolean => {
      const result = state.results.get(siteId);
      if (!result) return true; // No check yet, assume healthy
      if (result.skipped) return false; // Skipped because NetBird shows offline
      return result.ok;
    },
    [state.results],
  );

  return {
    ...state,
    checkSites,
    getSiteHealth,
    isSiteHealthy,
  };
}
