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
import { Users, UserPlus, Send, Loader2, X, Activity, MessageSquare, Shield, Crown } from "lucide-react";
import { toast } from "sonner";
import { friendlyError } from "@/lib/friendly-error";

type Tab = "team" | "chat" | "activity";

export function CollabPanel({ projectId, ownerId }: { projectId: string; ownerId: string | null }) {
  const [meId, setMeId] = useState<string | null>(null);
  useEffect(() => { supabase.auth.getUser().then(({ data }) => setMeId(data.user?.id ?? null)); }, []);
  const isOwner = !!meId && !!ownerId && meId === ownerId;
  const [tab, setTab] = useState<Tab>("team");
  return (
    <div className="rounded-2xl border border-white/10 bg-card/60 backdrop-blur-sm overflow-hidden">
      <div className="flex items-center gap-1 px-2 pt-2 border-b border-white/10">
        {([
          ["team", Users, "Team"],
          ["chat", MessageSquare, "Team Chat"],
          ["activity", Activity, "Activity"],
        ] as const).map(([k, Icon, label]) => (
          <button
            key={k}
            onClick={() => setTab(k as Tab)}
            className={`flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-t-lg transition ${
              tab === k ? "bg-white/10 text-foreground" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Icon className="h-3.5 w-3.5" /> {label}
          </button>
        ))}
      </div>
      <div className="p-3">
        {tab === "team" && <TeamTab projectId={projectId} isOwner={isOwner} />}
        {tab === "chat" && <ChatTab projectId={projectId} />}
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
    onSuccess: () => { setUsername(""); toast.success("Invite sent"); qc.invalidateQueries({ queryKey: invKey }); },
    onError: (e) => toast.error(friendlyError(e)),
  });

  return (
    <div className="space-y-4">
      {isOwner && (
        <div className="rounded-xl border border-white/10 bg-black/20 p-3">
          <div className="text-xs font-semibold text-muted-foreground mb-2 flex items-center gap-1.5">
            <UserPlus className="h-3.5 w-3.5" /> Invite a teammate
          </div>
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="username"
              className="flex-1 rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm outline-none focus:border-white/30"
            />
            <select value={role} onChange={(e) => setRole(e.target.value as any)} className="rounded-lg bg-white/5 border border-white/10 px-2 py-2 text-sm">
              <option value="editor">Editor</option>
              <option value="viewer">Viewer</option>
            </select>
            <button
              onClick={() => username.trim() && inviteMut.mutate()}
              disabled={!username.trim() || inviteMut.isPending}
              className="rounded-lg bg-gradient-to-r from-violet-500 to-pink-500 text-white px-4 py-2 text-sm font-semibold disabled:opacity-50"
            >
              {inviteMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Invite"}
            </button>
          </div>
        </div>
      )}

      <div>
        <div className="text-xs font-semibold text-muted-foreground mb-2 px-1">Members ({collabs.length + 1})</div>
        <div className="space-y-1.5">
          <MemberRow name="Owner" sub="project owner" role="owner" />
          {collabs.map((c: any) => (
            <MemberRow
              key={c.id}
              name={c.profile?.display_name || c.profile?.username || "User"}
              sub={c.profile?.username ? `@${c.profile.username}` : ""}
              avatar={c.profile?.avatar_url}
              role={c.role}
              onRemove={isOwner ? () => removeFn({ data: { project_id: projectId, user_id: c.user_id } }).then(() => qc.invalidateQueries({ queryKey: collabKey })) : undefined}
              onChangeRole={isOwner ? (r) => roleFn({ data: { project_id: projectId, user_id: c.user_id, role: r as any } }).then(() => qc.invalidateQueries({ queryKey: collabKey })) : undefined}
            />
          ))}
        </div>
      </div>

      {invites.filter((i: any) => i.status === "pending").length > 0 && (
        <div>
          <div className="text-xs font-semibold text-muted-foreground mb-2 px-1">Pending invites</div>
          <div className="space-y-1.5">
            {invites.filter((i: any) => i.status === "pending").map((i: any) => (
              <div key={i.id} className="flex items-center justify-between rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm">
                <div>
                  <div className="font-medium">@{i.invitee_username}</div>
                  <div className="text-xs text-muted-foreground">{i.role} · {new Date(i.created_at).toLocaleDateString()}</div>
                </div>
                {isOwner && (
                  <button onClick={() => cancelFn({ data: { invite_id: i.id } }).then(() => qc.invalidateQueries({ queryKey: invKey }))} className="text-xs text-muted-foreground hover:text-red-300">
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function MemberRow({ name, sub, avatar, role, onRemove, onChangeRole }: {
  name: string; sub?: string; avatar?: string | null; role: string;
  onRemove?: () => void; onChangeRole?: (r: string) => void;
}) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-white/10 bg-white/5 px-3 py-2">
      <div className="flex items-center gap-2.5 min-w-0">
        <div className="h-8 w-8 rounded-full bg-gradient-to-br from-violet-500 to-pink-500 flex items-center justify-center text-white text-xs font-bold overflow-hidden flex-shrink-0">
          {avatar ? <img src={avatar} alt="" className="h-full w-full object-cover" /> : (name[0] || "?").toUpperCase()}
        </div>
        <div className="min-w-0">
          <div className="text-sm font-medium truncate">{name}</div>
          {sub && <div className="text-xs text-muted-foreground truncate">{sub}</div>}
        </div>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        {role === "owner" ? (
          <span className="text-xs px-2 py-0.5 rounded-full bg-yellow-500/20 text-yellow-300 flex items-center gap-1"><Crown className="h-3 w-3" /> Owner</span>
        ) : onChangeRole ? (
          <select value={role} onChange={(e) => onChangeRole(e.target.value)} className="text-xs rounded bg-white/5 border border-white/10 px-1.5 py-0.5">
            <option value="editor">Editor</option>
            <option value="viewer">Viewer</option>
          </select>
        ) : (
          <span className="text-xs px-2 py-0.5 rounded-full bg-white/10 text-muted-foreground flex items-center gap-1"><Shield className="h-3 w-3" /> {role}</span>
        )}
        {onRemove && (
          <button onClick={onRemove} className="text-muted-foreground hover:text-red-300"><X className="h-4 w-4" /></button>
        )}
      </div>
    </div>
  );
}

function ChatTab({ projectId }: { projectId: string }) {
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

  useEffect(() => { scrollRef.current?.scrollTo({ top: 999999 }); }, [msgs.length]);

  const sendMut = useMutation({
    mutationFn: () => sendFn({ data: { project_id: projectId, body: text.trim() } }),
    onSuccess: () => { setText(""); qc.invalidateQueries({ queryKey: key }); },
    onError: (e) => toast.error(friendlyError(e)),
  });

  return (
    <div className="flex flex-col h-[420px]">
      <div ref={scrollRef} className="flex-1 overflow-y-auto space-y-2 pr-1">
        {msgs.length === 0 && (
          <div className="text-center text-xs text-muted-foreground py-8">No messages yet. Say hi 👋</div>
        )}
        {msgs.map((m: any) => (
          <div key={m.id} className="flex gap-2">
            <div className="h-7 w-7 rounded-full bg-gradient-to-br from-violet-500 to-pink-500 flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0 overflow-hidden">
              {m.profile?.avatar_url ? <img src={m.profile.avatar_url} className="h-full w-full object-cover" /> : (m.profile?.username?.[0] || "?").toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline gap-2">
                <span className="text-xs font-semibold">{m.profile?.display_name || m.profile?.username || "User"}</span>
                <span className="text-[10px] text-muted-foreground">{new Date(m.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
              </div>
              <div className="text-sm whitespace-pre-wrap break-words">{m.body}</div>
            </div>
          </div>
        ))}
      </div>
      <form
        onSubmit={(e) => { e.preventDefault(); if (text.trim()) sendMut.mutate(); }}
        className="mt-2 flex gap-2"
      >
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Message your team…"
          className="flex-1 rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm outline-none focus:border-white/30"
        />
        <button type="submit" disabled={!text.trim() || sendMut.isPending} className="rounded-lg bg-gradient-to-r from-violet-500 to-pink-500 text-white px-3 disabled:opacity-50">
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

  if (rows.length === 0) return <div className="text-center text-xs text-muted-foreground py-8">No activity yet.</div>;

  return (
    <div className="space-y-2 max-h-[420px] overflow-y-auto pr-1">
      {rows.map((r: any) => (
        <div key={r.id} className="flex gap-2 items-start text-sm">
          <div className="h-6 w-6 rounded-full bg-white/10 flex items-center justify-center text-[10px] font-bold flex-shrink-0 mt-0.5 overflow-hidden">
            {r.profile?.avatar_url ? <img src={r.profile.avatar_url} className="h-full w-full object-cover" /> : (r.profile?.username?.[0] || "•").toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-sm">
              <span className="font-semibold">{r.profile?.display_name || r.profile?.username || "Someone"}</span>{" "}
              <span className="text-muted-foreground">{r.summary}</span>
            </div>
            <div className="text-[10px] text-muted-foreground">{new Date(r.created_at).toLocaleString()}</div>
          </div>
        </div>
      ))}
    </div>
  );
}
