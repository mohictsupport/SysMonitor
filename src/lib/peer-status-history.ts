// Peer status history tracking - stores connect/disconnect events
import { sendSiteStatusNotification } from "./electron-notifications";

export interface StatusEvent {
  ts: number; // timestamp
  status: "connected" | "disconnected" | "degraded";
  latencyMs?: number;
  note?: string;
}

export interface PeerStatusHistory {
  peerId: string;
  peerName: string;
  events: StatusEvent[];
}

const STORAGE_KEY = "sysmonitor.peerStatusHistory.v1";

// Load all peer status histories from localStorage
export function loadPeerStatusHistory(): Record<string, PeerStatusHistory> {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as Record<string, PeerStatusHistory>;
  } catch {
    return {};
  }
}

// Save peer status histories to localStorage
export function savePeerStatusHistory(history: Record<string, PeerStatusHistory>): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
  } catch {
    // ignore quota errors
  }
}

// Record a status change for a peer
export function recordPeerStatus(
  peerId: string,
  peerName: string,
  status: "connected" | "disconnected" | "degraded",
  latencyMs?: number,
  note?: string,
  peerLocation?: string,
): void {
  const history = loadPeerStatusHistory();

  if (!history[peerId]) {
    history[peerId] = {
      peerId,
      peerName,
      events: [],
    };
  }

  // Check if this is actually a change from the last status
  const lastEvent = history[peerId].events[history[peerId].events.length - 1];
  if (lastEvent && lastEvent.status === status) {
    // Same status, just update the timestamp but don't create a new event
    lastEvent.ts = Date.now();
    if (latencyMs !== undefined) lastEvent.latencyMs = latencyMs;
    savePeerStatusHistory(history);
    return;
  }

  // Add new event
  history[peerId].events.push({
    ts: Date.now(),
    status,
    latencyMs,
    note,
  });

  // Keep only last 100 events per peer
  if (history[peerId].events.length > 100) {
    history[peerId].events = history[peerId].events.slice(-100);
  }

  savePeerStatusHistory(history);

  // Send deduplicated Telegram notification for status changes
  // Map peer status to online/offline format
  const siteStatus: "online" | "offline" = status === "connected" ? "online" : "offline";
  sendSiteStatusNotification(peerId, peerName, siteStatus, peerLocation);
}

// Get status history for a specific peer
export function getPeerStatusHistory(peerId: string): PeerStatusHistory | null {
  const history = loadPeerStatusHistory();
  return history[peerId] || null;
}

// Get uptime percentage for a time range
export function calculateUptime(events: StatusEvent[], startTs: number, endTs: number): number {
  if (events.length === 0) return 100;

  const relevantEvents = events.filter((e) => e.ts >= startTs && e.ts <= endTs);
  if (relevantEvents.length === 0) return 100;

  let connectedTime = 0;
  let totalTime = endTs - startTs;

  for (let i = 0; i < relevantEvents.length; i++) {
    const event = relevantEvents[i];
    const nextEvent = relevantEvents[i + 1];
    const segmentEnd = nextEvent ? nextEvent.ts : endTs;

    if (event.status === "connected") {
      connectedTime += segmentEnd - event.ts;
    }
  }

  return Math.round((connectedTime / totalTime) * 1000) / 10;
}

// Get current status duration (how long peer has been in current state)
export function getCurrentStatusDuration(events: StatusEvent[]): string {
  if (events.length === 0) return "Unknown";

  const lastEvent = events[events.length - 1];
  const durationMs = Date.now() - lastEvent.ts;

  const minutes = Math.floor(durationMs / 60000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}d ${hours % 24}h`;
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  return `${minutes}m`;
}

// Format timeline for display
export function formatStatusTimeline(events: StatusEvent[], maxEvents: number = 20): StatusEvent[] {
  return events.slice(-maxEvents).reverse();
}
