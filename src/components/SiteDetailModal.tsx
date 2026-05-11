import { useState, useEffect, useCallback } from "react";
import { useQueryClient, useMutation } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { updateNetbirdPeer, probeHttp } from "@/lib/netbird-api";
import type { Site } from "@/lib/sites-data";
import type { ProbeResult } from "@/lib/netbird-api";

export function SiteDetailModal({
  site,
  isOpen,
  onClose,
}: {
  site: Site | null;
  isOpen: boolean;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(site?.name || "");
  const [probeUrl, setProbeUrl] = useState("");
  const [probeResult, setProbeResult] = useState<ProbeResult | null>(null);


  // Reset edit state when site changes
  useEffect(() => {
    setEditName(site?.name || "");
    setIsEditing(false);
    setProbeUrl("");
    setProbeResult(null);
  }, [site]);

  const updateMutation = useMutation({
    mutationFn: async (newName: string) => {
      if (!site) throw new Error("No site selected");
      const result = await updateNetbirdPeer({ peerId: site.id, name: newName });
      if (!result.success) {
        throw new Error(result.error || "Failed to update");
      }
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["netbird", "peers"] });
      setIsEditing(false);
    },
  });

  const probeMutation = useMutation({
    mutationFn: (url: string) => probeHttp({ url }),
    onSuccess: (res) => setProbeResult(res),
    onError: (err) =>
      setProbeResult({
        ok: false,
        status: null,
        latencyMs: 0,
        detail: err instanceof Error ? err.message : "Probe failed",
      }),
  });

  const handleSave = useCallback(() => {
    if (editName.trim() && editName !== site?.name) {
      updateMutation.mutate(editName.trim());
    } else {
      setIsEditing(false);
      setEditName(site?.name || "");
    }
  }, [editName, site?.name, updateMutation]);

  const handleCancel = useCallback(() => {
    setIsEditing(false);
    setEditName(site?.name || "");
  }, [site?.name]);

  if (!site) return null;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="sr-only">Site Details</DialogTitle>
        </DialogHeader>
        <div className="flex flex-wrap items-end justify-between gap-4 border-b border-border pb-6">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-dim">
              {site.region} · NetBird Peer
            </p>
            {isEditing ? (
              <div className="mt-1 flex items-center gap-2">
                <Input
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="h-9 text-lg w-64"
                  disabled={updateMutation.isPending}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleSave();
                    if (e.key === "Escape") handleCancel();
                  }}
                />
                <Button size="sm" onClick={handleSave} disabled={updateMutation.isPending}>
                  Save
                </Button>
                <Button size="sm" variant="ghost" onClick={handleCancel}>
                  Cancel
                </Button>
              </div>
            ) : (
              <h2 className="text-2xl font-semibold">{site.name}</h2>
            )}
          </div>
          <div className="flex items-center gap-2">
            {!isEditing && (
              <Button size="sm" variant="outline" onClick={() => setIsEditing(true)}>
                Edit Name
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
