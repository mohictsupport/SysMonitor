import { createLazyFileRoute, Link, notFound } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useCallback } from "react";
import { Pencil, Check, X } from "lucide-react";
import { StatusBadge } from "@/components/StatusIndicator";
import { useNetbirdSites } from "@/lib/use-netbird";
import { probeHttp, updateNetbirdPeer, type ProbeResult } from "@/lib/netbird.functions";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { TopNav } from "@/components/TopNav";
import { useHasApiKey } from "@/lib/auth-utils";
import { ApiKeyGate } from "@/components/ApiKeyGate";

export const Route = createLazyFileRoute("/sites/$siteId")({
  head: ({ params }) => ({
    meta: [
      { title: `${params.siteId} — SysMonitor` },
      {
        name: "description",
        content: `Site detail and Netbird tunnel state for ${params.siteId}.`,
      },
    ],
  }),
  component: SiteDetailPage,
  notFoundComponent: () => (
    <div className="min-h-dvh bg-background p-12 text-center">
      <p className="font-mono text-[10px] uppercase tracking-widest text-dim">404</p>
      <h1 className="mt-2 text-xl">Site not found</h1>
      <Link to="/sites" className="mt-4 inline-block font-mono text-[11px] text-phosphor">
        ← Back to sites
      </Link>
    </div>
  ),
});

function SiteDetailPage() {
  const hasApiKey = useHasApiKey();
  const { siteId } = Route.useParams();
  const { sites, loading, error, refetch } = useNetbirdSites();
  const queryClient = useQueryClient();

  const site = sites.find((s) => s.id === siteId);

  // Edit state
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(site?.name || "");

  const updateMutation = useMutation({
    mutationFn: async (newName: string) => {
      const result = await updateNetbirdPeer({ peerId: siteId, name: newName });
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

  const [probeUrl, setProbeUrl] = useState("");
  const [probeResult, setProbeResult] = useState<ProbeResult | null>(null);
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

  // If no API key, show the gate
  if (!hasApiKey) {
    return (
      <div className="min-h-dvh bg-background text-foreground">
        <TopNav />
        <main className="mx-auto max-w-[1200px] p-6">
          <ApiKeyGate />
        </main>
      </div>
    );
  }

  if (!loading && sites.length > 0 && !site) throw notFound();

  if (!site) {
    return (
      <div className="min-h-dvh bg-background text-foreground">
        <main className="mx-auto max-w-[1400px] p-12 text-center font-mono text-[11px] text-dim">
          Loading peer…
        </main>
      </div>
    );
  }

  return (

    <div className="min-h-dvh bg-background text-foreground p-6">
      <Link
        to="/sites"
        className="inline-block font-mono text-[10px] uppercase tracking-widest text-dim hover:text-foreground mb-6"
      >
        ← All sites
      </Link>

      {/* Big Card Container */}
      <div className="mx-auto max-w-[1200px]">
        <div className="border border-border bg-panel rounded-lg shadow-lg overflow-hidden p-6">
          {error && (
            <div className="mt-4 border border-alert/40 bg-alert/10 px-4 py-3 font-mono text-[11px] text-alert">
              {(() => {
                const errMsg = (typeof error === "string" ? error : error.message || String(error));
                const errMsgLower = errMsg.toLowerCase();

                // API Key / Authentication errors
                const isAuthError = errMsgLower.includes("unauthorized") ||
                  errMsgLower.includes("authentication") ||
                  errMsgLower.includes("api key") ||
                  errMsgLower.includes("token") ||
                  errMsgLower.includes("expired") ||
                  errMsgLower.includes("invalid") ||
                  errMsgLower.includes("iso-8859") ||
                  errMsgLower.includes("headers") ||
                  errMsgLower.includes("401") ||
                  errMsgLower.includes("403");

                if (isAuthError) {
                  return `API key error: Your API key may be invalid, expired, or missing. Please check your API key in Settings.`;
                }

                // Network errors
                const isNetworkError = (errMsgLower.includes("failed to fetch") ||
                  errMsgLower.includes("networkerror") ||
                  errMsgLower.includes("network request failed") ||
                  errMsgLower.includes("econnrefused") ||
                  errMsgLower.includes("etimedout") ||
                  errMsgLower.includes("enotfound") ||
                  errMsgLower.includes("offline")) &&
                  !navigator.onLine;

                if (isNetworkError || !navigator.onLine) {
                  return `No internet connection. Please check your network and try again.`;
                }

                return `NetBird API error: ${errMsg}`;
              })()}
            </div>
          )}

          {/* Header */}
          <div className="mt-6 flex flex-wrap items-end justify-between gap-4 border-b border-border pb-6">
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
                    autoFocus
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-9 w-9"
                    onClick={handleSave}
                    disabled={updateMutation.isPending}
                  >
                    {updateMutation.isPending ? (
                      <div className="h-5 w-5 animate-spin rounded-full border-2 border-current border-t-transparent" />
                    ) : (
                      <Check className="h-5 w-5" />
                    )}
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-9 w-9"
                    onClick={handleCancel}
                    disabled={updateMutation.isPending}
                  >
                    <X className="h-5 w-5" />
                  </Button>
                </div>
              ) : (
                <h1 className="mt-1 flex items-center gap-3 text-2xl font-medium tracking-tight group">
                  {site.name}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={() => setIsEditing(true)}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <StatusBadge status={site.status} />
                </h1>
              )}
              <code className="mt-2 block font-mono text-[11px] text-dim">
                {site.hostname || site.id}
              </code>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => refetch()}
                className="border border-phosphor/40 bg-phosphor/10 px-3 py-2 font-mono text-[10px] uppercase tracking-widest text-phosphor hover:bg-phosphor/20"
              >
                ↻ Refresh peer
              </button>
            </div>
          </div>

          {/* Metrics */}
          <div className="mt-6 grid grid-cols-2 gap-px border border-border bg-border md:grid-cols-4">
            <Tile
              label="Tunnel"
              value={site.netbirdConnected ? "Connected" : "Down"}
              tone={site.netbirdConnected ? "ok" : "alert"}
            />
            {/* NetBird IP hidden for security */}
            <Tile label="Region" value={site.region} />
            <Tile label="Tags" value={site.tags.slice(0, 2).join(", ") || "—"} />
            <Tile
              label="Last Seen"
              value={site.netbirdConnected ? "Online now" : site.lastSeen ? new Date(site.lastSeen).toLocaleDateString() : "—"}
              tone={site.netbirdConnected ? "ok" : "neutral"}
            />
          </div>

          {/* Two-col: probes + peer */}
          <div className="mt-8 grid grid-cols-1 gap-8 lg:grid-cols-3">
            <section className="lg:col-span-2">
              <h2 className="mb-3 font-mono text-[11px] font-bold uppercase tracking-widest text-dim">
                NetBird Status
              </h2>
              <div className="divide-y divide-border border border-border bg-panel">
                {site.checks.map((c) => (
                  <div
                    key={c.label}
                    className="flex items-center justify-between gap-4 px-4 py-3 font-mono text-[11px]"
                  >
                    <div className="flex items-center gap-3">
                      <span
                        className={`size-2 rounded-full ${c.ok ? "bg-phosphor" : "bg-alert"}`}
                      />
                      <span className="text-foreground">{c.label}</span>
                      <span className="text-[10px] uppercase tracking-widest text-dim">
                        [{c.type}]
                      </span>
                    </div>
                    <span className={c.ok ? "text-phosphor" : "text-alert"}>{c.detail}</span>
                  </div>
                ))}
              </div>

              <h2 className="mt-8 mb-3 font-mono text-[11px] font-bold uppercase tracking-widest text-dim">
                On-demand HTTP probe
              </h2>
              <div className="border border-border bg-panel p-4">
                <p className="mb-3 font-mono text-[10px] text-dim">
                  Probes run from SysMonitor's edge — public endpoints only. Private NetBird IPs
                  need a local agent.
                </p>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (probeUrl.trim()) probeMutation.mutate(probeUrl.trim());
                  }}
                  className="flex flex-wrap gap-2"
                >
                  <input
                    value={probeUrl}
                    onChange={(e) => setProbeUrl(e.target.value)}
                    placeholder="https://example.com/health"
                    className="min-w-[260px] flex-1 border border-border bg-void px-3 py-2 font-mono text-[11px] text-foreground outline-hidden focus:border-phosphor"
                  />
                  <button
                    type="submit"
                    disabled={probeMutation.isPending || !probeUrl.trim()}
                    className="border border-phosphor/40 bg-phosphor/10 px-4 py-2 font-mono text-[10px] uppercase tracking-widest text-phosphor transition-colors hover:bg-phosphor/20 disabled:opacity-50"
                  >
                    {probeMutation.isPending ? "Probing…" : "Run probe"}
                  </button>
                </form>
                {probeResult && (
                  <div
                    className={`mt-3 border px-3 py-2 font-mono text-[11px] ${
                      probeResult.ok
                        ? "border-phosphor/40 bg-phosphor/10 text-phosphor"
                        : "border-alert/40 bg-alert/10 text-alert"
                    }`}
                  >
                    {probeResult.ok ? "OK · " : "FAIL · "}
                    {probeResult.detail}
                  </div>
                )}
              </div>
            </section>

            <aside className="space-y-6">
              <div className="border border-border bg-panel p-4">
                <h3 className="font-mono text-[10px] font-bold uppercase tracking-widest text-dim">
                  Netbird Peer
                </h3>
                <div className="mt-3 space-y-2 font-mono text-[11px]">
                  <Row
                    k="State"
                    v={site.netbirdConnected ? "Connected" : "Disconnected"}
                    tone={site.netbirdConnected ? "ok" : "alert"}
                  />
                  {/* Peer IP hidden for security */}
                  <Row k="Last Seen" v={site.netbirdConnected ? "Online now" : site.lastSeen ? new Date(site.lastSeen).toLocaleString() : "—"} />
                  <Row k="Tunnel" v="WireGuard / UDP 51820" />
                  <Row k="Encryption" v="ChaCha20-Poly1305" />
                  <Row k="Peer ID" v={site.id.slice(0, 16) + "…"} />
                </div>
              </div>

              <div className="border border-border bg-panel p-4">
                <h3 className="font-mono text-[10px] font-bold uppercase tracking-widest text-dim">
                  Groups
                </h3>
                <div className="mt-3 flex flex-wrap gap-1">
                  {site.tags.map((t) => (
                    <span
                      key={t}
                      className="border border-border bg-void px-2 py-0.5 font-mono text-[10px] uppercase tracking-widest text-dim"
                    >
                      {t}
                    </span>
                  ))}
                </div>
              </div>
            </aside>
          </div>
        </div>
      </div>
    </div>
  );
}

function Tile({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string;
  tone?: "neutral" | "ok" | "amber" | "alert";
}) {
  const cls =
    tone === "alert"
      ? "text-alert"
      : tone === "amber"
        ? "text-amber"
        : tone === "ok"
          ? "text-phosphor"
          : "text-foreground";
  return (
    <div className="bg-panel p-4">
      <div className="font-mono text-[10px] uppercase tracking-widest text-dim">{label}</div>
      <div className={`mt-1 font-mono text-lg tabular-nums ${cls}`}>{value}</div>
    </div>
  );
}

function Row({
  k,
  v,
  tone = "neutral",
}: {
  k: string;
  v: string;
  tone?: "neutral" | "ok" | "alert";
}) {
  const cls = tone === "alert" ? "text-alert" : tone === "ok" ? "text-phosphor" : "text-foreground";
  return (
    <div className="flex items-center justify-between">
      <span className="text-dim">{k}</span>
      <span className={cls}>{v}</span>
    </div>
  );
}
