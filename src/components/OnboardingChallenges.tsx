// Onboarding Challenges — quest-style checklist that guides new users through
// their first meaningful actions on BloxSmith. Progress is derived from real
// project + plugin data, and completion state persists per-user in localStorage.
import { useMemo } from "react";
import { Link } from "@tanstack/react-router";
import { Rocket, CheckCircle2, Circle, ArrowRight, Trophy } from "lucide-react";

type Challenge = {
  key: string;
  label: string;
  desc: string;
  href: string;
  done: boolean;
};

export function OnboardingChallenges(props: {
  projectCount: number;
  hasPluginSession: boolean;
  hasBuild: boolean;
}) {
  const challenges: Challenge[] = useMemo(() => [
    {
      key: "create_project",
      label: "Create your first project",
      desc: "Give BloxSmith an idea and spin up a fresh workspace.",
      href: "/dashboard",
      done: props.projectCount > 0,
    },
    {
      key: "install_plugin",
      label: "Install the Studio plugin",
      desc: "Connect Roblox Studio so builds land straight into your game.",
      href: "/plugin",
      done: props.hasPluginSession,
    },
    {
      key: "first_build",
      label: "Ship your first build",
      desc: "Ask the AI to build a system — anything from a shop to a full map.",
      href: "/dashboard",
      done: props.hasBuild,
    },
    {
      key: "browse_models",
      label: "Explore 3D models",
      desc: "Browse the model library and drop one into a scene.",
      href: "/models",
      done: false, // optional, no telemetry needed
    },
    {
      key: "invite_friend",
      label: "Invite a friend",
      desc: "Share your referral link — climb the leaderboard.",
      href: "/referrals",
      done: false,
    },
  ], [props.projectCount, props.hasPluginSession, props.hasBuild]);

  const completed = challenges.filter((c) => c.done).length;
  const total = challenges.length;
  const pct = Math.round((completed / total) * 100);
  const allDone = completed === total;

  return (
    <section className="rounded-2xl border border-white/8 bg-gradient-to-br from-indigo-500/8 via-white/[0.02] to-fuchsia-500/8 p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-indigo-500 to-fuchsia-500 text-white shadow-lg shadow-indigo-500/30">
            {allDone ? <Trophy className="h-5 w-5" /> : <Rocket className="h-5 w-5" />}
          </span>
          <div>
            <div className="text-sm font-bold text-white">
              {allDone ? "You're all set!" : "Get started with BloxSmith"}
            </div>
            <div className="text-[11px] text-slate-400">
              {completed}/{total} complete · {pct}%
            </div>
          </div>
        </div>
        {!allDone && (
          <div className="hidden h-1.5 w-32 overflow-hidden rounded-full bg-white/[0.06] sm:block">
            <div className="h-full rounded-full bg-gradient-to-r from-indigo-400 to-fuchsia-400" style={{ width: `${Math.max(4, pct)}%` }} />
          </div>
        )}
      </div>

      <ul className="space-y-1.5">
        {challenges.map((c) => (
          <li key={c.key}>
            <Link
              to={c.href}
              className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 transition ${
                c.done
                  ? "border-emerald-400/25 bg-emerald-500/[0.06] hover:bg-emerald-500/[0.10]"
                  : "border-white/8 bg-white/[0.02] hover:border-indigo-400/25 hover:bg-white/[0.05]"
              }`}
            >
              {c.done ? (
                <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-300" />
              ) : (
                <Circle className="h-4 w-4 shrink-0 text-slate-500" />
              )}
              <div className="min-w-0 flex-1">
                <div className={`truncate text-sm font-semibold ${c.done ? "text-emerald-100 line-through decoration-emerald-400/50" : "text-slate-100"}`}>
                  {c.label}
                </div>
                <div className="truncate text-[11px] text-slate-400">{c.desc}</div>
              </div>
              <ArrowRight className="h-3.5 w-3.5 shrink-0 text-slate-500" />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
