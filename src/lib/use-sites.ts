import { useEffect, useState, useCallback } from "react";
import {
  defaultAlertingRules,
  type Site,
  type EventEntry,
  type AlertingRule,
  type AlertCondition,
} from "./sites-data";
import { loadPeerStatusHistory } from "./peer-status-history";

const STORAGE_KEY = "sysmonitor.sites.v1";
const SITES_CACHE_KEY = "sysmonitor.sites.cache.v1";

// Clear all site-related caches from localStorage
export function clearAllSites(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(SITES_CACHE_KEY);
    console.log("[Sites] All site caches cleared");
  } catch (error) {
    console.error("[Sites] Failed to clear site caches:", error);
  }
}

function loadSites(): Site[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Site[];
    if (!Array.isArray(parsed)) return [];
    return parsed;
  } catch {
    return [];
  }
}

function saveSites(sites: Site[]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sites));
  } catch {
    // ignore quota errors
  }
}

export function useSites() {
  const [sites, setSites] = useState<Site[]>([]);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setSites(loadSites());
    setHydrated(true);
  }, []);

  const persist = useCallback((next: Site[]) => {
    setSites(next);
    saveSites(next);
  }, []);

  const addSite = useCallback(
    (input: { name: string; hostname: string; region: string; netbirdIp: string }) => {
      const id =
        input.name
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .slice(0, 40) || `site-${Date.now()}`;
      const ts = Date.now();
      const site: Site = {
        id,
        name: input.name,
        hostname: input.hostname,
        region: input.region || "UNKNOWN",
        ipv4: "—",
        netbirdIp: input.netbirdIp || "—",
        status: "online",
        uptime: 100,
        latencyMs: 0,
        packetLoss: 0,
        netbirdConnected: Boolean(input.netbirdIp),
        sslDaysLeft: 0,
        lastCheckedAt: ts,
        history: [],
        checks: [
          {
            type: "icmp",
            label: "NetBird Peer",
            ok: Boolean(input.netbirdIp),
            detail: input.netbirdIp ? "Pending probe" : "No IP",
          },
        ],
        tags: ["new"],
      };
      persist([site, ...sites]);
      return site;
    },
    [sites, persist],
  );

  const removeSite = useCallback(
    (id: string) => {
      persist(sites.filter((s) => s.id !== id));
    },
    [sites, persist],
  );

  return { sites, hydrated, addSite, removeSite };
}

// Combine real events from alerting rules and peer status history
export function useRealEvents(sites: Site[]): EventEntry[] {
  const [events, setEvents] = useState<EventEntry[]>([]);

  useEffect(() => {
    if (sites.length === 0) {
      setEvents([]);
      return;
    }

    // Get triggered alerts from alerting rules
    const rules = loadAlertingRules();
    const alertEvents = evaluateAlertingRules(rules, sites);

    // Get peer status change events from history
    const histories = loadPeerStatusHistory();
    const statusEvents: EventEntry[] = [];

    Object.values(histories).forEach((history) => {
      // Get last 5 status changes per peer
      const recentEvents = history.events.slice(-5);

      recentEvents.forEach((event) => {
        // Only include disconnected/degraded events as significant
        if (event.status !== "connected") {
          statusEvents.push({
            id: `status-${history.peerId}-${event.ts}`,
            ts: event.ts,
            level: event.status === "disconnected" ? "critical" : "warn",
            source: history.peerId,
            message: `${history.peerName} ${event.status}${event.latencyMs ? ` (${event.latencyMs}ms)` : ""}`,
          });
        }
      });
    });

    // Combine and sort by timestamp (newest first)
    const allEvents = [...alertEvents, ...statusEvents].sort((a, b) => b.ts - a.ts);

    // Take last 50 events
    setEvents(allEvents.slice(0, 50));
  }, [sites]);

  return events;
}

// Legacy hook - now returns real data
export function useEvents(): EventEntry[] {
  const [events, setEvents] = useState<EventEntry[]>([]);

  useEffect(() => {
    // For the static events page without sites context,
    // we show peer status history
    const histories = loadPeerStatusHistory();
    const allEvents: EventEntry[] = [];

    Object.values(histories).forEach((history) => {
      history.events.slice(-10).forEach((event) => {
        allEvents.push({
          id: `status-${history.peerId}-${event.ts}`,
          ts: event.ts,
          level:
            event.status === "disconnected"
              ? "critical"
              : event.status === "degraded"
                ? "warn"
                : "info",
          source: history.peerId,
          message: `${history.peerName} is ${event.status}${event.latencyMs ? ` (${event.latencyMs}ms)` : ""}`,
        });
      });
    });

    // Sort by timestamp descending
    allEvents.sort((a, b) => b.ts - a.ts);
    setEvents(allEvents.slice(0, 50));
  }, []);

  return events;
}

// Alerting rules storage
const ALERTS_STORAGE_KEY = "sysmonitor.alertingRules.v1";

export function loadAlertingRules(): AlertingRule[] {
  if (typeof window === "undefined") return defaultAlertingRules;
  try {
    const raw = localStorage.getItem(ALERTS_STORAGE_KEY);
    if (!raw) return defaultAlertingRules;
    const parsed = JSON.parse(raw) as AlertingRule[];
    if (!Array.isArray(parsed) || parsed.length === 0) return defaultAlertingRules;
    return parsed;
  } catch {
    return defaultAlertingRules;
  }
}

export function saveAlertingRules(rules: AlertingRule[]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(ALERTS_STORAGE_KEY, JSON.stringify(rules));
  } catch {
    // ignore quota errors
  }
}

// Evaluate a single rule against a site
function evaluateRule(
  rule: AlertingRule,
  site: Site,
): { triggered: boolean; message: string } | null {
  if (!rule.enabled) return null;

  // Check cooldown
  if (rule.lastTriggeredAt) {
    const cooldownMs = rule.cooldownMinutes * 60 * 1000;
    if (Date.now() - rule.lastTriggeredAt < cooldownMs) {
      return null;
    }
  }

  // Check if rule applies to this site
  if (rule.sites.length > 0 && !rule.sites.includes(site.id)) {
    return null;
  }

  switch (rule.condition) {
    case "status_offline":
      if (site.status === "offline") {
        return { triggered: true, message: `${site.name} is offline` };
      }
      break;
    case "status_degraded":
      if (site.status === "degraded") {
        return { triggered: true, message: `${site.name} is degraded` };
      }
      break;
    case "latency_high":
      if (rule.threshold && site.latencyMs > rule.threshold) {
        return {
          triggered: true,
          message: `${site.name} latency high (${site.latencyMs}ms > ${rule.threshold}ms)`,
        };
      }
      break;
    case "packet_loss_high":
      if (rule.threshold && site.packetLoss > rule.threshold) {
        return {
          triggered: true,
          message: `${site.name} packet loss high (${site.packetLoss}% > ${rule.threshold}%)`,
        };
      }
      break;
    case "ssl_expiring":
      if (rule.threshold && site.sslDaysLeft <= rule.threshold) {
        return {
          triggered: true,
          message: `${site.name} SSL expires in ${site.sslDaysLeft} days`,
        };
      }
      break;
    case "netbird_disconnected":
      if (!site.netbirdConnected) {
        return { triggered: true, message: `${site.name} Netbird disconnected` };
      }
      break;
    case "uptime_low":
      if (rule.threshold && site.uptime < rule.threshold) {
        return {
          triggered: true,
          message: `${site.name} uptime low (${site.uptime}% < ${rule.threshold}%)`,
        };
      }
      break;
  }

  return null;
}

// Evaluate all rules against all sites and return triggered alerts
export function evaluateAlertingRules(rules: AlertingRule[], sites: Site[]): EventEntry[] {
  const alerts: EventEntry[] = [];
  const now = Date.now();

  for (const rule of rules) {
    for (const site of sites) {
      const result = evaluateRule(rule, site);
      if (result?.triggered) {
        alerts.push({
          id: `alert-${rule.id}-${site.id}-${now}`,
          ts: now,
          level: rule.severity,
          source: site.id,
          message: result.message,
        });
      }
    }
  }

  return alerts;
}

export function useAlertingRules() {
  const [rules, setRules] = useState<AlertingRule[]>(defaultAlertingRules);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setRules(loadAlertingRules());
    setHydrated(true);
  }, []);

  const persist = useCallback((next: AlertingRule[]) => {
    setRules(next);
    saveAlertingRules(next);
  }, []);

  const addRule = useCallback(
    (rule: Omit<AlertingRule, "id">) => {
      const newRule: AlertingRule = {
        ...rule,
        id: `rule-${Date.now()}`,
      };
      persist([...rules, newRule]);
      return newRule;
    },
    [rules, persist],
  );

  const updateRule = useCallback(
    (id: string, updates: Partial<AlertingRule>) => {
      persist(rules.map((r) => (r.id === id ? { ...r, ...updates } : r)));
    },
    [rules, persist],
  );

  const removeRule = useCallback(
    (id: string) => {
      persist(rules.filter((r) => r.id !== id));
    },
    [rules, persist],
  );

  const toggleRule = useCallback(
    (id: string) => {
      persist(rules.map((r) => (r.id === id ? { ...r, enabled: !r.enabled } : r)));
    },
    [rules, persist],
  );

  return {
    rules,
    hydrated,
    addRule,
    updateRule,
    removeRule,
    toggleRule,
  };
}
