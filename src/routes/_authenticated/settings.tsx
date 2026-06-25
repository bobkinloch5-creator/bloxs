import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getMyProfile, updateMyProfile } from "@/lib/profile.functions";
import { useEffect, useState } from "react";
import { Loader2, Save } from "lucide-react";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({ meta: [{ title: "Settings — BloxSmith" }] }),
  component: SettingsPage,
});

const LANGS = [
  { id: "en", label: "English" },
  { id: "es", label: "Español" },
  { id: "pt", label: "Português" },
  { id: "fr", label: "Français" },
  { id: "de", label: "Deutsch" },
];

function SettingsPage() {
  const qc = useQueryClient();
  const profileFn = useServerFn(getMyProfile);
  const updateFn = useServerFn(updateMyProfile);
  const { data: profile } = useQuery({ queryKey: ["profile"], queryFn: () => profileFn() });

  const [form, setForm] = useState({
    display_name: "",
    bio: "",
    roblox_username: "",
    language: "en" as "en"|"es"|"pt"|"fr"|"de",
    is_private: false,
  });
  useEffect(() => {
    if (profile) setForm({
      display_name: profile.display_name ?? "",
      bio: profile.bio ?? "",
      roblox_username: profile.roblox_username ?? "",
      language: (profile.language ?? "en") as "en"|"es"|"pt"|"fr"|"de",
      is_private: !!profile.is_private,
    });
  }, [profile]);

  const save = useMutation({
    mutationFn: () => updateFn({ data: form }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["profile"] }),
  });

  return (
    <div className="mx-auto max-w-2xl px-6 py-10">
      <h1 className="font-display text-3xl font-bold">Settings</h1>
      <div className="glass mt-6 space-y-4 rounded-2xl p-6">
        <Field label="Display name">
          <input value={form.display_name} onChange={(e) => setForm({ ...form, display_name: e.target.value })}
            className="w-full rounded-lg border border-border bg-input px-3 py-2 text-sm" />
        </Field>
        <Field label="Roblox username">
          <input value={form.roblox_username} onChange={(e) => setForm({ ...form, roblox_username: e.target.value })}
            className="w-full rounded-lg border border-border bg-input px-3 py-2 text-sm" />
        </Field>
        <Field label="Bio">
          <textarea rows={3} value={form.bio} onChange={(e) => setForm({ ...form, bio: e.target.value })}
            className="w-full resize-none rounded-lg border border-border bg-input px-3 py-2 text-sm" />
        </Field>
        <Field label="Language">
          <select value={form.language}
            onChange={(e) => setForm({ ...form, language: e.target.value as typeof form.language })}
            className="w-full rounded-lg border border-border bg-input px-3 py-2 text-sm">
            {LANGS.map((l) => <option key={l.id} value={l.id}>{l.label}</option>)}
          </select>
        </Field>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={form.is_private} onChange={(e) => setForm({ ...form, is_private: e.target.checked })} />
          Private profile
        </label>
        <button onClick={() => save.mutate()} disabled={save.isPending}
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50">
          {save.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save
        </button>
        {save.isSuccess && <p className="text-xs text-success">Saved.</p>}
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
