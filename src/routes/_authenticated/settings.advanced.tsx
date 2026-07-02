// Hidden advanced settings for power users. Not linked from the main UI —
// reachable via direct URL /settings/advanced. Normal users only ever see
// the BloxSmith Agent pill; this page exposes the underlying model override.

import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AlertTriangle, ArrowLeft, Brain, Check, RotateCcw } from "lucide-react";
import { MODELS, DEFAULT_MODEL_ID, isSelectable } from "@/lib/models";

export const Route = createFileRoute("/_authenticated/settings/advanced")({
  head: () => ({
    meta: [
      { title: "Advanced Settings — BloxSmith" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: AdvancedSettingsPage,
});

const STORAGE_KEY = "bs-advanced-model";

function AdvancedSettingsPage() {
  const [override, setOverride] = useState<string>("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    setOverride(localStorage.getItem(STORAGE_KEY) ?? "");
  }, []);

  function save(id: string) {
    setOverride(id);
    if (typeof window !== "undefined") {
      if (id) localStorage.setItem(STORAGE_KEY, id);
      else localStorage.removeItem(STORAGE_KEY);
    }
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  }

  const selectable = MODELS.filter((m) => isSelectable(m));

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
        <Link
          to="/settings"
          className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Back to Settings
        </Link>

        <header className="mt-4 flex items-start gap-4">
          <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-primary/10">
            <Brain className="h-6 w-6 text-primary" />
          </div>
          <div className="min-w-0">
            <h1 className="font-display text-2xl font-bold tracking-tight">Advanced AI Settings</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              For power users. Normal users see only <span className="font-semibold text-foreground">BloxSmith Agent</span>,
              which routes each task to the best model automatically.
            </p>
          </div>
        </header>

        <div className="mt-6 rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-4 w-4 shrink-0 text-amber-500" />
            <div className="text-xs leading-relaxed text-foreground/80">
              Overriding the model disables intelligent routing. Every task — planning, scripting, UI, QA — will use the
              model you pick here. If you don&apos;t know which to choose, leave this as <em>Auto (recommended)</em>.
            </div>
          </div>
        </div>

        <section className="mt-6 rounded-2xl border border-border bg-card p-5">
          <h2 className="font-display text-sm font-bold uppercase tracking-widest text-muted-foreground">
            Model override
          </h2>

          <div className="mt-4 space-y-2">
            <button
              onClick={() => save("")}
              className={`flex w-full items-center gap-3 rounded-xl border p-3 text-left transition ${
                override === "" ? "border-primary bg-primary/10" : "border-border hover:border-primary/40"
              }`}
            >
              <RotateCcw className="h-4 w-4 text-primary" />
              <div className="flex-1">
                <div className="text-sm font-semibold">Auto (recommended)</div>
                <div className="text-xs text-muted-foreground">
                  Let BloxSmith Agent pick the best model per task.
                </div>
              </div>
              {override === "" && <Check className="h-4 w-4 text-primary" />}
            </button>

            {selectable.map((m) => (
              <button
                key={m.id}
                onClick={() => save(m.id)}
                className={`flex w-full items-center gap-3 rounded-xl border p-3 text-left transition ${
                  override === m.id ? "border-primary bg-primary/10" : "border-border hover:border-primary/40"
                }`}
              >
                <div className="flex-1 min-w-0">
                  <div className="truncate text-sm font-semibold">{m.label}</div>
                  <div className="truncate text-xs text-muted-foreground">
                    {m.provider} · {m.via ?? "gateway"}
                  </div>
                </div>
                {override === m.id && <Check className="h-4 w-4 text-primary" />}
              </button>
            ))}
          </div>

          {saved && (
            <div className="mt-3 text-xs font-semibold text-primary">
              Saved. New chats will use this model.
            </div>
          )}

          <div className="mt-4 text-[11px] text-muted-foreground">
            Default: <code className="rounded bg-secondary px-1 py-0.5">{DEFAULT_MODEL_ID}</code>
          </div>
        </section>
      </div>
    </div>
  );
}
