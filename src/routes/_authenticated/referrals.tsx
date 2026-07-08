import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { getMyReferral, applyReferralCode } from "@/lib/referrals.functions";
import { friendlyError } from "@/lib/friendly-error";
import {
  Copy, Users, Gift, Share2, ArrowLeft, Twitter, MessageCircle,
  CheckCircle2, TrendingUp, Sparkles, Link as LinkIcon,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/referrals")({
  head: () => ({ meta: [{ title: "Invite friends — BloxSmith" }] }),
  component: ReferralsPage,
});

function timeAgo(d: string): string {
  const t = new Date(d).getTime();
  const diff = Math.max(0, Date.now() - t);
  const m = Math.floor(diff / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const days = Math.floor(h / 24);
  return `${days}d ago`;
}

function ReferralsPage() {
  const getFn = useServerFn(getMyReferral);
  const applyFn = useServerFn(applyReferralCode);
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["my-referral"], queryFn: () => getFn() });
  const [input, setInput] = useState("");

  const applyMut = useMutation({
    mutationFn: (code: string) => applyFn({ data: { code } }),
    onSuccess: (r: any) => {
      const bonus = r?.bonus ?? 25;
      toast.success(`Referral applied — +${bonus} credits added to both accounts!`);
      qc.invalidateQueries({ queryKey: ["my-referral"] });
      qc.invalidateQueries({ queryKey: ["profile"] });
      setInput("");
    },
    onError: (e) => toast.error(friendlyError(e, { fallback: "Couldn't apply code." })),
  });


  const shareUrl = useMemo(() => {
    if (typeof window === "undefined" || !data?.code) return "";
    return `${window.location.origin}/auth?ref=${data.code}`;
  }, [data?.code]);

  const shareText = useMemo(
    () => `I'm using BloxSmith to build Roblox games with AI — you should try it. Use my invite:`,
    []
  );

  function copyLink() {
    if (!shareUrl) return;
    navigator.clipboard.writeText(shareUrl).then(() => toast.success("Invite link copied!"));
  }
  function copyCode() {
    if (!data?.code) return;
    navigator.clipboard.writeText(data.code).then(() => toast.success("Code copied!"));
  }
  function shareNative() {
    if (!shareUrl) return;
    if (typeof navigator !== "undefined" && (navigator as any).share) {
      (navigator as any).share({ title: "BloxSmith", text: shareText, url: shareUrl }).catch(() => {});
    } else {
      copyLink();
    }
  }
  const xUrl = shareUrl
    ? `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(shareUrl)}`
    : "";
  const whatsappUrl = shareUrl
    ? `https://wa.me/?text=${encodeURIComponent(`${shareText} ${shareUrl}`)}`
    : "";
  const discordText = shareUrl ? `${shareText} ${shareUrl}` : "";

  const count = data?.count ?? 0;
  const weekly = data?.weekly ?? 0;

  return (
    <div className="min-h-screen bg-[#0a0a1a] text-white">
      <div className="mx-auto max-w-4xl px-4 py-8 sm:py-10">
        <Link to="/dashboard" className="mb-6 inline-flex items-center gap-2 text-xs font-semibold text-slate-400 hover:text-white">
          <ArrowLeft className="h-3.5 w-3.5" /> Back to Dashboard
        </Link>

        <header className="mb-8">
          <div className="inline-flex items-center gap-2 rounded-full border border-indigo-400/30 bg-indigo-500/10 px-3 py-1 text-[11px] font-bold uppercase tracking-widest text-indigo-200">
            <Sparkles className="h-3 w-3" /> Free forever
          </div>
          <h1 className="mt-3 text-3xl font-black tracking-tight sm:text-4xl">Invite friends to BloxSmith</h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-300">
            Share your code with anyone who builds Roblox games. When they sign up with it, you both get shouted out on your profiles and leaderboard.
          </p>
        </header>

        {/* Stats strip */}
        <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
          <StatCard icon={<Users className="h-4 w-4" />} label="Total invited" value={count.toString()} />
          <StatCard icon={<TrendingUp className="h-4 w-4" />} label="This week" value={weekly.toString()} tint="emerald" />
          <StatCard icon={<CheckCircle2 className="h-4 w-4" />} label="Your status" value={data?.applied ? "Referred" : "Original"} tint="fuchsia" />
        </div>

        {/* Code + share */}
        <section className="rounded-3xl border border-indigo-400/30 bg-gradient-to-br from-indigo-500/15 via-white/[0.02] to-fuchsia-500/10 p-5 sm:p-7">
          <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-widest text-indigo-100">
            <Gift className="h-3.5 w-3.5" /> Your invite code
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              onClick={copyCode}
              className="group inline-flex items-center gap-3 rounded-2xl border border-white/15 bg-black/40 px-4 py-3 font-mono text-2xl font-black tracking-[0.18em] text-white transition hover:border-indigo-400/60"
              title="Click to copy"
            >
              {data?.code ?? "loading…"}
              <Copy className="h-4 w-4 text-slate-400 group-hover:text-white" />
            </button>
          </div>

          <div className="mt-4 rounded-2xl border border-white/10 bg-black/40 p-3">
            <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-slate-400">
              <LinkIcon className="h-3 w-3" /> Personal invite link
            </div>
            <div className="mt-1.5 flex items-center gap-2">
              <div className="min-w-0 flex-1 truncate rounded-lg bg-black/40 px-3 py-2 font-mono text-xs text-slate-200">
                {shareUrl || "…"}
              </div>
              <button
                onClick={copyLink}
                className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-indigo-500 px-3 py-2 text-xs font-bold text-white hover:bg-indigo-400"
              >
                <Copy className="h-3.5 w-3.5" /> Copy
              </button>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <button
              onClick={shareNative}
              className="inline-flex items-center gap-1.5 rounded-xl bg-white text-black px-3.5 py-2 text-xs font-bold hover:bg-slate-100"
            >
              <Share2 className="h-3.5 w-3.5" /> Share…
            </button>
            <a
              href={xUrl || "#"}
              target="_blank"
              rel="noreferrer"
              onClick={(e) => { if (!xUrl) e.preventDefault(); }}
              className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.05] px-3.5 py-2 text-xs font-semibold text-slate-100 hover:bg-white/[0.1]"
            >
              <Twitter className="h-3.5 w-3.5" /> Post on X
            </a>
            <a
              href={whatsappUrl || "#"}
              target="_blank"
              rel="noreferrer"
              onClick={(e) => { if (!whatsappUrl) e.preventDefault(); }}
              className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-3.5 py-2 text-xs font-semibold text-emerald-200 hover:bg-emerald-500/20"
            >
              <MessageCircle className="h-3.5 w-3.5" /> WhatsApp
            </a>
            <button
              onClick={() => {
                if (!discordText) return;
                navigator.clipboard.writeText(discordText).then(() => toast.success("Discord message copied — paste it in your server!"));
              }}
              className="inline-flex items-center gap-1.5 rounded-xl border border-indigo-400/30 bg-indigo-500/10 px-3.5 py-2 text-xs font-semibold text-indigo-200 hover:bg-indigo-500/20"
            >
              <MessageCircle className="h-3.5 w-3.5" /> Copy for Discord
            </button>
          </div>
        </section>

        {/* Apply a code */}
        {!data?.applied && (
          <section className="mt-6 rounded-2xl border border-white/15 bg-white/[0.04] p-5">
            <h2 className="text-sm font-black uppercase tracking-widest text-slate-200">Got a code from a friend?</h2>
            <p className="mt-1 text-xs text-slate-400">You can only apply one code, and only once.</p>
            <div className="mt-3 flex gap-2">
              <input
                value={input}
                onChange={(e) => setInput(e.target.value.toUpperCase())}
                placeholder="BS12345678"
                className="flex-1 rounded-lg border border-white/15 bg-black/40 px-3 py-2 font-mono text-sm text-white outline-none focus:border-indigo-400/60"
              />
              <button
                onClick={() => applyMut.mutate(input.trim())}
                disabled={!input.trim() || applyMut.isPending}
                className="rounded-lg bg-indigo-500 px-4 py-2 text-xs font-bold text-white hover:bg-indigo-400 disabled:opacity-60"
              >
                {applyMut.isPending ? "Applying…" : "Apply"}
              </button>
            </div>
          </section>
        )}

        {/* Friends joined */}
        <section className="mt-6">
          <h2 className="text-sm font-black uppercase tracking-widest text-slate-200">Friends who joined ({count})</h2>
          <div className="mt-3 rounded-2xl border border-white/10 bg-white/[0.03] p-2">
            {(data?.recent?.length ?? 0) === 0 ? (
              <div className="p-6 text-center text-sm text-slate-400">
                No one yet. Share your code — the more builders, the better the community.
              </div>
            ) : (
              <ul className="divide-y divide-white/5">
                {data!.recent.map((r) => (
                  <li key={r.user_id} className="flex items-center gap-3 p-3">
                    {r.avatar_url ? (
                      <img src={r.avatar_url} alt="" className="h-9 w-9 rounded-full object-cover" />
                    ) : (
                      <span className="grid h-9 w-9 place-items-center rounded-full bg-indigo-500/30 text-xs font-bold text-indigo-100">
                        {(r.display_name || r.username || "?").slice(0, 1).toUpperCase()}
                      </span>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-semibold text-slate-100">
                        {r.display_name || r.username || "New builder"}
                      </div>
                      <div className="truncate text-[11px] text-slate-500">
                        {r.username ? `@${r.username} · ` : ""}Joined {timeAgo(r.created_at)}
                      </div>
                    </div>
                    {r.username && (
                      <Link
                        to="/u/$username"
                        params={{ username: r.username }}
                        className="rounded-lg border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs font-semibold text-slate-200 hover:bg-white/[0.08]"
                      >
                        View
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        <p className="mt-8 text-center text-xs text-slate-500">
          Each friend that redeems your code gives <span className="font-bold text-emerald-300">+25 credits to both of you</span> — no purchases required.
        </p>

      </div>
    </div>
  );
}

function StatCard({ icon, label, value, tint = "indigo" }: { icon: React.ReactNode; label: string; value: string; tint?: "indigo" | "emerald" | "fuchsia" }) {
  const tints = {
    indigo: "border-indigo-400/30 bg-indigo-500/10 text-indigo-200",
    emerald: "border-emerald-400/30 bg-emerald-500/10 text-emerald-200",
    fuchsia: "border-fuchsia-400/30 bg-fuchsia-500/10 text-fuchsia-200",
  }[tint];
  return (
    <div className={`rounded-2xl border ${tints} p-4`}>
      <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest opacity-80">
        {icon} {label}
      </div>
      <div className="mt-2 text-2xl font-black text-white">{value}</div>
    </div>
  );
}
