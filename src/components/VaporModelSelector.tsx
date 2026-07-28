import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { Sparkles, ChevronDown, Check, Search, Cpu, Lock, Crown } from "lucide-react";
import { type ModelOption } from "@/lib/models";
import { PayPalTopUpModal } from "@/components/PayPalTopUpModal";
import { toast } from "sonner";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getMyProfile } from "@/lib/profile.functions";

interface Props {
  selectedModel: string;
  onSelectModel: (id: string) => void;
  availableModels: ModelOption[];
  isOwner?: boolean;
}

export function VaporModelSelector({ selectedModel, onSelectModel, availableModels, isOwner: isOwnerProp }: Props) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [coords, setCoords] = useState<{ top: number; right: number }>({ top: 0, right: 0 });
  const [mounted, setMounted] = useState(false);
  const [showTopUpModal, setShowTopUpModal] = useState(false);

  const profileFn = useServerFn(getMyProfile);
  const { data: profile } = useQuery({
    queryKey: ["profile"],
    queryFn: () => profileFn(),
    staleTime: 60_000,
  });

  const isOwnerUser = isOwnerProp || profile?.plan === "Owner" || profile?.is_admin === true;

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
    <>
      <div className="inline-block text-left">
        <button
          ref={triggerRef}
          type="button"
          onClick={handleToggle}
          aria-expanded={open}
          style={{ backgroundColor: open ? "#1e1b4b" : "#0a0a20" }}
          className={`group inline-flex items-center gap-2 rounded-xl border border-cyan-400/50 px-3.5 py-2 text-xs font-extrabold text-cyan-200 shadow-[0_0_15px_rgba(34,211,238,0.2)] transition-all active:scale-95 hover:border-cyan-400 hover:bg-[#121236] hover:shadow-[0_0_20px_rgba(34,211,238,0.35)]`}
          title="Choose which AI model handles your next messages."
        >
          <Sparkles className="h-3.5 w-3.5 text-cyan-400 group-hover:animate-pulse" />
          <span className="max-w-[180px] truncate font-extrabold text-white">
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
            {/* Dimmed Solid Backdrop Overlay */}
            <div
              style={{ backgroundColor: "rgba(0, 0, 0, 0.75)" }}
              className="fixed inset-0 z-[99998]"
              onClick={() => setOpen(false)}
            />

            {/* 100% Solid Non-Transparent Modal Window */}
            <div
              style={{
                position: "fixed",
                top: `${coords.top}px`,
                right: `${coords.right}px`,
                maxHeight: `calc(100vh - ${coords.top + 24}px)`,
                backgroundColor: "#050514",
                opacity: 1,
              }}
              className="z-[99999] flex w-[340px] flex-col overflow-hidden rounded-2xl border-2 border-cyan-400 shadow-[0_30px_100px_rgba(0,0,0,1)] animate-in fade-in zoom-in-95 duration-150 p-3 sm:w-[390px]"
            >
              {/* Header & Search */}
              <div className="shrink-0 border-b border-indigo-500/30 pb-2.5 mb-2">
                <div className="mb-2 flex items-center justify-between text-[10px] font-black uppercase tracking-wider text-indigo-300">
                  <span className="flex items-center gap-1.5">
                    <Cpu className="h-3.5 w-3.5 text-cyan-400" /> Choose AI Model
                  </span>
                  <span className="font-bold text-slate-300">{availableModels.length + 1} Available</span>
                </div>
                <div className="relative">
                  <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-cyan-400" />
                  <input
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search models (e.g. Claude, Qwen, NVIDIA, Llama)…"
                    style={{ backgroundColor: "#0d0d26", opacity: 1 }}
                    className="w-full rounded-xl border border-indigo-500/50 py-2 pl-9 pr-3 text-xs font-semibold text-white placeholder-slate-400 outline-none focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400"
                  />
                </div>
              </div>

              {/* Model Options List - All buttons 100% solid opacity */}
              <div className="flex-1 overflow-y-auto space-y-2 pr-1 scrollbar-thin scrollbar-thumb-indigo-500">
                {/* Auto Option */}
                {(!search || "auto".includes(search.toLowerCase()) || "recommend".includes(search.toLowerCase())) && (
                  <button
                    type="button"
                    onClick={() => {
                      onSelectModel("auto");
                      setOpen(false);
                    }}
                    style={{
                      backgroundColor: selectedModel === "auto" ? "#1e1b4b" : "#0c0c24",
                      opacity: 1,
                    }}
                    className={`group flex w-full items-start justify-between rounded-xl border p-3 text-left transition-all ${
                      selectedModel === "auto"
                        ? "border-cyan-400 shadow-[0_0_20px_rgba(34,211,238,0.4)]"
                        : "border-indigo-500/30 hover:border-cyan-400/60 hover:bg-[#121236]"
                    }`}
                  >
                    <div className="min-w-0 flex-1 pr-2">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-xs font-black text-cyan-300">⚡ Auto — Smart Routing</span>
                        <span
                          style={{ backgroundColor: "#0284c7" }}
                          className="rounded-full px-2 py-[1px] text-[9px] font-black uppercase tracking-wider text-white"
                        >
                          Recommended
                        </span>
                        <span
                          style={{ backgroundColor: "#052e16", color: "#86efac", borderColor: "#16a34a" }}
                          className="rounded-full border px-2 py-[1px] text-[9px] font-black uppercase tracking-wider"
                        >
                          ✨ FREE
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
                  const costNum = m.credits === "Very High" ? 6 : m.credits === "High" ? 4 : m.credits === "Medium" ? 2 : 1;
                  const badgeColor =
                    m.credits === "Very High"
                      ? { bg: "#881337", text: "#fecdd3", border: "#f43f5e" }
                      : m.credits === "High"
                        ? { bg: "#581c87", text: "#e9d5ff", border: "#a855f7" }
                        : m.credits === "Medium"
                          ? { bg: "#1e1b4b", text: "#a5b4fc", border: "#6366f1" }
                          : { bg: "#064e3b", text: "#6ee7b7", border: "#10b981" };

                  return (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => {
                        if (m.paidOnly && !isOwnerUser) {
                          toast.info(`💎 ${m.label} is a Top-Up Exclusive model. Opening payment options...`);
                          setShowTopUpModal(true);
                        }
                        onSelectModel(m.id);
                        setOpen(false);
                      }}
                      style={{
                        backgroundColor: isSelected ? "#1e1b4b" : "#0c0c24",
                        opacity: 1,
                      }}
                      className={`group flex w-full items-start justify-between rounded-xl border p-3 text-left transition-all ${
                        isSelected
                          ? "border-cyan-400 shadow-[0_0_20px_rgba(34,211,238,0.4)]"
                          : m.paidOnly && !isOwnerUser
                          ? "border-purple-500/40 hover:border-purple-400 hover:bg-[#1a0b2e]"
                          : "border-indigo-500/30 hover:border-cyan-400/60 hover:bg-[#121236]"
                      }`}
                    >
                      <div className="min-w-0 flex-1 pr-2">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className={`text-xs font-bold ${isSelected ? "text-white" : "text-slate-100 group-hover:text-cyan-200"}`}>
                            {m.label}
                          </span>
                          <span
                            style={{ backgroundColor: "#1e293b" }}
                            className="rounded-full px-2 py-[1px] text-[9px] font-bold text-slate-200"
                          >
                            {m.provider}
                          </span>
                          <span
                            style={{ backgroundColor: m.speed === "Fast" ? "#065f46" : "#3730a3" }}
                            className="rounded-full px-2 py-[1px] text-[9px] font-black uppercase text-white"
                          >
                            {m.speed}
                          </span>
                          {m.paidOnly ? (
                            isOwnerUser ? (
                              <span
                                style={{ backgroundColor: "#065f46", color: "#6ee7b7", borderColor: "#10b981" }}
                                className="rounded-full border px-2 py-[1px] text-[9px] font-black uppercase tracking-wider shadow-sm flex items-center gap-1"
                              >
                                <Crown className="w-3 h-3 text-emerald-400" /> OWNER UNLOCKED
                              </span>
                            ) : (
                              <span
                                style={{ backgroundColor: "#581c87", color: "#f3e8ff", borderColor: "#a855f7" }}
                                className="rounded-full border px-2 py-[1px] text-[9px] font-black uppercase tracking-wider shadow-[0_0_10px_rgba(168,85,247,0.4)] flex items-center gap-1"
                              >
                                💎 TOP-UP REQUIRED
                              </span>
                            )
                          ) : (
                            <span
                              style={{ backgroundColor: badgeColor.bg, color: badgeColor.text, borderColor: badgeColor.border }}
                              className="rounded-full border px-2 py-[1px] text-[9px] font-black uppercase tracking-wider shadow-sm"
                            >
                              ⚡ {costNum} Credit{costNum === 1 ? "" : "s"}
                            </span>
                          )}
                        </div>
                        <p className="mt-1 text-[11px] font-medium leading-snug text-slate-200 group-hover:text-white line-clamp-2">
                          {m.bestFor}
                        </p>
                      </div>
                      {isSelected ? (
                        <Check className="mt-0.5 h-4 w-4 shrink-0 text-cyan-300" />
                      ) : m.paidOnly ? (
                        <Lock className="mt-0.5 h-4 w-4 shrink-0 text-purple-400" />
                      ) : null}
                    </button>
                  );
                })}

                {filteredModels.length === 0 && search && (
                  <div className="p-4 text-center text-xs font-medium text-slate-300">
                    No AI models found matching &quot;{search}&quot;.
                  </div>
                )}
              </div>
            </div>
          </>,
          document.body
        )}
      </div>

      <PayPalTopUpModal
        isOpen={showTopUpModal}
        onClose={() => setShowTopUpModal(false)}
      />
    </>
  );
}

