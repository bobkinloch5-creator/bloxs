import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getMyProfile } from "@/lib/profile.functions";
import {
  listMyInvites, respondToInvite, listMyTeamProjects,
  searchCreators, inviteCollaborator, listAllTeamActivity,
} from "@/lib/collab.functions";
import { PageShell } from "@/components/PageShell";
import { CollabPanel } from "@/components/CollabPanel";
import {
  Users, UserPlus, Folder, Check, X, ArrowRight, Search, Share2,
  MessageSquare, Activity, Shield, Crown, Sparkles, Copy, CheckCircle2,
  UserCheck, Loader2, Link2, Plus, Zap
} from "lucide-react";
import { toast } from "sonner";
import { friendlyError } from "@/lib/friendly-error";

export const Route = createFileRoute("/_authenticated/collaborators")({
  head: () => ({
    meta: [
      { title: "Collaborators Hub — BloxSmith" },
      { name: "description", content: "Link up with Roblox creators, invite teammates, share projects, and build games together." },
    ],
  }),
  component: CollaboratorsPage,
});

type ActiveTab = "projects" | "discover" | "activity";

function CollaboratorsPage() {
  const qc = useQueryClient();
  const profFn = useServerFn(getMyProfile);
  const invitesFn = useServerFn(listMyInvites);
  const respondFn = useServerFn(respondToInvite);
  const myTeamFn = useServerFn(listMyTeamProjects);
  const searchFn = useServerFn(searchCreators);
  const inviteFn = useServerFn(inviteCollaborator);
  const activityFn = useServerFn(listAllTeamActivity);

  const [activeTab, setActiveTab] = useState<ActiveTab>("projects");
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [inviteTargetUser, setInviteTargetUser] = useState<{ id: string; username: string } | null>(null);
  const [inviteRole, setInviteRole] = useState<"editor" | "viewer">("editor");
  const [targetProjectId, setTargetProjectId] = useState<string>("");
  const [copiedLinkProjId, setCopiedLinkProjId] = useState<string | null>(null);

  const { data: profile } = useQuery({ queryKey: ["profile"], queryFn: () => profFn() });
  const { data: invites = [] } = useQuery({ queryKey: ["my-invites"], queryFn: () => invitesFn() });
  const { data: teamData, isLoading: teamLoading } = useQuery({
    queryKey: ["my-team-projects"],
    queryFn: () => myTeamFn(),
  });
  const { data: searchResults = [], isLoading: isSearching } = useQuery({
    queryKey: ["search-creators", searchQuery],
    queryFn: () => searchFn({ data: { query: searchQuery } }),
    enabled: searchQuery.trim().length > 0,
  });
  const { data: teamActivities = [] } = useQuery({
    queryKey: ["team-activity-all"],
    queryFn: () => activityFn({ data: { limit: 30 } }),
  });

  const ownedProjects = teamData?.owned ?? [];
  const sharedProjects = teamData?.shared ?? [];
  const allTeamProjects = [...ownedProjects, ...sharedProjects];

  const respondMut = useMutation({
    mutationFn: (v: { invite_id: string; accept: boolean }) => respondFn({ data: v }),
    onSuccess: (_d, vars) => {
      toast.success(vars.accept ? "Joined project team!" : "Invite declined");
      qc.invalidateQueries({ queryKey: ["my-invites"] });
      qc.invalidateQueries({ queryKey: ["my-team-projects"] });
      qc.invalidateQueries({ queryKey: ["team-activity-all"] });
    },
    onError: (e) => toast.error(friendlyError(e)),
  });

  const sendInviteMut = useMutation({
    mutationFn: () =>
      inviteFn({
        data: {
          project_id: targetProjectId,
          username: inviteTargetUser?.username ?? "",
          role: inviteRole,
        },
      }),
    onSuccess: () => {
      toast.success(`Invite sent to @${inviteTargetUser?.username}!`);
      setInviteTargetUser(null);
      setTargetProjectId("");
      qc.invalidateQueries({ queryKey: ["my-team-projects"] });
      qc.invalidateQueries({ queryKey: ["collab-invites", targetProjectId] });
    },
    onError: (e) => toast.error(friendlyError(e)),
  });

  const copyProjectLink = (projectId: string) => {
    const url = `${window.location.origin}/project/${projectId}`;
    navigator.clipboard.writeText(url);
    setCopiedLinkProjId(projectId);
    toast.success("Project invite link copied to clipboard!");
    setTimeout(() => setCopiedLinkProjId(null), 3000);
  };

  return (
    <PageShell
      title="Collaborators & Team Hub"
      description="Link up with creators, manage project teams, share invite links, and build Roblox games together."
      accent="collaborators"
      activeKey="co"
      isAdmin={!!profile?.is_admin}
    >
      {/* Top Banner Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
        <div className="rounded-2xl border border-violet-500/20 bg-gradient-to-br from-violet-500/10 to-transparent p-4 backdrop-blur-sm">
          <div className="flex items-center justify-between text-violet-300">
            <span className="text-xs font-semibold uppercase tracking-wider">Team Projects</span>
            <Folder className="h-4 w-4" />
          </div>
          <div className="text-2xl font-extrabold mt-1">{allTeamProjects.length}</div>
          <div className="text-xs text-muted-foreground mt-0.5">{ownedProjects.length} owned · {sharedProjects.length} shared</div>
        </div>

        <div className="rounded-2xl border border-pink-500/20 bg-gradient-to-br from-pink-500/10 to-transparent p-4 backdrop-blur-sm">
          <div className="flex items-center justify-between text-pink-300">
            <span className="text-xs font-semibold uppercase tracking-wider">Teammates</span>
            <Users className="h-4 w-4" />
          </div>
          <div className="text-2xl font-extrabold mt-1">
            {allTeamProjects.reduce((acc, p) => acc + (p.members?.length ?? 1), 0)}
          </div>
          <div className="text-xs text-muted-foreground mt-0.5">Across all team workspaces</div>
        </div>

        <div className="rounded-2xl border border-cyan-500/20 bg-gradient-to-br from-cyan-500/10 to-transparent p-4 backdrop-blur-sm">
          <div className="flex items-center justify-between text-cyan-300">
            <span className="text-xs font-semibold uppercase tracking-wider">Pending Invites</span>
            <UserPlus className="h-4 w-4" />
          </div>
          <div className="text-2xl font-extrabold mt-1">{invites.length}</div>
          <div className="text-xs text-muted-foreground mt-0.5">Awaiting your response</div>
        </div>
      </div>

      {/* Incoming Pending Invites Section */}
      {invites.length > 0 && (
        <div className="rounded-2xl border border-pink-500/30 bg-gradient-to-br from-pink-500/10 via-violet-500/5 to-transparent p-5 backdrop-blur-sm mb-6">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-pink-300 mb-3">
            <UserPlus className="h-4 w-4 animate-bounce" /> {invites.length} Pending Invitation{invites.length === 1 ? "" : "s"}
          </div>
          <div className="space-y-2">
            {invites.map((i: any) => (
              <div key={i.id} className="flex flex-col sm:flex-row sm:items-center justify-between rounded-xl bg-black/40 border border-white/10 p-4 gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-violet-500 to-pink-500 flex items-center justify-center text-white font-extrabold text-base flex-shrink-0 shadow-lg shadow-violet-500/20">
                    {(i.project?.name?.[0] || "?").toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-bold truncate">{i.project?.name || "Project"}</div>
                    <div className="text-xs text-muted-foreground truncate">
                      Invited by <span className="text-foreground font-semibold">@{i.inviter?.username || "user"}</span> · Role: <span className="text-pink-300 font-semibold">{i.role}</span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button
                    onClick={() => respondMut.mutate({ invite_id: i.id, accept: false })}
                    disabled={respondMut.isPending}
                    className="rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 px-4 py-2 text-xs font-semibold flex items-center gap-1.5 transition"
                  >
                    <X className="h-3.5 w-3.5" /> Decline
                  </button>
                  <button
                    onClick={() => respondMut.mutate({ invite_id: i.id, accept: true })}
                    disabled={respondMut.isPending}
                    className="rounded-xl bg-gradient-to-r from-violet-500 to-pink-500 hover:from-violet-400 hover:to-pink-400 text-white px-4 py-2 text-xs font-bold flex items-center gap-1.5 shadow-md shadow-pink-500/20 transition"
                  >
                    <Check className="h-4 w-4" /> Accept & Join Team
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Main Tabs Navigation */}
      <div className="flex items-center gap-2 border-b border-white/10 pb-3 mb-6">
        <button
          onClick={() => setActiveTab("projects")}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition ${
            activeTab === "projects"
              ? "bg-gradient-to-r from-violet-500/20 to-pink-500/20 border border-violet-500/30 text-white shadow-sm"
              : "text-muted-foreground hover:text-foreground hover:bg-white/5"
          }`}
        >
          <Folder className="h-4 w-4 text-violet-400" /> My Team Workspaces ({allTeamProjects.length})
        </button>

        <button
          onClick={() => setActiveTab("discover")}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition ${
            activeTab === "discover"
              ? "bg-gradient-to-r from-violet-500/20 to-pink-500/20 border border-violet-500/30 text-white shadow-sm"
              : "text-muted-foreground hover:text-foreground hover:bg-white/5"
          }`}
        >
          <Search className="h-4 w-4 text-pink-400" /> Find Creators & Link Up
        </button>

        <button
          onClick={() => setActiveTab("activity")}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition ${
            activeTab === "activity"
              ? "bg-gradient-to-r from-violet-500/20 to-pink-500/20 border border-violet-500/30 text-white shadow-sm"
              : "text-muted-foreground hover:text-foreground hover:bg-white/5"
          }`}
        >
          <Activity className="h-4 w-4 text-cyan-400" /> Team Activity Stream
        </button>
      </div>

      {/* Tab 1: My Team Workspaces */}
      {activeTab === "projects" && (
        <div className="space-y-6">
          {teamLoading ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground text-sm gap-2">
              <Loader2 className="h-5 w-5 animate-spin text-violet-400" /> Loading team workspaces…
            </div>
          ) : allTeamProjects.length === 0 ? (
            <div className="rounded-2xl border border-white/10 bg-card/60 p-8 text-center backdrop-blur-sm">
              <Users className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
              <h3 className="text-base font-bold">No team projects yet</h3>
              <p className="text-xs text-muted-foreground max-w-sm mx-auto mt-1 mb-4">
                Create a project from the Dashboard or ask a teammate to send you an invite link to link up!
              </p>
              <Link
                to="/dashboard"
                className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-violet-500 to-pink-500 text-white px-4 py-2 text-xs font-bold"
              >
                <Plus className="h-4 w-4" /> Create New Project
              </Link>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {allTeamProjects.map((p: any) => (
                <div
                  key={p.id}
                  className="rounded-2xl border border-white/10 bg-card/60 hover:border-white/20 p-5 backdrop-blur-sm flex flex-col justify-between transition group"
                >
                  <div>
                    <div className="flex items-start justify-between gap-3 mb-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-violet-500/30 to-pink-500/30 border border-violet-500/30 flex items-center justify-center text-violet-300 font-bold flex-shrink-0">
                          <Folder className="h-5 w-5" />
                        </div>
                        <div className="min-w-0">
                          <h3 className="text-base font-bold truncate group-hover:text-violet-300 transition">{p.name}</h3>
                          <div className="text-xs text-muted-foreground truncate">{p.game_type || "Roblox Experience"}</div>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        {p.is_owner ? (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/20 border border-amber-500/30 text-amber-300 flex items-center gap-1">
                            <Crown className="h-3 w-3" /> Owner
                          </span>
                        ) : (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-violet-500/20 border border-violet-500/30 text-violet-300 flex items-center gap-1">
                            <Shield className="h-3 w-3" /> {p.role}
                          </span>
                        )}
                      </div>
                    </div>

                    <p className="text-xs text-muted-foreground line-clamp-2 mb-4">
                      {p.description || "No project description set."}
                    </p>

                    {/* Team Avatar Stack */}
                    <div className="flex items-center justify-between border-t border-white/10 pt-3 mb-4">
                      <div className="flex items-center gap-2">
                        <div className="flex -space-x-2 overflow-hidden">
                          {p.members.slice(0, 4).map((m: any, idx: number) => (
                            <div
                              key={m.user_id || idx}
                              title={m.profile?.display_name || m.profile?.username || "Teammate"}
                              className="inline-block h-7 w-7 rounded-full ring-2 ring-background bg-gradient-to-br from-violet-500 to-pink-500 text-white text-[10px] font-bold flex items-center justify-center overflow-hidden"
                            >
                              {m.profile?.avatar_url ? (
                                <img src={m.profile.avatar_url} alt="" className="h-full w-full object-cover" />
                              ) : (
                                (m.profile?.username?.[0] || "?").toUpperCase()
                              )}
                            </div>
                          ))}
                        </div>
                        <span className="text-xs font-semibold text-muted-foreground">
                          {p.members.length} member{p.members.length === 1 ? "" : "s"}
                        </span>
                      </div>

                      {p.pending_invites_count > 0 && (
                        <span className="text-[10px] font-semibold text-pink-300 bg-pink-500/10 border border-pink-500/20 px-2 py-0.5 rounded-full">
                          {p.pending_invites_count} pending
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Actions Bar */}
                  <div className="flex items-center gap-2 pt-2 border-t border-white/10">
                    <button
                      onClick={() => copyProjectLink(p.id)}
                      title="Copy shareable project invite link"
                      className="rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 px-3 py-2 text-xs font-semibold flex items-center gap-1.5 transition text-muted-foreground hover:text-foreground"
                    >
                      {copiedLinkProjId === p.id ? (
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                      ) : (
                        <Share2 className="h-3.5 w-3.5" />
                      )}
                      {copiedLinkProjId === p.id ? "Copied" : "Share"}
                    </button>

                    <button
                      onClick={() => setSelectedProjectId(selectedProjectId === p.id ? null : p.id)}
                      className={`rounded-xl border px-3 py-2 text-xs font-semibold flex items-center gap-1.5 transition flex-1 justify-center ${
                        selectedProjectId === p.id
                          ? "border-violet-500 bg-violet-500/20 text-white"
                          : "border-white/10 bg-white/5 hover:bg-white/10 text-foreground"
                      }`}
                    >
                      <MessageSquare className="h-3.5 w-3.5 text-violet-400" /> Team Chat & Roles
                    </button>

                    <Link
                      to="/project/$projectId"
                      params={{ projectId: p.id }}
                      className="rounded-xl bg-gradient-to-r from-violet-500 to-pink-500 hover:from-violet-400 hover:to-pink-400 text-white px-3 py-2 text-xs font-bold flex items-center gap-1 transition"
                    >
                      Open <ArrowRight className="h-3.5 w-3.5" />
                    </Link>
                  </div>

                  {/* Expanded Collab Panel Drawer */}
                  {selectedProjectId === p.id && (
                    <div className="mt-4 pt-4 border-t border-white/10">
                      <CollabPanel projectId={p.id} ownerId={p.user_id} />
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Tab 2: Discover Creators & Link Up */}
      {activeTab === "discover" && (
        <div className="space-y-6">
          <div className="rounded-2xl border border-white/10 bg-card/60 p-6 backdrop-blur-sm">
            <h2 className="text-base font-extrabold flex items-center gap-2 mb-1">
              <Users className="h-5 w-5 text-pink-400" /> Search Creators & Link Up
            </h2>
            <p className="text-xs text-muted-foreground mb-4">
              Find fellow Roblox developers on BloxSmith by username or display name and invite them directly to your team projects.
            </p>

            <div className="relative max-w-md">
              <Search className="absolute left-3.5 top-3 h-4 w-4 text-muted-foreground" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search username or display name..."
                className="w-full rounded-xl bg-white/5 border border-white/10 pl-10 pr-4 py-2.5 text-sm outline-none focus:border-pink-500/50 transition"
              />
            </div>
          </div>

          {searchQuery.trim() && (
            <div>
              {isSearching ? (
                <div className="flex items-center justify-center py-8 text-xs text-muted-foreground gap-2">
                  <Loader2 className="h-4 w-4 animate-spin text-pink-400" /> Searching creators…
                </div>
              ) : searchResults.length === 0 ? (
                <div className="text-center py-8 text-xs text-muted-foreground">
                  No creators found matching "{searchQuery}".
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                  {searchResults.map((user: any) => (
                    <div
                      key={user.id}
                      className="rounded-2xl border border-white/10 bg-card/60 p-4 backdrop-blur-sm flex items-start justify-between gap-3 hover:border-pink-500/30 transition"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="h-10 w-10 rounded-full bg-gradient-to-br from-violet-500 to-pink-500 flex items-center justify-center text-white font-bold overflow-hidden flex-shrink-0">
                          {user.avatar_url ? (
                            <img src={user.avatar_url} alt="" className="h-full w-full object-cover" />
                          ) : (
                            (user.username?.[0] || "?").toUpperCase()
                          )}
                        </div>
                        <div className="min-w-0">
                          <div className="text-sm font-bold truncate">{user.display_name || user.username}</div>
                          <div className="text-xs text-muted-foreground truncate">@{user.username}</div>
                          {user.bio && <div className="text-[11px] text-muted-foreground/80 truncate mt-0.5">{user.bio}</div>}
                        </div>
                      </div>

                      <button
                        onClick={() => {
                          setInviteTargetUser({ id: user.id, username: user.username });
                          if (ownedProjects.length > 0) setTargetProjectId(ownedProjects[0].id);
                        }}
                        className="rounded-xl bg-pink-500/20 border border-pink-500/30 hover:bg-pink-500/30 text-pink-300 px-3 py-1.5 text-xs font-bold flex items-center gap-1 flex-shrink-0 transition"
                      >
                        <UserPlus className="h-3.5 w-3.5" /> Invite
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Tab 3: Team Activity Stream */}
      {activeTab === "activity" && (
        <div className="rounded-2xl border border-white/10 bg-card/60 p-6 backdrop-blur-sm space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold flex items-center gap-2">
              <Activity className="h-5 w-5 text-cyan-400" /> Recent Team Activity Across Workspaces
            </h2>
            <span className="text-xs text-muted-foreground">{teamActivities.length} recent events</span>
          </div>

          {teamActivities.length === 0 ? (
            <div className="text-center py-8 text-xs text-muted-foreground">
              No team activity recorded yet across your projects.
            </div>
          ) : (
            <div className="space-y-2">
              {teamActivities.map((act: any) => (
                <div
                  key={act.id}
                  className="flex items-center justify-between rounded-xl bg-white/5 border border-white/10 px-4 py-3 text-xs"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="h-8 w-8 rounded-full bg-gradient-to-br from-violet-500 to-pink-500 flex items-center justify-center text-white font-bold flex-shrink-0 overflow-hidden">
                      {act.profile?.avatar_url ? (
                        <img src={act.profile.avatar_url} alt="" className="h-full w-full object-cover" />
                      ) : (
                        (act.profile?.username?.[0] || "?").toUpperCase()
                      )}
                    </div>

                    <div className="min-w-0">
                      <div className="font-semibold text-foreground">
                        <span>@{act.profile?.username || "user"}</span>{" "}
                        <span className="font-normal text-muted-foreground">{act.summary}</span>
                      </div>
                      {act.project && (
                        <div className="text-[11px] text-violet-300 font-medium truncate mt-0.5">
                          in {act.project.name}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="text-[11px] text-muted-foreground flex-shrink-0">
                    {new Date(act.created_at).toLocaleString([], { dateStyle: "short", timeStyle: "short" })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Modal: Send Direct Project Invitation */}
      {inviteTargetUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-2xl border border-white/10 bg-card p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold flex items-center gap-2">
                <UserPlus className="h-5 w-5 text-pink-400" /> Invite @{inviteTargetUser.username} to Team
              </h3>
              <button
                onClick={() => setInviteTargetUser(null)}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {ownedProjects.length === 0 ? (
              <div className="text-xs text-muted-foreground py-4 text-center">
                You don't own any projects yet to invite teammates to. Please create a project first.
              </div>
            ) : (
              <div className="space-y-3">
                <div>
                  <label className="text-xs font-semibold text-muted-foreground block mb-1">
                    Select Target Project
                  </label>
                  <select
                    value={targetProjectId}
                    onChange={(e) => setTargetProjectId(e.target.value)}
                    className="w-full rounded-xl bg-white/5 border border-white/10 px-3 py-2 text-sm outline-none"
                  >
                    {ownedProjects.map((p: any) => (
                      <option key={p.id} value={p.id} className="bg-card text-foreground">
                        {p.name} ({p.game_type})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-xs font-semibold text-muted-foreground block mb-1">
                    Assign Permission Role
                  </label>
                  <select
                    value={inviteRole}
                    onChange={(e) => setInviteRole(e.target.value as any)}
                    className="w-full rounded-xl bg-white/5 border border-white/10 px-3 py-2 text-sm outline-none"
                  >
                    <option value="editor" className="bg-card text-foreground">Editor — Can edit scripts & build</option>
                    <option value="viewer" className="bg-card text-foreground">Viewer — Read-only access</option>
                  </select>
                </div>

                <div className="pt-2 flex justify-end gap-2">
                  <button
                    onClick={() => setInviteTargetUser(null)}
                    className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-xs font-semibold"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => sendInviteMut.mutate()}
                    disabled={sendInviteMut.isPending || !targetProjectId}
                    className="rounded-xl bg-gradient-to-r from-violet-500 to-pink-500 text-white px-4 py-2 text-xs font-bold flex items-center gap-1.5 disabled:opacity-50"
                  >
                    {sendInviteMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Send Team Invitation"}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </PageShell>
  );
}
