// NetBird API Client
// Handles all API communication with NetBird Cloud

const NETBIRD_API_BASE = "https://api.netbird.io/api";

interface ApiConfig {
  apiKey: string;
}

// Create API client with stored key
async function getApiClient() {
  let apiKey = "";

  // Try window.electronAPI (Tauri or Electron desktop app)
  if (typeof window !== "undefined" && window.electronAPI?.loadApiKey) {
    try {
      const result = await window.electronAPI.loadApiKey();
      if (result.success && result.apiKey) {
        apiKey = result.apiKey;
      }
    } catch {
      // API failed, continue to fallbacks
    }
  }

  // Try localStorage (browser fallback)
  if (!apiKey && typeof window !== "undefined") {
    apiKey = localStorage.getItem("netbird_api_key") || "";
  }

  // Fallback to env variable for development
  if (!apiKey) {
    apiKey = import.meta.env.VITE_NETBIRD_API_TOKEN || "";
  }

  if (!apiKey) {
    throw new Error("NetBird API key not configured");
  }

  return {
    apiKey,
    headers: {
      Authorization: `Token ${apiKey}`,
      "Content-Type": "application/json",
    },
  };
}

// Generic API request helper
async function apiRequest<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const config = await getApiClient();

  const response = await fetch(`${NETBIRD_API_BASE}${endpoint}`, {
    ...options,
    headers: {
      ...config.headers,
      ...options.headers,
    },
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`NetBird API error: ${response.status} - ${error}`);
  }

  return response.json();
}

// Get current API key (synchronous check)
export function getApiKey(): string | null {
  if (typeof window === "undefined") return null;

  // This is a sync check - for actual API calls use getApiClient
  const envKey = import.meta.env.VITE_NETBIRD_API_TOKEN;
  if (envKey) return envKey;

  return null;
}

// ===== SETUP KEYS =====

export interface SetupKey {
  id: string;
  name: string;
  key: string;
  type: "one-off" | "reusable";
  expires_at: string;
  used: boolean;
  auto_groups: string[];
}

export interface CreateSetupKeyRequest {
  name: string;
  type?: "one-off" | "reusable";
  expires_in?: number; // seconds
  auto_groups?: string[];
}

export async function createSetupKey(
  nameOrRequest: string | CreateSetupKeyRequest,
): Promise<string> {
  const name = typeof nameOrRequest === "string" ? nameOrRequest : nameOrRequest.name;

  const response = await apiRequest<{ key: string }>("/setup-keys", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name: name,
      type: "one-off",
      expires_in: 3600, // 1 hour
    }),
  });
  return response.key;
}

export async function deleteSetupKey(keyId: string): Promise<void> {
  await apiRequest(`/setup-keys/${keyId}`, {
    method: "DELETE",
  });
}

export async function listSetupKeys(): Promise<SetupKey[]> {
  return apiRequest<SetupKey[]>("/setup-keys");
}

// ===== PEERS =====

export interface NetBirdPeer {
  id: string;
  name: string;
  ip: string;
  dns_label: string;
  hostname: string;
  os: string;
  version: string;
  groups: string[];
  status: "online" | "offline";
  last_seen: string;
  connected: boolean;
  connection_ip: string;
  user_id: string;
  setup_key_id: string;
}

export async function listPeers(): Promise<NetBirdPeer[]> {
  return apiRequest<NetBirdPeer[]>("/peers");
}

export async function getPeer(peerId: string): Promise<NetBirdPeer> {
  return apiRequest<NetBirdPeer>(`/peers/${peerId}`);
}

// ===== GROUPS =====

export interface NetBirdGroup {
  id: string;
  name: string;
  peers_count: number;
}

export async function listGroups(): Promise<NetBirdGroup[]> {
  return apiRequest<NetBirdGroup[]>("/groups");
}

// ===== INSTALL COMMAND GENERATOR =====

export interface InstallCommandOptions {
  setupKey: string;
  hostname: string;
  server?: string;
}

export function generateInstallCommand(options: InstallCommandOptions): string {
  const { setupKey, hostname, server = "api.netbird.io" } = options;
  return `netbird up --setup-key ${setupKey} --hostname ${hostname} --management-url https://${server}:33073`;
}

export type PfSenseArch = "x86_64" | "aarch64";

export interface NetBirdVersions {
  releaseTag: string;
  netbirdVersion: string;
  pkgVersion: string;
}

/**
 * Fetches the latest release versions from GitHub for pfSense-netbird
 */
export async function fetchLatestNetBirdVersions(): Promise<NetBirdVersions> {
  const response = await fetch("https://api.github.com/repos/netbirdio/pfsense-netbird/releases/latest");
  if (!response.ok) {
    throw new Error(`GitHub API error: ${response.status}`);
  }
  const data = await response.json();
  const releaseTag = data.tag_name;

  // Extract versions from assets
  // Looking for netbird-X.Y.Z-x86_64.pkg and pfSense-pkg-NetBird-A.B.C-x86_64.pkg
  let netbirdVersion = "0.69.0"; // default fallback
  let pkgVersion = "0.2.2"; // default fallback

  const netbirdAsset = data.assets.find((a: any) => 
    a.name.startsWith("netbird-") && a.name.endsWith("-x86_64.pkg")
  );
  if (netbirdAsset) {
    const match = netbirdAsset.name.match(/netbird-(.*)-x86_64\.pkg/);
    if (match) netbirdVersion = match[1];
  }

  const pkgAsset = data.assets.find((a: any) => 
    a.name.startsWith("pfSense-pkg-NetBird-") && a.name.endsWith("-x86_64.pkg")
  );
  if (pkgAsset) {
    const match = pkgAsset.name.match(/pfSense-pkg-NetBird-(.*)-x86_64\.pkg/);
    if (match) pkgVersion = match[1];
  }

  return { releaseTag, netbirdVersion, pkgVersion };
}

export function generatePfSenseInstallScript(
  setupKey: string,
  hostname: string,
  arch: PfSenseArch = "x86_64",
  versions?: NetBirdVersions
): string {
  const RELEASE_TAG = versions?.releaseTag || "v0.1.34";
  const NETBIRD_VERSION = versions?.netbirdVersion || "0.69.0";
  const PKG_VERSION = versions?.pkgVersion || "0.2.2";

  return `#!/bin/sh
# NetBird pfSense Installation Script
# Generated by SysMonitor
# Release: ${RELEASE_TAG} | Architecture: ${arch}

HOSTNAME="${hostname}"
SETUP_KEY="${setupKey}"

echo "Installing NetBird on pfSense (${arch})..."

# Download NetBird packages
fetch https://github.com/netbirdio/pfsense-netbird/releases/download/${RELEASE_TAG}/netbird-${NETBIRD_VERSION}-${arch}.pkg
fetch https://github.com/netbirdio/pfsense-netbird/releases/download/${RELEASE_TAG}/pfSense-pkg-NetBird-${PKG_VERSION}-${arch}.pkg

# Install packages
pkg add -f netbird-${NETBIRD_VERSION}-${arch}.pkg
pkg add -f pfSense-pkg-NetBird-${PKG_VERSION}-${arch}.pkg

# Start NetBird with setup key
netbird up --setup-key "$SETUP_KEY" --hostname "$HOSTNAME"

echo "NetBird installation complete!"
echo "Check status with: netbird status"
echo "Manage via pfSense UI: Services → NetBird"
`;
}


// ===== PROVISIONING STATUS =====

export interface ProvisioningStatus {
  status: "pending" | "connecting" | "connected" | "failed";
  peerId?: string;
  peerIp?: string;
  connectedAt?: string;
  error?: string;
}

export async function checkProvisioningStatus(
  hostname: string,
  setupKeyId: string,
): Promise<ProvisioningStatus> {
  try {
    const peers = await listPeers();

    // Find peer by hostname or setup key
    const peer = peers.find((p) => p.hostname === hostname || p.setup_key_id === setupKeyId);

    if (!peer) {
      return { status: "pending" };
    }

    if (peer.connected) {
      return {
        status: "connected",
        peerId: peer.id,
        peerIp: peer.ip,
        connectedAt: peer.last_seen,
      };
    }

    return {
      status: "connecting",
      peerId: peer.id,
      peerIp: peer.ip,
    };
  } catch (error) {
    return {
      status: "failed",
      error: String(error),
    };
  }
}

// ===== PEER MANAGEMENT =====

export async function updateNetbirdPeer({
  peerId,
  name,
}: {
  peerId: string;
  name: string;
}): Promise<{ success: boolean; error?: string }> {
  try {
    await apiRequest(`/peers/${peerId}`, {
      method: "PUT",
      body: JSON.stringify({ name }),
    });
    return { success: true };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}

// ===== HTTP PROBE =====

export interface ProbeResult {
  ok: boolean;
  status: number | null;
  latencyMs: number;
  detail: string;
}

export async function probeHttp({ url }: { url: string }): Promise<ProbeResult> {
  const start = performance.now();
  try {
    const response = await fetch(url, {
      method: "HEAD",
      mode: "no-cors",
      cache: "no-cache",
    });
    const latencyMs = Math.round(performance.now() - start);
    return {
      ok: response.ok,
      status: response.status,
      latencyMs,
      detail: response.ok ? "OK" : `HTTP ${response.status}`,
    };
  } catch (error) {
    const latencyMs = Math.round(performance.now() - start);
    return {
      ok: false,
      status: null,
      latencyMs,
      detail: error instanceof Error ? error.message : "Network error",
    };
  }
}

// ===== UTILITY =====

export async function testConnection(): Promise<{ success: boolean; error?: string }> {
  try {
    await listPeers();
    return { success: true };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}

export default {
  createSetupKey,
  deleteSetupKey,
  listSetupKeys,
  listPeers,
  getPeer,
  listGroups,
  generateInstallCommand,
  generatePfSenseInstallScript,
  fetchLatestNetBirdVersions,
  checkProvisioningStatus,
  testConnection,
};
