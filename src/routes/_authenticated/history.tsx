import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getMyProfile } from "@/lib/profile.functions";
import { listProjects } from "@/lib/projects.functions";
import { PageShell, EmptyState } from "@/components/PageShell";
import { History as HistoryIcon, Hammer, Plus } from "lucide-react";

export const Route = createFileRoute("/_authenticated/history")({
  head: () => ({ meta: [
    { title: "History — BloxSmith" },
    { name: "description", content: "Your recent BloxSmith projects and build activity." },
  ]}),
  component: HistoryPage,
});

function HistoryPage() {
  const profFn = useServerFn(getMyProfile);
  const listFn = useServerFn(listProjects);
  const { data: profile } = useQuery({ queryKey: ["profile"], queryFn: () => profFn() });
  const { data: projects = [], isLoading } = useQuery({ queryKey: ["projects"], queryFn: () => listFn() });

  const sorted = [...projects].sort((a, b) =>
    new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
  );

  return (
    <PageShell
      title="History"
      description="Recent project activity and builds across your BloxSmith workspace."
      accent="history"
      activeKey="hist"
      isAdmin={!!profile?.is_admin}
    >
      {isLoading ? (
        <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-10 text-center text-sm text-muted-foreground">
          Loading…
        </div>
      ) : sorted.length === 0 ? (
        <EmptyState
          icon={HistoryIcon}
          title="No history yet"
          description="As you create projects and run AI builds, you'll see every change here in order."
          action={
            <Link to="/dashboard" className="inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-blue-500 to-violet-500 px-4 py-2.5 text-sm font-semibold text-white">
              <Plus className="h-4 w-4" /> Create a project
            </Link>
          }
        />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.02] backdrop-blur-sm">
          <table className="w-full text-left text-sm">
            <thead className="bg-white/[0.03] text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-4 py-3">Project</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3">Builds</th>
                <th className="px-4 py-3">Last update</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {sorted.map((p) => (
                <tr key={p.id} className="transition hover:bg-white/[0.03]">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2 font-semibold">
                      <span className="grid h-7 w-7 place-items-center rounded-md bg-blue-500/15 text-blue-300">
                        <Hammer className="h-3.5 w-3.5" />
                      </span>
                      {p.name}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">{p.game_type || "custom"}</td>
                  <td className="px-4 py-3 text-xs">{p.build_count ?? 0}</td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">{new Date(p.updated_at).toLocaleString()}</td>
                  <td className="px-4 py-3 text-right">
                    <Link to="/project/$projectId" params={{ projectId: p.id }} className="text-xs font-semibold text-blue-300 hover:underline">
                      Open
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </PageShell>
  );
}
