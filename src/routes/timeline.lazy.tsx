import { createLazyFileRoute, Link } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { TopNav } from "@/components/TopNav";
import { useNetbirdSites } from "@/lib/use-netbird";
import { useHasApiKey } from "@/lib/auth-utils";
import { ApiKeyGate } from "@/components/ApiKeyGate";
import {
  loadPeerStatusHistory,
  type PeerStatusHistory,
  type StatusEvent,
} from "@/lib/peer-status-history";

export const Route = createLazyFileRoute("/timeline")({
  head: () => ({
    meta: [
      { title: "Timeline — SysMonitor" },
      {
        name: "description",
        content: "Peer status timeline and connection history across your network.",
      },
    ],
  }),
  component: TimelinePage,
});

function TimelinePage() {
  const hasApiKey = useHasApiKey();
  const { sites } = useNetbirdSites();

  const [histories, setHistories] = useState<Record<string, PeerStatusHistory>>({});
  const [selectedPeer, setSelectedPeer] = useState<string | "all">("all");

  useEffect(() => {
    setHistories(loadPeerStatusHistory());
  }, [sites]);

  // If no API key, show the gate
  if (!hasApiKey) {
    return (
      <div className="min-h-dvh bg-background text-foreground">
        <TopNav />
        <main className="mx-auto max-w-[1400px] p-6">
          <ApiKeyGate />
        </main>
      </div>
    );
  }


  // Collect all events from all peers
  const allEvents: Array<{
    peerId: string;
    peerName: string;
    event: StatusEvent;
  }> = [];

  Object.values(histories).forEach((history) => {
    history.events.forEach((event) => {
      allEvents.push({
        peerId: history.peerId,
        peerName: history.peerName,
        event,
      });
    });
  });

  // Sort by timestamp descending
  allEvents.sort((a, b) => b.event.ts - a.event.ts);

  // Filter by selected peer
  const filteredEvents =
    selectedPeer === "all" ? allEvents : allEvents.filter((e) => e.peerId === selectedPeer);

  // Stats
  const totalEvents = allEvents.length;
  const disconnections = allEvents.filter((e) => e.event.status === "disconnected").length;
  const connectedNow = sites.filter((s) => s.netbirdConnected).length;

  return (
    <div className="min-h-dvh bg-background text-foreground">
      <TopNav />
      <main className="mx-auto max-w-[1400px] p-6">
        {/* Header */}
        <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-dim">
              Network · History
            </p>
            <h1 className="mt-1 text-2xl font-medium tracking-tight">Peer Status Timeline</h1>
          </div>

          <div className="flex items-center gap-4">
            <select
              value={selectedPeer}
              onChange={(e) => setSelectedPeer(e.target.value)}
              className="border border-border bg-background px-3 py-2 font-mono text-[11px] text-foreground focus:border-phosphor focus:outline-none"
            >
              <option value="all">All Peers</option>
              {sites.map((site) => (
                <option key={site.id} value={site.id}>
                  {site.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Stats */}
        <div className="mb-8 grid grid-cols-3 gap-px border border-border bg-border">
          <StatTile label="Total Events" value={totalEvents.toString()} />
          <StatTile label="Disconnections" value={disconnections.toString()} tone="alert" />
          <StatTile label="Connected Now" value={`${connectedNow}/${sites.length}`} tone="ok" />
        </div>

        {/* Timeline */}
        <div className="border border-border bg-panel">
          <div className="border-b border-border px-4 py-3">
            <h2 className="font-mono text-[11px] font-bold uppercase tracking-widest text-dim">
              Event History
              {selectedPeer !== "all" && (
                <span className="ml-2 text-phosphor">
                  ({sites.find((s) => s.id === selectedPeer)?.name || selectedPeer})
                </span>
              )}
            </h2>
          </div>

          {filteredEvents.length === 0 ? (
            <div className="p-12 text-center font-mono text-[11px] text-dim">
              No events recorded yet. Timeline will populate as peer status changes.
            </div>
          ) : (
            <div className="divide-y divide-border">
              {filteredEvents.slice(0, 100).map((item, index) => (
                <EventRow
                  key={`${item.peerId}-${item.event.ts}-${index}`}
                  peerId={item.peerId}
                  peerName={item.peerName}
                  event={item.event}
                />
              ))}
            </div>
          )}

          {filteredEvents.length > 100 && (
            <div className="border-t border-border px-4 py-3 text-center font-mono text-[10px] text-dim">
              + {filteredEvents.length - 100} more events
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

function StatTile({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string;
  tone?: "neutral" | "ok" | "alert";
}) {
  const valueClass =
    tone === "ok" ? "text-phosphor" : tone === "alert" ? "text-alert" : "text-foreground";

  return (
    <div className="bg-panel p-4">
      <div className="font-mono text-[10px] uppercase tracking-widest text-dim">{label}</div>
      <div className={`mt-1 font-mono text-xl tabular-nums ${valueClass}`}>{value}</div>
    </div>
  );
}

function EventRow({
  peerId,
  peerName,
  event,
}: {
  peerId: string;
  peerName: string;
  event: StatusEvent;
}) {
  const date = new Date(event.ts);
  const timeStr = date.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const dateStr = date.toLocaleDateString([], {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  const statusClass =
    event.status === "connected"
      ? "text-phosphor"
      : event.status === "degraded"
        ? "text-amber"
        : "text-alert";

  const statusDot =
    event.status === "connected"
      ? "bg-phosphor"
      : event.status === "degraded"
        ? "bg-amber"
        : "bg-alert";

  return (
    <div className="flex items-center gap-4 px-4 py-3 font-mono text-[11px]">
      <div className={`size-2 rounded-full ${statusDot}`} />

      <div className="w-24 shrink-0">
        <span className={`uppercase ${statusClass}`}>{event.status}</span>
      </div>

      <Link
        to={`/sites/${peerId}`}
        className="w-40 shrink-0 truncate text-foreground hover:text-phosphor hover:underline"
      >
        {peerName}
      </Link>

      <div className="w-32 shrink-0 text-dim">{dateStr}</div>
      <div className="w-24 shrink-0 text-foreground">{timeStr}</div>

      {event.latencyMs !== undefined && event.latencyMs > 0 && (
        <div className="ml-auto text-dim">{event.latencyMs}ms</div>
      )}
    </div>
  );
}
