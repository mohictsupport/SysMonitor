import { createFileRoute } from "@tanstack/react-router";
import { TopNav } from "@/components/TopNav";
import { useState } from "react";
import type { AlertingRule, AlertCondition } from "@/lib/sites-data";
import { useAlertingRules } from "@/lib/use-sites";
import { useHasApiKey } from "@/lib/auth-utils";
import { ApiKeyGate } from "@/components/ApiKeyGate";

export const Route = createFileRoute("/alerting")({
  head: () => ({
    meta: [
      { title: "Alerting — SysMonitor" },
      {
        name: "description",
        content: "Configure alerting rules for your network monitoring.",
      },
    ],
  }),
  component: AlertingPage,
});

const conditionLabels: Record<AlertCondition, string> = {
  status_offline: "Site Offline",
  status_degraded: "Site Degraded",
  latency_high: "High Latency",
  packet_loss_high: "High Packet Loss",
  ssl_expiring: "SSL Certificate Expiring",
  netbird_disconnected: "Netbird Disconnected",
  uptime_low: "Low Uptime",
};

function AlertingPage() {
  const hasApiKey = useHasApiKey();
  const { rules, toggleRule, removeRule, addRule, updateRule } = useAlertingRules();
  const [editingRule, setEditingRule] = useState<AlertingRule | null>(null);
  const [isCreating, setIsCreating] = useState(false);

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


  const handleToggleRule = (ruleId: string) => {
    toggleRule(ruleId);
  };

  const handleDeleteRule = (ruleId: string) => {
    removeRule(ruleId);
  };

  const handleSaveRule = (rule: AlertingRule) => {
    if (isCreating) {
      const { id, ...ruleWithoutId } = rule;
      addRule(ruleWithoutId);
      setIsCreating(false);
    } else {
      updateRule(rule.id, rule);
    }
    setEditingRule(null);
  };

  const handleCreateNew = () => {
    const newRule: AlertingRule = {
      id: `rule-${Date.now()}`,
      name: "New Rule",
      enabled: true,
      condition: "status_offline",
      sites: [],
      severity: "warn",
      cooldownMinutes: 10,
    };
    setEditingRule(newRule);
    setIsCreating(true);
  };

  return (
    <div className="min-h-dvh bg-background text-foreground">
      <TopNav />
      <main className="mx-auto max-w-[1200px] p-6">
        {/* Header */}
        <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-dim">
              Monitoring · Alerting
            </p>
            <h1 className="mt-1 text-2xl font-medium tracking-tight">Alerting Rules</h1>
          </div>
          <button
            onClick={handleCreateNew}
            className="inline-flex items-center gap-2 border border-phosphor/40 bg-phosphor/10 px-4 py-2 font-mono text-[11px] uppercase tracking-widest text-phosphor transition-colors hover:bg-phosphor/20"
          >
            + New Rule
          </button>
        </div>

        {/* Rules List */}
        <div className="space-y-4">
          {rules.length === 0 ? (
            <div className="border border-border bg-panel p-12 text-center font-mono text-[11px] text-dim">
              No alerting rules configured. Click "New Rule" to create one.
            </div>
          ) : (
            rules.map((rule) => (
              <div
                key={rule.id}
                className={`border border-border bg-panel p-4 transition-opacity ${
                  !rule.enabled ? "opacity-60" : ""
                }`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-3">
                      <h3 className="font-mono text-sm font-medium">{rule.name}</h3>
                      <span
                        className={`rounded px-2 py-0.5 font-mono text-[10px] uppercase ${
                          rule.severity === "critical"
                            ? "bg-alert/20 text-alert"
                            : "bg-amber/20 text-amber"
                        }`}
                      >
                        {rule.severity}
                      </span>
                      {!rule.enabled && (
                        <span className="rounded bg-dim/20 px-2 py-0.5 font-mono text-[10px] text-dim">
                          Disabled
                        </span>
                      )}
                    </div>
                    <p className="mt-1 font-mono text-[10px] text-dim">
                      {conditionLabels[rule.condition]}
                      {rule.threshold !== undefined && ` > ${rule.threshold}`}
                    </p>
                    <p className="mt-1 font-mono text-[10px] text-dim">
                      Cooldown: {rule.cooldownMinutes} min
                      {rule.sites.length > 0
                        ? ` · Sites: ${rule.sites.join(", ")}`
                        : " · All sites"}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setEditingRule(rule)}
                      className="border border-border px-3 py-1 font-mono text-[10px] uppercase text-dim transition-colors hover:text-foreground"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleToggleRule(rule.id)}
                      className={`border px-3 py-1 font-mono text-[10px] uppercase transition-colors ${
                        rule.enabled
                          ? "border-alert/40 text-alert hover:bg-alert/10"
                          : "border-phosphor/40 text-phosphor hover:bg-phosphor/10"
                      }`}
                    >
                      {rule.enabled ? "Disable" : "Enable"}
                    </button>
                    <button
                      onClick={() => handleDeleteRule(rule.id)}
                      className="border border-border px-3 py-1 font-mono text-[10px] uppercase text-dim transition-colors hover:text-alert"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Edit Modal */}
        {editingRule && (
          <RuleEditModal
            rule={editingRule}
            onSave={handleSaveRule}
            onCancel={() => {
              setEditingRule(null);
              setIsCreating(false);
            }}
          />
        )}
      </main>
    </div>
  );
}

function RuleEditModal({
  rule,
  onSave,
  onCancel,
}: {
  rule: AlertingRule;
  onSave: (rule: AlertingRule) => void;
  onCancel: () => void;
}) {
  const [formData, setFormData] = useState<AlertingRule>(rule);

  const needsThreshold = [
    "latency_high",
    "packet_loss_high",
    "ssl_expiring",
    "uptime_low",
  ].includes(formData.condition);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm">
      <div className="w-full max-w-lg border border-border bg-panel p-6">
        <h2 className="mb-6 font-mono text-sm font-bold uppercase tracking-widest">
          {rule.id.startsWith("rule-") && rule.name === "New Rule" ? "Create Rule" : "Edit Rule"}
        </h2>

        <div className="space-y-4">
          <div>
            <label className="mb-2 block font-mono text-[10px] uppercase tracking-widest text-dim">
              Rule Name
            </label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="w-full border border-border bg-background px-3 py-2 font-mono text-sm text-foreground focus:border-phosphor focus:outline-none"
            />
          </div>

          <div>
            <label className="mb-2 block font-mono text-[10px] uppercase tracking-widest text-dim">
              Condition
            </label>
            <select
              value={formData.condition}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  condition: e.target.value as AlertCondition,
                })
              }
              className="w-full border border-border bg-background px-3 py-2 font-mono text-sm text-foreground focus:border-phosphor focus:outline-none"
            >
              {Object.entries(conditionLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>

          {needsThreshold && (
            <div>
              <label className="mb-2 block font-mono text-[10px] uppercase tracking-widest text-dim">
                Threshold
                {formData.condition === "latency_high" && " (ms)"}
                {formData.condition === "packet_loss_high" && " (%)"}
                {formData.condition === "ssl_expiring" && " (days)"}
                {formData.condition === "uptime_low" && " (%)"}
              </label>
              <input
                type="number"
                value={formData.threshold || ""}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    threshold: parseInt(e.target.value, 10) || 0,
                  })
                }
                className="w-full border border-border bg-background px-3 py-2 font-mono text-sm text-foreground focus:border-phosphor focus:outline-none"
              />
            </div>
          )}

          <div>
            <label className="mb-2 block font-mono text-[10px] uppercase tracking-widest text-dim">
              Severity
            </label>
            <select
              value={formData.severity}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  severity: e.target.value as "warn" | "critical",
                })
              }
              className="w-full border border-border bg-background px-3 py-2 font-mono text-sm text-foreground focus:border-phosphor focus:outline-none"
            >
              <option value="warn">Warning</option>
              <option value="critical">Critical</option>
            </select>
          </div>

          <div>
            <label className="mb-2 block font-mono text-[10px] uppercase tracking-widest text-dim">
              Cooldown (minutes)
            </label>
            <input
              type="number"
              value={formData.cooldownMinutes}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  cooldownMinutes: parseInt(e.target.value, 10) || 0,
                })
              }
              className="w-full border border-border bg-background px-3 py-2 font-mono text-sm text-foreground focus:border-phosphor focus:outline-none"
            />
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="enabled"
              checked={formData.enabled}
              onChange={(e) => setFormData({ ...formData, enabled: e.target.checked })}
              className="size-4 border-border"
            />
            <label htmlFor="enabled" className="font-mono text-[11px] text-dim">
              Rule enabled
            </label>
          </div>
        </div>

        <div className="mt-8 flex items-center justify-end gap-2">
          <button
            onClick={onCancel}
            className="border border-border px-4 py-2 font-mono text-[11px] uppercase text-dim transition-colors hover:text-foreground"
          >
            Cancel
          </button>
          <button
            onClick={() => onSave(formData)}
            className="border border-phosphor/40 bg-phosphor/10 px-4 py-2 font-mono text-[11px] uppercase text-phosphor transition-colors hover:bg-phosphor/20"
          >
            Save Rule
          </button>
        </div>
      </div>
    </div>
  );
}
