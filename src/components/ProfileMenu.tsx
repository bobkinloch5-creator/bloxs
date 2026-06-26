import { Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getMyProfile } from "@/lib/profile.functions";
import { supabase } from "@/integrations/supabase/client";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent,
  DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator,
  DropdownMenuSub, DropdownMenuSubTrigger, DropdownMenuSubContent, DropdownMenuPortal,
} from "@/components/ui/dropdown-menu";
import {
  ChevronDown, Crown, Infinity as InfinityIcon, User, Settings, Folder,
  Zap, LogOut, Timer, ExternalLink, Languages, Check,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useLang, LANGUAGES } from "@/lib/i18n";

function useResetTimer(resetAt?: string | null) {
  const [label, setLabel] = useState("");
  useEffect(() => {
    if (!resetAt) return;
    const tick = () => {
      const ms = new Date(resetAt).getTime() - Date.now();
      if (ms <= 0) return setLabel("now");
      const h = Math.floor(ms / 3.6e6);
      const m = Math.floor((ms % 3.6e6) / 6e4);
      setLabel(h > 0 ? `${h}h ${m}m` : `${m}m`);
    };
    tick();
    const id = setInterval(tick, 30_000);
    return () => clearInterval(id);
  }, [resetAt]);
  return label;
}

export function ProfileMenu({ compact = false }: { compact?: boolean }) {
  const navigate = useNavigate();
  const profileFn = useServerFn(getMyProfile);
  const { data: profile } = useQuery({ queryKey: ["profile"], queryFn: () => profileFn() });

  const name = profile?.display_name || profile?.username || "Builder";
  const plan = (profile as any)?.plan || "Builder";
  const isAdmin = !!(profile as any)?.is_admin;
  const credits = (profile as any)?.credits ?? 0;
  const maxCredits = (profile as any)?.max_credits ?? 30;
  const reset = useResetTimer((profile as any)?.credits_reset_at);
  const pct = Math.min(100, Math.max(0, (credits / Math.max(1, maxCredits)) * 100));
  const initial = name.slice(0, 1).toUpperCase();
  const { lang, setLang, t } = useLang();
  const currentLang = LANGUAGES.find((l) => l.code === lang) ?? LANGUAGES[0];

  const signOut = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/auth" as any });
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="group flex items-center gap-2.5 rounded-2xl border border-indigo-500/15 bg-white/[0.03] px-2 py-1.5 transition hover:border-indigo-400/40 hover:bg-white/[0.06]"
        >
          <span className="relative grid h-8 w-8 shrink-0 place-items-center overflow-hidden rounded-xl text-[11px] font-bold text-white"
            style={{ background: "linear-gradient(135deg,#6366f1,#22d3ee)", fontFamily: "Space Mono, monospace" }}>
            {initial}
            <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-[#0a0a1a] bg-emerald-400" />
          </span>
          {!compact && (
            <span className="hidden min-w-0 text-left leading-tight sm:block">
              <span className="flex items-center gap-1 text-[12px] font-bold text-white">
                <span className="max-w-[110px] truncate">{name}</span>
                {isAdmin && <Crown className="h-3 w-3 text-amber-300" />}
              </span>
              <span className="block text-[10px] uppercase tracking-[0.18em] text-cyan-300/80" style={{ fontFamily: "Space Mono, monospace" }}>
                {isAdmin ? "Owner" : plan}
              </span>
            </span>
          )}
          <ChevronDown className="h-3.5 w-3.5 text-white/50 transition group-hover:text-white/80" />
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent
        align="end"
        sideOffset={10}
        className="w-72 rounded-2xl border-indigo-500/20 bg-[#0a0a1a]/95 p-2 text-white shadow-[0_24px_80px_-20px_rgba(99,102,241,0.45)] backdrop-blur-xl"
      >
        {/* Header */}
        <div className="flex items-center gap-3 rounded-xl bg-white/[0.03] p-3">
          <span className="grid h-11 w-11 place-items-center rounded-xl text-sm font-bold text-white"
            style={{ background: "linear-gradient(135deg,#6366f1,#22d3ee)", fontFamily: "Space Mono, monospace" }}>
            {initial}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1 text-sm font-bold">
              <span className="truncate">{name}</span>
              {isAdmin && <Crown className="h-3.5 w-3.5 shrink-0 text-amber-300" />}
            </div>
            <div className="truncate text-[10px] uppercase tracking-[0.2em] text-cyan-300/80" style={{ fontFamily: "Space Mono, monospace" }}>
              {isAdmin ? "Owner Plan" : `${plan} Plan`}
            </div>
          </div>
        </div>

        {/* Credits + timer */}
        <div className="mt-2 rounded-xl border border-indigo-500/15 bg-white/[0.02] p-3">
          <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-[0.2em] text-white/50" style={{ fontFamily: "Space Mono, monospace" }}>
            <span className="flex items-center gap-1.5"><Zap className="h-3 w-3 text-indigo-300" /> Credits</span>
            {!isAdmin && reset && <span className="flex items-center gap-1 text-cyan-300/80"><Timer className="h-3 w-3" /> {reset}</span>}
          </div>
          <div className="mt-1.5 flex items-baseline gap-1.5">
            {isAdmin ? (
              <span className="text-xl font-extrabold text-indigo-300"><InfinityIcon className="inline h-5 w-5" /></span>
            ) : (
              <>
                <span className="text-xl font-extrabold text-white" style={{ fontFamily: "Space Mono, monospace" }}>{credits}</span>
                <span className="text-[11px] text-white/50">/ {maxCredits}</span>
              </>
            )}
          </div>
          {!isAdmin && (
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/5">
              <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: "linear-gradient(90deg,#6366f1,#22d3ee)" }} />
            </div>
          )}
        </div>

        <DropdownMenuLabel className="mt-2 px-2 text-[10px] font-bold uppercase tracking-[0.22em] text-white/40" style={{ fontFamily: "Space Mono, monospace" }}>
          {t("profile.account")}
        </DropdownMenuLabel>
        <MenuLink to="/settings" icon={User} label={t("profile.viewProfile")} />
        <MenuLink to="/settings" icon={Settings} label={t("profile.accountSettings")} />
        <MenuLink to="/dashboard" icon={Folder} label={t("profile.myProjects")} />
        <MenuLink to="/settings" icon={Zap} label={t("profile.creditsPlan")} />

        <DropdownMenuSub>
          <DropdownMenuSubTrigger className="cursor-pointer rounded-lg px-2 py-2 text-xs font-medium text-white/70 focus:bg-white/5 focus:text-white">
            <Languages className="mr-2 h-3.5 w-3.5 text-indigo-300/80" />
            <span>{t("common.language")}</span>
            <span className="ml-auto text-[10px] uppercase tracking-[0.18em] text-white/40" style={{ fontFamily: "Space Mono, monospace" }}>
              {currentLang.code}
            </span>
          </DropdownMenuSubTrigger>
          <DropdownMenuPortal>
            <DropdownMenuSubContent className="max-h-72 w-56 overflow-y-auto rounded-2xl border-indigo-500/20 bg-[#0a0a1a]/95 p-1.5 text-white shadow-[0_24px_80px_-20px_rgba(99,102,241,0.45)] backdrop-blur-xl">
              {LANGUAGES.map((l) => (
                <DropdownMenuItem
                  key={l.code}
                  onSelect={(e) => { e.preventDefault(); setLang(l.code); }}
                  className="cursor-pointer rounded-lg px-2 py-2 text-xs font-medium text-white/70 focus:bg-white/5 focus:text-white"
                >
                  <span className="flex w-full items-center gap-2">
                    <span className="min-w-0 flex-1 truncate">
                      <span className="font-semibold text-white">{l.nativeLabel}</span>
                      <span className="ml-1.5 text-white/40">· {l.label}</span>
                    </span>
                    {l.code === lang && <Check className="h-3.5 w-3.5 text-emerald-300" />}
                  </span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuSubContent>
          </DropdownMenuPortal>
        </DropdownMenuSub>

        <DropdownMenuSeparator className="my-1.5 bg-white/5" />

        <DropdownMenuItem asChild className="cursor-pointer rounded-lg px-2 py-2 text-xs font-medium text-white/70 focus:bg-white/5 focus:text-white">
          <a href="https://discord.gg/6QDYT3RUkv" target="_blank" rel="noreferrer" className="flex items-center gap-2">
            <DiscordIcon className="h-3.5 w-3.5 text-indigo-300" /> Join our Discord
            <ExternalLink className="ml-auto h-3 w-3 text-white/30" />
          </a>
        </DropdownMenuItem>

        <DropdownMenuItem
          onSelect={(e) => { e.preventDefault(); signOut(); }}
          className="cursor-pointer rounded-lg px-2 py-2 text-xs font-medium text-rose-300 focus:bg-rose-500/10 focus:text-rose-200"
        >
          <LogOut className="h-3.5 w-3.5" /> {t("common.signOut")}
        </DropdownMenuItem>

      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function MenuLink({ to, icon: Icon, label }: { to: string; icon: any; label: string }) {
  return (
    <DropdownMenuItem asChild className="cursor-pointer rounded-lg px-2 py-2 text-xs font-medium text-white/70 focus:bg-white/5 focus:text-white">
      <Link to={to as any} className="flex items-center gap-2">
        <Icon className="h-3.5 w-3.5 text-indigo-300/80" /> {label}
      </Link>
    </DropdownMenuItem>
  );
}

export function DiscordIcon({ className = "" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M20.317 4.369A19.79 19.79 0 0 0 16.558 3a.07.07 0 0 0-.073.035c-.21.375-.444.864-.608 1.249a18.36 18.36 0 0 0-5.756 0 12.62 12.62 0 0 0-.617-1.25.07.07 0 0 0-.073-.034A19.74 19.74 0 0 0 5.677 4.37a.06.06 0 0 0-.03.024C2.9 8.045 2.14 11.62 2.51 15.149a.08.08 0 0 0 .031.054 19.9 19.9 0 0 0 5.993 3.03.07.07 0 0 0 .077-.027c.462-.63.873-1.295 1.226-1.994a.07.07 0 0 0-.038-.098 13.1 13.1 0 0 1-1.872-.892.07.07 0 0 1-.007-.117c.126-.094.252-.192.372-.291a.07.07 0 0 1 .073-.01c3.927 1.793 8.18 1.793 12.061 0a.07.07 0 0 1 .074.009c.12.099.246.198.373.292a.07.07 0 0 1-.006.117c-.598.349-1.22.645-1.873.891a.07.07 0 0 0-.038.099c.36.699.772 1.364 1.225 1.993a.07.07 0 0 0 .078.028 19.84 19.84 0 0 0 6.002-3.03.08.08 0 0 0 .032-.053c.443-4.08-.741-7.625-3.135-10.756a.06.06 0 0 0-.03-.024ZM8.02 13.001c-1.182 0-2.156-1.085-2.156-2.418 0-1.334.955-2.419 2.156-2.419 1.21 0 2.175 1.094 2.156 2.419 0 1.333-.955 2.418-2.156 2.418Zm7.974 0c-1.183 0-2.157-1.085-2.157-2.418 0-1.334.955-2.419 2.157-2.419 1.21 0 2.175 1.094 2.156 2.419 0 1.333-.946 2.418-2.156 2.418Z"/>
    </svg>
  );
}
