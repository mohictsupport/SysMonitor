import { useState, useEffect, useCallback } from "react";
import type { Site } from "./sites-data";
import { listNetbirdPeers, type NetbirdPeerLite } from "./netbird.functions";
import {
  type PendingSite,
  loadPendingSites,
  savePendingSites,
  detectNewPeers,
  approvePendingSite,
  rejectPendingSite,
  cleanupPendingSites,
  isAutoApproveEnabled,
  setAutoApproveEnabled,
  getPendingCount,
} from "./site-onboarding";

interface UseSiteOnboardingOptions {
  netbirdPeers: NetbirdPeerLite[];
  existingSites: Site[];
  onSitesAdded?: (sites: Site[]) => void;
}

export function useSiteOnboarding({
  netbirdPeers,
  existingSites,
  onSitesAdded,
}: UseSiteOnboardingOptions) {
  const [pendingSites, setPendingSites] = useState<PendingSite[]>([]);
  const [autoApprove, setAutoApprove] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  // Load initial state
  useEffect(() => {
    setPendingSites(loadPendingSites());
    setAutoApprove(isAutoApproveEnabled());
    setHydrated(true);
  }, []);

  // Save pending sites when changed
  useEffect(() => {
    if (!hydrated) return;
    savePendingSites(pendingSites);
  }, [pendingSites, hydrated]);

  // Detect new peers on each NetBird sync
  useEffect(() => {
    if (!hydrated || netbirdPeers.length === 0) return;

    const newPeers = detectNewPeers(
      netbirdPeers.map((p) => ({
        id: p.id,
        name: p.name,
        hostname: p.hostname,
        netbirdIp: p.netbirdIp,
        region: p.region,
        os: p.os,
        version: p.version,
        groups: p.groups,
      })),
      existingSites,
      pendingSites,
    );

    if (newPeers.length > 0) {
      // Clean up old entries first
      const cleaned = cleanupPendingSites(pendingSites);

      if (autoApprove) {
        // Auto-approve all new peers
        const approvedSites: Site[] = [];
        let updatedPending = cleaned;

        for (const peer of newPeers) {
          const { updatedPending: up, newSite } = approvePendingSite(peer, updatedPending);
          updatedPending = up;
          approvedSites.push(newSite);
        }

        setPendingSites(updatedPending);
        if (approvedSites.length > 0 && onSitesAdded) {
          onSitesAdded(approvedSites);
        }
      } else {
        // Add to pending queue
        setPendingSites([...newPeers, ...cleaned]);
      }
    }
  }, [netbirdPeers, existingSites, hydrated, autoApprove, onSitesAdded]);

  // Approve a pending site
  const approveSite = useCallback(
    (siteId: string) => {
      const pending = pendingSites.find((p) => p.id === siteId);
      if (!pending) return null;

      const { updatedPending, newSite } = approvePendingSite(pending, pendingSites);
      setPendingSites(updatedPending);

      if (onSitesAdded) {
        onSitesAdded([newSite]);
      }

      return newSite;
    },
    [pendingSites, onSitesAdded],
  );

  // Reject a pending site
  const rejectSite = useCallback((siteId: string) => {
    setPendingSites((prev) => rejectPendingSite(siteId, prev));
  }, []);

  // Toggle auto-approve
  const toggleAutoApprove = useCallback((enabled: boolean) => {
    setAutoApproveEnabled(enabled);
    setAutoApprove(enabled);
  }, []);

  // Get pending count
  const pendingCount = getPendingCount(pendingSites);

  // Get only pending sites (not approved/rejected)
  const pendingOnly = pendingSites.filter((p) => p.status === "pending");

  return {
    pendingSites: pendingOnly,
    pendingCount,
    autoApprove,
    approveSite,
    rejectSite,
    toggleAutoApprove,
    hydrated,
  };
}
