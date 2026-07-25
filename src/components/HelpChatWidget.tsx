import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { useEffect, useRef, useState } from "react";
import { MessageCircle, X, Send, Loader2, Sparkles, FileText, Wand2, Blocks } from "lucide-react";
import ReactMarkdown from "react-markdown";

const STORAGE_KEY = "bs:help-chat:open";
const GREETING =
  "Hi! I'm the **BloxSmith Helper** 👋\n\nAsk me anything about installing the plugin, using the AI builder, troubleshooting, or navigating the site.";

const SUGGESTIONS: { text: string; icon: typeof FileText }[] = [
  { text: "How do I install the plugin?", icon: Blocks },
  { text: "Build not verified — help?", icon: Wand2 },
  { text: "How do I start a project?", icon: FileText },
];

export function HelpChatWidget() {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const { messages, sendMessage, status, error } = useChat({
    id: "bloxsmith-help",
    transport: new DefaultChatTransport({ api: "/api/help-chat" }),
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.sessionStorage.getItem(STORAGE_KEY) === "1") setOpen(true);
  }, []);
  useEffect(() => {
    if (typeof window === "undefined") return;
    window.sessionStorage.setItem(STORAGE_KEY, open ? "1" : "0");
  }, [open]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, status]);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 100);
  }, [open]);

  const busy = status === "submitted" || status === "streaming";

  const submit = () => {
    const text = input.trim();
    if (!text || busy) return;
    sendMessage({ text });
    setInput("");
  };

  return (
    <>
      {/* Launcher */}
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Open BloxSmith help chat"
          className="group fixed bottom-20 right-4 z-[90] flex items-center gap-2.5 rounded-full border border-indigo-400/50 bg-gradient-to-r from-indigo-600 via-purple-600 to-indigo-700 px-4.5 py-3 text-white shadow-[0_0_30px_rgba(99,102,241,0.5)] transition-all hover:scale-105 hover:border-cyan-400 hover:shadow-[0_0_40px_rgba(34,211,238,0.6)] active:scale-95 sm:bottom-6 sm:right-6"
        >
          <MessageCircle className="h-5 w-5 text-cyan-300 transition-transform group-hover:scale-110" />
          <span className="hidden text-sm font-black tracking-wide text-white sm:inline">Need help?</span>
          <span className="absolute -top-1 -right-1 flex h-3.5 w-3.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex h-3.5 w-3.5 rounded-full bg-emerald-400 border-2 border-[#050614] shadow-[0_0_8px_#34d399]" />
          </span>
        </button>
      )}

      {/* Panel */}
      {open && (
        <div className="vapor-card fixed bottom-4 right-4 z-[90] flex h-[600px] max-h-[85vh] w-[calc(100vw-2rem)] max-w-[380px] flex-col overflow-hidden rounded-3xl border border-indigo-500/40 bg-[#0a0a22]/98 shadow-[0_0_50px_rgba(0,0,0,0.9)] backdrop-blur-2xl animate-in fade-in zoom-in-95 duration-200 sm:bottom-6 sm:right-6">
          {/* Header */}
          <div className="relative flex items-center justify-between border-b border-indigo-500/30 bg-gradient-to-r from-indigo-900/90 via-purple-900/80 to-indigo-900/90 p-4 shadow-lg">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-indigo-400/40 bg-indigo-500/25 shadow-[0_0_15px_rgba(99,102,241,0.4)]">
                <Sparkles className="h-5 w-5 text-cyan-300 animate-pulse" />
              </div>
              <div>
                <h3 className="text-sm font-extrabold leading-tight text-white">BloxSmith Helper</h3>
                <div className="mt-0.5 flex items-center gap-1.5">
                  <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-400 shadow-[0_0_8px_#34d399]" />
                  <span className="text-[11px] font-bold tracking-wide text-cyan-200">Online & Ready</span>
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close help chat"
              className="rounded-md p-1.5 text-white/60 transition hover:bg-white/10 hover:text-white"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Messages */}
          <div ref={scrollRef} className="relative flex-1 space-y-4 overflow-y-auto p-4 help-chat-scroll">
            {messages.length === 0 && (
              <>
                <div className="flex flex-col gap-1">
                  <div className="max-w-[90%] rounded-2xl rounded-tl-none border border-white/5 bg-slate-900 p-3 text-sm leading-relaxed text-slate-200 shadow-sm">
                    <div className="prose prose-sm prose-invert max-w-none prose-p:my-1.5 prose-strong:text-white">
                      <ReactMarkdown>{GREETING}</ReactMarkdown>
                    </div>
                  </div>
                  <span className="ml-1 text-[10px] font-medium uppercase tracking-wider text-slate-500">Assistant</span>
                </div>

                <div className="flex flex-wrap gap-2 pt-1">
                  {SUGGESTIONS.map(({ text, icon: Icon }) => (
                    <button
                      key={text}
                      type="button"
                      onClick={() => sendMessage({ text })}
                      className="flex items-center gap-1.5 rounded-full border border-indigo-500/30 bg-slate-900/50 px-3 py-1.5 text-[11px] font-medium text-indigo-300 transition-all hover:bg-slate-900 hover:border-indigo-400/50"
                    >
                      <Icon className="h-3 w-3" />
                      {text}
                    </button>
                  ))}
                </div>
              </>
            )}

            {messages.map((m) => {
              const text = m.parts.map((p) => (p.type === "text" ? p.text : "")).join("");
              const isUser = m.role === "user";
              return (
                <div key={m.id} className={`flex flex-col gap-1 ${isUser ? "items-end" : ""}`}>
                  <div
                    className={
                      isUser
                        ? "max-w-[85%] rounded-2xl rounded-tr-none bg-indigo-600 p-3 text-sm leading-relaxed text-white shadow-md"
                        : "max-w-[90%] rounded-2xl rounded-tl-none border border-white/5 bg-slate-900 p-3 text-sm leading-relaxed text-slate-200 shadow-sm"
                    }
                  >
                    {isUser ? (
                      <p className="whitespace-pre-wrap">{text}</p>
                    ) : (
                      <div className="prose prose-sm prose-invert max-w-none prose-p:my-1.5 prose-ul:my-1.5 prose-li:my-0.5 prose-a:text-indigo-300 prose-strong:text-white prose-code:text-fuchsia-300 prose-code:bg-white/10 prose-code:px-1 prose-code:rounded prose-code:before:content-none prose-code:after:content-none">
                        <ReactMarkdown>{text || "…"}</ReactMarkdown>
                      </div>
                    )}
                  </div>
                  <span
                    className={`text-[10px] font-medium uppercase tracking-wider text-slate-500 ${
                      isUser ? "mr-1" : "ml-1"
                    }`}
                  >
                    {isUser ? "You" : "Assistant"}
                  </span>
                </div>
              );
            })}

            {status === "submitted" && (
              <div className="flex flex-col gap-1">
                <div className="w-16 rounded-2xl rounded-tl-none border border-white/5 bg-slate-900 px-4 py-3 shadow-sm">
                  <div className="flex justify-center gap-1">
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-indigo-400/60 [animation-delay:0s]" />
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-indigo-400/80 [animation-delay:0.15s]" />
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-indigo-400 [animation-delay:0.3s]" />
                  </div>
                </div>
              </div>
            )}

            {error && (
              <div className="rounded-lg border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
                Something went wrong. Try again, or visit{" "}
                <a href="/support" className="underline">/support</a>.
              </div>
            )}

            {/* subtle stud motif */}
            <div className="pointer-events-none absolute bottom-1 right-1 grid grid-cols-2 gap-1 p-1 opacity-[0.06]">
              <span className="h-1 w-1 rounded-full bg-white" />
              <span className="h-1 w-1 rounded-full bg-white" />
              <span className="h-1 w-1 rounded-full bg-white" />
              <span className="h-1 w-1 rounded-full bg-white" />
            </div>
          </div>

          {/* Composer */}
          <div className="flex flex-col gap-2 border-t border-white/5 bg-[#0d0d10] p-4">
            <div className="relative flex items-center">
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    submit();
                  }
                }}
                placeholder="Ask me anything…"
                rows={1}
                className="h-[50px] w-full resize-none rounded-xl border border-white/10 bg-slate-900/50 px-4 py-3 pr-14 text-sm text-slate-200 placeholder:text-slate-600 transition-all focus:border-indigo-500/50 focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
                style={{ maxHeight: "120px" }}
              />
              <button
                type="button"
                onClick={submit}
                disabled={!input.trim() || busy}
                aria-label="Send"
                className="absolute right-2 flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-600 text-white transition-colors hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </button>
            </div>
            <div className="flex justify-center">
              <span className="flex items-center gap-1 text-[10px] font-medium text-slate-600">
                <kbd className="rounded border border-white/5 bg-slate-800 px-1">Enter</kbd> to send · For builds, use the project workspace
              </span>
            </div>
          </div>
        </div>
      )}

      <style>{`
        .help-chat-scroll::-webkit-scrollbar { width: 4px; }
        .help-chat-scroll::-webkit-scrollbar-track { background: transparent; }
        .help-chat-scroll::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 10px; }
        .help-chat-scroll::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.2); }
      `}</style>
    </>
  );
}
