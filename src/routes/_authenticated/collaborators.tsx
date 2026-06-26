import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getMyProfile } from "@/lib/profile.functions";
import { PageShell, EmptyState } from "@/components/PageShell";
import { Users, UserPlus } from "lucide-react";

export const Route = createFileRoute("/_authenticated/collaborators")({
  head: () => ({ meta: [
    { title: "Collaborators — BloxSmith" },
    { name: "description", content: "Invite teammates to your Roblox projects." },
  ]}),
  component: CollaboratorsPage,
});

function CollaboratorsPage() {
  const profFn = useServerFn(getMyProfile);
  const { data: profile } = useQuery({ queryKey: ["profile"], queryFn: () => profFn() });

  return (
    <PageShell
      title="Collaborators"
      description="Bring your team into BloxSmith — share projects, builds, and Studio sessions."
      accent="collaborators"
      activeKey="co"
      isAdmin={!!profile?.is_admin}
    >
      <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-pink-500/10 to-violet-500/5 p-6 backdrop-blur-sm">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-pink-300">
          <Users className="h-3.5 w-3.5" /> Team Beta
        </div>
        <h2 className="mt-2 text-xl font-extrabold">Project collaborators</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Collaboration is opening up project-by-project. Open a project and use Share to invite by username — they'll
          appear here once they accept.
        </p>
      </div>

      <EmptyState
        icon={UserPlus}
        title="No collaborators yet"
        description="Invite a teammate from any project's Share menu. You'll see every active collaborator and pending invite right here."
        action={
          <Link to="/dashboard" className="inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-pink-500 to-violet-500 px-4 py-2.5 text-sm font-semibold text-white">
            Go to Projects
          </Link>
        }
      />
    </PageShell>
  );
}
