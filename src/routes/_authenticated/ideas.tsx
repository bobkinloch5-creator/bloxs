import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { createProject } from "@/lib/projects.functions";
import { getMyProfile } from "@/lib/profile.functions";
import { PageShell } from "@/components/PageShell";
import { Lightbulb, Sparkles, Loader2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/ideas")({
  head: () => ({ meta: [
    { title: "Game Ideas — BloxSmith" },
    { name: "description", content: "Fresh Roblox game concepts you can start with one click." },
  ]}),
  component: IdeasPage,
});

const IDEAS = [
  { title: "Pet Adventure Simulator", desc: "Collect pets, explore worlds, become the best.",  diff: "Easy",   sys: ["Pets","Shop","Saves"],          tone: "from-emerald-500/20 to-blue-500/10" },
  { title: "Sky Island Obby",         desc: "Hop floating islands across the clouds.",         diff: "Easy",   sys: ["Stages","Checkpoints"],         tone: "from-sky-500/20 to-cyan-400/10" },
  { title: "Zombie Survival City",    desc: "Survive waves, build a base, unlock weapons.",    diff: "Medium", sys: ["Waves","Crafting","Combat"],    tone: "from-rose-500/20 to-orange-500/10" },
  { title: "Medieval Quest RPG",      desc: "Quests, dungeons, classes, epic battles.",        diff: "Hard",   sys: ["Quests","Inventory","NPCs"],    tone: "from-amber-500/20 to-yellow-400/10" },
  { title: "Theme Park Tycoon",       desc: "Build rides, hire staff, attract guests.",        diff: "Medium", sys: ["Economy","Builders","Saves"],   tone: "from-fuchsia-500/20 to-pink-400/10" },
  { title: "Neon Racing World",       desc: "Speed across tracks in upgraded vehicles.",       diff: "Medium", sys: ["Tracks","Cars","Laps"],         tone: "from-violet-500/20 to-blue-400/10" },
  { title: "Anime Battle Arena",      desc: "Pick a fighter, unleash abilities, climb ranks.", diff: "Hard",   sys: ["Combat","Ranks","Skills"],      tone: "from-indigo-500/20 to-purple-400/10" },
  { title: "Ocean Diving Sim",        desc: "Dive deep, find treasure, upgrade your gear.",    diff: "Easy",   sys: ["Diving","Shop","Quests"],       tone: "from-teal-500/20 to-cyan-500/10" },
  { title: "Cooking Cafe Tycoon",     desc: "Run a cafe, serve customers, grow your empire.",  diff: "Easy",   sys: ["Economy","Customers","Saves"],  tone: "from-orange-500/20 to-amber-400/10" },
];

const DIFF_COLOR: Record<string,string> = {
  Easy:   "bg-emerald-500/15 text-emerald-300",
  Medium: "bg-amber-500/15 text-amber-300",
  Hard:   "bg-rose-500/15 text-rose-300",
};

function IdeasPage() {
  const navigate = useNavigate();
  const createFn = useServerFn(createProject);
  const profFn = useServerFn(getMyProfile);
  const { data: profile } = useQuery({ queryKey: ["profile"], queryFn: () => profFn() });

  const mut = useMutation({
    mutationFn: (i: typeof IDEAS[number]) => createFn({ data: { name: i.title, description: i.desc, game_type: "custom" } }),
    onSuccess: (p) => navigate({ to: "/project/$projectId", params: { projectId: p.id } }),
  });

  return (
    <PageShell
      title="Game Ideas"
      description="Tap an idea — we'll spin up a project ready to build."
      accent="ideas"
      activeKey="ideas"
      isAdmin={!!profile?.is_admin}
    >
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {IDEAS.map((i) => (
          <div
            key={i.title}
            className={`relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br ${i.tone} p-5 backdrop-blur-sm transition hover:border-amber-400/40`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="grid h-10 w-10 place-items-center rounded-xl bg-white/10">
                <Lightbulb className="h-5 w-5 text-amber-300" />
              </div>
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${DIFF_COLOR[i.diff]}`}>
                {i.diff}
              </span>
            </div>
            <h3 className="mt-3 text-base font-extrabold">{i.title}</h3>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{i.desc}</p>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {i.sys.map((s) => (
                <span key={s} className="rounded-md bg-white/5 px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">{s}</span>
              ))}
            </div>
            <button
              onClick={() => mut.mutate(i)}
              disabled={mut.isPending}
              className="mt-4 inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-white/10 px-3 py-2 text-xs font-semibold transition hover:bg-white/15 disabled:opacity-50"
            >
              {mut.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
              Start this idea
            </button>
          </div>
        ))}
      </div>
    </PageShell>
  );
}
