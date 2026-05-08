import { useEffect, useState } from "react";
import type { Site } from "@/lib/sites-data";
import {
  type PeerStatusHistory,
  type StatusEvent,
  getPeerStatusHistory,
  recordPeerStatus,
  getCurrentStatusDuration,
  formatStatusTimeline,
} from "@/lib/peer-status-history";

interface PeerStatusTimelineProps {
  site: Site;
}

export function PeerStatusTimeline({ site }: PeerStatusTimelineProps) {
  const [history, setHistory] = useState<PeerStatusHistory | null>(null);
  const [isExpanded, setIsExpanded] = useState(false);

  // Record current status and load history
  useEffect(() => {
    const status = site.netbirdConnected
      ? "connected"
      : site.status === "degraded"
        ? "degraded"
        : "disconnected";

    recordPeerStatus(
      site.id,
      site.name,
      status,
      site.latencyMs,
      site.checks.map((c) => c.detail).join("; "),
      site.region,
    );

    setHistory(getPeerStatusHistory(site.id));
  }, [site]);

  if (!history || history.events.length === 0) {
    return (
      <div className="border border-border bg-panel p-4">
        <h3 className="font-mono text-[10px] font-bold uppercase tracking-widest text-dim">
          Status Timeline
        </h3>
        <p className="mt-2 font-mono text-[10px] text-dim">
          No history recorded yet. Timeline will populate as peer status changes.
        </p>
      </div>
    );
  }

  const lastEvent = history.events[history.events.length - 1];
  const currentDuration = getCurrentStatusDuration(history.events);
  const displayEvents = isExpanded
    ? formatStatusTimeline(history.events, 50)
    : formatStatusTimeline(history.events, 10);

  return (
    <div className="border border-border bg-panel p-4">
      <div className="flex items-start justify-between">
        <div>
          <h3 className="font-mono text-[10px] font-bold uppercase tracking-widest text-dim">
            Status Timeline
          </h3>
          <p className="mt-1 font-mono text-[10px] text-dim">
            {history.events.length} events recorded
          </p>
        </div>
        <div className="text-right">
          <div className="flex items-center gap-2">
            <StatusDot status={lastEvent.status} />
            <span className="font-mono text-[11px] uppercase">{lastEvent.status}</span>
          </div>
          <p className="font-mono text-[10px] text-dim">for {currentDuration}</p>
        </div>
      </div>

      {/* Timeline visualization */}
      <div className="mt-4">
        <TimelineBar events={history.events} />
      </div>

      {/* Event list */}
      <div className="mt-4 space-y-1">
        {displayEvents.map((event, index) => (
          <TimelineEvent key={`${event.ts}-${index}`} event={event} />
        ))}
      </div>

      {history.events.length > 10 && (
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="mt-3 w-full border border-border py-2 font-mono text-[10px] uppercase tracking-widest text-dim transition-colors hover:text-foreground"
        >
          {isExpanded ? "Show Less ↑" : `Show All ${history.events.length} Events ↓`}
        </button>
      )}
    </div>
  );
}

function StatusDot({ status }: { status: string }) {
  const colorClass =
    status === "connected" ? "bg-phosphor" : status === "degraded" ? "bg-amber" : "bg-alert";
  return <span className={`size-2 rounded-full ${colorClass}`} />;
}

function TimelineEvent({ event }: { event: StatusEvent }) {
  const date = new Date(event.ts);
  const timeStr = date.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const dateStr = date.toLocaleDateString([], {
    month: "short",
    day: "numeric",
  });

  const statusClass =
    event.status === "connected"
      ? "text-phosphor"
      : event.status === "degraded"
        ? "text-amber"
        : "text-alert";

  return (
    <div className="flex items-center gap-3 py-1 font-mono text-[10px]">
      <StatusDot status={event.status} />
      <span className={`w-20 uppercase ${statusClass}`}>{event.status}</span>
      <span className="text-dim w-24">{dateStr}</span>
      <span className="text-foreground">{timeStr}</span>
      {event.latencyMs !== undefined && event.latencyMs > 0 && (
        <span className="text-dim ml-auto">{event.latencyMs}ms</span>
      )}
    </div>
  );
}

function TimelineBar({ events }: { events: StatusEvent[] }) {
  // Show last 24 hours of status as a visual bar
  const now = Date.now();
  const dayAgo = now - 24 * 60 * 60 * 1000;
  const recentEvents = events.filter((e) => e.ts >= dayAgo);

  if (recentEvents.length === 0) {
    return <div className="h-6 w-full rounded bg-dim/20" title="No data in last 24h" />;
  }

  // Create segments for the timeline
  const segments: { status: string; width: number }[] = [];

  for (let i = 0; i < recentEvents.length; i++) {
    const event = recentEvents[i];
    const nextEvent = recentEvents[i + 1];
    const segmentStart = Math.max(event.ts, dayAgo);
    const segmentEnd = nextEvent ? nextEvent.ts : now;
    const width = ((segmentEnd - segmentStart) / (now - dayAgo)) * 100;

    segments.push({
      status: event.status,
      width: Math.max(width, 0.5), // Minimum width for visibility
    });
  }

  return (
    <div className="flex h-6 w-full overflow-hidden rounded">
      {segments.map((seg, i) => (
        <div
          key={i}
          className={`${
            seg.status === "connected"
              ? "bg-phosphor"
              : seg.status === "degraded"
                ? "bg-amber"
                : "bg-alert"
          }`}
          style={{ width: `${seg.width}%` }}
          title={`${seg.status}: ${seg.width.toFixed(1)}%`}
        />
      ))}
    </div>
  );
}
