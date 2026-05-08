import { useEffect, useState, useCallback } from "react";
import { db } from "./firebase";
import { collection, onSnapshot, query, where, getDocs, orderBy } from "firebase/firestore";
import { useHasApiKey } from "./auth-utils";

export interface CurrentStats {
  device_id: string;
  device_name: string;
  checks: number[]; // 1 = online, 0 = offline
  uptime_24h: number;
  last_updated: string;
  last_seen: string;
  connected: boolean;
  netbird_ip: string;
  hostname: string;
}

export interface DailyStats {
  device_id: string;
  device_name: string;
  date: string; // YYYY-MM-DD
  total_checks: number;
  online_checks: number;
  uptime: number;
  last_updated: string;
}

/**
 * Hook to listen to real-time 24h uptime data from Firestore
 * Updates automatically when Netlify function writes new data
 */
export function useCurrentStats() {
  const [stats, setStats] = useState<CurrentStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const hasApiKey = useHasApiKey();

  useEffect(() => {
    // Gate: Don't fetch if no API key
    if (!hasApiKey) {
      setLoading(false);
      setError("API Key Required");
      return;
    }

    const q = query(collection(db, "current_stats"));
    
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const data: CurrentStats[] = [];
        snapshot.forEach((doc) => {
          data.push(doc.data() as CurrentStats);
        });
        setStats(data);
        setLoading(false);
      },
      (err) => {
        console.error("[Firestore] Error fetching current_stats:", err);
        setError(err.message);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [hasApiKey]);

  return { stats, loading, error };
}

/**
 * Hook to listen to real-time daily stats from Firestore
 * @param startDate - Start date (YYYY-MM-DD)
 * @param endDate - End date (YYYY-MM-DD)
 */
export function useDailyStats(startDate?: string, endDate?: string) {
  const [stats, setStats] = useState<DailyStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const hasApiKey = useHasApiKey();

  useEffect(() => {
    // Gate: Don't fetch if no API key
    if (!hasApiKey) {
      setLoading(false);
      setError("API Key Required");
      return;
    }

    setLoading(true);
    setError(null);

    const constraints = [];
    if (startDate) {
      constraints.push(where("date", ">=", startDate));
    }
    if (endDate) {
      constraints.push(where("date", "<=", endDate));
    }

    const q = query(
      collection(db, "daily_stats"),
      orderBy("date", "desc"),
      ...constraints
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const data: DailyStats[] = [];
        snapshot.forEach((doc) => {
          data.push(doc.data() as DailyStats);
        });
        setStats(data);
        setLoading(false);
      },
      (err) => {
        console.error("[Firestore] Error in daily_stats snapshot:", err);
        setError(err instanceof Error ? err.message : "Failed to fetch");
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [startDate, endDate, hasApiKey]);

  return { stats, loading, error };
}

/**
 * Get uptime for a specific site from current stats
 */
export function getSiteUptime(stats: CurrentStats[], deviceId: string): number | null {
  const stat = stats.find((s) => s.device_id === deviceId);
  return stat ? stat.uptime_24h : null;
}

export interface MonthlySiteStats {
  month: string;
  device_name: string;
  total_checks: number;
  online_checks: number;
  uptime: number;
}

/**
 * Aggregate daily stats into monthly report with per-site breakdown
 */
export function aggregateMonthly(dailyStats: DailyStats[]): MonthlySiteStats[] {
  const byMonthSite = new Map<string, {
    total_checks: number;
    online_checks: number;
  }>();

  dailyStats.forEach((stat) => {
    const month = stat.date.substring(0, 7); // YYYY-MM
    const key = `${month}|${stat.device_name}`;
    const current = byMonthSite.get(key) || {
      total_checks: 0,
      online_checks: 0,
    };

    current.total_checks += stat.total_checks;
    current.online_checks += stat.online_checks;
    byMonthSite.set(key, current);
  });

  return Array.from(byMonthSite.entries()).map(([key, data]) => {
    const [month, device_name] = key.split("|");
    return {
      month,
      device_name,
      total_checks: data.total_checks,
      online_checks: data.online_checks,
      uptime: data.total_checks > 0
        ? Math.round((data.online_checks / data.total_checks) * 10000) / 100
        : 0,
    };
  }).sort((a, b) => {
    // Sort by month descending, then by device name
    if (b.month !== a.month) return b.month.localeCompare(a.month);
    return a.device_name.localeCompare(b.device_name);
  });
}

export interface QuarterlySiteStats {
  quarter: string;
  device_name: string;
  total_checks: number;
  online_checks: number;
  uptime: number;
}

/**
 * Aggregate daily stats into quarterly report with per-site breakdown
 */
export function aggregateQuarterly(dailyStats: DailyStats[]): QuarterlySiteStats[] {
  const byQuarterSite = new Map<string, {
    total_checks: number;
    online_checks: number;
  }>();

  dailyStats.forEach((stat) => {
    const date = new Date(stat.date);
    const quarter = Math.floor(date.getMonth() / 3) + 1;
    const quarterKey = `${date.getFullYear()}-Q${quarter}`;
    const key = `${quarterKey}|${stat.device_name}`;

    const current = byQuarterSite.get(key) || {
      total_checks: 0,
      online_checks: 0,
    };

    current.total_checks += stat.total_checks;
    current.online_checks += stat.online_checks;
    byQuarterSite.set(key, current);
  });

  return Array.from(byQuarterSite.entries()).map(([key, data]) => {
    const [quarter, device_name] = key.split("|");
    return {
      quarter,
      device_name,
      total_checks: data.total_checks,
      online_checks: data.online_checks,
      uptime: data.total_checks > 0
        ? Math.round((data.online_checks / data.total_checks) * 10000) / 100
        : 0,
    };
  }).sort((a, b) => {
    // Sort by quarter descending, then by device name
    if (b.quarter !== a.quarter) return b.quarter.localeCompare(a.quarter);
    return a.device_name.localeCompare(b.device_name);
  });
}
