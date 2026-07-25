import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import {
  Hammer, Loader2, Sparkles, Package, Rocket, AlertTriangle,
  CheckCircle2, RefreshCw, Boxes, Mountain, LayoutDashboard, Cpu,
} from "lucide-react";
import { PageShell } from "@/components/PageShell";
import { getMyProfile } from "@/lib/profile.functions";
import { listProjects } from "@/lib/projects.functions";
import {
  getBuilderCatalog, planGameBuild, queueGameBuild, regenerateScripts,
  installMarketplacePack, exportStudioProject,
} from "@/lib/game-builder.functions";

export const Route = createFileRoute("/_authenticated/builder")({
  head: () => ({
    meta: [
      { title: "Game Builder - BloxSmith" },
      {
        name: "description",
        content:
          "Plan and build a complete Roblox game: systems, gameplay, UI, terrain and a Studio-ready export.",
      },
    ],
  }),
  component: GameBuilder,
});

const EXAMPLES = [
  "A pet simulator called Bubble Pets: hatch eggs, coins, rebirth, trading, daily rewards and a floating island world",
  "An RPG called Elder Hollow with quests, combat, skills, inventory, NPC dialogue and a dungeon map",
  "A mining tycoon with droppers, conveyors, upgrades, gamepasses and an underground mine",
  "A 12 stage obby with checkpoints, timer leaderboard and a floating island course",
  "A tower defense game with waves, tower placement, currency and matchmaking",
  "A horror survival game with hunger, stamina, flashlight, jump scares and a foggy forest",
];

type CatalogShape = {
  genres: Array<{ key: string; label: string; pitch: string }>;
  systems: Array<{ key: string; label: string; category: string; description: string }>;
  features: Array<{ key: string; label: string; summary: string }>;
  screens: Array<{ key: string; label: string }>;
  themes: string[];
  terrain: Array<{ key: string; label: string }>;
  packs: Array<{ id: string; name: string; category: string; description: string }>;
};

type PlanShape = {
  title: string;
  genre: { key: string; label: string; pitch: string };
  systems: Array<{ key: string; label: string }>;
  features: string[];
  screens: Array<{ key: string; label: string }>;
  terrain: { label: string } | null;
  remotes: string[];
  artifacts: Array<{
    id: string; name: string; className: string; parentPath: string; group: string; lines: number; why: string;
  }>;
  summary: string[];
  issues: Array<{ artifactId: string; issues: Array<{ message: string }> }>;
};

function Chip({ active, children, onClick }: { active?: boolean; children: ReactNode; onClick?: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
        active
          ? "border-indigo-400/60 bg-indigo-500/20 text-indigo-100"
          : "border-white/10 bg-white/5 text-white/60 hover:border-white/25 hover:text-white"
      }`}
    >
      {children}
    </button>
  );
}

function Panel({
  title, icon: Icon, children, right,
}: { title: string; icon: typeof Hammer; children: ReactNode; right?: ReactNode }) {
  return (
    <section className="rounded-2xl border border-white/10 bg-[#0d0d22]/70 p-4 sm:p-5">
      <header className="mb-3 flex items-center gap-2">
        <Icon className="h-4 w-4 text-indigo-300" />
        <h2 className="text-sm font-semibold uppercase tracking-wider text-white/80">{title}</h2>
        <div className="ml-auto">{right}</div>
      </header>
      {children}
    </section>
  );
}

function downloadTextFile(content: string, filename: string) {
  const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function GameBuilder() {
  const profileFn = useServerFn(getMyProfile);
  const catalogFn = useServerFn(getBuilderCatalog);
  const projectsFn = useServerFn(listProjects);
  const planFn = useServerFn(planGameBuild);
  const queueFn = useServerFn(queueGameBuild);
  const regenFn = useServerFn(regenerateScripts);
  const packFn = useServerFn(installMarketplacePack);
  const exportFn = useServerFn(exportStudioProject);

  const { data: profile } = useQuery({ queryKey: ["profile"], queryFn: () => profileFn() });
  const { data: catalog } = useQuery({ queryKey: ["builder-catalog"], queryFn: () => catalogFn() });
  const { data: projects } = useQuery({ queryKey: ["projects"], queryFn: () => projectsFn() });

  const cat = catalog as CatalogShape | undefined;
  const projectList = (projects as Array<{ id: string; name?: string }> | undefined) ?? [];

  const [prompt, setPrompt] = useState("");
  const [title, setTitle] = useState("");
  const [genre, setGenre] = useState<string | undefined>(undefined);
  const [theme, setTheme] = useState<string | undefined>(undefined);
  const [terrain, setTerrain] = useState<string | null | undefined>(undefined);
  const [extraSystems, setExtraSystems] = useState<string[]>([]);
  const [extraScreens, setExtraScreens] = useState<string[]>([]);
  const [packs, setPacks] = useState<string[]>([]);
  const [projectId, setProjectId] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [status, setStatus] = useState<string | null>(null);

  const activeProject = projectId || projectList[0]?.id || "";

  const request = useMemo(
    () => ({
      prompt,
      title: title || undefined,
      genre,
      theme,
      terrain: terrain === undefined ? undefined : terrain,
      systems: extraSystems.length ? extraSystems : undefined,
      screens: extraScreens.length ? extraScreens : undefined,
      packs: packs.length ? packs : undefined,
    }),
    [prompt, title, genre, theme, terrain, extraSystems, extraScreens, packs],
  );

  const plan = useMutation({
    mutationFn: () => planFn({ data: request }),
    onSuccess: () => setStatus(null),
    onError: (error: Error) => setStatus(error.message),
  });

  const build = useMutation({
    mutationFn: () => queueFn({ data: { ...request, projectId: activeProject } }),
    onSuccess: (result: { queued: number }) =>
      setStatus(`Queued ${result.queued} actions. Open the Studio plugin and press Sync.`),
    onError: (error: Error) => setStatus(error.message),
  });

  const regen = useMutation({
    mutationFn: () =>
      regenFn({
        data: {
          ...request,
          projectId: activeProject,
          selectors: selected,
          strategy: "append_section" as const,
        },
      }),
    onSuccess: (result: { queued: number; skipped: string[] }) =>
      setStatus(`Regenerated ${result.queued} script(s); left ${result.skipped.length} untouched.`),
    onError: (error: Error) => setStatus(error.message),
  });

  const installPack = useMutation({
    mutationFn: (packId: string) => packFn({ data: { projectId: activeProject, packId } }),
    onSuccess: (result: { queued: number; pack: { name: string } }) =>
      setStatus(`Installed ${result.pack.name} (${result.queued} actions queued).`),
    onError: (error: Error) => setStatus(error.message),
  });

  const exportProject = useMutation({
    mutationFn: () => exportFn({ data: { ...request, projectName: title || undefined } }),
    onSuccess: (result: { projectName: string; files: Array<{ path: string; content: string }> }) => {
      const installer = result.files.find((file) => file.path.endsWith("BloxSmith_Install.lua"));
      if (installer) downloadTextFile(installer.content, "BloxSmith_Install.lua");
      setStatus(
        `Export ready for ${result.projectName} (${result.files.length} files). The Studio installer script was downloaded - paste it into the Command Bar.`,
      );
    },
    onError: (error: Error) => setStatus(error.message),
  });

  const planData = plan.data as PlanShape | undefined;
  const busy = plan.isPending || build.isPending || regen.isPending || exportProject.isPending;

  const toggle = (list: string[], value: string, set: (next: string[]) => void) =>
    set(list.includes(value) ? list.filter((entry) => entry !== value) : [...list, value]);

  return (
    <PageShell
      title="Game Builder"
      description="Describe a game. BloxSmith plans the systems, gameplay, UI, world and export, then queues it straight into Roblox Studio."
      accent="chat"
      activeKey="builder"
      isAdmin={!!(profile as { is_admin?: boolean } | undefined)?.is_admin}
    >
      <div className="space-y-5">
        <Panel title="Brief" icon={Sparkles}>
          <textarea
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            rows={5}
            placeholder="Describe the whole game: genre, systems, monetisation, UI, world..."
            className="w-full resize-y rounded-xl border border-white/10 bg-black/40 p-3 text-sm text-white/90 outline-none focus:border-indigo-400/60"
          />
          <div className="mt-3 flex flex-wrap gap-2">
            {EXAMPLES.map((example) => (
              <Chip key={example} onClick={() => setPrompt(example)}>
                {example.slice(0, 46)}...
              </Chip>
            ))}
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Game title (optional)"
              className="rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-white/90 outline-none focus:border-indigo-400/60"
            />
            <select
              value={genre ?? ""}
              onChange={(event) => setGenre(event.target.value || undefined)}
              className="rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-white/90 outline-none"
            >
              <option value="">Genre: auto detect</option>
              {(cat?.genres ?? []).map((entry) => (
                <option key={entry.key} value={entry.key}>{entry.label}</option>
              ))}
            </select>
            <select
              value={theme ?? ""}
              onChange={(event) => setTheme(event.target.value || undefined)}
              className="rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-white/90 outline-none"
            >
              <option value="">UI theme: default</option>
              {(cat?.themes ?? []).map((entry) => (
                <option key={entry} value={entry}>{entry}</option>
              ))}
            </select>
          </div>
        </Panel>

        <div className="grid gap-5 lg:grid-cols-2">
          <Panel title="Extra systems" icon={Cpu}>
            <div className="flex flex-wrap gap-2">
              {(cat?.systems ?? []).map((system) => (
                <Chip
                  key={system.key}
                  active={extraSystems.includes(system.key)}
                  onClick={() => toggle(extraSystems, system.key, setExtraSystems)}
                >
                  {system.label}
                </Chip>
              ))}
            </div>
          </Panel>

          <Panel title="Extra UI screens" icon={LayoutDashboard}>
            <div className="flex flex-wrap gap-2">
              {(cat?.screens ?? []).map((screen) => (
                <Chip
                  key={screen.key}
                  active={extraScreens.includes(screen.key)}
                  onClick={() => toggle(extraScreens, screen.key, setExtraScreens)}
                >
                  {screen.label}
                </Chip>
              ))}
            </div>
          </Panel>

          <Panel title="Terrain" icon={Mountain}>
            <div className="flex flex-wrap gap-2">
              <Chip active={terrain === undefined} onClick={() => setTerrain(undefined)}>Auto</Chip>
              <Chip active={terrain === null} onClick={() => setTerrain(null)}>None</Chip>
              {(cat?.terrain ?? []).map((entry) => (
                <Chip key={entry.key} active={terrain === entry.key} onClick={() => setTerrain(entry.key)}>
                  {entry.label}
                </Chip>
              ))}
            </div>
          </Panel>

          <Panel title="Plugin marketplace" icon={Package}>
            <div className="space-y-2">
              {(cat?.packs ?? []).map((pack) => (
                <div key={pack.id} className="flex items-start gap-3 rounded-xl border border-white/5 bg-black/30 p-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-white/90">{pack.name}</p>
                    <p className="truncate text-xs text-white/50">{pack.description}</p>
                  </div>
                  <Chip active={packs.includes(pack.id)} onClick={() => toggle(packs, pack.id, setPacks)}>
                    {packs.includes(pack.id) ? "In build" : "Add"}
                  </Chip>
                  <Chip onClick={() => activeProject && installPack.mutate(pack.id)}>Install now</Chip>
                </div>
              ))}
            </div>
          </Panel>
        </div>

        <Panel
          title="Build"
          icon={Hammer}
          right={
            <select
              value={activeProject}
              onChange={(event) => setProjectId(event.target.value)}
              className="rounded-lg border border-white/10 bg-black/40 px-2 py-1 text-xs text-white/80 outline-none"
            >
              {projectList.map((project) => (
                <option key={project.id} value={project.id}>{project.name ?? project.id.slice(0, 8)}</option>
              ))}
            </select>
          }
        >
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              disabled={busy || prompt.trim().length < 3}
              onClick={() => plan.mutate()}
              className="inline-flex items-center gap-2 rounded-xl bg-indigo-500 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              {plan.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              Plan build
            </button>
            <button
              type="button"
              disabled={busy || !activeProject || prompt.trim().length < 3}
              onClick={() => build.mutate()}
              className="inline-flex items-center gap-2 rounded-xl bg-emerald-500 px-4 py-2 text-sm font-semibold text-black disabled:opacity-50"
            >
              {build.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Rocket className="h-4 w-4" />}
              Build in Studio
            </button>
            <button
              type="button"
              disabled={busy || !activeProject || selected.length === 0}
              onClick={() => regen.mutate()}
              className="inline-flex items-center gap-2 rounded-xl border border-white/15 px-4 py-2 text-sm font-semibold text-white/80 disabled:opacity-50"
            >
              {regen.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              Regenerate selected ({selected.length})
            </button>
            <button
              type="button"
              disabled={busy || prompt.trim().length < 3}
              onClick={() => exportProject.mutate()}
              className="inline-flex items-center gap-2 rounded-xl border border-white/15 px-4 py-2 text-sm font-semibold text-white/80 disabled:opacity-50"
            >
              {exportProject.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Boxes className="h-4 w-4" />}
              Export Studio project
            </button>
          </div>

          {status ? (
            <p className="mt-3 flex items-start gap-2 whitespace-pre-wrap rounded-xl border border-white/10 bg-black/40 p-3 text-xs text-white/70">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
              {status}
            </p>
          ) : null}
        </Panel>

        {planData ? (
          <Panel title={`Plan: ${planData.title}`} icon={Boxes}>
            <p className="text-sm text-white/70">
              {planData.genre.label} - {planData.genre.pitch}
            </p>
            <ul className="mt-3 grid gap-1 text-xs text-white/60 sm:grid-cols-2">
              {planData.summary.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>

            {planData.issues.length > 0 ? (
              <div className="mt-3 rounded-xl border border-amber-400/30 bg-amber-500/10 p-3 text-xs text-amber-200">
                <p className="mb-1 flex items-center gap-2 font-semibold">
                  <AlertTriangle className="h-4 w-4" /> Validator notes
                </p>
                {planData.issues.map((entry) => (
                  <p key={entry.artifactId}>
                    {entry.artifactId}: {entry.issues.map((issue) => issue.message).join("; ")}
                  </p>
                ))}
              </div>
            ) : null}

            <div className="mt-4 overflow-hidden rounded-xl border border-white/10">
              <table className="w-full text-left text-xs">
                <thead className="bg-white/5 text-white/50">
                  <tr>
                    <th className="px-3 py-2">Pick</th>
                    <th className="px-3 py-2">Script</th>
                    <th className="px-3 py-2">Class</th>
                    <th className="px-3 py-2">Service path</th>
                    <th className="px-3 py-2">Lines</th>
                  </tr>
                </thead>
                <tbody>
                  {planData.artifacts.map((artifact) => (
                    <tr key={artifact.id} className="border-t border-white/5 text-white/70">
                      <td className="px-3 py-2">
                        <input
                          type="checkbox"
                          checked={selected.includes(artifact.id)}
                          onChange={() => toggle(selected, artifact.id, setSelected)}
                        />
                      </td>
                      <td className="px-3 py-2 font-medium text-white/90">{artifact.name}</td>
                      <td className="px-3 py-2">{artifact.className}</td>
                      <td className="px-3 py-2 text-white/50">{artifact.parentPath}</td>
                      <td className="px-3 py-2">{artifact.lines}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
        ) : null}
      </div>
    </PageShell>
  );
}
