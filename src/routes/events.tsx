import { createFileRoute } from "@tanstack/react-router";
import { TopNav } from "@/components/TopNav";
import { EventLog } from "@/components/EventLog";
import { useNetbirdSites } from "@/lib/use-netbird";
import { useRealEvents } from "@/lib/use-sites";
import { useHasApiKey } from "@/lib/auth-utils";
import { ApiKeyGate } from "@/components/ApiKeyGate";

export const Route = createFileRoute("/events")({
  head: () => ({
    meta: [
      { title: "Events — SysMonitor" },
      {
        name: "description",
        content: "Full event stream from every site, peer, and probe in your network.",
      },
    ],
  }),
  component: EventsPage,
});

function EventsPage() {
  const hasApiKey = useHasApiKey();
  const { sites } = useNetbirdSites();
  const events = useRealEvents(sites);

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


  return (
    <div className="min-h-dvh bg-background text-foreground">
      <TopNav />
      <main className="mx-auto max-w-[1400px] p-6">
        <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-dim">
          Audit · Continuous
        </p>
        <h1 className="mt-1 mb-6 text-2xl font-medium tracking-tight">Event Stream</h1>
        <EventLog events={events} title={`${events.length} Events · Live Alert Stream`} />
      </main>
    </div>
  );
}
