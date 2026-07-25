import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { testModel } from "@/lib/model-test.functions";
import { MODELS, isSelectable } from "@/lib/models";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Cpu,
  Filter,
  FlaskConical,
  Gauge,
  Loader2,
  PlayCircle,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  XCircle,
  Zap,
} from "lucide-react";

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

type FilterTab = "all" | "working" | "issues" | "untested";

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
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState<FilterTab>("all");
  const [selectedProvider, setSelectedProvider] = useState<string>("all");
  const [expandedOutput, setExpandedOutput] = useState<Record<string, boolean>>({});

  const selectable = MODELS.filter(isSelectable);

  // Extract unique providers for filtering
  const providers = useMemo(() => {
    const set = new Set<string>();
    selectable.forEach((m) => {
      if (m.via) set.add(m.via);
    });
    return Array.from(set);
  }, [selectable]);

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
    if (status === "idle" || !status) return "Untested";
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
    for (const m of selectable) {
      // eslint-disable-next-line no-await-in-loop
      await runOne(m.id);
    }
    setBulkRunning(false);
  }

  const statusCounts = useMemo(() => {
    return selectable.reduce<Record<ModelHealthStatus | "Untested" | "Scanning", number>>(
      (acc, m) => {
        const health = getHealth(results[m.id] ?? "idle");
        acc[health] = (acc[health] ?? 0) + 1;
        return acc;
      },
      { Working: 0, "Partially Working": 0, "Not Working": 0, Slow: 0, "Needs Fix": 0, Untested: 0, Scanning: 0 }
    );
  }, [selectable, results]);

  const downModels = useMemo(() => {
    return selectable.filter((m) => {
      const health = getHealth(results[m.id] ?? "idle");
      return health === "Not Working" || health === "Needs Fix";
    });
  }, [selectable, results]);

  const readyModels = useMemo(() => {
    return selectable.filter((m) => getHealth(results[m.id] ?? "idle") === "Working");
  }, [selectable, results]);

  const untestedModels = useMemo(() => {
    return selectable.filter((m) => {
      const status = results[m.id];
      return !status || status === "idle" || status === "running";
    });
  }, [selectable, results]);

  // Filtered model list based on search, tab, and provider
  const filteredModels = useMemo(() => {
    return selectable.filter((m) => {
      const matchesSearch =
        m.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
        m.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (m.via && m.via.toLowerCase().includes(searchQuery.toLowerCase()));

      const matchesProvider = selectedProvider === "all" || m.via === selectedProvider;

      const health = getHealth(results[m.id] ?? "idle");
      let matchesTab = true;
      if (activeTab === "working") matchesTab = health === "Working";
      else if (activeTab === "issues") matchesTab = health === "Not Working" || health === "Needs Fix" || health === "Partially Working" || health === "Slow";
      else if (activeTab === "untested") matchesTab = health === "Untested" || health === "Scanning";

      return matchesSearch && matchesProvider && matchesTab;
    });
  }, [selectable, results, searchQuery, activeTab, selectedProvider]);

  const testedLabel = lastTestedAt
    ? new Date(lastTestedAt).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })
    : "Not tested yet";

  const toggleExpand = (id: string) => {
    setExpandedOutput((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-950/90 p-5 shadow-2xl backdrop-blur-xl">
      {/* ── HEADER & GLOBAL CONTROLS ── */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-cyan-500/10 text-cyan-400 ring-1 ring-cyan-500/30">
              <FlaskConical className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white tracking-tight flex items-center gap-2">
                Model Health Check & Probe Suite
                <span className="rounded-full bg-cyan-500/10 px-2.5 py-0.5 text-xs font-semibold text-cyan-300 ring-1 ring-cyan-500/20">
                  {selectable.length} Models Active
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                Runs real-time Roblox Luau code generation, tool invocation, and latency probes across all connected model endpoints.
              </p>
            </div>
          </div>
        </div>

        {/* Global Action Buttons */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setAutoScan((v) => !v)}
            className={`flex items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-semibold transition-all ${
              autoScan
                ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20"
                : "border-slate-800 bg-slate-900 text-slate-400 hover:bg-slate-800"
            }`}
          >
            <RefreshCw className={`h-3.5 w-3.5 ${autoScan ? "animate-spin-slow text-emerald-400" : ""}`} />
            Auto Scan: <span className="font-bold">{autoScan ? "On (6h)" : "Off"}</span>
          </button>

          <button
            type="button"
            onClick={runAll}
            disabled={bulkRunning}
            className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 px-4 py-2 text-xs font-bold text-white shadow-lg shadow-cyan-600/20 hover:from-cyan-500 hover:to-blue-500 active:scale-95 disabled:opacity-50 transition-all"
          >
            {bulkRunning ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Running Health Probes…
              </>
            ) : (
              <>
                <PlayCircle className="h-4 w-4" />
                Test All Models
              </>
            )}
          </button>
        </div>
      </div>

      {/* ── KPI METRICS CARDS ── */}
      <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <MetricCard
          title="Working"
          value={statusCounts.Working}
          total={selectable.length}
          color="emerald"
          icon={CheckCircle2}
          subtext={readyModels.length ? `${readyModels[0]?.label.slice(0, 18)}…` : "All clear"}
        />
        <MetricCard
          title="Partial / Slow"
          value={statusCounts["Partially Working"] + statusCounts.Slow}
          total={selectable.length}
          color="amber"
          icon={Gauge}
          subtext="High response time"
        />
        <MetricCard
          title="Needs Fix"
          value={statusCounts["Needs Fix"]}
          total={selectable.length}
          color="rose"
          icon={AlertTriangle}
          subtext="Failed Luau syntax"
        />
        <MetricCard
          title="Down"
          value={statusCounts["Not Working"]}
          total={selectable.length}
          color="red"
          icon={XCircle}
          subtext={downModels.length ? `${downModels.length} failing` : "0 down"}
        />
        <MetricCard
          title="Untested"
          value={statusCounts.Untested}
          total={selectable.length}
          color="slate"
          icon={Cpu}
          subtext="Pending scan"
        />
        <MetricCard
          title="Last Tested"
          value={lastTestedAt ? "Active" : "Never"}
          customLabel={testedLabel}
          color="indigo"
          icon={Sparkles}
          subtext={`${untestedModels.length} remaining`}
        />
      </div>

      {/* ── DOWN MODELS WARNING BANNER ── */}
      {downModels.length > 0 && (
        <div className="mt-4 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3.5 text-xs">
          <div className="flex items-center gap-2 font-bold text-rose-400">
            <AlertTriangle className="h-4 w-4 text-rose-400" />
            Attention: {downModels.length} models failed recent health checks
          </div>
          <div className="mt-2 grid gap-1.5 sm:grid-cols-2">
            {downModels.map((m) => {
              const status = results[m.id] as Result;
              return (
                <div key={m.id} className="flex items-center justify-between gap-2 rounded-lg bg-black/40 px-2.5 py-1.5 text-rose-200">
                  <span className="font-semibold truncate">{m.label}</span>
                  <span className="text-[11px] text-rose-400/80 truncate">
                    {status.error || status.issues?.join(", ") || "Failed Roblox validation"}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── FILTER & SEARCH CONTROLS BAR ── */}
      <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-t border-slate-800/80 pt-4">
        {/* Tab Filters */}
        <div className="flex items-center gap-1 overflow-x-auto rounded-xl bg-slate-900/90 p-1 border border-slate-800">
          <TabButton active={activeTab === "all"} onClick={() => setActiveTab("all")}>
            All <span className="ml-1 text-[10px] opacity-70">({selectable.length})</span>
          </TabButton>
          <TabButton active={activeTab === "working"} onClick={() => setActiveTab("working")} color="emerald">
            Ready <span className="ml-1 text-[10px] opacity-70">({statusCounts.Working})</span>
          </TabButton>
          <TabButton active={activeTab === "issues"} onClick={() => setActiveTab("issues")} color="amber">
            Issues <span className="ml-1 text-[10px] opacity-70">({statusCounts["Needs Fix"] + statusCounts["Not Working"] + statusCounts.Slow})</span>
          </TabButton>
          <TabButton active={activeTab === "untested"} onClick={() => setActiveTab("untested")} color="slate">
            Untested <span className="ml-1 text-[10px] opacity-70">({statusCounts.Untested + statusCounts.Scanning})</span>
          </TabButton>
        </div>

        {/* Search & Provider Select */}
        <div className="flex items-center gap-2">
          {/* Provider Select */}
          <div className="relative">
            <select
              value={selectedProvider}
              onChange={(e) => setSelectedProvider(e.target.value)}
              className="appearance-none rounded-xl border border-slate-800 bg-slate-900 py-1.5 pl-3 pr-8 text-xs font-semibold text-slate-300 focus:border-cyan-500 focus:outline-none"
            >
              <option value="all">All Providers</option>
              {providers.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
            <Filter className="pointer-events-none absolute right-2.5 top-2.5 h-3.5 w-3.5 text-slate-500" />
          </div>

          {/* Search Box */}
          <div className="relative flex-1 sm:w-52">
            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-500" />
            <input
              type="text"
              placeholder="Search model..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-xl border border-slate-800 bg-slate-900 py-1.5 pl-8 pr-3 text-xs text-slate-200 placeholder-slate-500 focus:border-cyan-500 focus:outline-none"
            />
          </div>
        </div>
      </div>

      {/* ── RESPONSIVE 2/3 COLUMN MODEL CARDS GRID ── */}
      <div className="mt-4 grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
        {filteredModels.map((m) => {
          const status = results[m.id] ?? "idle";
          const health = getHealth(status);
          const isExpanded = !!expandedOutput[m.id];
          const isObj = typeof status === "object";

          return (
            <div
              key={m.id}
              className={`group relative flex flex-col justify-between rounded-xl border p-3.5 transition-all duration-200 ${
                health === "Working"
                  ? "border-emerald-500/20 bg-slate-900/60 hover:border-emerald-500/40 hover:bg-slate-900/90"
                  : health === "Scanning"
                  ? "border-cyan-500/40 bg-cyan-500/5 ring-1 ring-cyan-500/20"
                  : health === "Needs Fix" || health === "Not Working"
                  ? "border-rose-500/30 bg-rose-500/5 hover:border-rose-500/50"
                  : health === "Slow" || health === "Partially Working"
                  ? "border-amber-500/30 bg-amber-500/5 hover:border-amber-500/50"
                  : "border-slate-800 bg-slate-900/40 hover:border-slate-700"
              }`}
            >
              <div>
                {/* Card Top Header */}
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    <StatusDot status={status} />
                    <HealthBadge health={health} />
                  </div>
                  <span className="rounded-full bg-slate-800/80 px-2 py-0.5 text-[10px] font-semibold text-slate-400 border border-slate-700/50">
                    {m.via}
                  </span>
                </div>

                {/* Model Label & Identifier */}
                <div className="mt-2.5">
                  <h3 className="font-bold text-sm text-slate-100 group-hover:text-cyan-300 transition-colors truncate">
                    {m.label}
                  </h3>
                  <div className="mt-0.5 font-mono text-[10px] text-slate-500 truncate">{m.id}</div>
                </div>

                {/* Status Details / Metrics */}
                {isObj && (
                  <div className="mt-3 grid grid-cols-3 gap-1.5 rounded-lg bg-black/40 p-2 text-center text-[10px]">
                    <div>
                      <div className="text-slate-500">Latency</div>
                      <div className="font-bold text-slate-200">{status.durationMs}ms</div>
                    </div>
                    <div>
                      <div className="text-slate-500">Actions</div>
                      <div className="font-bold text-slate-200">{status.actions ?? 0}</div>
                    </div>
                    <div>
                      <div className="text-slate-500">Score</div>
                      <div
                        className={`font-bold ${
                          (status.score ?? 0) >= 80
                            ? "text-emerald-400"
                            : (status.score ?? 0) >= 50
                            ? "text-amber-400"
                            : "text-rose-400"
                        }`}
                      >
                        {status.score ?? 0}/100
                      </div>
                    </div>
                  </div>
                )}

                {/* Error message preview if failed */}
                {isObj && status.error && (
                  <div className="mt-2 rounded-md bg-rose-500/10 p-2 text-[11px] text-rose-300 border border-rose-500/20 truncate">
                    ⚠️ {status.error}
                  </div>
                )}
              </div>

              {/* Card Footer: Action & Sample Toggle */}
              <div className="mt-3 pt-2.5 border-t border-slate-800/60 flex items-center justify-between gap-2">
                {isObj && status.reply ? (
                  <button
                    type="button"
                    onClick={() => toggleExpand(m.id)}
                    className="flex items-center gap-1 text-[11px] text-slate-400 hover:text-cyan-400 transition-colors"
                  >
                    {isExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                    <span>Sample</span>
                  </button>
                ) : (
                  <span className="text-[10px] text-slate-600">No probe data</span>
                )}

                <button
                  type="button"
                  onClick={() => runOne(m.id)}
                  disabled={status === "running" || bulkRunning}
                  className="flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:border-cyan-500/50 hover:bg-cyan-500/10 hover:text-cyan-300 disabled:opacity-50 transition-all"
                >
                  {status === "running" ? (
                    <>
                      <Loader2 className="h-3 w-3 animate-spin text-cyan-400" />
                      Testing…
                    </>
                  ) : (
                    <>
                      <Zap className="h-3 w-3 text-cyan-400" />
                      Test
                    </>
                  )}
                </button>
              </div>

              {/* Expandable Output Drawer */}
              {isExpanded && isObj && status.reply && (
                <div className="mt-2.5 rounded-lg bg-black/80 p-2.5 text-[10px] font-mono text-slate-300 border border-slate-800">
                  <div className="text-[9px] text-slate-500 mb-1 uppercase font-sans font-bold">Probe Response Output:</div>
                  <pre className="max-h-28 overflow-auto whitespace-pre-wrap leading-relaxed text-slate-300">
                    {status.reply}
                  </pre>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {filteredModels.length === 0 && (
        <div className="mt-8 rounded-xl border border-dashed border-slate-800 p-8 text-center">
          <Cpu className="mx-auto h-8 w-8 text-slate-600" />
          <h3 className="mt-2 text-sm font-semibold text-slate-400">No models match your filter</h3>
          <p className="mt-1 text-xs text-slate-500">Try clearing your search query or selecting "All Providers".</p>
        </div>
      )}
    </div>
  );
}

// ── HELPER COMPONENTS ──

function MetricCard({
  title,
  value,
  total,
  customLabel,
  color,
  icon: Icon,
  subtext,
}: {
  title: string;
  value: number | string;
  total?: number;
  customLabel?: string;
  color: "emerald" | "amber" | "rose" | "red" | "slate" | "indigo";
  icon: any;
  subtext: string;
}) {
  const styles = {
    emerald: "border-emerald-500/30 bg-emerald-500/5 text-emerald-400",
    amber: "border-amber-500/30 bg-amber-500/5 text-amber-400",
    rose: "border-rose-500/30 bg-rose-500/5 text-rose-400",
    red: "border-red-500/30 bg-red-500/5 text-red-400",
    slate: "border-slate-800 bg-slate-900/60 text-slate-400",
    indigo: "border-indigo-500/30 bg-indigo-500/5 text-indigo-400",
  }[color];

  return (
    <div className={`rounded-xl border p-3 ${styles}`}>
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{title}</span>
        <Icon className="h-3.5 w-3.5 opacity-80" />
      </div>
      <div className="mt-1.5 flex items-baseline gap-1">
        <span className="text-xl font-black text-white">{customLabel ?? value}</span>
        {total !== undefined && typeof value === "number" && (
          <span className="text-[10px] text-slate-500">/ {total}</span>
        )}
      </div>
      <div className="mt-1 truncate text-[10px] text-slate-500">{subtext}</div>
    </div>
  );
}

function TabButton({
  children,
  active,
  onClick,
  color = "cyan",
}: {
  children: React.ReactNode;
  active: boolean;
  onClick: () => void;
  color?: "cyan" | "emerald" | "amber" | "slate";
}) {
  const activeStyles = {
    cyan: "bg-cyan-500 text-black font-bold shadow-md shadow-cyan-500/20",
    emerald: "bg-emerald-500 text-black font-bold shadow-md shadow-emerald-500/20",
    amber: "bg-amber-500 text-black font-bold shadow-md shadow-amber-500/20",
    slate: "bg-slate-700 text-white font-bold",
  }[color];

  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-lg px-3 py-1 text-xs font-semibold transition-all ${
        active ? activeStyles : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/50"
      }`}
    >
      {children}
    </button>
  );
}

function StatusDot({ status }: { status: Status }) {
  if (status === "running") return <Loader2 className="h-3 w-3 animate-spin text-cyan-400" />;
  if (status === "idle" || !status) return <span className="h-2 w-2 rounded-full bg-slate-600" />;
  if (typeof status === "object") {
    if (status.healthStatus === "Working" || status.ok) return <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />;
    if (status.healthStatus === "Slow" || status.healthStatus === "Partially Working") return <span className="h-2 w-2 rounded-full bg-amber-400" />;
    return <span className="h-2 w-2 rounded-full bg-rose-500" />;
  }
  return <span className="h-2 w-2 rounded-full bg-slate-600" />;
}

function HealthBadge({ health }: { health: ModelHealthStatus | "Untested" | "Scanning" }) {
  const badgeStyles = {
    Working: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
    "Partially Working": "bg-amber-500/15 text-amber-300 border-amber-500/30",
    Slow: "bg-amber-500/15 text-amber-300 border-amber-500/30",
    "Needs Fix": "bg-rose-500/15 text-rose-300 border-rose-500/30",
    "Not Working": "bg-red-500/20 text-red-300 border-red-500/30",
    Scanning: "bg-cyan-500/20 text-cyan-300 border-cyan-500/40 animate-pulse",
    Untested: "bg-slate-800 text-slate-400 border-slate-700",
  }[health];

  return (
    <span className={`rounded-md border px-2 py-0.5 text-[10px] font-bold ${badgeStyles}`}>
      {health}
    </span>
  );
}
