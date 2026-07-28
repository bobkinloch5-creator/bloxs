import React, { useState } from "react";
import {
  BookOpen, Sparkles, Plug, Crown, Zap, CheckCircle2, Shield, X,
  HelpCircle, Code2, LayoutDashboard, Box, ExternalLink, MessageSquare, Flame, Rocket
} from "lucide-react";
import { Link } from "@tanstack/react-router";

interface WebsiteGuideModalProps {
  open: boolean;
  onClose: () => void;
}

export function WebsiteGuideModal({ open, onClose }: WebsiteGuideModalProps) {
  const [activeTab, setActiveTab] = useState<"features" | "plugin" | "roles" | "tips">("features");

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-md animate-in fade-in duration-200">
      <div
        className="relative w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden rounded-3xl border border-indigo-500/30 bg-[#0c0d1d] text-slate-100 shadow-[0_0_50px_rgba(79,70,229,0.3)]"
        style={{ fontFamily: "Rubik, ui-sans-serif, system-ui" }}
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-indigo-500/20 bg-gradient-to-r from-indigo-950/60 via-[#10122e] to-purple-950/40 px-6 py-5">
          <div className="flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-2xl bg-gradient-to-tr from-indigo-600 to-cyan-400 text-white shadow-[0_0_20px_rgba(99,102,241,0.5)]">
              <BookOpen className="h-5 w-5" />
            </span>
            <div>
              <h2 className="text-xl font-extrabold text-white tracking-tight flex items-center gap-2">
                BloxSmith AI Platform Guide
                <span className="rounded-full bg-cyan-500/20 border border-cyan-400/30 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-widest text-cyan-300">
                  How Everything Works
                </span>
              </h2>
              <p className="text-xs text-indigo-200/70">
                Learn how AI models, Roblox Studio sync, credits, and builds work together seamlessly.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-white/10 bg-white/5 p-2 text-slate-400 hover:bg-white/10 hover:text-white transition"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-white/10 bg-white/[0.02] px-6 py-2 gap-2 overflow-x-auto no-scrollbar">
          <button
            type="button"
            onClick={() => setActiveTab("features")}
            className={`flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition ${
              activeTab === "features"
                ? "bg-indigo-500/20 border border-indigo-400/40 text-indigo-200 shadow-[0_0_15px_rgba(99,102,241,0.25)]"
                : "text-slate-400 hover:text-slate-200 hover:bg-white/5"
            }`}
          >
            <Sparkles className="h-4 w-4 text-cyan-400" /> 1. Platform & AI Models
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("plugin")}
            className={`flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition ${
              activeTab === "plugin"
                ? "bg-emerald-500/20 border border-emerald-400/40 text-emerald-200 shadow-[0_0_15px_rgba(52,211,153,0.25)]"
                : "text-slate-400 hover:text-slate-200 hover:bg-white/5"
            }`}
          >
            <Plug className="h-4 w-4 text-emerald-400" /> 2. Roblox Studio Sync
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("roles")}
            className={`flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition ${
              activeTab === "roles"
                ? "bg-amber-500/20 border border-amber-400/40 text-amber-200 shadow-[0_0_15px_rgba(251,191,36,0.25)]"
                : "text-slate-400 hover:text-slate-200 hover:bg-white/5"
            }`}
          >
            <Crown className="h-4 w-4 text-amber-400" /> 3. Roles & Credits
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("tips")}
            className={`flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition ${
              activeTab === "tips"
                ? "bg-cyan-500/20 border border-cyan-400/40 text-cyan-200 shadow-[0_0_15px_rgba(34,211,238,0.25)]"
                : "text-slate-400 hover:text-slate-200 hover:bg-white/5"
            }`}
          >
            <Rocket className="h-4 w-4 text-cyan-400" /> 4. Tips & Troubleshooting
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6 bs-smooth-scroll">
          {activeTab === "features" && (
            <div className="space-y-5 animate-in fade-in duration-150">
              <div className="rounded-2xl border border-indigo-500/30 bg-indigo-950/20 p-5 space-y-3">
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-cyan-400" /> AI Workspace & Composer
                </h3>
                <p className="text-xs text-slate-300 leading-relaxed">
                  The AI Workspace allows you to build full Roblox games, write Luau scripts, generate custom UI layouts, and stream 3D models directly into your projects using plain English.
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2">
                  <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3.5 space-y-1">
                    <div className="text-xs font-bold text-indigo-300 flex items-center gap-1.5">
                      <Code2 className="h-3.5 w-3.5 text-cyan-400" /> 28+ Specialized AI Models
                    </div>
                    <p className="text-[11px] text-slate-400">
                      Choose from OpenAI GPT 5.5, GPT 5.6 Sol, Claude Opus 4.8, GLM 5.2, Kimi K3, DeepSeek, and more. Each model highlights its primary strength (e.g., Luau Scripting, UI Blueprints, or Architecture).
                    </p>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3.5 space-y-1">
                    <div className="text-xs font-bold text-indigo-300 flex items-center gap-1.5">
                      <Hammer className="h-3.5 w-3.5 text-amber-400" /> Automatic Project Builds
                    </div>
                    <p className="text-[11px] text-slate-400">
                      When in <strong>Build</strong> mode, your instructions generate exact Luau code, RemoteEvents, and model structures that immediately sync into your active project.
                    </p>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4 space-y-2">
                  <div className="h-8 w-8 rounded-xl bg-cyan-500/20 text-cyan-300 grid place-items-center font-bold text-xs">
                    <LayoutDashboard className="h-4 w-4" />
                  </div>
                  <h4 className="text-xs font-bold text-white">UI Generator</h4>
                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    Design modern HUDs, shop menus, inventory screens, and leaderboards that compile cleanly into Roblox ScreenGuis.
                  </p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4 space-y-2">
                  <div className="h-8 w-8 rounded-xl bg-purple-500/20 text-purple-300 grid place-items-center font-bold text-xs">
                    <Box className="h-4 w-4" />
                  </div>
                  <h4 className="text-xs font-bold text-white">3D Models & Procedural AI</h4>
                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    Search thousands of 3D assets or generate custom procedural shapes with parts, wedges, and materials.
                  </p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4 space-y-2">
                  <div className="h-8 w-8 rounded-xl bg-emerald-500/20 text-emerald-300 grid place-items-center font-bold text-xs">
                    <Shield className="h-4 w-4" />
                  </div>
                  <h4 className="text-xs font-bold text-white">Server-Authoritative Luau</h4>
                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    All generated scripts follow modern Luau standards, utilizing task.wait, typed remotes, and multiplayer anti-cheat checks.
                  </p>
                </div>
              </div>
            </div>
          )}

          {activeTab === "plugin" && (
            <div className="space-y-5 animate-in fade-in duration-150">
              <div className="rounded-2xl border border-emerald-500/30 bg-emerald-950/20 p-5 space-y-3">
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <Plug className="h-4 w-4 text-emerald-400" /> Connecting BloxSmith to Roblox Studio
                </h3>
                <p className="text-xs text-slate-300 leading-relaxed">
                  The BloxSmith Studio Plugin connects your browser workspace directly to your active Roblox Studio session so builds are placed inside your place automatically.
                </p>
                <div className="space-y-3 pt-2">
                  <div className="flex items-start gap-3 rounded-xl bg-white/[0.03] border border-white/10 p-3.5">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-300 font-bold text-xs">1</span>
                    <div className="space-y-1">
                      <div className="text-xs font-bold text-white">Install the BloxSmith Studio Plugin</div>
                      <p className="text-[11px] text-slate-400">
                        Download and install the free plugin from the Roblox Creator Store or your <Link to="/plugin" className="text-emerald-300 underline font-semibold">Studio Plugin Page</Link>.
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3 rounded-xl bg-white/[0.03] border border-white/10 p-3.5">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-300 font-bold text-xs">2</span>
                    <div className="space-y-1">
                      <div className="text-xs font-bold text-white">Enter Your Plugin Access Token</div>
                      <p className="text-[11px] text-slate-400">
                        Copy your unique Token starting with <code className="rounded bg-black/40 px-1.5 py-0.5 text-emerald-300 font-mono text-[10px]">BS-...</code> from your settings and paste it into the plugin widget in Roblox Studio.
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3 rounded-xl bg-white/[0.03] border border-white/10 p-3.5">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-300 font-bold text-xs">3</span>
                    <div className="space-y-1">
                      <div className="text-xs font-bold text-white">Click "Connect" & Stream Builds</div>
                      <p className="text-[11px] text-slate-400">
                        Once connected, your status will turn <span className="text-emerald-400 font-bold">Studio: Connected</span>. Any builds generated in chat will instantly stream scripts, GUIs, and models right into your place!
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === "roles" && (
            <div className="space-y-5 animate-in fade-in duration-150">
              <div className="rounded-2xl border border-amber-500/30 bg-amber-950/20 p-5 space-y-3">
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <Crown className="h-4 w-4 text-amber-400" /> Account Roles, Credits & Model Access
                </h3>
                <p className="text-xs text-slate-300 leading-relaxed">
                  BloxSmith uses a transparent credit allocation system to allow everyone to build Roblox games for free while rewarding supporters and platform owners.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="rounded-2xl border border-amber-500/40 bg-gradient-to-b from-amber-500/10 to-transparent p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="rounded-lg bg-amber-500/20 border border-amber-400/40 px-2 py-0.5 text-[10px] font-black uppercase text-amber-300">
                      👑 OWNER ROLE
                    </span>
                    <Crown className="h-4 w-4 text-amber-400" />
                  </div>
                  <h4 className="text-xs font-bold text-white">Unlimited Platform Access</h4>
                  <p className="text-[11px] text-slate-300 leading-relaxed">
                    The Owner account (<code className="text-amber-200">bobkinloch5@gmail.com</code>) bypasses all top-up requirements and credit limits site-wide with unlocked access to all 28+ AI models.
                  </p>
                </div>

                <div className="rounded-2xl border border-cyan-500/40 bg-gradient-to-b from-cyan-500/10 to-transparent p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="rounded-lg bg-cyan-500/20 border border-cyan-400/40 px-2 py-0.5 text-[10px] font-black uppercase text-cyan-300">
                      ⚡ TOP-UP SUPPORTERS
                    </span>
                    <Zap className="h-4 w-4 text-cyan-400" />
                  </div>
                  <h4 className="text-xs font-bold text-white">Premium Model Access</h4>
                  <p className="text-[11px] text-slate-300 leading-relaxed">
                    Users who top up credits unlock high-tier paid-only AI models like GPT 5.6 Sol and Claude Opus for complex architecture and large game builds.
                  </p>
                </div>

                <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="rounded-lg bg-white/10 px-2 py-0.5 text-[10px] font-bold uppercase text-slate-300">
                      FREE TIER
                    </span>
                    <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                  </div>
                  <h4 className="text-xs font-bold text-white">50 Daily Credits</h4>
                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    Free users receive 50 daily credits to generate scripts, ask questions, and build Roblox experiences with core models.
                  </p>
                </div>
              </div>
            </div>
          )}

          {activeTab === "tips" && (
            <div className="space-y-4 animate-in fade-in duration-150">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Rocket className="h-4 w-4 text-cyan-400" /> Pro Tips for Building Fast
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 space-y-1.5">
                  <div className="text-xs font-bold text-cyan-300 flex items-center gap-1.5">
                    <Flame className="h-3.5 w-3.5 text-amber-400" /> Be Specific in Your Prompts
                  </div>
                  <p className="text-[11px] text-slate-300 leading-relaxed">
                    Instead of asking "Make a tycoon", try "Create a cash printer tycoon with leaderstats, a button to upgrade print speed, and a shop GUI."
                  </p>
                </div>

                <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 space-y-1.5">
                  <div className="text-xs font-bold text-cyan-300 flex items-center gap-1.5">
                    <HelpCircle className="h-3.5 w-3.5 text-indigo-400" /> Use Chat for Advice, Build for Code
                  </div>
                  <p className="text-[11px] text-slate-300 leading-relaxed">
                    Switch to <strong>Chat</strong> mode when asking questions about game design, and switch back to <strong>Build</strong> mode when you want AI to generate code.
                  </p>
                </div>

                <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 space-y-1.5">
                  <div className="text-xs font-bold text-cyan-300 flex items-center gap-1.5">
                    <Plug className="h-3.5 w-3.5 text-emerald-400" /> Keep Studio Open While Building
                  </div>
                  <p className="text-[11px] text-slate-300 leading-relaxed">
                    Having Roblox Studio open with your plugin connected lets you watch assets populate live in real time as the AI outputs them.
                  </p>
                </div>

                <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 space-y-1.5">
                  <div className="text-xs font-bold text-cyan-300 flex items-center gap-1.5">
                    <MessageSquare className="h-3.5 w-3.5 text-purple-400" /> Join Our Discord Community
                  </div>
                  <p className="text-[11px] text-slate-300 leading-relaxed">
                    Have questions or feedback? Join our active Discord community to showcase your games, get help, and request new features!
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-between border-t border-indigo-500/20 bg-gradient-to-r from-indigo-950/40 via-[#0e1026] to-purple-950/40 px-6 py-4">
          <a
            href="https://discord.gg/YJ8xPFNSSX"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 text-xs font-bold text-indigo-300 hover:text-white transition"
          >
            <MessageSquare className="h-3.5 w-3.5" /> Need direct help? Join Discord
          </a>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl bg-indigo-500 px-5 py-2 text-xs font-bold text-white hover:bg-indigo-400 transition shadow-[0_0_15px_rgba(99,102,241,0.4)]"
          >
            Got it, thanks!
          </button>
        </div>
      </div>
    </div>
  );
}
