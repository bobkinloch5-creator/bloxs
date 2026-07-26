import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Zap, Check, ShieldCheck, Heart, Sparkles, ExternalLink, MessageSquare, ArrowRight, Star, HelpCircle, Crown } from "lucide-react";
import { TOP_UP_PACKS } from "@/lib/paypal.functions";
import { MODELS } from "@/lib/models";
import { PayPalTopUpModal } from "@/components/PayPalTopUpModal";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getMyProfile } from "@/lib/profile.functions";

export const Route = createFileRoute("/pricing")({
  head: () => ({
    meta: [
      { title: "Pricing & AI Credits — BloxSmith Studio" },
      { name: "description", content: "Transparent AI credit pricing for Roblox Studio Forge. 15 free daily credits, 1 free unlimited model, and instant PayPal top-ups." },
      { property: "og:title", content: "BloxSmith AI Credit Pricing" },
      { property: "og:description", content: "Build Roblox games with AI. Get 15 free daily credits and top up via PayPal." },
      { property: "og:url", content: "https://bloxsmith.pro/pricing" },
      { property: "og:type", content: "website" },
    ],
    links: [{ rel: "canonical", href: "https://bloxsmith.pro/pricing" }],
  }),
  component: PricingPage,
});

function PricingPage() {
  const [showTopUpModal, setShowTopUpModal] = useState(false);
  const profFn = useServerFn(getMyProfile);
  const { data: profile } = useQuery({ queryKey: ["profile"], queryFn: () => profFn() });
  const credits = (profile as any)?.credits ?? 15;

  const freeModel = MODELS.find((m) => m.credits === "Free") || MODELS.find((m) => m.id.includes("llama-3.1-8b"));

  return (
    <div className="min-h-screen bg-[#050515] text-slate-100 font-sans selection:bg-cyan-500/30">
      {/* Background Glows */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -top-40 left-1/2 -translate-x-1/2 h-[500px] w-[800px] rounded-full bg-gradient-to-b from-indigo-600/20 via-purple-600/10 to-transparent blur-3xl" />
        <div className="absolute top-1/3 -left-40 h-[400px] w-[400px] rounded-full bg-cyan-600/10 blur-3xl" />
        <div className="absolute bottom-10 right-0 h-[400px] w-[400px] rounded-full bg-purple-600/10 blur-3xl" />
      </div>

      {/* Header Navigation */}
      <header className="sticky top-0 z-40 border-b border-indigo-500/15 bg-[#050515]/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <Link to="/" className="flex items-center gap-2.5 group">
            <span className="grid h-8 w-8 place-items-center rounded-xl bg-gradient-to-br from-cyan-400 via-indigo-500 to-purple-600 text-slate-950 font-black shadow-[0_0_20px_rgba(34,211,238,0.4)] group-hover:scale-105 transition">
              <Zap className="h-4 w-4 fill-slate-950 stroke-slate-950" />
            </span>
            <span className="text-base font-extrabold tracking-tight text-white">BloxSmith</span>
          </Link>
          <div className="flex items-center gap-4 text-xs font-semibold">
            <Link to="/dashboard" className="text-slate-300 hover:text-white transition">Dashboard</Link>
            <Link to="/docs" className="text-slate-300 hover:text-white transition">Docs</Link>
            <a
              href="https://discord.gg/YJ8xPFNSSX"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 rounded-xl border border-indigo-500/30 bg-indigo-500/10 px-3 py-1.5 text-indigo-300 hover:bg-indigo-500/20 hover:text-white transition"
            >
              <MessageSquare className="h-3.5 w-3.5 text-indigo-400" />
              Discord Community
            </a>
          </div>
        </div>
      </header>

      <main className="relative z-10 mx-auto max-w-6xl px-6 py-12">
        {/* Discord Notice Banner */}
        <div className="mb-10 overflow-hidden rounded-3xl border border-indigo-400/40 bg-gradient-to-r from-indigo-950/90 via-purple-950/90 to-indigo-950/90 p-5 shadow-[0_0_40px_rgba(99,102,241,0.25)]">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-start gap-4">
              <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-indigo-500/20 border border-indigo-400/40 text-indigo-300">
                <MessageSquare className="h-6 w-6" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-black text-white">Discord Membership Required for Top-Ups</h3>
                  <span className="rounded-full bg-amber-400/20 px-2.5 py-0.5 text-[10px] font-black uppercase text-amber-300 border border-amber-400/40">
                    Important
                  </span>
                </div>
                <p className="mt-1 text-xs text-indigo-200/90 max-w-2xl leading-relaxed">
                  Before purchasing credit top-ups or plans on the site, please <span className="font-extrabold text-white">join our Discord server</span> so our team can immediately verify your transaction and assign your credit role!
                </p>
              </div>
            </div>
            <a
              href="https://discord.gg/YJ8xPFNSSX"
              target="_blank"
              rel="noreferrer"
              className="inline-flex shrink-0 items-center gap-2 rounded-2xl bg-indigo-500 px-5 py-3 text-xs font-black text-white hover:bg-indigo-400 transition shadow-[0_0_25px_rgba(99,102,241,0.5)] active:scale-95"
            >
              Join Discord Server First <ExternalLink className="h-4 w-4" />
            </a>
          </div>
        </div>

        {/* Hero Section */}
        <div className="text-center max-w-3xl mx-auto mb-16">
          <div className="inline-flex items-center gap-2 rounded-full border border-cyan-400/30 bg-cyan-400/10 px-3.5 py-1 text-xs font-bold text-cyan-300 mb-4">
            <Zap className="h-3.5 w-3.5 fill-cyan-300" />
            Fair & Flexible AI Pricing
          </div>
          <h1 className="text-4xl sm:text-5xl font-black tracking-tight text-white leading-tight">
            Build Unlimited Roblox Worlds with AI Credits
          </h1>
          <p className="mt-4 text-base text-slate-300 max-w-2xl mx-auto leading-relaxed">
            Every user gets <span className="font-extrabold text-cyan-300">50 Free Monthly Credits</span> plus <span className="font-extrabold text-emerald-300">1 Completely Free Unlimited Model</span>. Need more heavy reasoning power? Top up credits instantly via PayPal!
          </p>
        </div>

        {/* Main Tier Cards Grid */}
        <div className="grid gap-8 lg:grid-cols-3 mb-16">
          {/* Card 1: Free Plan */}
          <div className="relative flex flex-col justify-between rounded-3xl border border-indigo-500/20 bg-[#0a0a24]/80 p-8 backdrop-blur-xl shadow-xl hover:border-indigo-500/40 transition">
            <div>
              <div className="inline-block rounded-full bg-slate-800/80 px-3 py-1 text-xs font-extrabold text-slate-300 mb-4">
                Starter Tier
              </div>
              <h2 className="text-2xl font-black text-white">Free Monthly Plan</h2>
              <p className="mt-2 text-xs text-slate-400">Perfect for casual Roblox creators and quick Lua edits.</p>
              <div className="mt-6 flex items-baseline gap-1">
                <span className="text-4xl font-black text-white">$0</span>
                <span className="text-xs text-slate-400">/ forever</span>
              </div>

              <div className="mt-8 space-y-3 border-t border-white/10 pt-6 text-xs text-slate-300">
                <div className="flex items-center gap-2.5 font-bold text-cyan-300">
                  <Check className="h-4 w-4 text-cyan-400 shrink-0" />
                  50 Free Credits Refreshed Every Month
                </div>
                <div className="flex items-center gap-2.5 font-bold text-emerald-300">
                  <Check className="h-4 w-4 text-emerald-400 shrink-0" />
                  1 Free Unlimited Cheap Model (0 Credits Cost!)
                </div>
                <div className="flex items-center gap-2.5">
                  <Check className="h-4 w-4 text-indigo-400 shrink-0" />
                  Full Access to Roblox Studio Plugin
                </div>
                <div className="flex items-center gap-2.5">
                  <Check className="h-4 w-4 text-indigo-400 shrink-0" />
                  Web Builder & AI Chat Workspace
                </div>
                <div className="flex items-center gap-2.5">
                  <Check className="h-4 w-4 text-indigo-400 shrink-0" />
                  Automated Luau Script Generation
                </div>
              </div>
            </div>

            <Link
              to="/dashboard"
              className="mt-8 block w-full rounded-2xl border border-white/10 bg-white/5 py-3 text-center text-xs font-bold text-white hover:bg-white/10 transition"
            >
              Get Started Free
            </Link>
          </div>

          {/* Card 2: PayPal Top-Up Packs (Featured) */}
          <div className="relative flex flex-col justify-between rounded-3xl border-2 border-cyan-400 bg-gradient-to-b from-[#0e0e36] via-[#0b0b2b] to-[#060618] p-8 shadow-[0_0_50px_rgba(34,211,238,0.25)] ring-1 ring-cyan-400/50">
            <span className="absolute -top-3.5 left-1/2 -translate-x-1/2 rounded-full bg-gradient-to-r from-amber-400 via-yellow-400 to-orange-400 px-4 py-1 text-[11px] font-black uppercase text-slate-950 shadow-md">
              Most Popular • Instant Refills
            </span>
            <div>
              <div className="inline-block rounded-full bg-cyan-400/20 px-3 py-1 text-xs font-extrabold text-cyan-300 mb-4 border border-cyan-400/30">
                PayPal Top-Ups
              </div>
              <h2 className="text-2xl font-black text-white">Credit Top-Up Packs</h2>
              <p className="mt-2 text-xs text-slate-300">Buy additional credits anytime with zero subscriptions.</p>
              <div className="mt-6 flex items-baseline gap-1">
                <span className="text-4xl font-black text-white">From $1.99</span>
                <span className="text-xs text-slate-400">/ top-up</span>
              </div>

              <div className="mt-8 space-y-3 border-t border-white/10 pt-6 text-xs text-slate-200">
                <div className="flex items-center gap-2.5 font-bold text-white">
                  <Sparkles className="h-4 w-4 text-cyan-300 shrink-0" />
                  Starter Pack: $1.99 for +100 Credits
                </div>
                <div className="flex items-center gap-2.5 font-bold text-amber-300">
                  <Star className="h-4 w-4 text-amber-400 shrink-0 fill-amber-400" />
                  Pro Pack: $4.99 for +350 Credits (Popular)
                </div>
                <div className="flex items-center gap-2.5 font-bold text-cyan-300">
                  <Zap className="h-4 w-4 text-cyan-400 shrink-0 fill-cyan-400" />
                  Mega Pack: $9.99 for +850 Credits (Best Value)
                </div>
                <div className="flex items-center gap-2.5 font-bold text-purple-300">
                  <Crown className="h-4 w-4 text-purple-400 shrink-0" />
                  Ultimate Pack: $19.99 for +2,000 Credits
                </div>
                <div className="flex items-center gap-2.5 text-slate-300">
                  <Check className="h-4 w-4 text-emerald-400 shrink-0" />
                  Credits Never Expire
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setShowTopUpModal(true)}
              className="mt-8 flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-cyan-400 via-indigo-500 to-purple-500 py-3 text-xs font-black text-slate-950 hover:brightness-110 shadow-[0_4px_25px_rgba(34,211,238,0.35)] transition active:scale-[0.98]"
            >
              <Zap className="h-4 w-4 fill-slate-950" /> Top Up Credits via PayPal
            </button>
          </div>

          {/* Card 3: Studio / Owner Tier */}
          <div className="relative flex flex-col justify-between rounded-3xl border border-indigo-500/20 bg-[#0a0a24]/80 p-8 backdrop-blur-xl shadow-xl hover:border-indigo-500/40 transition">
            <div>
              <div className="inline-block rounded-full bg-purple-500/20 px-3 py-1 text-xs font-extrabold text-purple-300 mb-4 border border-purple-500/30">
                Studio Developer
              </div>
              <h2 className="text-2xl font-black text-white">Owner & Admin Access</h2>
              <p className="mt-2 text-xs text-slate-400">Unlimited power for studio leads & core contributors.</p>
              <div className="mt-6 flex items-baseline gap-1">
                <span className="text-4xl font-black text-white">Unlimited</span>
              </div>

              <div className="mt-8 space-y-3 border-t border-white/10 pt-6 text-xs text-slate-300">
                <div className="flex items-center gap-2.5 font-bold text-purple-300">
                  <Crown className="h-4 w-4 text-amber-300 shrink-0" />
                  0 Credit Deduction (Unlimited Generations)
                </div>
                <div className="flex items-center gap-2.5">
                  <Check className="h-4 w-4 text-indigo-400 shrink-0" />
                  Priority High-Speed AI Pipeline
                </div>
                <div className="flex items-center gap-2.5">
                  <Check className="h-4 w-4 text-indigo-400 shrink-0" />
                  Exclusive Discord Dev Role
                </div>
                <div className="flex items-center gap-2.5">
                  <Check className="h-4 w-4 text-indigo-400 shrink-0" />
                  Direct Technical Support from Admins
                </div>
              </div>
            </div>

            <a
              href="https://discord.gg/YJ8xPFNSSX"
              target="_blank"
              rel="noreferrer"
              className="mt-8 block w-full rounded-2xl border border-indigo-500/40 bg-indigo-500/10 py-3 text-center text-xs font-bold text-indigo-200 hover:bg-indigo-500/20 hover:text-white transition"
            >
              Contact Admins on Discord
            </a>
          </div>
        </div>

        {/* Complete AI Model & Credit Cost Catalog */}
        <section className="mb-16">
          <div className="text-center max-w-2xl mx-auto mb-8">
            <h2 className="text-2xl font-extrabold text-white">Supported AI Models & Credit Costs</h2>
            <p className="mt-2 text-xs text-slate-400">
              Select any model from the chat dropdown. Fast models cost less, while large reasoning models take more credits.
            </p>
          </div>

          <div className="overflow-hidden rounded-3xl border border-indigo-500/20 bg-[#090920]/80 backdrop-blur-xl shadow-xl">
            <table className="w-full text-left text-xs text-slate-300">
              <thead className="border-b border-white/10 bg-white/[0.03] text-[10px] font-black uppercase tracking-wider text-indigo-300">
                <tr>
                  <th className="px-6 py-4">Model Name</th>
                  <th className="px-6 py-4">Provider</th>
                  <th className="px-6 py-4">Speed</th>
                  <th className="px-6 py-4">Quality</th>
                  <th className="px-6 py-4">Credit Cost</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {MODELS.filter((m) => m.status === "Working").map((model) => {
                  const isFree = model.credits === "Free";
                  const isPaidOnly = model.paidOnly;
                  return (
                    <tr key={model.id} className="hover:bg-white/[0.02] transition">
                      <td className="px-6 py-4 font-bold text-white flex flex-wrap items-center gap-2">
                        {model.label}
                        {isFree && (
                          <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-[9px] font-extrabold text-emerald-300 border border-emerald-500/40">
                            100% FREE MODEL
                          </span>
                        )}
                        {isPaidOnly && (
                          <span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-[9px] font-extrabold text-amber-300 border border-amber-500/40">
                            PAID & OWNER UNLOCKED
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-slate-400">{model.provider}</td>
                      <td className="px-6 py-4">
                        <span className="rounded-md bg-indigo-500/10 px-2 py-1 font-mono text-[10px] text-indigo-300">
                          {model.speed}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-slate-300">{model.quality}</td>
                      <td className="px-6 py-4 font-black">
                        {isFree ? (
                          <span className="text-emerald-400">0 Credits (Free)</span>
                        ) : model.credits === "Low" ? (
                          <span className="text-cyan-300">1 Credit</span>
                        ) : model.credits === "Medium" ? (
                          <span className="text-indigo-300">2 Credits</span>
                        ) : model.credits === "High" ? (
                          <span className="text-amber-300">4 Credits</span>
                        ) : (
                          <span className="text-purple-300">6 Credits</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        {/* FAQ Section */}
        <section className="max-w-3xl mx-auto">
          <h2 className="text-2xl font-extrabold text-white text-center mb-8">Frequently Asked Questions</h2>
          <div className="space-y-4">
            <FaqItem
              question="How do monthly free credits work?"
              answer="Every BloxSmith user receives 50 free AI credits automatically refreshed every month. Your balance auto-resets so you can generate Luau scripts and builds continuously."
            />
            <FaqItem
              question="Can I use BloxSmith for free without consuming credits?"
              answer="Yes! We offer 1 completely free model (Meta Llama 3.1 8B) which costs 0 credits per generation. You can use it indefinitely even if your monthly credit balance runs out!"
            />
            <FaqItem
              question="Which models require a top-up or Owner status?"
              answer="Our frontier model family — GPT-5.6 Sol (Frontier 372K context, $5/$30 MTok), GPT-5.6 Terra (Balanced 372K context, $2.50/$15 MTok), GPT-5.6 Luna (Fast 372K context), and Claude Fable 5 (Reasoning 372K context) — are exclusive models unlocked after your first credit top-up! Platform Owners get instant unlimited access to all of them."
            />
            <FaqItem
              question="Why do I need to join Discord before topping up?"
              answer="Joining our Discord server ensures our support staff can immediately cross-reference your PayPal transaction ID with your BloxSmith account to guarantee instant, verified credit delivery."
            />
            <FaqItem
              question="Do purchased top-up credits expire?"
              answer="No! Top-up credits purchased via PayPal remain on your account permanently until used."
            />
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-white/10 bg-[#03030d] py-8 text-center text-xs text-slate-500">
        <div className="mx-auto max-w-6xl px-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p>© 2026 BloxSmith Studio. All rights reserved.</p>
          <div className="flex gap-4">
            <a href="https://paypal.me/kinloch930" target="_blank" rel="noreferrer" className="hover:text-slate-300">PayPal Direct</a>
            <a href="https://discord.gg/YJ8xPFNSSX" target="_blank" rel="noreferrer" className="hover:text-slate-300">Discord Support</a>
            <Link to="/docs" className="hover:text-slate-300">Documentation</Link>
          </div>
        </div>
      </footer>

      {/* Top Up Modal Trigger */}
      <PayPalTopUpModal
        isOpen={showTopUpModal}
        onClose={() => setShowTopUpModal(false)}
        currentCredits={credits}
      />
    </div>
  );
}

function FaqItem({ question, answer }: { question: string; answer: string }) {
  return (
    <div className="rounded-2xl border border-indigo-500/20 bg-[#090920]/80 p-5 backdrop-blur-xl">
      <h3 className="text-sm font-extrabold text-white flex items-center gap-2">
        <HelpCircle className="h-4 w-4 text-cyan-300" />
        {question}
      </h3>
      <p className="mt-2 text-xs text-slate-300 leading-relaxed pl-6">{answer}</p>
    </div>
  );
}
