import { z } from "zod";

const batchHealthCheckSchema = z.object({
  sites: z.array(
    z.object({
      id: z.string(),
      hostname: z.string(),
      netbirdConnected: z.boolean(),
    }),
  ),
  concurrency: z.number().min(1).max(50).default(25),
  timeoutMs: z.number().min(1000).max(10000).default(5000),
});

export interface HealthCheckResult {
  id: string;
  hostname: string;
  ok: boolean;
  latencyMs: number;
  detail: string;
  skipped: boolean;
}

interface BatchHealthCheckResponse {
  results: HealthCheckResult[];
  summary: {
    total: number;
    checked: number;
    skipped: number;
    passed: number;
    failed: number;
    avgLatencyMs: number;
  };
}

export async function batchHealthCheck(
  input: { data: z.infer<typeof batchHealthCheckSchema> },
): Promise<BatchHealthCheckResponse> {
  const data = batchHealthCheckSchema.parse(input.data);

  // In Electron, delegate to main process which has Node.js net module
  if (typeof window !== "undefined" && window.electronAPI?.healthBatchCheck) {
    return window.electronAPI.healthBatchCheck(data);
  }

  // Browser fallback: use HTTP fetch-based checks instead of TCP
  const results: HealthCheckResult[] = [];
  let checked = 0;
  let skipped = 0;
  let passed = 0;
  let failed = 0;
  let totalLatency = 0;

  for (const site of data.sites) {
    if (!site.netbirdConnected) {
      skipped++;
      results.push({
        id: site.id,
        hostname: site.hostname,
        ok: false,
        latencyMs: 0,
        detail: "Skipped - NetBird peer offline",
        skipped: true,
      });
      continue;
    }

    checked++;
    const start = Date.now();
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), data.timeoutMs);
      const res = await fetch(`https://${site.hostname}`, {
        method: "HEAD",
        mode: "no-cors",
        signal: ctrl.signal,
      });
      clearTimeout(timer);
      const ms = Date.now() - start;
      // no-cors mode returns opaque response, type "opaque" means reachable
      const ok = res.type === "opaque" || res.ok;
      if (ok) passed++;
      else failed++;
      totalLatency += ms;
      results.push({
        id: site.id,
        hostname: site.hostname,
        ok,
        latencyMs: ms,
        detail: ok ? `HTTP reachable · ${ms}ms` : `HTTP check failed · ${ms}ms`,
        skipped: false,
      });
    } catch (err) {
      const ms = Date.now() - start;
      failed++;
      totalLatency += ms;
      const msg = err instanceof Error ? err.message : "fetch failed";
      results.push({
        id: site.id,
        hostname: site.hostname,
        ok: false,
        latencyMs: ms,
        detail: msg.includes("aborted") ? `Timeout after ${data.timeoutMs}ms` : msg.slice(0, 100),
        skipped: false,
      });
    }
  }

  const avgLatencyMs = checked > 0 ? Math.round(totalLatency / checked) : 0;

  return {
    results,
    summary: {
      total: data.sites.length,
      checked,
      skipped,
      passed,
      failed,
      avgLatencyMs,
    },
  };
}

/**
 * Performs a batch ICMP ping check on multiple sites
 */
export async function pingBatchCheck(sites: Site[], options: { count?: number; timeoutMs?: number; concurrency?: number } = {}) {
  if (typeof window === "undefined" || !window.electronAPI?.pingBatchCheck) {
    return [];
  }

  return window.electronAPI.pingBatchCheck({
    sites: sites.map(s => ({ id: s.id, hostname: s.hostname, netbirdIp: s.netbirdIp })),
    count: options.count,
    timeoutMs: options.timeoutMs,
    concurrency: options.concurrency
  });
}

// Storage helpers for ICMP Ping status checking configuration
const ICMP_CHECKS_ENABLED_KEY = "sysmonitor.icmpChecksEnabled";

export function areIcmpChecksEnabled(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return localStorage.getItem(ICMP_CHECKS_ENABLED_KEY) === "true";
  } catch {
    return false;
  }
}

export function setIcmpChecksEnabled(enabled: boolean): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(ICMP_CHECKS_ENABLED_KEY, enabled ? "true" : "false");
  } catch (error) {
    console.error("Failed to write ICMP setting to localStorage:", error);
  }
}
