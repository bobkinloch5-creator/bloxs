import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getMyProfile } from "@/lib/profile.functions";
import { listProjects } from "@/lib/projects.functions";
import { listMyInvites, respondToInvite } from "@/lib/collab.functions";
import { PageShell } from "@/components/PageShell";
import { Users, UserPlus, Folder, Check, X, ArrowRight } from "lucide-react";
import { toast } from "sonner";
import { friendlyError } from "@/lib/friendly-error";

export const Route = createFileRoute("/_authenticated/collaborators")({
  head: () => ({ meta: [
    { title: "Collaborators — BloxSmith" },
    { name: "description", content: "Invite teammates and build Roblox games together in real time." },
  ]}),
  component: CollaboratorsPage,
});

function CollaboratorsPage() {
  const qc = useQueryClient();
  const profFn = useServerFn(getMyProfile);
  const projectsFn = useServerFn(listProjects);
  const invitesFn = useServerFn(listMyInvites);
  const respondFn = useServerFn(respondToInvite);

  const { data: profile } = useQuery({ queryKey: ["profile"], queryFn: () => profFn() });
  const { data: projects = [] } = useQuery({ queryKey: ["projects"], queryFn: () => projectsFn() });
  const { data: invites = [] } = useQuery({ queryKey: ["my-invites"], queryFn: () => invitesFn() });

  const respondMut = useMutation({
    mutationFn: (v: { invite_id: string; accept: boolean }) => respondFn({ data: v }),
    onSuccess: (_d, vars) => {
      toast.success(vars.accept ? "Joined project" : "Invite declined");
      qc.invalidateQueries({ queryKey: ["my-invites"] });
      qc.invalidateQueries({ queryKey: ["projects"] });
    },
    onError: (e) => toast.error(friendlyError(e)),
  });

  return (
    <PageShell
      title="Collaborators"
      description="Build together — invite teammates, share projects, chat live."
      accent="collaborators"
      activeKey="co"
      isAdmin={!!profile?.is_admin}
    >
      {invites.length > 0 && (
        <div className="rounded-2xl border border-pink-500/30 bg-gradient-to-br from-pink-500/10 to-violet-500/5 p-5 backdrop-blur-sm">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-pink-300 mb-3">
            <UserPlus className="h-3.5 w-3.5" /> {invites.length} pending invite{invites.length === 1 ? "" : "s"}
          </div>
          <div className="space-y-2">
            {invites.map((i: any) => (
              <div key={i.id} className="flex items-center justify-between rounded-xl bg-black/30 border border-white/10 px-4 py-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="h-9 w-9 rounded-lg bg-gradient-to-br from-violet-500 to-pink-500 flex items-center justify-center text-white font-bold flex-shrink-0">
                    {(i.project?.name?.[0] || "?").toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-semibold truncate">{i.project?.name || "Project"}</div>
                    <div className="text-xs text-muted-foreground truncate">
                      from @{i.inviter?.username || "user"} · role: {i.role}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button
                    onClick={() => respondMut.mutate({ invite_id: i.id, accept: false })}
                    className="rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 px-3 py-1.5 text-xs"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => respondMut.mutate({ invite_id: i.id, accept: true })}
                    className="rounded-lg bg-gradient-to-r from-violet-500 to-pink-500 text-white px-3 py-1.5 text-xs font-semibold flex items-center gap-1"
                  >
                    <Check className="h-3.5 w-3.5" /> Accept
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="rounded-2xl border border-white/10 bg-card/60 backdrop-blur-sm p-5">
        <h2 className="text-lg font-extrabold flex items-center gap-2"><Users className="h-5 w-5 text-violet-400" /> Manage a project's team</h2>
        <p className="text-sm text-muted-foreground mt-1 mb-4">
          Open any project to invite teammates, set roles, and use team chat.
        </p>
        {projects.length === 0 ? (
          <div className="text-sm text-muted-foreground text-center py-6">
            No projects yet. <Link to="/dashboard" className="text-violet-400 underline">Create one</Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {projects.map((p: any) => (
              <Link
                key={p.id}
                to="/project/$projectId"
                params={{ projectId: p.id }}
                className="flex items-center justify-between rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 px-3 py-2.5 transition group"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-violet-500/30 to-pink-500/30 flex items-center justify-center flex-shrink-0">
                    <Folder className="h-4 w-4 text-violet-300" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-medium truncate">{p.name}</div>
                    <div className="text-xs text-muted-foreground truncate">{p.game_type}</div>
                  </div>
                </div>
                <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition" />
              </Link>
            ))}
          </div>
        )}
      </div>
    </PageShell>
  );
}
