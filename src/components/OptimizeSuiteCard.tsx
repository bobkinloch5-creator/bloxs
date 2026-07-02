import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Gauge, HardDrive, Sparkles, Code2, Smartphone, Loader2, CheckCircle2 } from "lucide-react";
import { queueOptimize, type OptimizeKind } from "@/lib/optimize.functions";

const OPTIONS: Array<{ kind: OptimizeKind; label: string; detail: string; Icon: typeof Gauge }> = [
  { kind: "fps", label: "Optimize FPS", detail: "Anchor static parts, enable streaming, kill busy loops.", Icon: Gauge },
  { kind: "memory", label: "Optimize Memory", detail: "Dedup parts, clear empty folders, reorganize.", Icon: HardDrive },
  { kind: "lighting", label: "Optimize Lighting", detail: "Future lighting, balanced exposure, real shadows.", Icon: Sparkles },
  { kind: "scripts", label: "Optimize Scripts", detail: "Rename untitled scripts, autofix, verify scan.", Icon: Code2 },
  { kind: "mobile", label: "Optimize Mobile", detail: "Touch controls, ShadowMap, UIScale on every GUI.", Icon: Smartphone },
];

export function OptimizeSuiteCard({ projectId }: { projectId: string }) {
  const queue = useServerFn(queueOptimize);
  const [busy, setBusy] = useState<OptimizeKind | null>(null);
  const [done, setDone] = useState<Record<OptimizeKind, string | null>>({
    fps: null, memory: null, lighting: null, scripts: null, mobile: null,
  });
  const [err, setErr] = useState<string | null>(null);

  async function run(kind: OptimizeKind) {
    setBusy(kind);
    setErr(null);
    try {
      const res = await queue({ data: { projectId, kind } });
      setDone((p) => ({ ...p, [kind]: `Queued ${res.count} actions for Studio.` }));
    } catch (e: any) {
      setErr(e?.message || "Could not queue optimize batch.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="rounded-2xl border p-3" style={{ borderColor: "var(--bs-border)", background: "var(--bs-card)" }}>
      <div className="flex items-center justify-between">
        <div className="text-sm font-semibold">One-Click Optimize</div>
        <Gauge className="h-3.5 w-3.5" style={{ color: "var(--bs-primary)" }} />
      </div>
      <div className="mt-1 text-[11px]" style={{ color: "var(--bs-muted-fg)" }}>
        Queue safe optimization passes that run in your Studio plugin.
      </div>
      <div className="mt-3 space-y-2">
        {OPTIONS.map(({ kind, label, detail, Icon }) => (
          <button
            key={kind}
            onClick={() => run(kind)}
            disabled={busy !== null}
            className="w-full rounded-xl border px-2.5 py-2 text-left transition hover:opacity-90 disabled:opacity-50"
            style={{ borderColor: "var(--bs-border)", background: "var(--bs-card-2)" }}
          >
            <div className="flex items-center gap-2">
              <Icon className="h-3.5 w-3.5" style={{ color: "var(--bs-primary)" }} />
              <div className="text-xs font-semibold">{label}</div>
              {busy === kind && <Loader2 className="ml-auto h-3 w-3 animate-spin" />}
              {done[kind] && busy !== kind && <CheckCircle2 className="ml-auto h-3 w-3 text-emerald-400" />}
            </div>
            <div className="mt-0.5 text-[11px]" style={{ color: "var(--bs-muted-fg)" }}>{detail}</div>
            {done[kind] && <div className="mt-1 text-[10px] text-emerald-400">{done[kind]}</div>}
          </button>
        ))}
      </div>
      {err && <div className="mt-2 rounded-lg border border-red-500/40 bg-red-500/10 px-2 py-1 text-[11px] text-red-300">{err}</div>}
    </div>
  );
}
