import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { testModel } from "@/lib/model-test.functions";
import { MODELS, isSelectable } from "@/lib/models";
import { CheckCircle2, XCircle, Loader2, PlayCircle, FlaskConical } from "lucide-react";

type Result = {
  ok: boolean;
  reply?: string;
  error?: string;
  actions?: number;
  issues?: string[];
  durationMs: number;
};

type Status = "idle" | "running" | Result;
const STORAGE_KEY = "bloxsmith-model-health-v1";

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

  async function runOne(id: string) {
    setResults((r) => ({ ...r, [id]: "running" }));
    try {
      const res = await runTest({ data: { modelId: id } });
      setResults((r) => ({ ...r, [id]: res }));
    } catch (e) {
      setResults((r) => ({
        ...r,
        [id]: { ok: false, error: e instanceof Error ? e.message : "Failed", durationMs: 0 },
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

  const okCount = Object.values(results).filter((r) => typeof r === "object" && r.ok).length;
  const failCount = Object.values(results).filter((r) => typeof r === "object" && !r.ok).length;
  const downModels = selectable.filter((m) => {
    const status = results[m.id];
    return typeof status === "object" && !status.ok;
  });
  const readyModels = selectable.filter((m) => {
    const status = results[m.id];
    return typeof status === "object" && status.ok;
  });
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
            {okCount} ✓ · {failCount} ✗ · {selectable.length} total
          </span>
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
        Sends the same BloxSmith Core Brain Roblox/Luau build probe to each model and validates Studio actions, remotes, server scripts, UI, animation, cleanup, and consistency.
      </p>
      <div className="mt-3 grid gap-2 md:grid-cols-3">
        <HealthSummary
          title="Use these"
          value={`${readyModels.length} Roblox-ready`}
          detail={readyModels.length ? readyModels.slice(0, 3).map((m) => m.label).join(", ") : "Run tests to find the best models."}
          tone="ready"
        />
        <HealthSummary
          title="Down / failing"
          value={`${downModels.length} models`}
          detail={downModels.length ? downModels.map((m) => m.label).join(", ") : "No failing models in the latest test."}
          tone={downModels.length ? "down" : "ready"}
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
                    {status.error || status.issues?.join("; ") || "Model failed the Roblox readiness test"}
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
          return (
            <div
              key={m.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-xl border px-3 py-2 text-sm"
              style={{ borderColor: "var(--bs-border)", background: "var(--bs-card-2)" }}
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 font-semibold">
                  <StatusIcon status={status} />
                  <span className="truncate">{m.label}</span>
                  <span className="bs-chip text-[10px]" style={{ color: "var(--bs-muted-fg)" }}>
                    {m.via}
                  </span>
                </div>
                <div className="mt-0.5 truncate text-xs" style={{ color: "var(--bs-muted-fg)" }}>
                  {typeof status === "object"
                    ? status.ok
                      ? `Roblox-ready · ${status.actions ?? 0} actions · ${status.durationMs}ms`
                      : `Failed · ${status.error ?? "unknown"}`
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
  if (status.ok) return <CheckCircle2 className="h-3.5 w-3.5" style={{ color: "var(--bs-success)" }} />;
  return <XCircle className="h-3.5 w-3.5" style={{ color: "var(--bs-danger, #ef4444)" }} />;
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
  tone: "ready" | "down" | "neutral";
}) {
  const color = tone === "ready" ? "var(--bs-success)" : tone === "down" ? "#ef4444" : "var(--bs-primary)";
  return (
    <div className="rounded-xl border px-3 py-2" style={{ borderColor: "var(--bs-border)", background: "var(--bs-card-2)" }}>
      <div className="text-[10px] font-bold uppercase tracking-wide" style={{ color: "var(--bs-muted-fg)" }}>{title}</div>
      <div className="mt-0.5 text-sm font-bold" style={{ color }}>{value}</div>
      <div className="mt-0.5 truncate text-[11px]" style={{ color: "var(--bs-muted-fg)" }}>{detail}</div>
    </div>
  );
}
