import type { SiteStatus } from "@/lib/sites-data";

const MAP: Record<
  SiteStatus,
  { dot: string; text: string; label: string; ring?: string; pulse?: string }
> = {
  online: {
    dot: "bg-phosphor shadow-[0_0_10px_oklch(0.86_0.22_155/0.6)]",
    text: "text-phosphor",
    label: "Online",
    pulse: "status-pulse",
  },
  degraded: {
    dot: "bg-amber shadow-[0_0_10px_oklch(0.82_0.17_80/0.6)]",
    text: "text-amber",
    label: "Degraded",
  },
  offline: {
    dot: "bg-alert shadow-[0_0_10px_oklch(0.68_0.22_27/0.7)]",
    text: "text-alert",
    label: "Offline",
    pulse: "alert-pulse",
  },
  maintenance: {
    dot: "bg-dim",
    text: "text-dim",
    label: "Maintenance",
  },
};

export function StatusDot({
  status,
  withPulse = true,
}: {
  status: SiteStatus;
  withPulse?: boolean;
}) {
  const cfg = MAP[status];
  return (
    <span
      className={`inline-block size-2 rounded-full ${cfg.dot} ${withPulse && cfg.pulse ? cfg.pulse : ""}`}
      aria-label={cfg.label}
    />
  );
}

export function StatusBadge({ status }: { status: SiteStatus }) {
  const cfg = MAP[status];
  return (
    <span
      className={`inline-flex items-center gap-2 border border-border bg-panel/60 px-2 py-0.5 font-mono text-[10px] uppercase tracking-widest ${cfg.text}`}
    >
      <StatusDot status={status} />
      {cfg.label}
    </span>
  );
}

export function statusLabel(status: SiteStatus) {
  return MAP[status].label;
}
