import { useState } from "react";
import type { PendingSite } from "@/lib/site-onboarding";

interface SiteOnboardingPanelProps {
  pendingSites: PendingSite[];
  pendingCount: number;
  autoApprove: boolean;
  onApprove: (siteId: string) => void;
  onReject: (siteId: string) => void;
  onToggleAutoApprove: (enabled: boolean) => void;
}

export function SiteOnboardingPanel({
  pendingSites,
  pendingCount,
  autoApprove,
  onApprove,
  onReject,
  onToggleAutoApprove,
}: SiteOnboardingPanelProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  const [processingId, setProcessingId] = useState<string | null>(null);

  if (pendingCount === 0 && !autoApprove) {
    return (
      <div className="border border-border bg-panel p-4 mx-auto max-w-3xl">
        <div className="flex items-center justify-between">
          <div className="text-center flex-1">
            <h3 className="font-mono text-[10px] font-bold uppercase tracking-widest text-dim">
              Auto-Onboarding
            </h3>
            <p className="mt-1 font-mono text-[10px] text-dim">
              No new sites detected. New NetBird peers will appear here.
            </p>
          </div>
          <label className="flex items-center gap-2 cursor-pointer shrink-0 ml-4">
            <span className="font-mono text-[10px] text-dim">Auto-approve</span>
            <input
              type="checkbox"
              checked={autoApprove}
              onChange={(e) => onToggleAutoApprove(e.target.checked)}
              className="size-4 border border-border bg-void"
            />
          </label>
        </div>
      </div>
    );
  }

  return (
    <div className="border border-border bg-panel mx-auto max-w-3xl">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex w-full items-center justify-center px-4 py-3 hover:bg-foreground/5 relative"
      >
        <div className="flex items-center gap-3">
          <span className="flex size-5 items-center justify-center rounded-full bg-amber font-mono text-[10px] font-bold text-background">
            {pendingCount}
          </span>
          <div className="text-center">
            <h3 className="font-mono text-[10px] font-bold uppercase tracking-widest">
              New Sites Detected
            </h3>
            <p className="font-mono text-[9px] text-dim">
              {pendingCount} NetBird peer{pendingCount !== 1 ? "s" : ""} waiting for approval
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3 absolute right-4">
          <label className="flex items-center gap-2 cursor-pointer">
            <span className="font-mono text-[10px] text-dim">Auto-approve</span>
            <input
              type="checkbox"
              checked={autoApprove}
              onChange={(e) => {
                e.stopPropagation();
                onToggleAutoApprove(e.target.checked);
              }}
              className="size-4 border border-border bg-void"
            />
          </label>
          <span className="font-mono text-[10px] text-dim">{isExpanded ? "▼" : "▶"}</span>
        </div>
      </button>

      {isExpanded && (
        <div className="divide-y divide-border border-t border-border">
          {pendingSites.map((site) => (
            <div key={site.id} className="flex items-center gap-4 px-4 py-3 font-mono text-[11px]">
              <div className="size-2 rounded-full bg-amber" />

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-foreground truncate">{site.name}</span>
                  <span className="text-dim">·</span>
                  <span className="text-dim truncate">{site.netbirdIp}</span>
                </div>
                <div className="text-[10px] text-dim mt-0.5">
                  {site.hostname} · {site.region} · {site.os} {site.version}
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => {
                    setProcessingId(site.id);
                    onApprove(site.id);
                    setTimeout(() => setProcessingId(null), 500);
                  }}
                  disabled={processingId === site.id}
                  className="border border-phosphor/40 bg-phosphor/10 px-3 py-1.5 text-[10px] uppercase tracking-widest text-phosphor transition-colors hover:bg-phosphor/20 disabled:opacity-50"
                >
                  {processingId === site.id ? "..." : "Approve"}
                </button>
                <button
                  onClick={() => onReject(site.id)}
                  className="border border-alert/40 bg-alert/10 px-3 py-1.5 text-[10px] uppercase tracking-widest text-alert transition-colors hover:bg-alert/20"
                >
                  Reject
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
