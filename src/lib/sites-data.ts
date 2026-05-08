export type SiteStatus = "online" | "degraded" | "offline" | "maintenance";

export type CheckType = "http" | "icmp" | "ssl" | "tcp";

export type AlertCondition =
  | "status_offline"
  | "status_degraded"
  | "latency_high"
  | "packet_loss_high"
  | "ssl_expiring"
  | "netbird_disconnected"
  | "uptime_low";

export interface AlertingRule {
  id: string;
  name: string;
  enabled: boolean;
  condition: AlertCondition;
  threshold?: number; // For latency (ms), packet loss (%), ssl days, uptime (%)
  sites: string[]; // Empty array = all sites
  severity: "warn" | "critical";
  cooldownMinutes: number;
  lastTriggeredAt?: number;
}

export interface Check {
  type: CheckType;
  label: string;
  ok: boolean;
  detail: string;
}

export interface LatencyPoint {
  t: number; // unix ms
  ms: number; // latency
}

export interface EventEntry {
  id: string;
  ts: number;
  level: "info" | "warn" | "critical" | "auth";
  source: string;
  message: string;
}

export interface Site {
  id: string;
  name: string;
  hostname: string;
  region: string;
  ipv4: string;
  netbirdIp: string;
  status: SiteStatus;
  uptime: number; // 0..100
  latencyMs: number;
  packetLoss: number; // %
  netbirdConnected: boolean;
  sslDaysLeft: number;
  lastCheckedAt: number;
  lastSeen: string | null; // ISO timestamp from NetBird
  history: LatencyPoint[];
  checks: Check[];
  tags: string[];
  os?: string; // Operating system from NetBird
  version?: string; // NetBird client version
}

export const defaultAlertingRules: AlertingRule[] = [
  {
    id: "rule-001",
    name: "Site Offline",
    enabled: true,
    condition: "status_offline",
    sites: [],
    severity: "critical",
    cooldownMinutes: 5,
  },
  {
    id: "rule-002",
    name: "High Latency",
    enabled: true,
    condition: "latency_high",
    threshold: 200,
    sites: [],
    severity: "warn",
    cooldownMinutes: 10,
  },
  {
    id: "rule-003",
    name: "SSL Expiring Soon",
    enabled: true,
    condition: "ssl_expiring",
    threshold: 14,
    sites: [],
    severity: "warn",
    cooldownMinutes: 1440, // 24 hours
  },
  {
    id: "rule-004",
    name: "Netbird Disconnected",
    enabled: true,
    condition: "netbird_disconnected",
    sites: [],
    severity: "critical",
    cooldownMinutes: 5,
  },
  {
    id: "rule-005",
    name: "Packet Loss High",
    enabled: true,
    condition: "packet_loss_high",
    threshold: 5,
    sites: [],
    severity: "warn",
    cooldownMinutes: 15,
  },
];
