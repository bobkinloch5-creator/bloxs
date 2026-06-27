import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getMyProfile, updateMyProfile } from "@/lib/profile.functions";
import { useEffect, useState } from "react";
import { Loader2, Save, ShieldCheck, UserRound } from "lucide-react";
import { LANGUAGES, useLang, type LangCode } from "@/lib/i18n";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({ meta: [{ title: "Settings — BloxSmith" }] }),
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

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-6 sm:py-10">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs font-bold text-violet-200">
            <UserRound className="h-3.5 w-3.5" /> Account
          </div>
          <h1 className="mt-3 font-display text-3xl font-bold text-white">{t("settings.title")}</h1>
          <p className="mt-1 max-w-xl text-sm text-muted-foreground">Keep your Roblox identity, language, privacy, and asset safety preferences cleanly synced across BloxSmith.</p>
        </div>
        <div className="rounded-2xl border border-emerald-300/20 bg-emerald-400/10 px-4 py-3 text-xs text-emerald-100">
          <div className="flex items-center gap-2 font-bold"><ShieldCheck className="h-4 w-4" /> Toolbox safety mode</div>
          <div className="mt-1 text-emerald-100/75">Visual builds prefer safe free Creator Store assets.</div>
        </div>
      </div>

      <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-4 shadow-2xl shadow-black/20 backdrop-blur sm:p-6">
        <div className="grid gap-4 md:grid-cols-2">
        <Field label={t("settings.displayName")}>
          <input value={form.display_name} onChange={(e) => setForm({ ...form, display_name: e.target.value })}
            className="w-full rounded-xl border border-white/10 bg-black/25 px-3 py-2.5 text-sm text-white outline-none transition focus:border-violet-300/60" placeholder="Your creator name" />
        </Field>
        <Field label={t("settings.robloxUser")}>
          <input value={form.roblox_username} onChange={(e) => setForm({ ...form, roblox_username: e.target.value })}
            className="w-full rounded-xl border border-white/10 bg-black/25 px-3 py-2.5 text-sm text-white outline-none transition focus:border-violet-300/60" placeholder="Roblox username" />
        </Field>
        <Field label={t("settings.bio")} wide>
          <textarea rows={3} value={form.bio} onChange={(e) => setForm({ ...form, bio: e.target.value })}
            className="w-full resize-none rounded-xl border border-white/10 bg-black/25 px-3 py-2.5 text-sm text-white outline-none transition focus:border-violet-300/60" placeholder="Short profile bio" />
        </Field>
        <Field label={t("common.language")}>
          <select
            value={form.language}
            onChange={(e) => {
              const next = e.target.value as LangCode;
              setForm({ ...form, language: next });
              setLang(next); // preview the language immediately
            }}
            className="w-full rounded-xl border border-white/10 bg-black/25 px-3 py-2.5 text-sm text-white outline-none transition focus:border-violet-300/60"
          >
            {LANGUAGES.map((l) => (
              <option key={l.code} value={l.code}>
                {l.nativeLabel} ({l.label})
              </option>
            ))}
          </select>
          <div className="mt-1 text-xs text-muted-foreground">{t("settings.languageHelp")}</div>
        </Field>
        <Field label="Roblox asset mode">
          <select
            value={form.asset_mode}
            onChange={(e) => setForm({ ...form, asset_mode: e.target.value as typeof form.asset_mode })}
            className="w-full rounded-xl border border-white/10 bg-black/25 px-3 py-2.5 text-sm text-white outline-none transition focus:border-violet-300/60"
          >
            <option value="toolbox_only">Toolbox assets only — ask before fallback</option>
            <option value="both">Toolbox assets + scripted systems</option>
          </select>
          <div className="mt-1 text-xs text-muted-foreground">
            BloxSmith uses safe, free Roblox Creator Store assets for visual objects and asks before using any generated fallback.
          </div>
        </Field>
        <label className="flex items-center gap-3 rounded-2xl border border-white/10 bg-black/20 p-3 text-sm text-white md:col-span-2">
          <input type="checkbox" checked={form.is_private} onChange={(e) => setForm({ ...form, is_private: e.target.checked })} />
          {t("settings.private")}
        </label>
        </div>
        <div className="mt-6 flex flex-wrap items-center gap-3 border-t border-white/10 pt-5">
        <button onClick={() => save.mutate()} disabled={save.isPending}
          className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground hover:opacity-90 disabled:opacity-50">
          {save.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} {t("common.save")}
        </button>
        {save.isSuccess && <p className="text-xs text-success">{t("common.saved")}</p>}
        </div>
      </div>
    </div>
  );
}

function Field({ label, children, wide = false }: { label: string; children: React.ReactNode; wide?: boolean }) {
  return (
    <label className={wide ? "block md:col-span-2" : "block"}>
      <div className="mb-1.5 text-xs font-bold uppercase tracking-wide text-muted-foreground">{label}</div>
      {children}
    </label>
  );
}
