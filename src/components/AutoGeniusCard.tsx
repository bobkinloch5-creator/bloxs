// ============================================================================
// Auto Genius Card — "Auto Build Perfect Game"
// Analyzes the user's idea, auto-picks specialist models per task, builds a
// plan, then hands off to the existing agent pipeline with an enriched prompt.
// ============================================================================
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  Sparkles,
  Loader2,
  Wand2,
  Target,
  CheckCircle2,
  Brain,
  Rocket,
  AlertTriangle,
} from "lucide-react";
import { friendlyError } from "@/lib/friendly-error";
import { runAutoGenius, type AutoGeniusResult } from "@/lib/auto-genius.functions";
import { startAgentPipeline } from "@/lib/agent-pipeline.functions";
import { TASK_LABELS, type AutoTask } from "@/lib/model-router";

const friendly = (err: unknown) => friendlyError(err, { context: "Auto Genius" });

interface Props {
  projectId: string;
}

export function AutoGeniusCard({ projectId }: Props) {
  const [idea, setIdea] = useState("");
  const [result, setResult] = useState<AutoGeniusResult | null>(null);
  const [launched, setLaunched] = useState(false);

  const analyzeFn = useServerFn(runAutoGenius);
  const startFn = useServerFn(startAgentPipeline);

  const analyzeMut = useMutation({
    mutationFn: async (text: string) => analyzeFn({ data: { projectId, idea: text } }),
    onSuccess: (data) => {
      setResult(data);
      setLaunched(false);
      toast.success("Auto Genius ready — review the plan and launch.");
    },
    onError: (err) => toast.error(friendly(err)),
  });

  const launchMut = useMutation({
    mutationFn: async () => {
      if (!result) throw new Error("Run Auto Genius first.");
      return startFn({ data: { projectId, prompt: result.enrichedPrompt.slice(0, 4000) } });
    },
    onSuccess: () => {
      setLaunched(true);
      toast.success("Pipeline launched — watch the AI Game Director above.");
    },
    onError: (err) => toast.error(friendly(err)),
  });

  const onAnalyze = () => {
    const trimmed = idea.trim();
    if (trimmed.length < 3) {
      toast.error("Tell us your game idea — at least a few words.");
      return;
    }
    if (trimmed.length > 4000) {
      toast.error("Idea is too long. Keep it under 4000 characters.");
      return;
    }
    analyzeMut.mutate(trimmed);
  };

  const analyzing = analyzeMut.isPending;
  const launching = launchMut.isPending;

  return (
    <div className="bs-card rounded-2xl p-4">
      <div className="flex items-center gap-2">
        <div
          className="grid h-9 w-9 place-items-center rounded-xl text-white"
          style={{ background: "var(--bs-grad)" }}
        >
          <Wand2 className="h-5 w-5" />
        </div>
        <div>
          <div className="text-sm font-semibold">Auto Genius Mode</div>
          <div className="text-xs opacity-70">One button → full AI game studio.</div>
        </div>
      </div>

      <div className="mt-3 space-y-2">
        <textarea
          value={idea}
          onChange={(e) => setIdea(e.target.value)}
          placeholder="Describe your game idea — e.g. 'tycoon where you run a pizza shop with quests and pets'"
          rows={3}
          maxLength={4000}
          disabled={analyzing}
          className="w-full resize-none rounded-lg border bg-transparent p-2 text-sm outline-none focus:ring-1"
          style={{ borderColor: "var(--bs-border)" }}
        />
        <button
          type="button"
          onClick={onAnalyze}
          disabled={analyzing || idea.trim().length < 3}
          className="flex w-full items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"
          style={{ background: "var(--bs-grad)" }}
        >
          {analyzing ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Auto Genius is thinking…
            </>
          ) : (
            <>
              <Sparkles className="h-4 w-4" />
              Auto Build Perfect Game
            </>
          )}
        </button>
      </div>

      {analyzeMut.isError ? (
        <div
          className="mt-3 flex items-start gap-2 rounded-lg border p-2 text-xs"
          style={{ borderColor: "rgba(239,68,68,0.4)", background: "rgba(239,68,68,0.08)" }}
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
          <span>{friendly(analyzeMut.error)}</span>
        </div>
      ) : null}

      {result ? (
        <div className="mt-4 space-y-3 text-xs">
          <section>
            <div className="mb-1 flex items-center gap-1.5 font-semibold opacity-80">
              <Brain className="h-3.5 w-3.5" /> Detected
            </div>
            <div className="flex flex-wrap gap-1.5">
              <Chip>{result.analysis.detectedType}</Chip>
              <Chip>{result.analysis.complexity}</Chip>
              <Chip>{result.analysis.uiStyle}</Chip>
              <Chip>~{result.analysis.estimatedScripts} scripts</Chip>
              <Chip>
                Quality target {result.analysis.predictedQualityScore}/10
              </Chip>
            </div>
          </section>

          <section>
            <div className="mb-1 flex items-center gap-1.5 font-semibold opacity-80">
              <Sparkles className="h-3.5 w-3.5" /> Auto-picked specialists
            </div>
            <ul className="space-y-1">
              {result.modelPicks.map((p) => (
                <li
                  key={p.task}
                  className="rounded-md border p-2"
                  style={{ borderColor: "var(--bs-border)" }}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium">{TASK_LABELS[p.task as AutoTask]}</span>
                    <span className="opacity-80">{p.label}</span>
                  </div>
                  <div className="mt-0.5 opacity-60">{p.reason}</div>
                </li>
              ))}
            </ul>
          </section>

          <section>
            <div className="mb-1 flex items-center gap-1.5 font-semibold opacity-80">
              <Target className="h-3.5 w-3.5" /> Build plan
            </div>
            <ol className="list-decimal space-y-0.5 pl-4 opacity-80">
              {result.analysis.buildPlan.map((step, i) => (
                <li key={i}>{step}</li>
              ))}
            </ol>
          </section>

          <section>
            <div className="mb-1 flex items-center gap-1.5 font-semibold opacity-80">
              <CheckCircle2 className="h-3.5 w-3.5" /> Quality targets
            </div>
            <ul className="space-y-0.5 pl-4 opacity-80" style={{ listStyle: "'✓  '" }}>
              {result.analysis.qualityCriteria.map((c, i) => (
                <li key={i}>{c}</li>
              ))}
            </ul>
          </section>

          <button
            type="button"
            onClick={() => launchMut.mutate()}
            disabled={launching || launched}
            className="flex w-full items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"
            style={{ background: "var(--bs-grad)" }}
          >
            {launching ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> Launching pipeline…
              </>
            ) : launched ? (
              <>
                <CheckCircle2 className="h-4 w-4" /> Launched — see Director above
              </>
            ) : (
              <>
                <Rocket className="h-4 w-4" /> Launch full pipeline
              </>
            )}
          </button>

          {launchMut.isError ? (
            <div
              className="flex items-start gap-2 rounded-lg border p-2"
              style={{ borderColor: "rgba(239,68,68,0.4)", background: "rgba(239,68,68,0.08)" }}
            >
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-red-500" />
              <span>{friendly(launchMut.error)}</span>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span
      className="rounded-full border px-2 py-0.5 text-[11px]"
      style={{ borderColor: "var(--bs-border)", background: "var(--bs-card-2, transparent)" }}
    >
      {children}
    </span>
  );
}
