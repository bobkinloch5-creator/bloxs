import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { useEffect, useRef, useState } from "react";
import { MessageCircle, X, Send, Loader2, Sparkles, FileText, Wand2, Blocks, RotateCcw, HelpCircle } from "lucide-react";
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

  const { messages, sendMessage, status, error, setMessages } = useChat({
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
    if (open) setTimeout(() => inputRef.current?.focus({ preventScroll: true }), 100);
  }, [open]);

  const busy = status === "submitted" || status === "streaming";

  const submit = () => {
    const text = input.trim();
    if (!text || busy) return;
    sendMessage({ text });
    setInput("");
  };

  const handleSuggestion = (text: string) => {
    sendMessage({ text });
    setTimeout(() => inputRef.current?.focus({ preventScroll: true }), 100);
  };

  const clearChat = () => {
    setMessages([]);
    setInput("");
  };

  return (
    <>
      {/* Launcher Button */}
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Open BloxSmith help chat"
          className="group fixed bottom-5 right-5 z-[9999] flex items-center gap-2.5 rounded-full border border-indigo-400/50 bg-gradient-to-r from-indigo-600 via-purple-600 to-indigo-700 px-4.5 py-3 text-white shadow-[0_0_30px_rgba(99,102,241,0.5)] transition-all hover:scale-105 hover:border-cyan-400 hover:shadow-[0_0_40px_rgba(34,211,238,0.6)] active:scale-95 sm:bottom-6 sm:right-6"
        >
          <MessageCircle className="h-5 w-5 text-cyan-300 transition-transform group-hover:scale-110" />
          <span className="hidden text-sm font-black tracking-wide text-white sm:inline">Need help?</span>
          <span className="relative flex h-3 w-3 sm:-top-1 sm:-right-1">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex h-3 w-3 rounded-full border-2 border-[#050614] bg-emerald-400 shadow-[0_0_8px_#34d399]" />
          </span>
        </button>
      )}

      {/* Floating Chat Panel */}
      {open && (
        <div className="vapor-card fixed bottom-5 right-5 z-[9999] flex h-[580px] max-h-[82vh] w-[calc(100vw-2.5rem)] max-w-[390px] flex-col overflow-hidden rounded-3xl border border-indigo-500/40 bg-[#0a0a22]/98 shadow-[0_20px_60px_rgba(0,0,0,0.9),0_0_40px_rgba(79,70,229,0.3)] backdrop-blur-2xl animate-in fade-in slide-in-from-bottom-4 duration-200 sm:bottom-6 sm:right-6">
          {/* Header */}
          <div className="relative flex items-center justify-between border-b border-indigo-500/30 bg-gradient-to-r from-indigo-950/90 via-purple-950/80 to-indigo-950/90 p-4 shadow-lg">
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

            <div className="flex items-center gap-1">
              {messages.length > 0 && (
                <button
                  type="button"
                  onClick={clearChat}
                  title="Clear conversation"
                  aria-label="Clear chat"
                  className="rounded-lg p-1.5 text-white/50 transition hover:bg-white/10 hover:text-white"
                >
                  <RotateCcw className="h-4 w-4" />
                </button>
              )}
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close help chat"
                className="rounded-lg p-1.5 text-white/60 transition hover:bg-white/10 hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Messages Feed */}
          <div ref={scrollRef} className="relative flex-1 space-y-4 overflow-y-auto p-4 help-chat-scroll">
            {messages.length === 0 && (
              <>
                <div className="flex flex-col gap-1">
                  <div className="max-w-[92%] rounded-2xl rounded-tl-none border border-indigo-500/20 bg-slate-900/90 p-3.5 text-sm leading-relaxed text-slate-200 shadow-sm backdrop-blur-md">
                    <div className="prose prose-sm prose-invert max-w-none prose-p:my-1.5 prose-strong:text-white">
                      <ReactMarkdown>{GREETING}</ReactMarkdown>
                    </div>
                  </div>
                  <span className="ml-1 text-[10px] font-medium uppercase tracking-wider text-indigo-400">Assistant</span>
                </div>

                <div className="flex flex-col gap-2 pt-2">
                  <span className="text-[11px] font-semibold text-slate-400">Suggested questions:</span>
                  {SUGGESTIONS.map(({ text, icon: Icon }) => (
                    <button
                      key={text}
                      type="button"
                      onClick={() => handleSuggestion(text)}
                      className="flex items-center gap-2 rounded-xl border border-indigo-500/30 bg-slate-900/70 p-2.5 text-left text-xs font-medium text-indigo-200 transition-all hover:border-indigo-400/60 hover:bg-indigo-950/50 hover:text-white active:scale-[0.98]"
                    >
                      <Icon className="h-4 w-4 shrink-0 text-cyan-300" />
                      <span>{text}</span>
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
                        ? "max-w-[85%] rounded-2xl rounded-tr-none bg-gradient-to-r from-indigo-600 to-purple-600 p-3 text-sm leading-relaxed text-white shadow-md"
                        : "max-w-[92%] rounded-2xl rounded-tl-none border border-white/10 bg-slate-900/90 p-3.5 text-sm leading-relaxed text-slate-200 shadow-sm"
                    }
                  >
                    {isUser ? (
                      <p className="whitespace-pre-wrap">{text}</p>
                    ) : (
                      <div className="prose prose-sm prose-invert max-w-none prose-p:my-1.5 prose-ul:my-1.5 prose-li:my-0.5 prose-a:text-indigo-300 prose-strong:text-white prose-code:rounded prose-code:bg-white/10 prose-code:px-1 prose-code:text-fuchsia-300 prose-code:before:content-none prose-code:after:content-none">
                        <ReactMarkdown>{text || "…"}</ReactMarkdown>
                      </div>
                    )}
                  </div>
                  <span
                    className={`text-[10px] font-medium uppercase tracking-wider text-slate-500 ${
                      isUser ? "mr-1 text-indigo-300" : "ml-1 text-slate-400"
                    }`}
                  >
                    {isUser ? "You" : "Assistant"}
                  </span>
                </div>
              );
            })}

            {status === "submitted" && (
              <div className="flex flex-col gap-1">
                <div className="w-16 rounded-2xl rounded-tl-none border border-indigo-500/20 bg-slate-900 px-4 py-3 shadow-sm">
                  <div className="flex justify-center gap-1">
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-indigo-400/60 [animation-delay:0s]" />
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-indigo-400/80 [animation-delay:0.15s]" />
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-indigo-400 [animation-delay:0.3s]" />
                  </div>
                </div>
              </div>
            )}

            {error && (
              <div className="rounded-xl border border-rose-500/40 bg-rose-950/40 p-3 text-xs text-rose-200 backdrop-blur-md">
                <p className="font-semibold">Unable to get response.</p>
                <p className="mt-1 text-rose-300/80">
                  Please try again or visit <a href="/support" className="underline font-bold hover:text-white">Support</a>.
                </p>
              </div>
            )}
          </div>

          {/* Composer */}
          <div className="flex flex-col gap-2 border-t border-indigo-500/20 bg-[#08081a] p-3.5">
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
                className="h-[48px] w-full resize-none rounded-xl border border-indigo-500/30 bg-slate-900/80 px-3.5 py-3 pr-12 text-sm text-slate-100 placeholder:text-slate-500 transition-all focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
                style={{ maxHeight: "110px" }}
              />
              <button
                type="button"
                onClick={submit}
                disabled={!input.trim() || busy}
                aria-label="Send message"
                className="absolute right-1.5 flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600 text-white transition-all hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
              </button>
            </div>
            <div className="flex items-center justify-between px-1">
              <span className="flex items-center gap-1 text-[10px] text-slate-500">
                <kbd className="rounded border border-white/10 bg-slate-800 px-1 font-mono text-[9px]">Enter</kbd> to send
              </span>
              <span className="text-[10px] text-slate-500">
                For builds, use the workspace
              </span>
            </div>
          </div>
        </div>
      )}

      <style>{`
        .help-chat-scroll::-webkit-scrollbar { width: 4px; }
        .help-chat-scroll::-webkit-scrollbar-track { background: transparent; }
        .help-chat-scroll::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.15); border-radius: 10px; }
        .help-chat-scroll::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.3); }
      `}</style>
    </>
  );
}
