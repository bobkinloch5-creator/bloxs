import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Trophy, Crown, Home as HomeIcon, Users, Sparkles } from "lucide-react";

type Leader = {
  rank: number;
  user_id: string;
  username: string | null;
  display_name: string;
  avatar_url: string | null;
  referrals: number;
};

async function fetchLeaders(): Promise<{ leaders: Leader[] }> {
  const res = await fetch("/api/public/leaderboard");
  if (!res.ok) throw new Error("leaderboard_unavailable");
  return res.json();
}

export const Route = createFileRoute("/leaderboard")({
  head: () => ({
    meta: [
      { title: "Referral Leaderboard — BloxSmith" },
      { name: "description", content: "Top BloxSmith builders by referrals. Invite friends, climb the board, help the community grow." },
      { property: "og:title", content: "Referral Leaderboard — BloxSmith" },
      { property: "og:description", content: "Top BloxSmith builders by referrals. Invite friends, climb the board." },
    ],
  }),
  component: LeaderboardPage,
});

const RANK_TINT: Record<number, string> = {
  1: "from-amber-400/40 to-yellow-500/30 border-amber-300/40 text-amber-100",
  2: "from-slate-300/30 to-slate-400/20 border-slate-300/30 text-slate-100",
  3: "from-orange-400/30 to-amber-600/20 border-orange-400/30 text-orange-100",
};

function LeaderboardPage() {
  const { data, isLoading } = useQuery({ queryKey: ["leaderboard"], queryFn: fetchLeaders, refetchInterval: 60_000 });
  const leaders = data?.leaders ?? [];

  return (
    <div className="relative min-h-screen bg-slate-950 text-white">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_-10%,rgba(245,158,11,0.15),transparent_60%),radial-gradient(circle_at_10%_90%,rgba(99,102,241,0.12),transparent_60%)]" />
      <div className="relative mx-auto max-w-3xl px-5 py-14 sm:px-8 sm:py-20">
        <Link to="/" className="mb-8 inline-flex items-center gap-1.5 text-xs font-semibold text-slate-400 hover:text-white">
          <HomeIcon className="h-3.5 w-3.5" /> Back to BloxSmith
        </Link>

        <div className="mb-8 flex items-center gap-4">
          <span className="grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-amber-400 to-orange-500 text-white shadow-[0_16px_40px_-12px_rgba(245,158,11,0.8)]">
            <Trophy className="h-7 w-7" />
          </span>
          <div>
            <h1 className="text-3xl font-black tracking-tight text-white sm:text-4xl">Referral Leaderboard</h1>
            <p className="mt-1 text-sm text-slate-400">Top builders bringing friends into BloxSmith. Refresh every minute.</p>
          </div>
        </div>

        <div className="rounded-2xl border border-white/8 bg-white/[0.02]">
          {isLoading && (
            <div className="p-10 text-center text-sm text-slate-400">Loading top builders…</div>
          )}
          {!isLoading && leaders.length === 0 && (
            <div className="p-10 text-center">
              <Users className="mx-auto mb-3 h-8 w-8 text-slate-500" />
              <div className="text-sm font-semibold text-slate-200">No referrals yet</div>
              <div className="mt-1 text-xs text-slate-400">Be the first — share your referral link from Settings.</div>
              <Link to="/referrals" className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-indigo-500 px-4 py-2 text-xs font-bold text-white hover:bg-indigo-400">
                <Sparkles className="h-3.5 w-3.5" /> Get your link
              </Link>
            </div>
          )}
          {!isLoading && leaders.length > 0 && (
            <ul className="divide-y divide-white/5">
              {leaders.map((l) => {
                const tint = RANK_TINT[l.rank];
                return (
                  <li key={l.user_id} className="flex items-center gap-4 px-4 py-3 sm:px-5 sm:py-4">
                    <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl border text-sm font-black ${
                      tint ? `bg-gradient-to-br ${tint}` : "border-white/10 bg-white/[0.03] text-slate-300"
                    }`}>
                      {l.rank <= 3 ? <Crown className="h-4 w-4" /> : `#${l.rank}`}
                    </span>
                    {l.avatar_url ? (
                      <img src={l.avatar_url} alt="" className="h-9 w-9 shrink-0 rounded-full object-cover" />
                    ) : (
                      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-indigo-500/30 text-xs font-bold text-indigo-100">
                        {(l.display_name || "?").slice(0, 1).toUpperCase()}
                      </span>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-bold text-slate-100">{l.display_name}</div>
                      {l.username && (
                        <div className="truncate text-[11px] text-slate-500">@{l.username}</div>
                      )}
                    </div>
                    <div className="text-right">
                      <div className="text-lg font-black text-white sm:text-xl">{l.referrals}</div>
                      <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">referrals</div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="mt-6 rounded-2xl border border-indigo-400/25 bg-gradient-to-r from-indigo-500/10 to-fuchsia-500/10 p-5">
          <div className="text-sm font-bold text-white">Want to climb?</div>
          <p className="mt-1 text-xs text-slate-300">Grab your referral link and share it with your Roblox dev friends. Every signup counts.</p>
          <Link to="/referrals" className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-white/10 px-3.5 py-2 text-xs font-bold text-white hover:bg-white/15">
            <Sparkles className="h-3.5 w-3.5" /> Open referrals
          </Link>
        </div>
      </div>
    </div>
  );
}
