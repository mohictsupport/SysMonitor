// Auto-Provisioning Service
// Manages the flow of creating setup keys and detecting new peers

import {
  createSetupKey,
  deleteSetupKey,
  listPeers,
  generateInstallCommand,
  generatePfSenseInstallScript,
  checkProvisioningStatus,
  type SetupKey,
  type PfSenseArch,
} from "./netbird-api";

// Storage key for provisioning requests
const PROVISIONING_STORAGE_KEY = "sysmonitor.provisioningRequests.v1";
const SITES_STORAGE_KEY = "sysmonitor.sites.v1";

// ===== TYPES =====

export interface ProvisioningRequest {
  id: string;
  siteName: string;
  hostname: string;
  location: string;
  setupKeyId: string;
  setupKey: string;
  createdAt: number;
  expiresAt: number;
  status: "pending" | "connected" | "expired" | "failed";
  peerId?: string;
  peerIp?: string;
  connectedAt?: number;
  error?: string;
}

export interface ProvisionedSite {
  id: string;
  name: string;
  hostname: string;
  location: string;
  netbirdIp: string;
  peerId: string;
  status: "online" | "offline" | "pending";
  provisionedAt: number;
  lastSeenAt?: number;
}

// ===== STORAGE =====

function loadProvisioningRequests(): ProvisioningRequest[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(PROVISIONING_STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

function saveProvisioningRequests(requests: ProvisioningRequest[]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(PROVISIONING_STORAGE_KEY, JSON.stringify(requests));
  } catch {
    // ignore quota errors
  }
}

function loadSites(): ProvisionedSite[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(SITES_STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

function saveSites(sites: ProvisionedSite[]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(SITES_STORAGE_KEY, JSON.stringify(sites));
  } catch {
    // ignore quota errors
  }
}

// ===== PROVISIONING FLOW =====

export interface CreateProvisioningRequest {
  siteName: string;
  location: string;
}

export async function startProvisioning(
  request: CreateProvisioningRequest,
): Promise<{ success: boolean; data?: ProvisioningRequest; error?: string }> {
  try {
    const hostname = generateHostname(request.siteName, request.location);

    // Create setup key in NetBird
    const setupKey = await createSetupKey({
      name: `Provision: ${request.siteName}`,
      type: "one-off",
      expires_in: 3600, // 1 hour
    });

    // Create provisioning request record
    const now = Date.now();
    const provisioningRequest: ProvisioningRequest = {
      id: `prov-${now}`,
      siteName: request.siteName,
      hostname,
      location: request.location,
      setupKeyId: setupKey.id,
      setupKey: setupKey.key,
      createdAt: now,
      expiresAt: now + 3600 * 1000, // 1 hour
      status: "pending",
    };

    // Save to storage
    const requests = loadProvisioningRequests();
    requests.push(provisioningRequest);
    saveProvisioningRequests(requests);

    return { success: true, data: provisioningRequest };
  } catch (error) {
    console.error("Provisioning failed:", error);
    return { success: false, error: String(error) };
  }
}

export function getProvisioningStatus(requestId: string): ProvisioningRequest | undefined {
  const requests = loadProvisioningRequests();
  return requests.find((r) => r.id === requestId);
}

export function getActiveProvisioningRequests(): ProvisioningRequest[] {
  const requests = loadProvisioningRequests();
  const now = Date.now();

  return requests.filter((r) => r.status === "pending" && r.expiresAt > now);
}

export function getProvisionedSites(): ProvisionedSite[] {
  return loadSites();
}

// ===== SYNC & DETECTION =====

export interface SyncResult {
  newSites: ProvisionedSite[];
  updatedStatuses: Array<{ id: string; status: string }>;
  expiredRequests: string[];
}

export async function syncPeersWithSites(): Promise<SyncResult> {
  const result: SyncResult = {
    newSites: [],
    updatedStatuses: [],
    expiredRequests: [],
  };

  try {
    // Get all peers from NetBird
    const peers = await listPeers();

    // Get pending provisioning requests
    const requests = loadProvisioningRequests();
    const sites = loadSites();

    const now = Date.now();

    // Check each pending request
    for (const request of requests) {
      // Check if expired
      if (request.expiresAt < now && request.status === "pending") {
        request.status = "expired";
        result.expiredRequests.push(request.id);
        continue;
      }

      // Skip if already connected
      if (request.status === "connected") continue;

      // Look for matching peer
      const matchingPeer = peers.find(
        (peer) => peer.hostname === request.hostname || peer.setup_key_id === request.setupKeyId,
      );

      if (matchingPeer) {
        // Peer found!
        request.status = "connected";
        request.peerId = matchingPeer.id;
        request.peerIp = matchingPeer.ip;
        request.connectedAt = now;

        // Check if site already exists
        const existingSite = sites.find((s) => s.peerId === matchingPeer.id);

        if (!existingSite) {
          // Create new site
          const newSite: ProvisionedSite = {
            id: `site-${now}-${Math.random().toString(36).slice(2, 8)}`,
            name: request.siteName,
            hostname: request.hostname,
            location: request.location,
            netbirdIp: matchingPeer.ip,
            peerId: matchingPeer.id,
            status: matchingPeer.connected ? "online" : "offline",
            provisionedAt: now,
            lastSeenAt: now,
          };

          sites.push(newSite);
          result.newSites.push(newSite);
        }

        // Update site status
        const site = sites.find((s) => s.peerId === matchingPeer.id);
        if (site) {
          site.status = matchingPeer.connected ? "online" : "offline";
          site.lastSeenAt = now;
          result.updatedStatuses.push({
            id: site.id,
            status: site.status,
          });
        }
      }
    }

    // Save updated data
    saveProvisioningRequests(requests);
    saveSites(sites);

    return result;
  } catch (error) {
    console.error("Sync failed:", error);
    return result;
  }
}

// ===== CLEANUP =====

export async function cleanupExpiredRequests(): Promise<number> {
  const requests = loadProvisioningRequests();
  const now = Date.now();

  const expired = requests.filter(
    (r) => r.status === "expired" || (r.status === "pending" && r.expiresAt < now),
  );

  // Delete setup keys from NetBird
  for (const request of expired) {
    try {
      await deleteSetupKey(request.setupKeyId);
    } catch {
      // Key might already be deleted, ignore
    }
  }

  // Remove from storage
  const active = requests.filter(
    (r) => r.status !== "expired" && !(r.status === "pending" && r.expiresAt < now),
  );

  saveProvisioningRequests(active);

  return expired.length;
}

export function cancelProvisioning(requestId: string): boolean {
  const requests = loadProvisioningRequests();
  const request = requests.find((r) => r.id === requestId);

  if (!request || request.status !== "pending") {
    return false;
  }

  request.status = "expired";
  saveProvisioningRequests(requests);

  // Try to delete the setup key
  deleteSetupKey(request.setupKeyId).catch(() => {
    // Ignore errors
  });

  return true;
}

// ===== UTILITY =====

function generateHostname(siteName: string, location: string): string {
  // Clean and combine site name and location
  const clean = (str: string) =>
    str
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");

  const name = clean(siteName);
  const loc = clean(location);

  return `${name}-${loc}`;
}

export function generateInstallCommands(
  setupKey: string,
  hostname: string,
  pfsenseArch: "x86_64" | "aarch64" = "x86_64"
) {
  return {
    standard: generateInstallCommand({ setupKey, hostname }),
    pfsense: generatePfSenseInstallScript(setupKey, hostname, pfsenseArch),
    docker: `docker run -d --name netbird-client netbirdio/netbird:latest netbird up --setup-key ${setupKey} --hostname ${hostname}`,
    linux: `curl -fsSL https://pkgs.netbird.io/install.sh | sh && netbird up --setup-key ${setupKey} --hostname ${hostname}`,
  };
}

// ===== AUTO-SYNC SETUP =====

let syncInterval: NodeJS.Timeout | null = null;

export function startAutoSync(
  intervalMs: number = 60000, // Default: 1 minute
  onNewSite?: (site: ProvisionedSite) => void,
) {
  stopAutoSync();

  syncInterval = setInterval(async () => {
    const result = await syncPeersWithSites();

    if (result.newSites.length > 0 && onNewSite) {
      result.newSites.forEach(onNewSite);
    }
  }, intervalMs);
}

export function stopAutoSync() {
  if (syncInterval) {
    clearInterval(syncInterval);
    syncInterval = null;
  }
}

export default {
  startProvisioning,
  getProvisioningStatus,
  getActiveProvisioningRequests,
  getProvisionedSites,
  syncPeersWithSites,
  cleanupExpiredRequests,
  cancelProvisioning,
  generateInstallCommands,
  startAutoSync,
  stopAutoSync,
};
