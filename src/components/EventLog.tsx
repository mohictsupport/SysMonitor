import type { EventEntry } from "@/lib/sites-data";

const LEVEL_STYLES: Record<EventEntry["level"], { tag: string; bg: string }> = {
  info: { tag: "text-phosphor", bg: "" },
  warn: { tag: "text-amber", bg: "" },
  critical: { tag: "text-alert", bg: "bg-alert/5" },
  auth: { tag: "text-phosphor", bg: "" },
};

const LEVEL_LABEL: Record<EventEntry["level"], string> = {
  info: "[NETBIRD]",
  warn: "[LATENCY]",
  critical: "[CRITICAL]",
  auth: "[AUTH]",
};

function fmt(ts: number) {
  const d = new Date(ts);
  const pad = (n: number, w = 2) => String(n).padStart(w, "0");
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(d.getMilliseconds(), 3)}`;
}

export function EventLog({
  events,
  title = "Event Log",
}: {
  events: EventEntry[];
  title?: string;
}) {
  return (
    <section>
      <header className="flex items-center justify-between border-x border-t border-border bg-panel px-3 py-2">
        <div className="flex items-center gap-2">
          <span className="status-pulse size-1.5 rounded-full bg-phosphor" />
          <h2 className="font-mono text-[10px] font-bold uppercase tracking-widest text-foreground">
            {title}
          </h2>
        </div>
        <span className="font-mono text-[10px] text-dim">BUFFER: 1.2MB/s</span>
      </header>
      <div className="divide-y divide-border/60 border border-border bg-void font-mono text-[11px]">
        {events.map((e) => {
          const cfg = LEVEL_STYLES[e.level];
          return (
            <div
              key={e.id}
              className={`flex flex-col gap-1 p-3 transition-colors hover:bg-foreground/5 sm:flex-row sm:gap-4 ${cfg.bg}`}
            >
              <span className="shrink-0 text-dim">{fmt(e.ts)}</span>
              <span className={`shrink-0 uppercase ${cfg.tag}`}>{LEVEL_LABEL[e.level]}</span>
              <span className="text-zinc-400">
                <span className="text-foreground">{e.source}</span> — {e.message}
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}
