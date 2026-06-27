import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getMyProfile, updateMyProfile } from "@/lib/profile.functions";
import { useEffect, useState, type ReactNode } from "react";
import {
  BadgeCheck,
  Bot,
  Boxes,
  CheckCircle2,
  Globe2,
  Loader2,
  LockKeyhole,
  Save,
  ShieldCheck,
  UserRound,
  Wand2,
} from "lucide-react";
import { LANGUAGES, useLang, type LangCode } from "@/lib/i18n";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({ meta: [{ title: "Profile & Settings - BloxSmith" }] }),
  component: SettingsPage,
});

function SettingsPage() {
  const qc = useQueryClient();
  const profileFn = useServerFn(getMyProfile);
  const updateFn = useServerFn(updateMyProfile);
  const { data: profile } = useQuery({ queryKey: ["profile"], queryFn: () => profileFn() });
  const { t, setLang } = useLang();

  const [form, setForm] = useState({
    display_name: "",
    bio: "",
    roblox_username: "",
    language: "en" as LangCode,
    is_private: false,
    asset_mode: "toolbox_only" as "toolbox_only" | "both",
  });

  useEffect(() => {
    if (profile) {
      const settings = ((profile as any).settings ?? {}) as Record<string, unknown>;
      const mode = settings.asset_mode;
      setForm({
        display_name: profile.display_name ?? "",
        bio: profile.bio ?? "",
        roblox_username: profile.roblox_username ?? "",
        language: ((profile as any).language ?? "en") as LangCode,
        is_private: !!profile.is_private,
        asset_mode: (mode === "both" ? mode : "toolbox_only"),
      });
    }
  }, [profile]);

  const save = useMutation({
    mutationFn: () => updateFn({ data: form }),
    onSuccess: () => {
      setLang(form.language);
      qc.invalidateQueries({ queryKey: ["profile"] });
    },
  });

  const displayName = form.display_name.trim() || (profile as any)?.username || "BloxSmith Creator";
  const initial = displayName.trim().slice(0, 1).toUpperCase() || "B";
  const profileAny = (profile ?? {}) as any;
  const plan = profileAny.plan ?? "Free";
  const isUnlimited = !!profileAny.is_admin || plan === "Owner" || plan === "Unlimited";
  const credits = Number(profileAny.credits ?? 0);
  const maxCredits = Number(profileAny.max_credits ?? 0);
  const creditPercent = isUnlimited || maxCredits <= 0 ? 100 : Math.max(0, Math.min(100, Math.round((credits / maxCredits) * 100)));
  const resetLabel = profileAny.credits_reset_at
    ? new Date(profileAny.credits_reset_at).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })
    : "Not scheduled";

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
      <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-violet-300/20 bg-violet-300/10 px-3 py-1 text-xs font-bold text-violet-100">
            <UserRound className="h-3.5 w-3.5" /> Creator profile
          </div>
          <h1 className="mt-3 font-display text-4xl font-black tracking-tight text-white">Profile & Settings</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
            Keep your Roblox identity, build preferences, safety mode, and language synced across every BloxSmith model.
          </p>
        </div>
        <button
          onClick={() => save.mutate()}
          disabled={save.isPending}
          className="inline-flex items-center justify-center gap-2 rounded-2xl bg-primary px-5 py-3 text-sm font-black text-primary-foreground shadow-lg shadow-violet-950/30 transition hover:opacity-90 disabled:opacity-50"
        >
          {save.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} {t("common.save")}
        </button>
      </div>

      <div className="grid gap-5 lg:grid-cols-[340px_1fr]">
        <aside className="space-y-4">
          <section className="overflow-hidden rounded-3xl border border-white/10 bg-white/[0.045] shadow-2xl shadow-black/20 backdrop-blur">
            <div className="h-24 bg-[radial-gradient(circle_at_20%_0%,rgba(99,102,241,.55),transparent_35%),radial-gradient(circle_at_80%_30%,rgba(34,211,238,.35),transparent_35%),linear-gradient(135deg,rgba(76,29,149,.8),rgba(2,6,23,.9))]" />
            <div className="-mt-10 px-5 pb-5">
              <div className="flex items-end justify-between gap-3">
                <div className="grid h-20 w-20 place-items-center overflow-hidden rounded-3xl border border-white/15 bg-violet-500 text-3xl font-black text-white shadow-xl">
                  {profileAny.avatar_url ? <img src={profileAny.avatar_url} alt="" className="h-full w-full object-cover" /> : initial}
                </div>
                <span className="mb-2 inline-flex items-center gap-1.5 rounded-full border border-emerald-300/25 bg-emerald-400/10 px-3 py-1 text-xs font-bold text-emerald-100">
                  <BadgeCheck className="h-3.5 w-3.5" /> {plan}
                </span>
              </div>
              <h2 className="mt-4 truncate text-2xl font-black text-white">{displayName}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{form.roblox_username ? `@${form.roblox_username}` : "Roblox username not connected yet"}</p>
              <p className="mt-4 min-h-12 text-sm leading-6 text-slate-300">
                {form.bio.trim() || "Add a short creator bio so collaborators know what you are building."}
              </p>
            </div>
          </section>

          <section className="rounded-3xl border border-white/10 bg-white/[0.04] p-5 backdrop-blur">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Credits</div>
                <div className="mt-1 text-2xl font-black text-white">{isUnlimited ? "Unlimited" : `${credits}/${maxCredits}`}</div>
              </div>
              <Bot className="h-9 w-9 text-violet-200" />
            </div>
            <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/10">
              <div className="h-full rounded-full bg-gradient-to-r from-violet-400 to-cyan-300" style={{ width: `${creditPercent}%` }} />
            </div>
            <div className="mt-2 text-xs text-muted-foreground">{isUnlimited ? "Owner mode is active." : `Next reset: ${resetLabel}`}</div>
          </section>

          <section className="rounded-3xl border border-emerald-300/20 bg-emerald-400/10 p-5 text-emerald-50">
            <div className="flex items-center gap-2 font-black"><ShieldCheck className="h-4 w-4" /> Toolbox Safety</div>
            <p className="mt-2 text-sm leading-6 text-emerald-100/75">
              Visual builds prefer safe, free Roblox Creator Store assets and ask before fallback geometry.
            </p>
          </section>
        </aside>

        <main className="space-y-5">
          <section className="rounded-3xl border border-white/10 bg-white/[0.045] p-5 shadow-2xl shadow-black/20 backdrop-blur sm:p-6">
            <SectionTitle icon={<UserRound className="h-4 w-4" />} title="Identity" description="How BloxSmith names you across projects and shared builds." />
            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <Field label={t("settings.displayName")}>
                <input value={form.display_name} onChange={(e) => setForm({ ...form, display_name: e.target.value })}
                  className="profile-input" placeholder="Your creator name" maxLength={60} />
              </Field>
              <Field label={t("settings.robloxUser")}>
                <input value={form.roblox_username} onChange={(e) => setForm({ ...form, roblox_username: e.target.value })}
                  className="profile-input" placeholder="Roblox username" maxLength={40} />
              </Field>
              <Field label={t("settings.bio")} wide>
                <textarea rows={4} value={form.bio} onChange={(e) => setForm({ ...form, bio: e.target.value })}
                  className="profile-input resize-none" placeholder="Short profile bio" maxLength={500} />
              </Field>
            </div>
          </section>

          <section className="rounded-3xl border border-white/10 bg-white/[0.045] p-5 shadow-2xl shadow-black/20 backdrop-blur sm:p-6">
            <SectionTitle icon={<Wand2 className="h-4 w-4" />} title="Roblox Builder Preferences" description="Default behavior for BloxSmith builds, assets, and language." />
            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <Field label={t("common.language")}>
                <select
                  value={form.language}
                  onChange={(e) => {
                    const next = e.target.value as LangCode;
                    setForm({ ...form, language: next });
                    setLang(next);
                  }}
                  className="profile-input"
                >
                  {LANGUAGES.map((l) => (
                    <option key={l.code} value={l.code}>
                      {l.nativeLabel} ({l.label})
                    </option>
                  ))}
                </select>
                <div className="mt-2 inline-flex items-center gap-1.5 text-xs text-muted-foreground"><Globe2 className="h-3.5 w-3.5" /> {t("settings.languageHelp")}</div>
              </Field>
              <Field label="Roblox asset mode">
                <select
                  value={form.asset_mode}
                  onChange={(e) => setForm({ ...form, asset_mode: e.target.value as typeof form.asset_mode })}
                  className="profile-input"
                >
                  <option value="toolbox_only">Toolbox assets only - ask before fallback</option>
                  <option value="both">Toolbox assets + scripted systems</option>
                </select>
                <div className="mt-2 inline-flex items-center gap-1.5 text-xs text-muted-foreground"><Boxes className="h-3.5 w-3.5" /> Applies to maps, props, NPCs, vehicles, tools, and decorations.</div>
              </Field>
            </div>
          </section>

          <section className="rounded-3xl border border-white/10 bg-white/[0.045] p-5 shadow-2xl shadow-black/20 backdrop-blur sm:p-6">
            <SectionTitle icon={<LockKeyhole className="h-4 w-4" />} title="Privacy" description="Control what other BloxSmith users can see about your creator profile." />
            <label className="mt-5 flex cursor-pointer items-center justify-between gap-4 rounded-2xl border border-white/10 bg-black/20 p-4 text-sm text-white transition hover:bg-white/[0.04]">
              <span>
                <span className="block font-bold">{t("settings.private")}</span>
                <span className="mt-1 block text-xs text-muted-foreground">Hide public profile details while keeping your projects and Studio connection private.</span>
              </span>
              <input className="h-5 w-5 accent-violet-500" type="checkbox" checked={form.is_private} onChange={(e) => setForm({ ...form, is_private: e.target.checked })} />
            </label>
          </section>

          <div className="sticky bottom-4 z-10 flex flex-wrap items-center justify-between gap-3 rounded-3xl border border-white/10 bg-slate-950/85 p-3 shadow-2xl shadow-black/40 backdrop-blur-xl">
            <div className="inline-flex items-center gap-2 text-sm text-slate-300">
              {save.isSuccess ? <CheckCircle2 className="h-4 w-4 text-emerald-300" /> : <ShieldCheck className="h-4 w-4 text-violet-200" />}
              {save.isSuccess ? t("common.saved") : "Changes stay local until you save."}
            </div>
            <button onClick={() => save.mutate()} disabled={save.isPending}
              className="inline-flex items-center gap-2 rounded-2xl bg-primary px-5 py-2.5 text-sm font-black text-primary-foreground transition hover:opacity-90 disabled:opacity-50">
              {save.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} {t("common.save")}
            </button>
          </div>
        </main>
      </div>
    </div>
  );
}

function SectionTitle({ icon, title, description }: { icon: ReactNode; title: string; description: string }) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs font-bold text-violet-100">
          {icon} {title}
        </div>
        <p className="mt-2 text-sm text-muted-foreground">{description}</p>
      </div>
    </div>
  );
}

function Field({ label, children, wide = false }: { label: string; children: ReactNode; wide?: boolean }) {
  return (
    <label className={wide ? "block md:col-span-2" : "block"}>
      <div className="mb-2 text-xs font-black uppercase tracking-wide text-muted-foreground">{label}</div>
      {children}
    </label>
  );
}
