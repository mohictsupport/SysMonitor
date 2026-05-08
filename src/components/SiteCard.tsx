import { Link } from "@tanstack/react-router";
import type { Site } from "@/lib/sites-data";
import { StatusDot, statusLabel } from "./StatusIndicator";
import { LatencySparkline } from "./LatencySparkline";
import { OSIcon } from "./OSIcon";

interface SiteCardProps {
  site: Site;
  onClick?: () => void;
}

// Smart time ago formatter
function formatTimeAgo(isoString: string | null): string {
  if (!isoString) return "—";

  const date = new Date(isoString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();

  // Future date (shouldn't happen, but handle it)
  if (diffMs < 0) return "just now";

  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);
  const diffWeek = Math.floor(diffDay / 7);
  const diffMonth = Math.floor(diffDay / 30);

  if (diffSec < 60) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHour < 24) return `${diffHour}h ago`;
  if (diffDay < 7) return `${diffDay}d ago`;
  if (diffWeek < 4) return `${diffWeek}w ago`;
  if (diffMonth < 12) return `${diffMonth}mo ago`;

  const diffYear = Math.floor(diffMonth / 12);
  return `${diffYear}y ago`;
}

export function SiteCard({ site, onClick }: SiteCardProps) {
  const sparkColor =
    site.status === "offline" ? "alert" : site.status === "degraded" ? "amber" : "phosphor";

  const netbirdState = site.netbirdConnected
    ? site.status === "offline"
      ? "Reconnecting..."
      : "Connected"
    : "Disconnected";

  const netbirdClass = site.netbirdConnected
    ? site.status === "offline"
      ? "text-amber"
      : "text-phosphor"
    : "text-alert";

  // For online sites, show "Online now" instead of connection time
  const lastSeenText = site.netbirdConnected
    ? "Online now"
    : formatTimeAgo(site.lastSeen);

  const cardContent = (
    <>
      <div className="mb-4 flex items-start justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="truncate font-medium text-foreground">{site.name}</h3>
            <OSIcon os={site.os} size="sm" />
          </div>
          <div className="flex items-center gap-1.5">
            {/* NetBird IP hidden for security */}
            <code className="font-mono text-[10px] text-dim">{site.region}</code>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <StatusDot status={site.status} />
          <span className="font-mono text-[10px] uppercase tracking-widest text-dim">
            {statusLabel(site.status)}
          </span>
        </div>
      </div>

      <LatencySparkline data={site.history} color={sparkColor} height={48} />

      <div className="mt-4 grid grid-cols-4 gap-3 font-mono text-[11px]">
        <div>
          <div className="text-[9px] uppercase tracking-widest text-dim">Latency</div>
          <div
            className={
              site.status === "offline"
                ? "text-alert"
                : site.status === "degraded"
                  ? "text-amber"
                  : "text-foreground"
            }
          >
            {site.status === "offline" ? "TIMEOUT" : `${site.latencyMs}ms`}
          </div>
        </div>
        <div>
          <div className="text-[9px] uppercase tracking-widest text-dim">Uptime</div>
          <div className="text-foreground tabular-nums">{site.uptime.toFixed(2)}%</div>
        </div>
        <div>
          <div className="text-[9px] uppercase tracking-widest text-dim">Last Seen</div>
          <div className="text-dim">{lastSeenText}</div>
        </div>
        <div>
          <div className="text-[9px] uppercase tracking-widest text-dim">Netbird</div>
          <div className={netbirdClass}>{netbirdState}</div>
        </div>
      </div>
    </>
  );

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className="group block w-full text-left bg-panel p-5 transition-colors hover:bg-panel-2 cursor-pointer"
      >
        {cardContent}
      </button>
    );
  }

  return (
    <Link
      to="/sites/$siteId"
      params={{ siteId: site.id }}
      className="group block bg-panel p-5 transition-colors hover:bg-panel-2"
    >
      {cardContent}
    </Link>
  );
}
