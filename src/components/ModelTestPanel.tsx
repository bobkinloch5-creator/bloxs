import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { testModel } from "@/lib/model-test.functions";
import { MODELS, isSelectable } from "@/lib/models";
import { AlertTriangle, CheckCircle2, Gauge, Loader2, PlayCircle, RefreshCw, FlaskConical, XCircle } from "lucide-react";

type ModelHealthStatus = "Working" | "Partially Working" | "Not Working" | "Slow" | "Needs Fix";

type Result = {
  ok: boolean;
  reply?: string;
  error?: string;
  actions?: number;
  issues?: string[];
  healthStatus?: ModelHealthStatus;
  score?: number;
  metrics?: Record<string, string>;
  durationMs: number;
};

type Status = "idle" | "running" | Result;
const STORAGE_KEY = "bloxsmith-model-health-v2";
const AUTO_SCAN_MS = 6 * 60 * 60 * 1000;

export function ModelTestPanel() {
  const runTest = useServerFn(testModel);
  const [results, setResults] = useState<Record<string, Status>>(() => {
    if (typeof window === "undefined") return {};
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
      return saved && typeof saved === "object" ? saved : {};
    } catch {
      return {};
    }
  });
  const [bulkRunning, setBulkRunning] = useState(false);
  const [autoScan, setAutoScan] = useState(() => {
    if (typeof window === "undefined") return true;
    return localStorage.getItem(`${STORAGE_KEY}:auto`) !== "0";
  });

  const selectable = MODELS.filter(isSelectable);
  const lastTestedAt = useMemo(() => {
    if (typeof window === "undefined") return null;
    return localStorage.getItem(`${STORAGE_KEY}:testedAt`);
  }, [results]);

  useEffect(() => {
    const stable = Object.fromEntries(Object.entries(results).filter(([, status]) => status !== "running"));
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stable));
    if (Object.values(stable).some((status) => typeof status === "object")) {
      localStorage.setItem(`${STORAGE_KEY}:testedAt`, new Date().toISOString());
    }
  }, [results]);
  useEffect(() => {
    localStorage.setItem(`${STORAGE_KEY}:auto`, autoScan ? "1" : "0");
  }, [autoScan]);
  useEffect(() => {
    if (!autoScan || bulkRunning) return;
    const last = localStorage.getItem(`${STORAGE_KEY}:testedAt`);
    const stale = !last || Number.isNaN(Date.parse(last)) || Date.now() - Date.parse(last) > AUTO_SCAN_MS;
    if (stale) setTimeout(() => void runAll(), 500);
    const timer = window.setInterval(() => void runAll(), AUTO_SCAN_MS);
    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoScan]);

  function getHealth(status: Status): ModelHealthStatus | "Untested" | "Scanning" {
    if (status === "running") return "Scanning";
    if (status === "idle") return "Untested";
    if (!status) return "Untested";
    if (typeof status === "object") return status.healthStatus ?? (status.ok ? "Working" : "Needs Fix");
    return "Untested";
  }

  async function runOne(id: string) {
    setResults((r) => ({ ...r, [id]: "running" }));
    try {
      const res = await runTest({ data: { modelId: id } });
      setResults((r) => ({ ...r, [id]: res }));
    } catch (e) {
      setResults((r) => ({
        ...r,
        [id]: { ok: false, error: e instanceof Error ? e.message : "Failed", durationMs: 0, healthStatus: "Not Working", score: 0 },
      }));
    }
  }

  async function runAll() {
    setBulkRunning(true);
    // Run sequentially to avoid rate-limit spikes
    for (const m of selectable) {
      // eslint-disable-next-line no-await-in-loop
      await runOne(m.id);
    }
    setBulkRunning(false);
  }

  const statusCounts = selectable.reduce<Record<ModelHealthStatus | "Untested" | "Scanning", number>>((acc, m) => {
    const health = getHealth(results[m.id] ?? "idle");
    acc[health] = (acc[health] ?? 0) + 1;
    return acc;
  }, { Working: 0, "Partially Working": 0, "Not Working": 0, Slow: 0, "Needs Fix": 0, Untested: 0, Scanning: 0 });
  const downModels = selectable.filter((m) => {
    const health = getHealth(results[m.id] ?? "idle");
    return health === "Not Working" || health === "Needs Fix";
  });
  const readyModels = selectable.filter((m) => getHealth(results[m.id] ?? "idle") === "Working");
  const untestedModels = selectable.filter((m) => {
    const status = results[m.id];
    return !status || status === "idle" || status === "running";
  });
  const testedLabel = lastTestedAt
    ? new Date(lastTestedAt).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })
    : "Not tested yet";

  return (
    <div className="bs-card p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-lg font-bold">
          <FlaskConical className="h-4 w-4" style={{ color: "var(--bs-primary)" }} />
          Model health check
        </h2>
        <div className="flex items-center gap-2">
          <span className="text-xs" style={{ color: "var(--bs-muted-fg)" }}>
            {statusCounts.Working} working · {statusCounts["Not Working"]} down · {selectable.length} total
          </span>
          <button
            type="button"
            onClick={() => setAutoScan((v) => !v)}
            className="bs-quick"
            title="Automatically rescan every 6 hours while this admin page is open"
            style={{ color: autoScan ? "var(--bs-success)" : "var(--bs-muted-fg)" }}
          >
            <RefreshCw className="h-3.5 w-3.5" /> Auto {autoScan ? "On" : "Off"}
          </button>
          <button
            type="button"
            onClick={runAll}
            disabled={bulkRunning}
            className="bs-quick"
            style={{ opacity: bulkRunning ? 0.6 : 1 }}
          >
            {bulkRunning ? (
              <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Testing…</>
            ) : (
              <><PlayCircle className="h-3.5 w-3.5" /> Test all models</>
            )}
          </button>
        </div>
      </div>
      <p className="mt-2 text-xs" style={{ color: "var(--bs-muted-fg)" }}>
        Automatically sends the same BloxSmith Core Brain Roblox/Luau probe to every model and checks Roblox understanding, Luau scripting, tool execution, response quality, speed, and reliability.
      </p>
      <div className="mt-3 grid gap-2 md:grid-cols-5">
        <HealthSummary
          title="Working"
          value={`${statusCounts.Working}`}
          detail={readyModels.length ? readyModels.slice(0, 3).map((m) => m.label).join(", ") : "Run tests to find the best models."}
          tone="ready"
        />
        <HealthSummary
          title="Partial"
          value={`${statusCounts["Partially Working"]}`}
          detail="Usable, but missing quality or execution checks."
          tone="partial"
        />
        <HealthSummary
          title="Slow"
          value={`${statusCounts.Slow}`}
          detail="Works, but response time is high."
          tone="slow"
        />
        <HealthSummary
          title="Needs Fix"
          value={`${statusCounts["Needs Fix"]}`}
          detail="Responds, but fails important Roblox checks."
          tone="fix"
        />
        <HealthSummary
          title="Not Working"
          value={`${statusCounts["Not Working"]}`}
          detail={downModels.length ? downModels.slice(0, 2).map((m) => m.label).join(", ") : "No down models in latest scan."}
          tone={downModels.length ? "down" : "ready"}
        />
      </div>
      <div className="mt-2 grid gap-2 md:grid-cols-2">
        <HealthSummary
          title="Auto Scanner"
          value={autoScan ? "Every 6 hours" : "Paused"}
          detail="Runs while the admin health panel is open and stores the latest model status."
          tone={autoScan ? "ready" : "neutral"}
        />
        <HealthSummary
          title="Last tested"
          value={testedLabel}
          detail={`${untestedModels.length} not tested or currently running`}
          tone="neutral"
        />
      </div>
      {downModels.length > 0 && (
        <div className="mt-3 rounded-xl border px-3 py-2 text-xs" style={{ borderColor: "color-mix(in oklab, #ef4444 35%, var(--bs-border))", background: "color-mix(in oklab, #ef4444 8%, var(--bs-card))" }}>
          <div className="font-bold" style={{ color: "#ef4444" }}>Models to avoid right now</div>
          <div className="mt-1 grid gap-1">
            {downModels.map((m) => {
              const status = results[m.id] as Result;
              return (
                <div key={m.id} className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-semibold">{m.label}</span>
                  <span className="min-w-0 max-w-full truncate" style={{ color: "var(--bs-muted-fg)" }}>
                    {status.healthStatus ?? "Needs Fix"} · {status.error || status.issues?.join("; ") || "Model failed the Roblox readiness test"}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="mt-4 grid gap-2">
        {selectable.map((m) => {
          const status = results[m.id] ?? "idle";
          const health = getHealth(status);
          const tone = healthTone(health);
          return (
            <div
              key={m.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-xl border px-3 py-2 text-sm"
              style={{ borderColor: tone.borderColor, background: tone.background }}
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 font-semibold">
                  <StatusIcon status={status} />
                  <span className="truncate">{m.label}</span>
                  <HealthBadge health={health} />
                  <span className="bs-chip text-[10px]" style={{ color: "var(--bs-muted-fg)" }}>
                    {m.via}
                  </span>
                </div>
                <div className="mt-0.5 truncate text-xs" style={{ color: "var(--bs-muted-fg)" }}>
                  {typeof status === "object"
                    ? `${status.healthStatus ?? (status.ok ? "Working" : "Needs Fix")} · score ${status.score ?? 0} · ${status.actions ?? 0} actions · ${status.durationMs}ms${status.error ? ` · ${status.error}` : ""}`
                    : m.id}
                </div>
                {typeof status === "object" && status.ok && status.reply && (
                  <div className="mt-0.5 truncate text-[11px]" style={{ color: "var(--bs-muted-fg)" }}>
                    Sample: {status.reply.replace(/\s+/g, " ").slice(0, 180)}
                  </div>
                )}
              </div>
              <button
                type="button"
                onClick={() => runOne(m.id)}
                disabled={status === "running" || bulkRunning}
                className="bs-quick text-xs"
                style={{ opacity: status === "running" || bulkRunning ? 0.6 : 1 }}
              >
                {status === "running" ? "Testing…" : "Test"}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function StatusIcon({ status }: { status: Status }) {
  if (status === "idle") return <span className="inline-block h-3.5 w-3.5 rounded-full" style={{ background: "var(--bs-border)" }} />;
  if (status === "running") return <Loader2 className="h-3.5 w-3.5 animate-spin" style={{ color: "var(--bs-primary)" }} />;
  if (status.healthStatus === "Working") return <CheckCircle2 className="h-3.5 w-3.5" style={{ color: "var(--bs-success)" }} />;
  if (status.healthStatus === "Slow") return <Gauge className="h-3.5 w-3.5" style={{ color: "#eab308" }} />;
  if (status.healthStatus === "Partially Working") return <AlertTriangle className="h-3.5 w-3.5" style={{ color: "#f97316" }} />;
  if (status.healthStatus === "Needs Fix") return <XCircle className="h-3.5 w-3.5" style={{ color: "var(--bs-danger, #ef4444)" }} />;
  if (status.ok) return <CheckCircle2 className="h-3.5 w-3.5" style={{ color: "var(--bs-success)" }} />;
  return <XCircle className="h-3.5 w-3.5" style={{ color: "var(--bs-danger, #ef4444)" }} />;
}

function healthColor(health: ModelHealthStatus | "Untested" | "Scanning") {
  if (health === "Working") return "var(--bs-success)";
  if (health === "Slow") return "#eab308";
  if (health === "Partially Working") return "#f97316";
  if (health === "Needs Fix") return "var(--bs-danger, #ef4444)";
  if (health === "Not Working") return "var(--bs-danger, #ef4444)";
  if (health === "Scanning") return "var(--bs-primary)";
  return "var(--bs-muted-fg)";
}

function healthTone(health: ModelHealthStatus | "Untested" | "Scanning") {
  const color = healthColor(health);
  const tint = health === "Working" ? 9 : health === "Not Working" || health === "Needs Fix" ? 10 : 6;
  const border = health === "Untested" ? 18 : 45;
  return {
    borderColor: `color-mix(in oklab, ${color} ${border}%, var(--bs-border))`,
    background: `color-mix(in oklab, ${color} ${tint}%, var(--bs-card-2))`,
  };
}

function HealthBadge({ health }: { health: ModelHealthStatus | "Untested" | "Scanning" }) {
  const color = healthColor(health);
  return (
    <span className="rounded-md px-1.5 py-0.5 text-[10px] font-bold" style={{ color, background: `color-mix(in oklab, ${color} 16%, transparent)` }}>
      {health}
    </span>
  );
}

function HealthSummary({
  title,
  value,
  detail,
  tone,
}: {
  title: string;
  value: string;
  detail: string;
  tone: "ready" | "down" | "neutral" | "partial" | "slow" | "fix";
}) {
  const color =
    tone === "ready" ? "var(--bs-success)" :
    tone === "down" ? "#ef4444" :
    tone === "partial" || tone === "fix" ? "#f97316" :
    tone === "slow" ? "#eab308" :
    "var(--bs-primary)";
  return (
    <div className="rounded-xl border px-3 py-2" style={{ borderColor: "var(--bs-border)", background: "var(--bs-card-2)" }}>
      <div className="text-[10px] font-bold uppercase tracking-wide" style={{ color: "var(--bs-muted-fg)" }}>{title}</div>
      <div className="mt-0.5 text-sm font-bold" style={{ color }}>{value}</div>
      <div className="mt-0.5 truncate text-[11px]" style={{ color: "var(--bs-muted-fg)" }}>{detail}</div>
    </div>
  );
}
