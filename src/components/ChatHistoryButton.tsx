// Chat history popover — lists past project conversations so the user can
// jump back into any thread. Data lives per-project in `chat_messages`
// (cloud-backed, scoped to the signed-in user).
import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { History, Loader2, MessageSquare, Search } from "lucide-react";
import { listChatThreads } from "@/lib/chat.functions";

function timeAgo(iso: string): string {
  const diff = Math.max(0, Date.now() - new Date(iso).getTime());
  const m = Math.floor(diff / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(iso).toLocaleDateString();
}

export function ChatHistoryButton({
  activeProjectId,
  onSelect,
}: {
  activeProjectId: string | null;
  onSelect: (projectId: string) => void;
}) {
  const qc = useQueryClient();
  const listFn = useServerFn(listChatThreads);
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const panelRef = useRef<HTMLDivElement | null>(null);
  const btnRef = useRef<HTMLButtonElement | null>(null);

  const { data: threads = [], isLoading, refetch } = useQuery({
    queryKey: ["chat-threads"],
    queryFn: () => listFn(),
    staleTime: 15_000,
    enabled: open,
  });

  useEffect(() => {
    if (!open) return;
    refetch();
    // refresh listing whenever chat messages update
    qc.invalidateQueries({ queryKey: ["chat-threads"] });
    function onDown(e: MouseEvent) {
      const t = e.target as Node;
      if (panelRef.current?.contains(t)) return;
      if (btnRef.current?.contains(t)) return;
      setOpen(false);
    }
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") setOpen(false); }
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const filtered = threads.filter((t) => {
    if (!q.trim()) return true;
    const needle = q.trim().toLowerCase();
    return (
      t.name.toLowerCase().includes(needle) ||
      t.lastMessage.toLowerCase().includes(needle)
    );
  });

  return (
    <div className="relative">
      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 bg-black/40 px-2.5 py-1.5 text-[11px] font-semibold text-slate-200 hover:bg-black/60"
        title="Chat history — jump into a past conversation"
      >
        <History className="h-3.5 w-3.5 text-indigo-300" />
        History
        {threads.length > 0 && (
          <span className="ml-1 rounded-md bg-indigo-500/25 px-1.5 py-0.5 text-[10px] font-bold text-indigo-100">
            {threads.length}
          </span>
        )}
      </button>

      {open && (
        <div
          ref={panelRef}
          className="absolute left-0 z-40 mt-2 w-[340px] max-w-[92vw] overflow-hidden rounded-xl border border-white/15 bg-slate-950/95 shadow-2xl backdrop-blur"
        >
          <div className="flex items-center gap-2 border-b border-white/10 bg-white/[0.03] px-3 py-2">
            <Search className="h-3.5 w-3.5 text-slate-400" />
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search past chats…"
              className="flex-1 bg-transparent text-[12px] text-slate-100 placeholder:text-slate-500 focus:outline-none"
            />
          </div>

          <div className="max-h-[380px] overflow-y-auto py-1">
            {isLoading ? (
              <div className="flex items-center justify-center gap-2 py-8 text-[12px] text-slate-400">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading history…
              </div>
            ) : filtered.length === 0 ? (
              <div className="px-4 py-8 text-center text-[12px] text-slate-400">
                {threads.length === 0
                  ? "No past chats yet. Send a message to start your first conversation."
                  : "No chats match your search."}
              </div>
            ) : (
              <ul className="px-1">
                {filtered.map((t) => {
                  const active = t.projectId === activeProjectId;
                  return (
                    <li key={t.projectId}>
                      <button
                        type="button"
                        onClick={() => {
                          onSelect(t.projectId);
                          setOpen(false);
                        }}
                        className={`group flex w-full items-start gap-2.5 rounded-lg px-2.5 py-2 text-left transition ${
                          active
                            ? "bg-indigo-500/15 ring-1 ring-indigo-400/40"
                            : "hover:bg-white/5"
                        }`}
                      >
                        <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-md bg-white/[0.04] text-indigo-300">
                          <MessageSquare className="h-3.5 w-3.5" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center justify-between gap-2">
                            <span className="truncate text-[12.5px] font-semibold text-slate-100">
                              {t.name}
                            </span>
                            <span className="shrink-0 text-[10px] uppercase tracking-wider text-slate-500">
                              {timeAgo(t.lastAt)}
                            </span>
                          </span>
                          <span className="mt-0.5 line-clamp-2 block text-[11.5px] leading-snug text-slate-400">
                            <span className="mr-1 uppercase tracking-wider text-slate-500">
                              {t.lastRole === "user" ? "you:" : "ai:"}
                            </span>
                            {t.lastMessage || "(no text)"}
                          </span>
                          <span className="mt-1 flex items-center gap-2 text-[10px] text-slate-500">
                            <span>{t.count} msg{t.count === 1 ? "" : "s"}</span>
                            {t.gameType && <span>· {t.gameType}</span>}
                            {active && <span className="text-indigo-300">· active</span>}
                          </span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
