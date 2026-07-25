import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { Sparkles, ChevronDown, Check, Search, Cpu } from "lucide-react";
import { type ModelOption } from "@/lib/models";

interface Props {
  selectedModel: string;
  onSelectModel: (id: string) => void;
  availableModels: ModelOption[];
}

export function VaporModelSelector({ selectedModel, onSelectModel, availableModels }: Props) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [coords, setCoords] = useState<{ top: number; right: number }>({ top: 0, right: 0 });
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const updateCoords = () => {
    if (triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      const right = Math.max(16, window.innerWidth - rect.right);
      const top = rect.bottom + 8;
      setCoords({ top, right });
    }
  };

  const handleToggle = () => {
    if (!open) {
      updateCoords();
    }
    setOpen((v) => !v);
  };

  // Close / update on scroll or resize
  useEffect(() => {
    if (!open) return;
    function handleScrollOrResize() {
      updateCoords();
    }
    window.addEventListener("scroll", handleScrollOrResize, true);
    window.addEventListener("resize", handleScrollOrResize);
    return () => {
      window.removeEventListener("scroll", handleScrollOrResize, true);
      window.removeEventListener("resize", handleScrollOrResize);
    };
  }, [open]);

  const activeModel = availableModels.find((m) => m.id === selectedModel);

  const filteredModels = availableModels.filter((m) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      m.label.toLowerCase().includes(q) ||
      m.provider.toLowerCase().includes(q) ||
      m.bestFor.toLowerCase().includes(q) ||
      m.tier.toLowerCase().includes(q)
    );
  });

  return (
    <div className="inline-block text-left">
      <button
        ref={triggerRef}
        type="button"
        onClick={handleToggle}
        aria-expanded={open}
        className={`group inline-flex items-center gap-2 rounded-xl border px-3.5 py-2 text-xs font-extrabold transition-all active:scale-95 ${
          open
            ? "border-cyan-400 bg-indigo-500/30 text-white shadow-[0_0_25px_rgba(34,211,238,0.4)]"
            : "border-indigo-500/40 bg-[#0c0c26] text-cyan-200 shadow-[0_0_15px_rgba(79,70,229,0.2)] hover:border-cyan-400/60 hover:bg-[#121236] hover:shadow-[0_0_20px_rgba(34,211,238,0.3)]"
        }`}
        title="Choose which AI model handles your next messages."
      >
        <Sparkles className="h-3.5 w-3.5 text-cyan-400 group-hover:animate-pulse" />
        <span className="max-w-[180px] truncate font-extrabold">
          {selectedModel === "auto" ? "Auto (Recommended)" : activeModel?.label ?? selectedModel}
        </span>
        <ChevronDown
          className={`h-3.5 w-3.5 text-slate-400 transition-transform duration-200 ${
            open ? "rotate-180 text-cyan-300" : "group-hover:text-slate-200"
          }`}
        />
      </button>

      {open && mounted && createPortal(
        <>
          {/* Dimmed Backdrop to block clicks and avoid visual clutter */}
          <div
            className="fixed inset-0 z-[99998] bg-black/60 backdrop-blur-[3px]"
            onClick={() => setOpen(false)}
          />

          {/* Portal Popover Window */}
          <div
            style={{
              position: "fixed",
              top: `${coords.top}px`,
              right: `${coords.right}px`,
              maxHeight: `calc(100vh - ${coords.top + 24}px)`,
            }}
            className="z-[99999] flex w-[340px] flex-col overflow-hidden rounded-2xl border-2 border-cyan-400/80 bg-[#08081c] p-2.5 shadow-[0_30px_90px_rgba(0,0,0,0.98)] animate-in fade-in zoom-in-95 duration-150 sm:w-[390px]"
          >
            {/* Header & Search */}
            <div className="shrink-0 border-b border-white/10 p-2">
              <div className="mb-2 flex items-center justify-between text-[10px] font-black uppercase tracking-wider text-indigo-300">
                <span className="flex items-center gap-1.5">
                  <Cpu className="h-3.5 w-3.5 text-cyan-400" /> Choose AI Model
                </span>
                <span className="font-bold text-slate-400">{availableModels.length + 1} Available</span>
              </div>
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-cyan-400" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search models (e.g. Claude, Qwen, NVIDIA, Llama)…"
                  className="w-full rounded-xl border border-indigo-500/50 bg-[#040412] py-2 pl-8 pr-3 text-xs font-semibold text-white placeholder-slate-500 outline-none focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400"
                />
              </div>
            </div>

            {/* Model Options List */}
            <div className="mt-1.5 flex-1 overflow-y-auto space-y-1.5 pr-1 scrollbar-thin scrollbar-thumb-indigo-500/40">
              {/* Auto Option */}
              {(!search || "auto".includes(search.toLowerCase()) || "recommend".includes(search.toLowerCase())) && (
                <button
                  type="button"
                  onClick={() => {
                    onSelectModel("auto");
                    setOpen(false);
                  }}
                  className={`group flex w-full items-start justify-between rounded-xl border p-2.5 text-left transition-all ${
                    selectedModel === "auto"
                      ? "border-cyan-400 bg-gradient-to-r from-cyan-500/30 via-indigo-500/30 to-purple-500/30 shadow-[0_0_25px_rgba(34,211,238,0.3)]"
                      : "border-white/10 bg-[#0e0e30] hover:border-indigo-400/60 hover:bg-[#141440]"
                  }`}
                >
                  <div className="min-w-0 flex-1 pr-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-black text-cyan-300">⚡ Auto — Smart Routing</span>
                      <span className="rounded-full border border-cyan-400/40 bg-cyan-400/20 px-2 py-[1px] text-[9px] font-black uppercase tracking-wider text-cyan-200">
                        Recommended
                      </span>
                    </div>
                    <p className="mt-1 text-[11px] font-medium leading-snug text-slate-200">
                      Auto-selects fast NVIDIA models for Luau scripting & build actions, and Nemotron/Claude for deep planning.
                    </p>
                  </div>
                  {selectedModel === "auto" && (
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-cyan-300" />
                  )}
                </button>
              )}

              {/* Filtered Models List */}
              {filteredModels.map((m) => {
                const isSelected = selectedModel === m.id;
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => {
                      onSelectModel(m.id);
                      setOpen(false);
                    }}
                    className={`group flex w-full items-start justify-between rounded-xl border p-2.5 text-left transition-all ${
                      isSelected
                        ? "border-indigo-400 bg-indigo-500/35 shadow-[0_0_25px_rgba(99,102,241,0.35)]"
                        : "border-white/10 bg-[#0e0e30] hover:border-indigo-400/60 hover:bg-[#141440]"
                    }`}
                  >
                    <div className="min-w-0 flex-1 pr-2">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className={`text-xs font-bold ${isSelected ? "text-white" : "text-slate-100 group-hover:text-cyan-200"}`}>
                          {m.label}
                        </span>
                        <span className="rounded-full border border-white/15 bg-white/10 px-1.5 py-[1px] text-[9px] font-bold text-slate-300">
                          {m.provider}
                        </span>
                        <span className={`rounded-full px-1.5 py-[1px] text-[9px] font-black uppercase ${
                          m.speed === "Fast" ? "border border-emerald-500/40 bg-emerald-500/20 text-emerald-300" : "border border-indigo-500/40 bg-indigo-500/20 text-indigo-300"
                        }`}>
                          {m.speed}
                        </span>
                      </div>
                      <p className="mt-1 text-[11px] font-medium leading-snug text-slate-300 group-hover:text-white line-clamp-2">
                        {m.bestFor}
                      </p>
                    </div>
                    {isSelected && (
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-cyan-300" />
                    )}
                  </button>
                );
              })}

              {filteredModels.length === 0 && search && (
                <div className="p-4 text-center text-xs font-medium text-slate-400">
                  No AI models found matching &quot;{search}&quot;.
                </div>
              )}
            </div>
          </div>
        </>,
        document.body
      )}
    </div>
  );
}
