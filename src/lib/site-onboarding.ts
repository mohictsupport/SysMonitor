// Auto-onboarding system for new NetBird peers

import type { Site } from "./sites-data";
import { saveProvisioningEntry } from "./firebase-store";
import { auth } from "./firebase";

export interface PendingSite {
  id: string;
  name: string;
  hostname: string;
  netbirdIp: string;
  region: string;
  os: string;
  version: string;
  detectedAt: number;
  status: "pending" | "approved" | "rejected" | "provisioning";
  groups: string[];
  setupKey?: string;
  setupKeyId?: string;
  provisioningLocation?: string;
  provisioningCreatedAt?: number;
}

const ONBOARDING_STORAGE_KEY = "sysmonitor.pendingSites.v1";
const AUTO_APPROVE_KEY = "sysmonitor.autoApproveSites";

// Load pending sites from localStorage
export function loadPendingSites(): PendingSite[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(ONBOARDING_STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as PendingSite[];
  } catch {
    return [];
  }
}

// Save pending sites to localStorage
export function savePendingSites(sites: PendingSite[]): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(ONBOARDING_STORAGE_KEY, JSON.stringify(sites));
  } catch {
    // ignore quota errors
  }
}

// Add a new pending site for provisioning
export function addPendingSite(data: {
  name: string;
  location: string;
  setupKey: string;
  setupKeyId?: string;
  status?: "pending" | "provisioning";
  createdAt?: number;
}): PendingSite {
  const sites = loadPendingSites();

  const newSite: PendingSite = {
    id: crypto.randomUUID(),
    name: data.name,
    hostname: data.name.toLowerCase().replace(/\s+/g, "-"),
    netbirdIp: "", // Will be filled when peer connects
    region: data.location,
    os: "",
    version: "",
    detectedAt: data.createdAt || Date.now(),
    status: data.status || "provisioning",
    groups: [],
    setupKey: data.setupKey,
    setupKeyId: data.setupKeyId,
    provisioningLocation: data.location,
    provisioningCreatedAt: data.createdAt || Date.now(),
  };

  sites.push(newSite);
  savePendingSites(sites);

  // Sync to Firestore if user is authenticated
  const user = auth.currentUser;
  if (user) {
    saveProvisioningEntry({
      setupKey: data.setupKey,
      siteName: data.name,
      location: data.location,
      hostname: newSite.hostname,
      status: data.status || "provisioning",
      userId: user.uid,
    }).catch((error) => {
      console.error("Failed to save provisioning entry to Firestore:", error);
    });
  }

  return newSite;
}

// Check if auto-approve is enabled
export function isAutoApproveEnabled(): boolean {
  if (typeof window === "undefined") return false;
  return localStorage.getItem(AUTO_APPROVE_KEY) === "true";
}

// Toggle auto-approve
export function setAutoApproveEnabled(enabled: boolean): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(AUTO_APPROVE_KEY, enabled ? "true" : "false");
}

// Detect new peers from NetBird that aren't in sites or pending
export function detectNewPeers(
  netbirdPeers: Array<{
    id: string;
    name: string;
    hostname: string;
    netbirdIp: string;
    region: string;
    os: string;
    version: string;
    groups: string[];
    setupKeyId?: string;
  }>,
  existingSites: Site[],
  pendingSites: PendingSite[],
): PendingSite[] {
  const existingIds = new Set(existingSites.map((s) => s.id));
  const pendingIds = new Set(pendingSites.map((p) => p.id));

  const newPeers: PendingSite[] = [];

  // First, check if any new peers match provisioning sites (by setupKeyId or hostname)
  for (const peer of netbirdPeers) {
    const provisioningMatch = pendingSites.find(
      (p) =>
        p.status === "provisioning" &&
        ((p.setupKeyId && peer.setupKeyId && p.setupKeyId === peer.setupKeyId) ||
          p.hostname.toLowerCase() === peer.name.toLowerCase() ||
          p.hostname.toLowerCase() === peer.hostname.toLowerCase()),
    );

    if (provisioningMatch) {
      // Update the provisioning site with the peer's details
      provisioningMatch.id = peer.id;
      provisioningMatch.netbirdIp = peer.netbirdIp;
      provisioningMatch.os = peer.os;
      provisioningMatch.version = peer.version;
      provisioningMatch.groups = peer.groups;
      provisioningMatch.detectedAt = Date.now();
      // Keep it as provisioning - user will approve it
      console.log(`[Provisioning] Matched peer ${peer.name} to provisioning request`);
    }
  }

  // Then detect truly new peers
  for (const peer of netbirdPeers) {
    // Skip if already a site or already pending/rejected
    if (existingIds.has(peer.id)) continue;
    if (pendingIds.has(peer.id)) {
      // Check if existing pending is rejected - don't re-add
      const existing = pendingSites.find((p) => p.id === peer.id);
      if (existing?.status === "rejected") continue;
      continue;
    }

    // Skip if it's a provisioning match (already handled above)
    const isProvisioningMatch = pendingSites.some(
      (p) =>
        p.status === "provisioning" &&
        ((p.setupKeyId && peer.setupKeyId && p.setupKeyId === peer.setupKeyId) ||
          p.hostname.toLowerCase() === peer.name.toLowerCase() ||
          p.hostname.toLowerCase() === peer.hostname.toLowerCase()),
    );
    if (isProvisioningMatch) continue;

    newPeers.push({
      id: peer.id,
      name: peer.name,
      hostname: peer.hostname,
      netbirdIp: peer.netbirdIp,
      region: peer.region,
      os: peer.os,
      version: peer.version,
      detectedAt: Date.now(),
      status: "pending",
      groups: peer.groups,
      setupKeyId: peer.setupKeyId,
    });
  }

  return newPeers;
}

// Approve a pending site and return Site object
export function approvePendingSite(
  pending: PendingSite,
  pendingSites: PendingSite[],
): { updatedPending: PendingSite[]; newSite: Site } {
  const ts = Date.now();

  const newSite: Site = {
    id: pending.id,
    name: pending.name,
    hostname: pending.hostname,
    region: pending.region,
    ipv4: "—",
    netbirdIp: pending.netbirdIp,
    status: "online",
    uptime: 100,
    latencyMs: 0,
    packetLoss: 0,
    netbirdConnected: true,
    sslDaysLeft: 0,
    lastCheckedAt: ts,
    history: Array.from({ length: 24 }).map((_, i) => ({
      t: ts - (23 - i) * 60_000,
      ms: 0,
    })),
    checks: [
      {
        type: "icmp",
        label: "NetBird Peer",
        ok: true,
        detail: `Auto-onboarded · ${pending.os} ${pending.version}`,
      },
    ],
    tags: pending.groups.length > 0 ? pending.groups : ["auto-onboarded"],
  };

  // Mark as approved in pending list
  const updatedPending = pendingSites.map((p) =>
    p.id === pending.id ? { ...p, status: "approved" as const } : p,
  );

  return { updatedPending, newSite };
}

// Reject a pending site
export function rejectPendingSite(siteId: string, pendingSites: PendingSite[]): PendingSite[] {
  return pendingSites.map((p) => (p.id === siteId ? { ...p, status: "rejected" as const } : p));
}

// Clear old approved/rejected sites (keep for 7 days)
export function cleanupPendingSites(pendingSites: PendingSite[]): PendingSite[] {
  const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000; // 7 days ago
  return pendingSites.filter((p) => p.status === "pending" || p.detectedAt > cutoff);
}

// Get pending count
export function getPendingCount(pendingSites: PendingSite[]): number {
  return pendingSites.filter((p) => p.status === "pending").length;
}
