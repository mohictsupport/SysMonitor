import { z } from "zod";
import { isElectron, httpProbe } from "./electron-notifications";

const NETBIRD_BASE = "https://api.netbird.io/api";

interface NetbirdPeer {
  id: string;
  name?: string;
  ip?: string;
  connected?: boolean;
  last_seen?: string;
  os?: string;
  version?: string;
  hostname?: string;
  groups?: Array<{ id: string; name: string }>;
  country_code?: string;
  city_name?: string;
  approval_required?: boolean;
  setup_key_id?: string;
}

export interface NetbirdPeerLite {
  id: string;
  name: string;
  hostname: string;
  netbirdIp: string;
  connected: boolean;
  lastSeen: string | null;
  os: string;
  version: string;
  region: string;
  groups: string[];
  setupKeyId?: string;
}

export interface ProbeResult {
  ok: boolean;
  status: number | null;
  latencyMs: number;
  detail: string;
}

async function getApiKey(): Promise<string> {
  // Try Electron secure storage first
  if (typeof window !== "undefined" && window.electronAPI?.loadApiKey) {
    try {
      const result = await window.electronAPI.loadApiKey();
      if (result.success && result.apiKey) {
        return result.apiKey;
      }
    } catch {
      // fall through
    }
  }

  // Try localStorage (browser fallback)
  if (typeof window !== "undefined") {
    const stored = localStorage.getItem("netbird_api_key");
    if (stored) return stored;
  }

  // Fallback to env variable for development
  const envToken = import.meta.env.VITE_NETBIRD_API_TOKEN;
  if (envToken) return envToken;

  throw new Error("NETBIRD_API_TOKEN is not configured. Please add it in Settings.");
}

async function authHeaders(): Promise<Record<string, string>> {
  const token = await getApiKey();
  return {
    Authorization: `Token ${token}`,
    Accept: "application/json",
  };
}

function mapPeer(p: NetbirdPeer): NetbirdPeerLite {
  // Auto-detect firewall/pfSense devices
  const osLower = (p.os || "").toLowerCase();
  const hostnameLower = (p.hostname || "").toLowerCase();
  const nameLower = (p.name || "").toLowerCase();
  
  // Detect by: OS contains pfsense/freebsd, OR hostname contains pfsense/fw/mohnet patterns, OR name suggests firewall
  const isPfSense = osLower.includes("pfsense") || 
                    osLower.includes("freebsd") || 
                    hostnameLower.includes("pfsense") ||
                    hostnameLower.includes("-fw-") || 
                    hostnameLower.includes("fw.") ||
                    hostnameLower.includes("mohnet") ||
                    hostnameLower.includes("fw") ||
                    nameLower.includes("firewall") ||
                    nameLower.includes("pfsense");

  // If OS is empty/whitespace but device appears to be a firewall, set OS to pfSense
  let os = p.os?.trim() || "—";
  if (os === "—" && isPfSense) {
    os = "pfSense";
  }

  // Get group names, filtering out "All" group
  const groupNames = (p.groups || []).map((g) => g.name);
  const nonAllGroups = groupNames.filter((g) => g.toLowerCase() !== "all");

  // Use first non-All group as region, fallback to geo location or "UNKNOWN"
  const region = nonAllGroups[0] ||
    [p.country_code, p.city_name].filter(Boolean).join(" · ").toUpperCase() ||
    "UNKNOWN";

  // Get raw name/hostname
  let name = p.name || p.hostname || p.id;
  let hostname = p.hostname || p.name || "";

  // If it's a pfSense device and name is generic/empty, default to "pfSense Router"
  if (isPfSense) {
    const nameLower = (name || "").toLowerCase();
    const hostnameLower = (hostname || "").toLowerCase();
    // Check if name is generic (ID-like or just "pfsense" without being descriptive)
    if (!name || name === p.id || nameLower === "pfsense" || nameLower === "freebsd" || hostnameLower === "pfsense" || hostnameLower === "freebsd") {
      name = "pfSense Router";
      if (!hostname) hostname = "pfsense";
    }
  }

  // Final safety: ensure name is never empty
  if (!name || name.trim() === "") {
    name = hostname || "pfSense Device";
  }
  if (!hostname || hostname.trim() === "") {
    hostname = name;
  }

  // Debug final result for pfSense
  if (isPfSense || hostnameLower.includes("pfsense")) {
    console.log("[NetBird] pfSense mapped result:", { id: p.id, finalName: name, finalHostname: hostname, os });
  }

  return {
    id: p.id,
    name,
    hostname,
    netbirdIp: p.ip || "—",
    connected: Boolean(p.connected),
    lastSeen: p.last_seen ?? null,
    os,
    version: p.version || "—",
    region,
    groups: groupNames,
    setupKeyId: p.setup_key_id,
  };
}

export async function listNetbirdPeers(): Promise<{ peers: NetbirdPeerLite[]; error: string | null }> {
  try {
    const headers = await authHeaders();
    const res = await fetch(`${NETBIRD_BASE}/peers`, {
      method: "GET",
      headers,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.error("NetBird peers error", res.status, text);
      if (res.status === 401 || res.status === 404) {
        return {
          peers: [],
          error: "NetBird API key invalid or expired. Please update your API key in Settings.",
        };
      }
      return {
        peers: [],
        error: `NetBird API ${res.status}: ${text.slice(0, 200) || res.statusText}`,
      };
    }
    const raw = (await res.json()) as NetbirdPeer[];
    return { peers: raw.map(mapPeer), error: null };
  } catch (err) {
    console.error("NetBird peers fetch failed", err);
    return {
      peers: [],
      error: err instanceof Error ? err.message : "Unknown error",
    };
  }
}

const probeSchema = z.object({
  url: z.string().min(1).max(500),
});

const updatePeerSchema = z.object({
  peerId: z.string(),
  name: z.string().optional(),
  groups: z.array(z.string()).optional(),
});

export async function updateNetbirdPeer(
  input: z.infer<typeof updatePeerSchema>,
): Promise<{ success: boolean; error?: string }> {
  const data = updatePeerSchema.parse(input);
  try {
    const headers = await authHeaders();
    const res = await fetch(`${NETBIRD_BASE}/peers/${data.peerId}`, {
      method: "PUT",
      headers: {
        ...headers,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: data.name,
        groups: data.groups,
      }),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.error("NetBird update peer error", res.status, text);
      return {
        success: false,
        error: `Failed to update peer: ${res.status} ${text.slice(0, 200)}`,
      };
    }

    return { success: true };
  } catch (err) {
    console.error("NetBird update peer failed", err);
    return {
      success: false,
      error: err instanceof Error ? err.message : "Unknown error",
    };
  }
}

export async function deleteNetbirdPeer(
  peerId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const headers = await authHeaders();
    const res = await fetch(`${NETBIRD_BASE}/peers/${peerId}`, {
      method: "DELETE",
      headers,
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.error("NetBird delete peer error", res.status, text);
      return {
        success: false,
        error: `Failed to delete peer: ${res.status} ${text.slice(0, 200)}`,
      };
    }

    return { success: true };
  } catch (err) {
    console.error("NetBird delete peer failed", err);
    return {
      success: false,
      error: err instanceof Error ? err.message : "Unknown error",
    };
  }
}

export async function listNetbirdGroups(): Promise<{
  groups: Array<{ id: string; name: string }>;
  error: string | null;
}> {
  try {
    const headers = await authHeaders();
    const res = await fetch(`${NETBIRD_BASE}/groups`, {
      method: "GET",
      headers,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.error("NetBird groups error", res.status, text);
      return {
        groups: [],
        error: `NetBird API ${res.status}: ${text.slice(0, 200) || res.statusText}`,
      };
    }
    const raw = (await res.json()) as Array<{ id: string; name: string }>;
    return { groups: raw, error: null };
  } catch (err) {
    console.error("NetBird groups fetch failed", err);
    return {
      groups: [],
      error: err instanceof Error ? err.message : "Unknown error",
    };
  }
}

const createGroupSchema = z.object({
  name: z.string().min(1).max(50),
});

export async function createNetbirdGroup(
  input: z.infer<typeof createGroupSchema>,
): Promise<{ success: boolean; groupId?: string; error?: string }> {
  const data = createGroupSchema.parse(input);
  try {
    const headers = await authHeaders();
    const res = await fetch(`${NETBIRD_BASE}/groups`, {
      method: "POST",
      headers: {
        ...headers,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: data.name,
      }),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.error("NetBird create group error", res.status, text);
      return {
        success: false,
        error: `NetBird API ${res.status}: ${text.slice(0, 200) || res.statusText}`,
      };
    }

    const created = (await res.json()) as { id: string; name: string };
    console.log("Created NetBird group:", created);
    return {
      success: true,
      groupId: created.id,
    };
  } catch (err) {
    console.error("NetBird create group failed", err);
    return {
      success: false,
      error: err instanceof Error ? err.message : "Unknown error",
    };
  }
}

export async function probeHttp(input: { url: string }): Promise<ProbeResult> {
  const data = probeSchema.parse(input);
  let target = data.url.trim();
  if (!/^https?:\/\//i.test(target)) target = `https://${target}`;

  // Use Electron IPC when in desktop app (bypasses CSP)
  if (isElectron()) {
    try {
      const result = await httpProbe(target);
      return {
        ok: result.ok ?? false,
        status: result.status ?? null,
        latencyMs: result.latencyMs ?? 0,
        detail: result.detail ?? "Probe failed",
      };
    } catch (err) {
      return {
        ok: false,
        status: null,
        latencyMs: 0,
        detail: err instanceof Error ? err.message : "IPC probe failed",
      };
    }
  }

  // Fallback to direct fetch (will fail in Electron due to CSP)
  const start = Date.now();
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8000);
    const res = await fetch(target, {
      method: "GET",
      redirect: "follow",
      signal: ctrl.signal,
    });
    clearTimeout(timer);
    const ms = Date.now() - start;
    return {
      ok: res.ok,
      status: res.status,
      latencyMs: ms,
      detail: `${res.status} ${res.statusText} · ${ms}ms`,
    };
  } catch (err) {
    const ms = Date.now() - start;
    const msg = err instanceof Error ? err.message : "fetch failed";
    return {
      ok: false,
      status: null,
      latencyMs: ms,
      detail: msg.includes("aborted") ? "Timeout after 8s" : msg.slice(0, 120),
    };
  }
}
