import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import {
  listCollaborators, listProjectInvites, inviteCollaborator, cancelInvite,
  removeCollaborator, updateCollaboratorRole,
  listProjectChat, sendProjectChat,
  listProjectActivity,
} from "@/lib/collab.functions";
import { Users, UserPlus, Send, Loader2, X, Activity, MessageSquare, Shield, Crown, Radio, Sparkles, Zap } from "lucide-react";
import { toast } from "sonner";
import { friendlyError } from "@/lib/friendly-error";

type Tab = "team" | "chat" | "activity";

function sanitizeUsername(username?: string | null): string {
  if (!username) return "User";
  if (username.includes("@")) {
    return username.split("@")[0];
  }
  return username;
}

export function CollabPanel({ projectId, ownerId }: { projectId: string; ownerId: string | null }) {
  const [meId, setMeId] = useState<string | null>(null);
  useEffect(() => { supabase.auth.getUser().then(({ data }) => setMeId(data.user?.id ?? null)); }, []);
  const isOwner = !!meId && !!ownerId && meId === ownerId;
  const [tab, setTab] = useState<Tab>("chat");

  return (
    <div className="rounded-2xl border border-indigo-500/20 bg-black/40 backdrop-blur-md overflow-hidden shadow-2xl">
      {/* Header Tabs */}
      <div className="flex items-center justify-between px-3 pt-2.5 border-b border-white/10 bg-white/5">
        <div className="flex items-center gap-1">
          {([
            ["chat", MessageSquare, "Realtime Chat"],
            ["team", Users, "Team Members"],
            ["activity", Activity, "Activity Feed"],
          ] as const).map(([k, Icon, label]) => (
            <button
              key={k}
              onClick={() => setTab(k as Tab)}
              className={`flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-t-xl transition-all ${
                tab === k 
                  ? "bg-indigo-600/30 text-white border-t-2 border-indigo-400 shadow-[0_0_10px_rgba(99,102,241,0.2)]" 
                  : "text-slate-400 hover:text-slate-200 hover:bg-white/5"
              }`}
            >
              <Icon className="h-3.5 w-3.5" /> {label}
            </button>
          ))}
        </div>
        <div className="hidden sm:flex items-center gap-1.5 text-[11px] text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-1 rounded-full font-medium">
          <Radio className="h-3 w-3 animate-pulse" /> Live Sync
        </div>
      </div>

      <div className="p-3 sm:p-4">
        {tab === "team" && <TeamTab projectId={projectId} isOwner={isOwner} />}
        {tab === "chat" && <ChatTab projectId={projectId} currentUserId={meId} />}
        {tab === "activity" && <ActivityTab projectId={projectId} />}
      </div>
    </div>
  );
}

function TeamTab({ projectId, isOwner }: { projectId: string; isOwner: boolean }) {
  const qc = useQueryClient();
  const listFn = useServerFn(listCollaborators);
  const invListFn = useServerFn(listProjectInvites);
  const inviteFn = useServerFn(inviteCollaborator);
  const cancelFn = useServerFn(cancelInvite);
  const removeFn = useServerFn(removeCollaborator);
  const roleFn = useServerFn(updateCollaboratorRole);

  const collabKey = ["collab", projectId];
  const invKey = ["collab-invites", projectId];

  const { data: collabs = [] } = useQuery({ queryKey: collabKey, queryFn: () => listFn({ data: { project_id: projectId } }) });
  const { data: invites = [] } = useQuery({ queryKey: invKey, queryFn: () => invListFn({ data: { project_id: projectId } }) });

  useEffect(() => {
    const ch = supabase
      .channel(`collab-${projectId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "project_collaborators", filter: `project_id=eq.${projectId}` }, () => qc.invalidateQueries({ queryKey: collabKey }))
      .on("postgres_changes", { event: "*", schema: "public", table: "project_invites", filter: `project_id=eq.${projectId}` }, () => qc.invalidateQueries({ queryKey: invKey }))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [projectId]);

  const [username, setUsername] = useState("");
  const [role, setRole] = useState<"editor" | "viewer">("editor");

  const inviteMut = useMutation({
    mutationFn: () => inviteFn({ data: { project_id: projectId, username: username.trim(), role } }),
    onSuccess: () => { setUsername(""); toast.success("Invite sent successfully"); qc.invalidateQueries({ queryKey: invKey }); },
    onError: (e) => toast.error(friendlyError(e)),
  });

  return (
    <div className="space-y-4">
      {/* Credit usage reminder */}
      <div className="rounded-xl border border-indigo-500/20 bg-indigo-500/10 p-3 text-xs text-indigo-200 flex items-start gap-2">
        <Zap className="h-4 w-4 shrink-0 text-indigo-400 mt-0.5" />
        <div>
          <strong className="text-white">Collaborator Credit Rules:</strong> Invited team members get full access to edit project scripts and models. Each member uses their own credits for AI generation commands!
        </div>
      </div>

      {/* Instant Linkup Share Card */}
      <div className="rounded-xl border border-cyan-500/30 bg-gradient-to-r from-cyan-950/40 via-indigo-950/30 to-purple-950/40 p-3 shadow-[0_0_20px_rgba(6,182,212,0.15)]">
        <div className="flex items-center justify-between mb-1.5">
          <div className="text-xs font-bold text-cyan-300 flex items-center gap-1.5">
            <Sparkles className="h-3.5 w-3.5 text-cyan-400 animate-pulse" /> Instant Linkup & Invite Link
          </div>
          <span className="text-[10px] font-semibold text-cyan-400/80 bg-cyan-500/10 border border-cyan-400/20 px-2 py-0.5 rounded-full">
            Project Linkup
          </span>
        </div>
        <p className="text-[11px] text-slate-300 mb-2">
          Share this linkup URL with collaborators so they can join and chat with you in real-time.
        </p>
        <div className="flex items-center gap-2">
          <input
            readOnly
            value={typeof window !== "undefined" ? `${window.location.origin}/dashboard?collab=${projectId}` : ""}
            className="flex-1 rounded-lg bg-black/50 border border-cyan-500/30 px-3 py-1.5 text-xs text-cyan-200 font-mono select-all outline-none"
          />
          <button
            type="button"
            onClick={() => {
              const url = `${window.location.origin}/dashboard?collab=${projectId}`;
              navigator.clipboard.writeText(url);
              toast.success("Linkup collaboration link copied to clipboard! 🚀");
            }}
            className="rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 px-3 py-1.5 text-xs font-black transition shrink-0 flex items-center gap-1 shadow-[0_0_15px_rgba(6,182,212,0.4)]"
          >
            Copy Linkup
          </button>
        </div>
      </div>

      {isOwner && (
        <div className="rounded-xl border border-white/10 bg-black/30 p-3">
          <div className="text-xs font-semibold text-slate-300 mb-2 flex items-center gap-1.5">
            <UserPlus className="h-3.5 w-3.5 text-indigo-400" /> Invite Teammate by Username
          </div>
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Username or email"
              className="flex-1 rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm outline-none focus:border-indigo-400 text-white placeholder:text-slate-500"
            />
            <select value={role} onChange={(e) => setRole(e.target.value as any)} className="rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-white bg-slate-900">
              <option value="editor">Editor</option>
              <option value="viewer">Viewer</option>
            </select>
            <button
              onClick={() => inviteMut.mutate()}
              disabled={!username.trim() || inviteMut.isPending}
              className="rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 text-xs font-bold transition disabled:opacity-50 flex items-center justify-center gap-1"
            >
              {inviteMut.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Send Invite"}
            </button>
          </div>
        </div>
      )}

      {/* Active Collaborators */}
      <div>
        <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 flex items-center justify-between">
          <span>Active Team ({collabs.length})</span>
        </div>
        <div className="space-y-2 max-h-[220px] overflow-y-auto pr-1">
          {collabs.length === 0 && (
            <div className="text-center text-xs text-slate-500 py-4">No other collaborators yet. Invite someone above!</div>
          )}
          {collabs.map((c: any) => (
            <MemberRow
              key={c.id}
              profile={c.profile}
              role={c.role}
              isOwner={c.role === "owner"}
              canManage={isOwner && c.role !== "owner"}
              onRemove={() => removeCollaborator({ data: { project_id: projectId, user_id: c.user_id } }).then(() => qc.invalidateQueries({ queryKey: collabKey }))}
              onRoleChange={(r: any) => updateCollaboratorRole({ data: { project_id: projectId, user_id: c.user_id, role: r } }).then(() => qc.invalidateQueries({ queryKey: collabKey }))}
            />
          ))}
        </div>
      </div>

      {/* Pending Invites */}
      {invites.length > 0 && (
        <div>
          <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
            Pending Invites ({invites.length})
          </div>
          <div className="space-y-1.5">
            {invites.map((inv: any) => (
              <div key={inv.id} className="flex items-center justify-between rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-xs">
                <span className="text-slate-300 font-medium">{sanitizeUsername(inv.invitee_profile?.display_name || inv.invitee_profile?.username || inv.invitee_id)}</span>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-slate-400 uppercase font-semibold">{inv.role}</span>
                  {isOwner && (
                    <button
                      onClick={() => cancelInvite({ data: { invite_id: inv.id } }).then(() => qc.invalidateQueries({ queryKey: invKey }))}
                      className="text-slate-400 hover:text-red-400 transition"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function MemberRow({ profile, role, isOwner, canManage, onRemove, onRoleChange }: any) {
  const cleanName = sanitizeUsername(profile?.display_name || profile?.username);
  return (
    <div className="flex items-center justify-between rounded-xl bg-white/5 border border-white/10 p-2.5">
      <div className="flex items-center gap-2.5 min-w-0">
        <div className="h-8 w-8 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white text-xs font-bold overflow-hidden shadow-inner">
          {profile?.avatar_url ? <img src={profile.avatar_url} className="h-full w-full object-cover" /> : cleanName[0]?.toUpperCase()}
        </div>
        <div className="min-w-0">
          <div className="text-xs font-semibold text-white truncate flex items-center gap-1.5">
            {cleanName}
            {isOwner && <Crown className="h-3 w-3 text-amber-400 shrink-0" />}
          </div>
          <div className="text-[10px] text-slate-400 capitalize">{role}</div>
        </div>
      </div>
      <div className="flex items-center gap-2">
        {canManage ? (
          <select
            value={role}
            onChange={(e) => onRoleChange?.(e.target.value)}
            className="rounded bg-black/40 border border-white/10 px-2 py-1 text-[11px] text-slate-200"
          >
            <option value="editor">Editor</option>
            <option value="viewer">Viewer</option>
          </select>
        ) : (
          <span className="text-[10px] uppercase font-bold text-slate-400 bg-white/5 border border-white/10 px-2 py-0.5 rounded">
            {role}
          </span>
        )}
        {canManage && onRemove && (
          <button onClick={onRemove} className="text-slate-400 hover:text-red-400 transition p-1">
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}

function ChatTab({ projectId, currentUserId }: { projectId: string; currentUserId?: string | null }) {
  const qc = useQueryClient();
  const listFn = useServerFn(listProjectChat);
  const sendFn = useServerFn(sendProjectChat);
  const key = ["proj-chat", projectId];
  const { data: msgs = [] } = useQuery({ queryKey: key, queryFn: () => listFn({ data: { project_id: projectId, limit: 100 } }) });
  const [text, setText] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const ch = supabase
      .channel(`pchat-${projectId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "project_chat_messages", filter: `project_id=eq.${projectId}` }, () => qc.invalidateQueries({ queryKey: key }))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [projectId]);

  useEffect(() => { scrollRef.current?.scrollTo({ top: 999999, behavior: "smooth" }); }, [msgs.length]);

  const sendMut = useMutation({
    mutationFn: (bodyText?: string) => sendFn({ data: { project_id: projectId, body: (bodyText || text).trim() } }),
    onSuccess: () => { setText(""); qc.invalidateQueries({ queryKey: key }); },
    onError: (e) => toast.error(friendlyError(e)),
  });

  const quickPills = [
    "🎮 Test the build",
    "🚀 Ship to Studio",
    "🔥 Looks great!",
    "🐛 Check output log",
    "🎨 Quick UI update",
    "👏 Nice work!",
  ];

  return (
    <div className="flex flex-col h-[440px]">
      {/* Realtime Chat Messages List */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto space-y-3 pr-1.5 bs-smooth-scroll">
        {msgs.length === 0 && (
          <div className="flex flex-col items-center justify-center text-center text-xs text-slate-400 py-12 space-y-2">
            <div className="h-10 w-10 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
              <MessageSquare className="h-5 w-5" />
            </div>
            <p className="font-semibold text-slate-200">Start the Team Conversation</p>
            <p className="text-[11px] text-slate-500 max-w-[240px]">
              Chat in real-time with collaborators as you build together on this project!
            </p>
          </div>
        )}

        {msgs.map((m: any) => {
          const isSelf = currentUserId && m.user_id === currentUserId;
          const cleanName = sanitizeUsername(m.profile?.display_name || m.profile?.username);

          return (
            <div key={m.id} className={`flex gap-2.5 ${isSelf ? "flex-row-reverse" : "flex-row"}`}>
              {/* User Avatar */}
              <div className="h-7 w-7 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white text-[11px] font-bold shrink-0 overflow-hidden shadow-sm mt-0.5">
                {m.profile?.avatar_url ? (
                  <img src={m.profile.avatar_url} className="h-full w-full object-cover" />
                ) : (
                  cleanName[0]?.toUpperCase() || "?"
                )}
              </div>

              {/* Message Bubble */}
              <div className={`max-w-[80%] space-y-1 ${isSelf ? "items-end text-right" : "items-start"}`}>
                <div className="flex items-baseline gap-2 px-1">
                  <span className="text-[11px] font-bold text-slate-300">{cleanName}</span>
                  <span className="text-[9px] text-slate-500">
                    {new Date(m.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </span>
                </div>
                <div
                  className={`rounded-2xl px-3.5 py-2 text-xs leading-relaxed whitespace-pre-wrap break-words shadow-md ${
                    isSelf
                      ? "bg-gradient-to-r from-indigo-600 to-violet-600 text-white rounded-tr-xs"
                      : "bg-slate-800/80 border border-white/10 text-slate-100 rounded-tl-xs"
                  }`}
                >
                  {m.body}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Quick Action Pills */}
      <div className="py-2 flex items-center gap-1.5 overflow-x-auto no-scrollbar border-t border-white/5 mt-1">
        {quickPills.map((pill) => (
          <button
            key={pill}
            type="button"
            onClick={() => sendMut.mutate(pill)}
            disabled={sendMut.isPending}
            className="shrink-0 rounded-full border border-white/10 bg-white/5 hover:bg-indigo-500/20 hover:border-indigo-500/40 px-2.5 py-1 text-[11px] text-slate-300 hover:text-white transition"
          >
            {pill}
          </button>
        ))}
      </div>

      {/* Send Message Form */}
      <form
        onSubmit={(e) => { e.preventDefault(); if (text.trim()) sendMut.mutate(undefined); }}
        className="mt-1 flex gap-2"
      >
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Discuss your project with team in real-time…"
          className="flex-1 rounded-xl bg-white/5 border border-white/10 px-3.5 py-2.5 text-xs text-white placeholder:text-slate-500 outline-none focus:border-indigo-400 focus:bg-white/10 transition"
        />
        <button
          type="submit"
          disabled={!text.trim() || sendMut.isPending}
          className="rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white px-4 py-2.5 text-xs font-bold transition shadow-lg shadow-indigo-600/30 disabled:opacity-40 flex items-center justify-center gap-1.5"
        >
          {sendMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </button>
      </form>
    </div>
  );
}

function ActivityTab({ projectId }: { projectId: string }) {
  const qc = useQueryClient();
  const listFn = useServerFn(listProjectActivity);
  const key = ["proj-activity", projectId];
  const { data: rows = [] } = useQuery({ queryKey: key, queryFn: () => listFn({ data: { project_id: projectId, limit: 50 } }) });

  useEffect(() => {
    const ch = supabase
      .channel(`pact-${projectId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "project_activity", filter: `project_id=eq.${projectId}` }, () => qc.invalidateQueries({ queryKey: key }))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [projectId]);

  if (rows.length === 0) return <div className="text-center text-xs text-slate-500 py-12">No activity recorded yet. Actions taken on this project will appear here in real-time!</div>;

  return (
    <div className="space-y-2 max-h-[420px] overflow-y-auto pr-1 bs-smooth-scroll">
      {rows.map((r: any) => {
        const cleanName = sanitizeUsername(r.profile?.display_name || r.profile?.username);
        return (
          <div key={r.id} className="flex gap-2.5 items-start text-xs rounded-xl bg-white/5 border border-white/10 p-2.5">
            <div className="h-6 w-6 rounded-full bg-indigo-500/20 border border-indigo-400/30 flex items-center justify-center text-[10px] font-bold text-indigo-300 shrink-0 mt-0.5 overflow-hidden">
              {r.profile?.avatar_url ? <img src={r.profile.avatar_url} className="h-full w-full object-cover" /> : cleanName[0]?.toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <div>
                <span className="font-bold text-white">{cleanName}</span>{" "}
                <span className="text-slate-300">{r.summary}</span>
              </div>
              <div className="text-[10px] text-slate-500 mt-0.5">{new Date(r.created_at).toLocaleString()}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
