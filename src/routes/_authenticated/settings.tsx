import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getMyProfile, updateMyProfile } from "@/lib/profile.functions";
import { useEffect, useState } from "react";
import { Loader2, Save } from "lucide-react";
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
    <div className="mx-auto max-w-2xl px-6 py-10">
      <h1 className="font-display text-3xl font-bold">{t("settings.title")}</h1>
      <div className="glass mt-6 space-y-4 rounded-2xl p-6">
        <Field label={t("settings.displayName")}>
          <input value={form.display_name} onChange={(e) => setForm({ ...form, display_name: e.target.value })}
            className="w-full rounded-lg border border-border bg-input px-3 py-2 text-sm" />
        </Field>
        <Field label={t("settings.robloxUser")}>
          <input value={form.roblox_username} onChange={(e) => setForm({ ...form, roblox_username: e.target.value })}
            className="w-full rounded-lg border border-border bg-input px-3 py-2 text-sm" />
        </Field>
        <Field label={t("settings.bio")}>
          <textarea rows={3} value={form.bio} onChange={(e) => setForm({ ...form, bio: e.target.value })}
            className="w-full resize-none rounded-lg border border-border bg-input px-3 py-2 text-sm" />
        </Field>
        <Field label={t("common.language")}>
          <select
            value={form.language}
            onChange={(e) => {
              const next = e.target.value as LangCode;
              setForm({ ...form, language: next });
              setLang(next); // preview the language immediately
            }}
            className="w-full rounded-lg border border-border bg-input px-3 py-2 text-sm"
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
            className="w-full rounded-lg border border-border bg-input px-3 py-2 text-sm"
          >
            <option value="toolbox_only">Toolbox assets only — ask before fallback</option>
            <option value="both">Toolbox assets + scripted systems</option>
          </select>
          <div className="mt-1 text-xs text-muted-foreground">
            BloxSmith uses safe, free Roblox Creator Store assets for visual objects and asks before using any generated fallback.
          </div>
        </Field>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={form.is_private} onChange={(e) => setForm({ ...form, is_private: e.target.checked })} />
          {t("settings.private")}
        </label>
        <button onClick={() => save.mutate()} disabled={save.isPending}
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50">
          {save.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} {t("common.save")}
        </button>
        {save.isSuccess && <p className="text-xs text-success">{t("common.saved")}</p>}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className="mb-1 text-xs font-medium text-muted-foreground">{label}</div>
      {children}
    </label>
  );
}
