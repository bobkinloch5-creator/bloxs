import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Activity, CheckCircle2, AlertTriangle, RefreshCw, Home as HomeIcon } from "lucide-react";
import { Link } from "@tanstack/react-router";

type Status = {
  ok: boolean;
  maintenance: boolean;
  maintenance_message?: string;
  services: Record<string, { status: string; active_24h?: number; actions_24h?: number }>;
  checked_at: string;
  latency_ms: number;
};

const LABELS: Record<string, string> = {
  website: "Website",
  ai_gateway: "AI Gateway",
  studio_plugin: "Studio Plugin",
  build_pipeline: "Build Pipeline",
  database: "Database",
};

async function fetchStatus(): Promise<Status> {
  const res = await fetch("/api/public/status", { cache: "no-store" });
  if (!res.ok) throw new Error("status_unavailable");
  return res.json();
}

export const Route = createFileRoute("/status")({
  head: () => ({
    meta: [
      { title: "System Status — BloxSmith" },
      { name: "description", content: "Live status of BloxSmith services — AI gateway, Studio plugin, build pipeline, and database." },
      { property: "og:title", content: "System Status — BloxSmith" },
      { property: "og:description", content: "Live status of BloxSmith services — AI gateway, Studio plugin, build pipeline, and database." },
    ],
  }),
  component: StatusPage,
});

function StatusPage() {
  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["public-status"],
    queryFn: fetchStatus,
    refetchInterval: 30_000,
  });

  const allGood = data?.ok && !data.maintenance;
  const headline = data?.maintenance
    ? "Scheduled maintenance in progress"
    : allGood
    ? "All systems operational"
    : "Some services degraded";

  return (
    <div className="relative min-h-screen bg-slate-950 text-white">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_10%,rgba(99,102,241,0.15),transparent_60%),radial-gradient(circle_at_80%_90%,rgba(217,70,239,0.10),transparent_60%)]" />
      <div className="relative mx-auto max-w-3xl px-5 py-14 sm:px-8 sm:py-20">
        <div className="mb-8 flex items-center justify-between">
          <Link to="/" className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-400 hover:text-white">
            <HomeIcon className="h-3.5 w-3.5" /> Back to BloxSmith
          </Link>
          <button
            onClick={() => refetch()}
            className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs font-semibold text-slate-200 hover:bg-white/[0.06]"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`} /> Refresh
          </button>
        </div>

        <div className={`mb-8 flex items-start gap-4 rounded-2xl border p-5 sm:p-6 ${
          data?.maintenance ? "border-amber-400/30 bg-amber-500/10"
          : allGood ? "border-emerald-400/30 bg-emerald-500/10"
          : "border-rose-400/30 bg-rose-500/10"
        }`}>
          <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl ${
            allGood ? "bg-emerald-500/25 text-emerald-200"
            : data?.maintenance ? "bg-amber-500/25 text-amber-200"
            : "bg-rose-500/25 text-rose-200"
          }`}>
            {allGood ? <CheckCircle2 className="h-5 w-5" /> : <AlertTriangle className="h-5 w-5" />}
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-lg font-bold text-white sm:text-xl">{headline}</div>
            <div className="mt-1 text-xs text-slate-300 sm:text-sm">
              {data?.maintenance_message
                ? data.maintenance_message
                : isLoading
                ? "Checking services…"
                : `Last checked ${new Date(data?.checked_at ?? Date.now()).toLocaleTimeString()} · ${data?.latency_ms ?? 0}ms`}
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-white/8 bg-white/[0.02]">
          <div className="border-b border-white/5 px-5 py-4">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.14em] text-slate-400">
              <Activity className="h-3.5 w-3.5" /> Services
            </div>
          </div>
          <ul className="divide-y divide-white/5">
            {Object.entries(data?.services ?? {}).map(([key, svc]) => {
              const status = svc.status;
              const good = status === "operational";
              const idle = status === "idle";
              return (
                <li key={key} className="flex items-center justify-between px-5 py-3.5">
                  <div className="flex items-center gap-3">
                    <span className={`h-2.5 w-2.5 rounded-full ${
                      good ? "bg-emerald-400 shadow-[0_0_12px_rgba(52,211,153,0.7)]"
                      : idle ? "bg-slate-500"
                      : "bg-rose-400 shadow-[0_0_12px_rgba(251,113,133,0.7)]"
                    }`} />
                    <span className="text-sm font-semibold text-slate-100">{LABELS[key] ?? key}</span>
                  </div>
                  <div className="flex items-center gap-3 text-xs">
                    {typeof svc.active_24h === "number" && (
                      <span className="text-slate-500">{svc.active_24h} active today</span>
                    )}
                    {typeof svc.actions_24h === "number" && (
                      <span className="text-slate-500">{svc.actions_24h} actions/24h</span>
                    )}
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                      good ? "bg-emerald-500/15 text-emerald-300"
                      : idle ? "bg-slate-500/15 text-slate-300"
                      : "bg-rose-500/15 text-rose-300"
                    }`}>
                      {status}
                    </span>
                  </div>
                </li>
              );
            })}
            {!data && !isLoading && (
              <li className="px-5 py-6 text-center text-sm text-slate-400">Status check failed — try refresh.</li>
            )}
          </ul>
        </div>

        <p className="mt-6 text-center text-xs font-semibold text-slate-400">
          Auto-refreshes every 30 seconds. Need help? Join our{" "}
          <a
            href="https://discord.gg/YJ8xPFNSSX"
            target="_blank"
            rel="noopener noreferrer"
            className="text-cyan-300 underline underline-offset-4 hover:text-cyan-200"
          >
            BloxSmith Discord
          </a>.
        </p>
      </div>
    </div>
  );
}
