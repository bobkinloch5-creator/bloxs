import React, { useState, useMemo, useRef, useEffect } from "react";
import { Sparkles, ChevronDown, Check, Search, Zap, Lock, Crown } from "lucide-react";
import { ModelOption } from "@/lib/models";
import { PayPalTopUpModal } from "@/components/PayPalTopUpModal";
import { toast } from "sonner";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getMyProfile } from "@/lib/profile.functions";

interface ModelSelectorProps {
  selectedModel: string;
  onSelectModel: (modelId: string) => void;
  availableModels: ModelOption[];
  isOwner?: boolean;
}

const PROVIDER_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  Anthropic: { bg: "bg-amber-500/15", text: "text-amber-300", border: "border-amber-500/30" },
  NVIDIA: { bg: "bg-emerald-500/15", text: "text-emerald-300", border: "border-emerald-500/30" },
  Qwen: { bg: "bg-purple-500/15", text: "text-purple-300", border: "border-purple-500/30" },
  Meta: { bg: "bg-cyan-500/15", text: "text-cyan-300", border: "border-cyan-500/30" },
  Mistral: { bg: "bg-orange-500/15", text: "text-orange-300", border: "border-orange-500/30" },
  Google: { bg: "bg-blue-500/15", text: "text-blue-300", border: "border-blue-500/30" },
  DeepSeek: { bg: "bg-indigo-500/15", text: "text-indigo-300", border: "border-indigo-500/30" },
  default: { bg: "bg-slate-500/15", text: "text-slate-300", border: "border-slate-500/30" },
};

export function ModelSelector({ selectedModel, onSelectModel, availableModels, isOwner: isOwnerProp }: ModelSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState<string>("All");
  const [showTopUpModal, setShowTopUpModal] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const profileFn = useServerFn(getMyProfile);
  const { data: profile } = useQuery({
    queryKey: ["profile"],
    queryFn: () => profileFn(),
    staleTime: 60_000,
  });

  const isOwnerUser =
    isOwnerProp ||
    profile?.plan === "Owner" ||
    profile?.is_admin === true ||
    profile?.username?.toLowerCase() === "king" ||
    profile?.display_name?.toLowerCase() === "king" ||
    profile?.username?.toLowerCase() === "elibobop" ||
    profile?.display_name?.toLowerCase() === "elibobop" ||
    (profile as any)?.email?.toLowerCase() === "bobkinloch5@gmail.com";

  // Close when clicking outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  // Current active model object
  const currentModel = useMemo(() => {
    if (selectedModel === "auto") return null;
    return availableModels.find((m) => m.id === selectedModel);
  }, [selectedModel, availableModels]);

  // Filtered models by search & tab
  const filteredModels = useMemo(() => {
    return availableModels.filter((m) => {
      const matchesSearch =
        m.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
        m.provider.toLowerCase().includes(searchQuery.toLowerCase()) ||
        m.bestFor.toLowerCase().includes(searchQuery.toLowerCase());
      
      const matchesTab =
        activeTab === "All" ||
        (activeTab === "Anthropic" && m.provider === "Anthropic") ||
        (activeTab === "NVIDIA" && (m.provider === "NVIDIA" || m.via.includes("NVIDIA"))) ||
        (activeTab === "Qwen" && m.provider === "Qwen") ||
        (activeTab === "Meta" && m.provider === "Meta");

      return matchesSearch && matchesTab;
    });
  }, [availableModels, searchQuery, activeTab]);

  return (
    <>
      <div className="relative inline-block text-left" ref={dropdownRef}>
        {/* Trigger Button */}
        <button
          type="button"
          onClick={() => setIsOpen((prev) => !prev)}
          className={`group flex items-center justify-between gap-2.5 rounded-xl border px-3 py-1.5 text-xs font-medium transition-all duration-200 ${
            isOpen
              ? "border-indigo-400/60 bg-slate-900/90 text-white shadow-[0_0_20px_rgba(99,102,241,0.25)] ring-2 ring-indigo-500/30"
              : "border-white/10 bg-slate-900/70 text-slate-200 hover:border-indigo-400/30 hover:bg-slate-800/80 hover:text-white"
          }`}
        >
          <div className="flex items-center gap-2 min-w-0">
            {selectedModel === "auto" ? (
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-amber-400 to-indigo-500 text-slate-950 font-bold shadow-sm">
                <Zap className="h-3 w-3 fill-slate-950 stroke-slate-950" />
              </span>
            ) : (
              <span
                className={`flex h-5 px-1.5 shrink-0 items-center justify-center rounded-md border text-[10px] font-bold ${
                  PROVIDER_COLORS[currentModel?.provider ?? "default"].bg
                } ${PROVIDER_COLORS[currentModel?.provider ?? "default"].text} ${
                  PROVIDER_COLORS[currentModel?.provider ?? "default"].border
                }`}
              >
                {currentModel?.provider || "AI"}
              </span>
            )}

            <div className="flex flex-col text-left min-w-0">
              <span className="truncate text-[11.5px] font-semibold tracking-tight text-slate-100">
                {selectedModel === "auto" ? "Auto (Optimal AI)" : currentModel?.label}
              </span>
            </div>
          </div>

          <ChevronDown
            className={`h-3.5 w-3.5 text-slate-400 transition-transform duration-200 ${
              isOpen ? "rotate-180 text-indigo-400" : "group-hover:text-slate-200"
            }`}
          />
        </button>

        {/* Popover Dropdown Panel */}
        {isOpen && (
          <div className="absolute right-0 z-50 mt-2 w-[360px] sm:w-[410px] rounded-2xl border border-indigo-500/20 bg-slate-950/95 p-3 text-slate-100 shadow-[0_20px_50px_rgba(0,0,0,0.8)] backdrop-blur-xl animate-in fade-in-50 zoom-in-95">
            {/* Header & Search */}
            <div className="mb-2.5 flex flex-col gap-2">
              <div className="flex items-center justify-between px-1">
                <div className="flex items-center gap-1.5 text-xs font-bold text-slate-200">
                  <Sparkles className="h-3.5 w-3.5 text-indigo-400" />
                  Select Roblox AI Engine
                </div>
                <span className="text-[10px] font-semibold text-slate-400">
                  {availableModels.length} models active
                </span>
              </div>

              {/* Search input */}
              <div className="relative flex items-center">
                <Search className="absolute left-3 h-3.5 w-3.5 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search models (e.g. Claude, Qwen, 70B, NVIDIA)..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full rounded-xl border border-white/10 bg-slate-900/90 py-1.5 pl-8 pr-3 text-xs text-slate-200 placeholder-slate-500 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  autoFocus
                />
              </div>

              {/* Filter Tabs */}
              <div className="flex items-center gap-1 overflow-x-auto pb-1 no-scrollbar text-[10.5px]">
                {["All", "Anthropic", "NVIDIA", "Qwen", "Meta"].map((tab) => (
                  <button
                    key={tab}
                    type="button"
                    onClick={() => setActiveTab(tab)}
                    className={`rounded-lg px-2.5 py-1 font-semibold transition-colors shrink-0 ${
                      activeTab === tab
                        ? "bg-indigo-500/20 text-indigo-300 border border-indigo-500/40"
                        : "text-slate-400 hover:bg-slate-800/60 hover:text-slate-200"
                    }`}
                  >
                    {tab}
                  </button>
                ))}
              </div>
            </div>

            {/* Model Options List */}
            <div className="max-h-[320px] overflow-y-auto space-y-1.5 pr-1 text-left custom-scrollbar">
              {/* AUTO OPTION */}
              {(!searchQuery || "auto optimal best".includes(searchQuery.toLowerCase())) && (
                <button
                  type="button"
                  onClick={() => {
                    onSelectModel("auto");
                    setIsOpen(false);
                  }}
                  className={`w-full text-left rounded-xl p-2.5 transition-all duration-150 border ${
                    selectedModel === "auto"
                      ? "border-amber-400/50 bg-gradient-to-r from-amber-500/15 via-indigo-500/15 to-purple-500/15 shadow-[0_0_15px_rgba(245,158,11,0.15)]"
                      : "border-amber-500/20 bg-slate-900/60 hover:border-amber-400/30 hover:bg-slate-800/70"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-gradient-to-br from-amber-400 to-indigo-500 text-slate-950 font-bold shadow-sm shrink-0">
                        <Zap className="h-3.5 w-3.5 fill-slate-950 stroke-slate-950" />
                      </span>
                      <div>
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-bold text-amber-200">⚡ Auto — Smart Router</span>
                          <span className="rounded bg-amber-400/20 px-1.5 py-0.5 text-[9.5px] font-bold text-amber-300">
                            RECOMMENDED
                          </span>
                          <span className="rounded bg-emerald-500/20 border border-emerald-400/30 px-1.5 py-0.5 text-[9.5px] font-bold text-emerald-300">
                            ✨ FREE
                          </span>
                        </div>
                        <p className="mt-0.5 text-[11px] leading-tight text-slate-300">
                          Dynamically picks fast NVIDIA models for planning & Qwen Coder for high-quality Luau scripts.
                        </p>
                      </div>
                    </div>
                    {selectedModel === "auto" && (
                      <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-amber-400 text-slate-950">
                        <Check className="h-2.5 w-2.5 stroke-[3]" />
                      </span>
                    )}
                  </div>
                </button>
              )}

              {/* REGULAR MODELS */}
              {filteredModels.map((m) => {
                const isSelected = selectedModel === m.id;
                const providerStyle = PROVIDER_COLORS[m.provider] || PROVIDER_COLORS.default;
                const costNum = m.credits === "Very High" ? 6 : m.credits === "High" ? 4 : m.credits === "Medium" ? 2 : 1;
                const creditBadgeStyle =
                  m.credits === "Very High"
                    ? "bg-rose-500/20 border-rose-500/40 text-rose-300"
                    : m.credits === "High"
                      ? "bg-purple-500/20 border-purple-500/40 text-purple-300"
                      : m.credits === "Medium"
                        ? "bg-indigo-500/20 border-indigo-500/40 text-indigo-300"
                        : "bg-emerald-500/20 border-emerald-500/40 text-emerald-300";

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
                      setIsOpen(false);
                    }}
                    className={`w-full text-left rounded-xl p-2.5 transition-all duration-150 border ${
                      isSelected
                        ? "border-indigo-400/60 bg-indigo-500/15 shadow-[0_0_15px_rgba(99,102,241,0.2)]"
                        : m.paidOnly && !isOwnerUser
                        ? "border-purple-500/40 hover:border-purple-400 hover:bg-purple-950/40"
                        : "border-white/5 bg-slate-900/40 hover:border-slate-700 hover:bg-slate-800/60"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-xs font-bold text-slate-100">{m.label}</span>
                          <span
                            className={`rounded px-1.5 py-0.2 text-[9.5px] font-bold border ${providerStyle.bg} ${providerStyle.text} ${providerStyle.border}`}
                          >
                            {m.provider}
                          </span>
                          <span className="text-[10px] font-medium text-slate-400">
                            {m.speed} • {m.quality}
                          </span>
                          {m.paidOnly ? (
                            isOwnerUser ? (
                              <span className="rounded border bg-emerald-950/60 border-emerald-400/60 text-emerald-300 px-1.5 py-0.5 text-[9.5px] font-extrabold uppercase tracking-wider shadow-[0_0_8px_rgba(16,185,129,0.4)] flex items-center gap-1">
                                <Crown className="w-3 h-3 text-emerald-400" /> OWNER UNLOCKED
                              </span>
                            ) : (
                              <span className="rounded border bg-purple-900/60 border-purple-400/60 text-purple-200 px-1.5 py-0.5 text-[9.5px] font-extrabold uppercase tracking-wider shadow-[0_0_8px_rgba(168,85,247,0.4)]">
                                💎 TOP-UP REQUIRED
                              </span>
                            )
                          ) : (
                            <span
                              className={`rounded border px-1.5 py-0.5 text-[9.5px] font-extrabold uppercase tracking-wider ${creditBadgeStyle}`}
                            >
                              ⚡ {costNum} Credit{costNum === 1 ? "" : "s"}
                            </span>
                          )}
                        </div>
                        <p className="mt-1 text-[11px] leading-snug text-slate-400 line-clamp-2">
                          {m.bestFor}
                        </p>
                      </div>

                      {isSelected ? (
                        <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-indigo-400 text-slate-950 mt-0.5">
                          <Check className="h-2.5 w-2.5 stroke-[3]" />
                        </span>
                      ) : m.paidOnly ? (
                        <Lock className="h-4 w-4 shrink-0 text-purple-400 mt-0.5" />
                      ) : null}
                    </div>
                  </button>
                );
              })}

              {filteredModels.length === 0 && searchQuery && (
                <div className="py-6 text-center text-xs text-slate-400">
                  No active models matching "{searchQuery}"
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      <PayPalTopUpModal
        isOpen={showTopUpModal}
        onClose={() => setShowTopUpModal(false)}
      />
    </>
  );
}
iv>
  );
}
