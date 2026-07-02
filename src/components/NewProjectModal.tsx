// NewProjectModal — collects rich project context (name, game type, description,
// style, target device, build goal) so the AI has that context on every turn.
// Renders as a lightweight overlay; parent controls open state so clicking
// "+ New Project" NEVER wipes the surrounding page.
import { useEffect, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { X, Loader2, Sparkles } from "lucide-react";
import { createProject } from "@/lib/projects.functions";
import { toast } from "sonner";

const GAME_TYPES = [
  "Tycoon", "Obby", "Simulator", "RPG", "Horror", "Fighting", "Racing",
  "Roleplay", "Tower Defense", "Shooter", "Adventure", "Puzzle", "Custom",
] as const;

const STYLES = [
  "Cartoon", "Realistic", "Low Poly", "Anime", "Neon / Cyberpunk",
  "Fantasy", "Sci-Fi", "Cute / Chibi", "Dark / Horror", "Retro", "Minimal",
] as const;

const DEVICES = ["PC", "Mobile", "Console", "PC + Mobile", "All Devices"] as const;

const GOALS = [
  "Prototype quickly",
  "Full playable game",
  "Learn / experiment",
  "Polish an existing idea",
  "Publish to Roblox",
] as const;

export function NewProjectModal({
  open, onClose, onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const createFn = useServerFn(createProject);
  const [name, setName] = useState("");
  const [gameType, setGameType] = useState<string>("Custom");
  const [description, setDescription] = useState("");
  const [style, setStyle] = useState<string>("Cartoon");
  const [device, setDevice] = useState<string>("PC + Mobile");
  const [goal, setGoal] = useState<string>("Full playable game");
  const nameRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!open) return;
    // Reset each time it opens so it feels like a clean flow.
    setName(""); setGameType("Custom"); setDescription("");
    setStyle("Cartoon"); setDevice("PC + Mobile"); setGoal("Full playable game");
    const t = setTimeout(() => nameRef.current?.focus(), 50);
    return () => clearTimeout(t);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const mut = useMutation({
    mutationFn: async () => {
      const cleanName = name.trim() || `New ${gameType} Game`;
      // Compose a rich description so the AI sees full project context.
      // Description column is capped at 500 chars.
      const briefLines = [
        `Type: ${gameType}`,
        `Style: ${style}`,
        `Target: ${device}`,
        `Goal: ${goal}`,
      ];
      if (description.trim()) briefLines.push(`Notes: ${description.trim()}`);
      const brief = briefLines.join(" • ").slice(0, 500);
      return createFn({
        data: {
          name: cleanName.slice(0, 80),
          description: brief,
          game_type: gameType.toLowerCase().replace(/[^a-z0-9]+/g, "_").slice(0, 40) || "custom",
        },
      });
    },
    onSuccess: (p: any) => {
      try { localStorage.setItem("bs:activeProjectId", p.id); } catch {}
      toast.success(`Created "${p.name}"`);
      onCreated(p.id);
      onClose();
    },
    onError: (e: any) => toast.error(e?.message || "Couldn't create the project."),
  });

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-6">
      <button
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Create a new project"
        className="relative z-10 w-full max-w-[560px] overflow-hidden rounded-2xl border border-white/15 bg-[#0f0f22] shadow-2xl"
      >
        <div className="flex items-center justify-between border-b border-white/10 px-5 py-3">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-indigo-300" />
            <h2 className="text-sm font-bold text-white">Create a new project</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-slate-400 hover:bg-white/5 hover:text-white"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form
          onSubmit={(e) => { e.preventDefault(); if (!mut.isPending) mut.mutate(); }}
          className="max-h-[75vh] space-y-4 overflow-y-auto px-5 py-4"
        >
          <Field label="Project name">
            <input
              ref={nameRef}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Neon Tycoon"
              maxLength={80}
              className="w-full rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-sm text-white outline-none placeholder:text-slate-500 focus:border-indigo-400/60"
            />
          </Field>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Game type">
              <Select value={gameType} onChange={setGameType} options={GAME_TYPES as readonly string[]} />
            </Field>
            <Field label="Style">
              <Select value={style} onChange={setStyle} options={STYLES as readonly string[]} />
            </Field>
            <Field label="Target device">
              <Select value={device} onChange={setDevice} options={DEVICES as readonly string[]} />
            </Field>
            <Field label="Build goal">
              <Select value={goal} onChange={setGoal} options={GOALS as readonly string[]} />
            </Field>
          </div>

          <Field label="Description (optional)">
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe the game — mechanics, vibe, unique twist…"
              rows={3}
              maxLength={400}
              className="w-full resize-none rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-sm text-white outline-none placeholder:text-slate-500 focus:border-indigo-400/60"
            />
          </Field>

          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-white/15 bg-white/[0.04] px-3 py-2 text-xs font-semibold text-slate-200 hover:bg-white/[0.1]"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={mut.isPending}
              className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-500 px-4 py-2 text-xs font-bold text-white shadow-[0_10px_30px_-12px_rgba(99,102,241,0.7)] transition hover:bg-indigo-400 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {mut.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
              {mut.isPending ? "Creating…" : "Create project"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-slate-400">{label}</span>
      {children}
    </label>
  );
}

function Select({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: readonly string[] }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-sm text-white outline-none focus:border-indigo-400/60"
    >
      {options.map((o) => <option key={o} value={o} className="bg-[#0f0f22]">{o}</option>)}
    </select>
  );
}
