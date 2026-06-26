import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listProjects } from "@/lib/projects.functions";
import { getMyProfile } from "@/lib/profile.functions";
import { PageShell, EmptyState } from "@/components/PageShell";
import { MessageSquare, ArrowRight, Sparkles, Folder, Plus, Mic } from "lucide-react";

export const Route = createFileRoute("/_authenticated/chat")({
  head: () => ({ meta: [
    { title: "AI Chat — BloxSmith" },
    { name: "description", content: "Talk to BloxSmith AI inside any of your Roblox projects." },
  ]}),
  component: ChatHub,
});

function ChatHub() {
  const listFn = useServerFn(listProjects);
  const profFn = useServerFn(getMyProfile);
  const { data: projects = [], isLoading } = useQuery({ queryKey: ["projects"], queryFn: () => listFn() });
  const { data: profile } = useQuery({ queryKey: ["profile"], queryFn: () => profFn() });

  return (
    <PageShell
      title="AI Chat"
      description="Your BloxSmith AI command center — open a project to start building with chat."
      accent="chat"
      activeKey="chat"
      isAdmin={!!profile?.is_admin}
      actions={
        <div className="flex items-center gap-2">
          <Link to="/voice" className="inline-flex items-center gap-1.5 rounded-lg border border-cyan-400/30 bg-cyan-400/10 px-3 py-2 text-xs font-semibold text-cyan-100 transition hover:bg-cyan-400/20">
            <Mic className="h-3.5 w-3.5" /> Voice Chat
          </Link>
          <Link to="/dashboard" className="inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-blue-500 to-violet-500 px-3 py-2 text-xs font-semibold text-white">
            <Plus className="h-3.5 w-3.5" /> New Project
          </Link>
        </div>
      }
    >
      <section className="rounded-2xl border border-white/10 bg-gradient-to-br from-blue-500/10 via-transparent to-violet-500/10 p-6 backdrop-blur-sm">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-blue-300">
          <Sparkles className="h-3.5 w-3.5" /> BloxSmith AI Builder
        </div>
        <h2 className="mt-2 text-xl font-extrabold">Chat lives inside each project</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Pick a project below to open its AI build conversation. Each project keeps its own message history, model
          choice, and Studio plugin queue.
        </p>
      </section>

      {isLoading ? (
        <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-10 text-center text-sm text-muted-foreground">
          Loading your projects…
        </div>
      ) : projects.length === 0 ? (
        <EmptyState
          icon={MessageSquare}
          title="No projects yet"
          description="Create a project first — that's where AI chat happens. Each one becomes its own buildable Roblox game."
          action={
            <Link to="/dashboard" className="inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-blue-500 to-violet-500 px-4 py-2.5 text-sm font-semibold text-white">
              <Plus className="h-4 w-4" /> Create your first project
            </Link>
          }
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((p) => (
            <Link
              key={p.id}
              to="/project/$projectId"
              params={{ projectId: p.id }}
              className="group rounded-2xl border border-white/10 bg-white/[0.03] p-4 backdrop-blur-sm transition hover:border-blue-400/40 hover:bg-blue-500/[0.06]"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="grid h-10 w-10 place-items-center rounded-xl bg-blue-500/15 text-blue-300">
                  <Folder className="h-5 w-5" />
                </div>
                <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {p.game_type || "custom"}
                </span>
              </div>
              <div className="mt-3 truncate text-sm font-bold">{p.name}</div>
              <div className="mt-1 text-xs text-muted-foreground">
                {p.build_count ?? 0} build{(p.build_count ?? 0) === 1 ? "" : "s"} ·{" "}
                {new Date(p.updated_at).toLocaleDateString()}
              </div>
              <div className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-blue-300 opacity-0 transition group-hover:opacity-100">
                Open chat <ArrowRight className="h-3 w-3" />
              </div>
            </Link>
          ))}
        </div>
      )}
    </PageShell>
  );
}
