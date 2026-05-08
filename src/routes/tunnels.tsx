import { createFileRoute, Link } from "@tanstack/react-router";
import { TopNav } from "@/components/TopNav";
import { useNetbirdSites } from "@/lib/use-netbird";
import { useMemo } from "react";
import { WifiOff } from "lucide-react";
import { useHasApiKey } from "@/lib/auth-utils";
import { ApiKeyGate } from "@/components/ApiKeyGate";

export const Route = createFileRoute("/tunnels")({
  head: () => ({
    meta: [
      { title: "Tunnels — SysMonitor" },
      {
        name: "description",
        content: "WireGuard tunnels managed via Netbird across all registered sites.",
      },
      { property: "og:title", content: "Tunnels — SysMonitor" },
      {
        property: "og:description",
        content: "WireGuard tunnels managed via Netbird across all registered sites.",
      },
    ],
  }),
  component: TunnelsPage,
  errorComponent: TunnelsErrorComponent,
});

// Smart error classification: API key, network, or other
function classifyError(error: Error | null): { type: "auth" | "network" | "other"; message: string } {
  if (!error) return { type: "other", message: "" };
  const msg = error.message || "";
  const msgLower = msg.toLowerCase();

  // API Key / Authentication errors
  const isAuthError = msgLower.includes("unauthorized") ||
    msgLower.includes("authentication") ||
    msgLower.includes("api key") ||
    msgLower.includes("token") ||
    msgLower.includes("expired") ||
    msgLower.includes("invalid") ||
    msgLower.includes("iso-8859") ||
    msgLower.includes("headers") ||
    msgLower.includes("401") ||
    msgLower.includes("403");

  if (isAuthError) {
    return { type: "auth", message: "API key error: Your API key may be invalid, expired, or missing. Please check your API key in Settings." };
  }

  // Network errors - only true network failures
  const isNetworkError = (msgLower.includes("failed to fetch") ||
    msgLower.includes("networkerror") ||
    msgLower.includes("network request failed") ||
    msgLower.includes("econnrefused") ||
    msgLower.includes("etimedout") ||
    msgLower.includes("enotfound") ||
    msgLower.includes("offline")) &&
    !navigator.onLine;

  if (isNetworkError || !navigator.onLine) {
    return { type: "network", message: "No internet connection. Please check your network and try again." };
  }

  return { type: "other", message: msg };
}

function TunnelsErrorComponent({ error }: { error: Error }) {
  const errorInfo = classifyError(error);

  return (
    <div className="min-h-dvh bg-background text-foreground">
      <TopNav />
      <main className="mx-auto max-w-[1400px] p-6">
        <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-dim">
          Mesh Control · Netbird
        </p>
        <h1 className="mt-1 text-2xl font-medium tracking-tight">Encrypted Tunnels</h1>

        <div className="mt-8 flex flex-col items-center justify-center rounded-lg border border-alert/30 bg-alert/5 p-8 text-center">
          <WifiOff className="h-12 w-12 text-alert mb-4" />
          <h2 className="text-lg font-semibold text-alert">
            {errorInfo.type === "auth" ? "API Key Error" : 
             errorInfo.type === "network" ? "No Internet Connection" : 
             "Unable to Load Tunnels"}
          </h2>
          <p className="mt-2 max-w-md text-sm text-dim">
            {errorInfo.type === "auth" 
              ? errorInfo.message
              : errorInfo.type === "network"
                ? "Please check your internet connection and try again. The app will automatically reconnect when the network is available."
                : "An unexpected error occurred while loading tunnel data. Please try again."}
          </p>
          {errorInfo.type !== "auth" && (
            <p className="mt-4 font-mono text-[10px] text-dim/60">
              {error.message}
            </p>
          )}
        </div>
      </main>
    </div>
  );
}

function TunnelsPage() {
  const hasApiKey = useHasApiKey();
  const { sites, loading, error } = useNetbirdSites();

  const connected = sites.filter((s) => s.netbirdConnected).length;

  // Smart error message
  const errorInfo = useMemo(() => classifyError(error), [error]);

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
          Mesh Control · Netbird
        </p>
        <h1 className="mt-1 text-2xl font-medium tracking-tight">Encrypted Tunnels</h1>
        <p className="mt-2 max-w-2xl text-sm text-dim">
          Each site is reachable via a Netbird-managed WireGuard tunnel. Probes (HTTP, ICMP, TCP)
          run inside the tunnel so private hosts stay private.
        </p>

        {error && (
          <div className="mt-4 border border-alert/40 bg-alert/10 px-4 py-3 font-mono text-[11px] text-alert">
            {errorInfo.message}
          </div>
        )}

        <div className="mt-6 grid grid-cols-2 gap-px border border-border bg-border md:grid-cols-4">
          <Tile label="Active Tunnels" value={`${connected}`} unit={`/ ${sites.length}`} />
          <Tile label="Protocol" value="WireGuard" />
          <Tile label="Cipher" value="ChaCha20" />
          <Tile label="Source" value="NetBird" />
        </div>

        <div className="mt-8 border border-border bg-panel">
          <header className="flex items-center justify-between border-b border-border px-4 py-3">
            <h2 className="font-mono text-[10px] font-bold uppercase tracking-widest text-dim">
              Peer Roster
            </h2>
            <span className="font-mono text-[10px] uppercase tracking-widest text-dim">
              {sites.length} peers
            </span>
          </header>
          <div className="divide-y divide-border">
            {loading && sites.length === 0 && (
              <div className="px-4 py-12 text-center font-mono text-[11px] text-dim">
                Connecting to NetBird API…
              </div>
            )}
            {sites.map((s) => (
              <div
                key={s.id}
                className="grid grid-cols-1 items-center gap-3 px-4 py-3 font-mono text-[11px] md:grid-cols-12"
              >
                <Link
                  to="/sites/$siteId"
                  params={{ siteId: s.id }}
                  className="col-span-3 truncate text-foreground hover:text-phosphor"
                >
                  {s.name}
                </Link>
                <div className="col-span-2 text-dim">{s.region}</div>
                {/* NetBird IP hidden for security */}
                <div className="col-span-3 text-dim">—</div>
                <div className="col-span-2 text-dim">UDP 51820</div>
                <div className="col-span-2 text-right">
                  {s.netbirdConnected ? (
                    <span className="text-phosphor">● Connected</span>
                  ) : (
                    <span className="text-alert">● Down</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}

function Tile({ label, value, unit }: { label: string; value: string; unit?: string }) {
  return (
    <div className="bg-panel p-4">
      <div className="font-mono text-[10px] uppercase tracking-widest text-dim">{label}</div>
      <div className="mt-1 font-mono text-2xl tabular-nums text-foreground">
        {value}
        {unit && <span className="ml-1 text-xs text-dim">{unit}</span>}
      </div>
    </div>
  );
}
