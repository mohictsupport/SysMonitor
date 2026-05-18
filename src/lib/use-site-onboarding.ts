import { useState, useEffect, useCallback } from "react";
import type { Site } from "./sites-data";
import { 
  listNetbirdPeers, 
  updateNetbirdPeer, 
  listNetbirdGroups, 
  createNetbirdGroup, 
  type NetbirdPeerLite 
} from "./netbird.functions";
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
        setupKeyId: p.setupKeyId,
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

          // Asynchronously update name and assign group in the background
          (async () => {
            try {
              let targetGroupIds: string[] = [];
              if (peer.region && peer.region !== "UNKNOWN") {
                const groupsResult = await listNetbirdGroups();
                let regionGroup = groupsResult.groups?.find(
                  (g: any) => g.name.toLowerCase() === peer.region.toLowerCase(),
                );
                let groupId = regionGroup?.id;

                if (!groupId) {
                  const createResult = await createNetbirdGroup({ name: peer.region });
                  if (createResult.success && createResult.groupId) {
                    groupId = createResult.groupId;
                  }
                }

                if (groupId) {
                  targetGroupIds.push(groupId);
                }
              }

              await updateNetbirdPeer({
                peerId: peer.id,
                name: peer.name,
                groups: targetGroupIds.length > 0 ? targetGroupIds : undefined,
              });
              console.log(`[Auto-Onboard] Successfully synchronized peer ${peer.id} with group and name on NetBird`);
            } catch (err) {
              console.error(`[Auto-Onboard] Background sync failed for peer ${peer.id}:`, err);
            }
          })();
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
    async (siteId: string) => {
      const pending = pendingSites.find((p) => p.id === siteId);
      if (!pending) return null;

      // Programmatically synchronize name and group to NetBird API on manual approval
      try {
        console.log(`[Onboarding] Approving and updating peer ${pending.id} to NetBird:`, { name: pending.name, region: pending.region });
        let targetGroupIds: string[] = [];
        
        if (pending.region && pending.region !== "UNKNOWN") {
          const groupsResult = await listNetbirdGroups();
          let regionGroup = groupsResult.groups?.find(
            (g: any) => g.name.toLowerCase() === pending.region.toLowerCase(),
          );
          let groupId = regionGroup?.id;

          if (!groupId) {
            console.log(`[Onboarding] Creating region group: ${pending.region}`);
            const createResult = await createNetbirdGroup({ name: pending.region });
            if (createResult.success && createResult.groupId) {
              groupId = createResult.groupId;
            }
          }

          if (groupId) {
            targetGroupIds.push(groupId);
          }
        }

        const updateRes = await updateNetbirdPeer({
          peerId: pending.id,
          name: pending.name,
          groups: targetGroupIds.length > 0 ? targetGroupIds : undefined,
        });

        if (updateRes.success) {
          console.log(`[Onboarding] Peer naming and region grouping updated on NetBird`);
        } else {
          console.warn(`[Onboarding] Peer updates partially failed on NetBird:`, updateRes.error);
        }
      } catch (err) {
        console.error(`[Onboarding] Error synchronizing peer to NetBird during approval:`, err);
      }

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
