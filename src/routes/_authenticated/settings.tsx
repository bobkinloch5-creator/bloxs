import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  getMyProfile,
  updateMyProfile,
  deleteMyAccount,
  changeMyUsername,
  checkUsernameAvailable,
  setMyAvatar,
  clearMyAvatar,
  changeMyPassword,
  sendMyPasswordResetEmail,
} from "@/lib/profile.functions";
import { supabase } from "@/integrations/supabase/client";
import { useEffect, useRef, useState, type ReactNode } from "react";

import {
  AtSign,
  BadgeCheck,
  Bot,
  Boxes,
  Camera,
  CheckCircle2,
  Globe2,
  KeyRound,
  Loader2,
  LockKeyhole,
  Mail,
  Save,
  ShieldCheck,
  Trash2,
  Upload,
  UserRound,
  Users,
  Wand2,
  X as XIcon,
} from "lucide-react";

import { LANGUAGES, useLang, type LangCode } from "@/lib/i18n";


export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({
    meta: [
      { title: "Profile & Settings — BloxSmith" },
      { name: "description", content: "Update your BloxSmith profile, Roblox username, preferred language, AI asset mode, and account privacy in one place." },
      { property: "og:title", content: "Your BloxSmith Profile & Settings" },
      { property: "og:description", content: "Manage your BloxSmith account, language, Roblox identity, and AI asset preferences." },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
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
    asset_mode: "toolbox_only" as "toolbox_only" | "both" | "procedural",
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
        asset_mode: (mode === "both" || mode === "procedural" ? mode : "toolbox_only"),
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

  // ===== Username =====
  const changeUsernameFn = useServerFn(changeMyUsername);
  const checkUsernameFn = useServerFn(checkUsernameAvailable);
  const [usernameDraft, setUsernameDraft] = useState("");
  const [usernameStatus, setUsernameStatus] = useState<"idle" | "checking" | "ok" | "taken" | "format">("idle");
  const [usernameMsg, setUsernameMsg] = useState<string | null>(null);
  useEffect(() => { if (profile) setUsernameDraft((profile as any).username ?? ""); }, [profile]);
  useEffect(() => {
    const currentUsername = ((profile as any)?.username ?? "").toString();
    const normalized = usernameDraft.trim().toLowerCase();
    if (!normalized || normalized === currentUsername) { setUsernameStatus("idle"); return; }
    if (!/^[a-z0-9_]{3,24}$/.test(normalized)) { setUsernameStatus("format"); return; }
    setUsernameStatus("checking");
    const t = setTimeout(async () => {
      try {
        const res = await checkUsernameFn({ data: { username: normalized } });
        setUsernameStatus(res.available ? "ok" : "taken");
      } catch { setUsernameStatus("idle"); }
    }, 350);
    return () => clearTimeout(t);
  }, [usernameDraft, profile, checkUsernameFn]);
  const changeUsername = useMutation({
    mutationFn: () => changeUsernameFn({ data: { username: usernameDraft.trim().toLowerCase() } }),
    onSuccess: () => { setUsernameMsg("Username updated."); qc.invalidateQueries({ queryKey: ["profile"] }); },
    onError: (e: any) => setUsernameMsg(e?.message ?? "Failed to change username."),
  });
  const usernameChangedAt = (profile as any)?.username_changed_at ? new Date((profile as any).username_changed_at).getTime() : null;
  const cooldownMs = usernameChangedAt ? (usernameChangedAt + 14 * 86400_000) - Date.now() : 0;
  const cooldownDays = Math.max(0, Math.ceil(cooldownMs / 86400_000));

  // ===== Avatar =====
  const setAvatarFn = useServerFn(setMyAvatar);
  const clearAvatarFn = useServerFn(clearMyAvatar);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [avatarMsg, setAvatarMsg] = useState<string | null>(null);
  async function handleAvatarPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!/^image\//.test(file.type)) { setAvatarMsg("Please pick an image."); return; }
    setAvatarBusy(true); setAvatarMsg(null);
    try {
      const jpegBlob = await resizeImageToJpeg(file, 512, 0.85);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not signed in");
      const path = `${user.id}/avatar-${Date.now()}.jpg`;
      const { error: upErr } = await supabase.storage.from("avatars").upload(path, jpegBlob, {
        cacheControl: "31536000", upsert: true, contentType: "image/jpeg",
      });
      if (upErr) throw upErr;
      const { data: signed, error: sErr } = await supabase.storage.from("avatars").createSignedUrl(path, 60 * 60 * 24 * 365);
      if (sErr || !signed?.signedUrl) throw sErr ?? new Error("Failed to sign avatar URL");
      await setAvatarFn({ data: { url: signed.signedUrl, storage_path: path } });
      qc.invalidateQueries({ queryKey: ["profile"] });
      setAvatarMsg("Avatar updated.");
    } catch (err: any) { setAvatarMsg(err?.message ?? "Failed to upload avatar."); }
    finally { setAvatarBusy(false); }
  }
  const clearAvatar = useMutation({
    mutationFn: () => clearAvatarFn(),
    onSuccess: () => { setAvatarMsg("Avatar removed."); qc.invalidateQueries({ queryKey: ["profile"] }); },
    onError: (e: any) => setAvatarMsg(e?.message ?? "Failed to remove avatar."),
  });

  // ===== Password =====
  const changePwFn = useServerFn(changeMyPassword);
  const resetPwFn = useServerFn(sendMyPasswordResetEmail);
  const [pwForm, setPwForm] = useState({ current: "", next: "", confirm: "" });
  const [pwMsg, setPwMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const changePw = useMutation({
    mutationFn: () => {
      if (pwForm.next !== pwForm.confirm) return Promise.reject(new Error("New passwords do not match."));
      if (pwForm.next.length < 8) return Promise.reject(new Error("New password must be at least 8 characters."));
      return changePwFn({ data: { current_password: pwForm.current, new_password: pwForm.next } });
    },
    onSuccess: () => { setPwMsg({ ok: true, text: "Password updated." }); setPwForm({ current: "", next: "", confirm: "" }); },
    onError: (e: any) => setPwMsg({ ok: false, text: e?.message ?? "Failed to change password." }),
  });
  const sendReset = useMutation({
    mutationFn: () => resetPwFn({ data: { redirect_to: `${window.location.origin}/auth` } }),
    onSuccess: (r: any) => setPwMsg({ ok: true, text: `Password reset email sent to ${r?.email ?? "your inbox"}.` }),
    onError: (e: any) => setPwMsg({ ok: false, text: e?.message ?? "Failed to send reset email." }),
  });



  const deleteFn = useServerFn(deleteMyAccount);
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const deleteAcct = useMutation({
    mutationFn: () => deleteFn({ data: { confirm: "DELETE" as const } }),
    onSuccess: async () => {
      try { await supabase.auth.signOut(); } catch {}
      window.location.href = "/";
    },
    onError: (e: any) => setDeleteError(e?.message ?? "Failed to delete account."),
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

          {/* ===== Account (username, avatar, password) ===== */}
          <section className="rounded-3xl border border-white/10 bg-white/[0.045] p-5 shadow-2xl shadow-black/20 backdrop-blur sm:p-6">
            <SectionTitle icon={<AtSign className="h-4 w-4" />} title="Account" description="Change your username, upload a profile avatar, and update your password." />

            {/* Avatar */}
            <div className="mt-5 flex flex-col gap-4 rounded-2xl border border-white/10 bg-black/20 p-4 sm:flex-row sm:items-center">
              <div className="grid h-20 w-20 shrink-0 place-items-center overflow-hidden rounded-2xl border border-white/15 bg-violet-500 text-3xl font-black text-white shadow-xl">
                {profileAny.avatar_url ? <img src={profileAny.avatar_url} alt="" className="h-full w-full object-cover" /> : initial}
              </div>
              <div className="flex-1">
                <div className="text-sm font-bold text-white inline-flex items-center gap-2"><Camera className="h-4 w-4" /> Profile avatar</div>
                <p className="mt-1 text-xs text-muted-foreground">Upload a square image up to 5&nbsp;MB. We auto-resize to 512×512 JPEG for fast loading.</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarPick} />
                  <button onClick={() => fileInputRef.current?.click()} disabled={avatarBusy}
                    className="inline-flex items-center gap-2 rounded-xl bg-violet-500/90 px-4 py-2 text-sm font-bold text-white transition hover:bg-violet-500 disabled:opacity-50">
                    {avatarBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />} Upload new
                  </button>
                  {profileAny.avatar_url && (
                    <button onClick={() => clearAvatar.mutate()} disabled={clearAvatar.isPending}
                      className="inline-flex items-center gap-2 rounded-xl border border-white/15 bg-white/[0.04] px-4 py-2 text-sm font-bold text-white transition hover:bg-white/[0.08] disabled:opacity-50">
                      {clearAvatar.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <XIcon className="h-4 w-4" />} Remove
                    </button>
                  )}
                </div>
                {avatarMsg && <p className="mt-2 text-xs text-slate-300">{avatarMsg}</p>}
              </div>
            </div>

            {/* Username */}
            <div className="mt-4 rounded-2xl border border-white/10 bg-black/20 p-4">
              <div className="text-sm font-bold text-white inline-flex items-center gap-2"><AtSign className="h-4 w-4" /> Username</div>
              <p className="mt-1 text-xs text-muted-foreground">3–24 characters, lowercase letters, numbers, or underscores. Can be changed once every 14 days.</p>
              <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
                <div className="relative flex-1">
                  <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">@</span>
                  <input
                    value={usernameDraft}
                    onChange={(e) => { setUsernameDraft(e.target.value); setUsernameMsg(null); }}
                    className="profile-input pl-7"
                    placeholder="your_handle"
                    maxLength={24}
                    autoCapitalize="none"
                    spellCheck={false}
                  />
                </div>
                <button
                  onClick={() => changeUsername.mutate()}
                  disabled={
                    changeUsername.isPending ||
                    usernameStatus !== "ok" ||
                    cooldownDays > 0 ||
                    usernameDraft.trim().toLowerCase() === (profileAny.username ?? "")
                  }
                  className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-bold text-primary-foreground transition hover:opacity-90 disabled:opacity-40"
                >
                  {changeUsername.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />} Change username
                </button>
              </div>
              <div className="mt-2 text-xs">
                {usernameStatus === "checking" && <span className="text-slate-400">Checking availability…</span>}
                {usernameStatus === "ok" && <span className="text-emerald-300">Available ✓</span>}
                {usernameStatus === "taken" && <span className="text-red-300">Already taken</span>}
                {usernameStatus === "format" && <span className="text-amber-300">Only a–z, 0–9, and _ (3–24 chars)</span>}
                {cooldownDays > 0 && <span className="ml-2 text-slate-400">· Next change in {cooldownDays} day{cooldownDays === 1 ? "" : "s"}</span>}
              </div>
              {usernameMsg && <p className="mt-2 text-xs text-slate-300">{usernameMsg}</p>}
            </div>

            {/* Password */}
            <div className="mt-4 rounded-2xl border border-white/10 bg-black/20 p-4">
              <div className="text-sm font-bold text-white inline-flex items-center gap-2"><KeyRound className="h-4 w-4" /> Password</div>
              <p className="mt-1 text-xs text-muted-foreground">Enter your current password, then a new password (min 8 characters). If you signed up with Google/Apple, use the reset email instead.</p>
              <div className="mt-3 grid gap-3 md:grid-cols-3">
                <input type="password" autoComplete="current-password" value={pwForm.current}
                  onChange={(e) => { setPwForm({ ...pwForm, current: e.target.value }); setPwMsg(null); }}
                  className="profile-input" placeholder="Current password" />
                <input type="password" autoComplete="new-password" value={pwForm.next}
                  onChange={(e) => { setPwForm({ ...pwForm, next: e.target.value }); setPwMsg(null); }}
                  className="profile-input" placeholder="New password" />
                <input type="password" autoComplete="new-password" value={pwForm.confirm}
                  onChange={(e) => { setPwForm({ ...pwForm, confirm: e.target.value }); setPwMsg(null); }}
                  className="profile-input" placeholder="Confirm new password" />
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  onClick={() => changePw.mutate()}
                  disabled={changePw.isPending || !pwForm.current || !pwForm.next || !pwForm.confirm}
                  className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-bold text-primary-foreground transition hover:opacity-90 disabled:opacity-40"
                >
                  {changePw.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />} Update password
                </button>
                <button
                  onClick={() => sendReset.mutate()}
                  disabled={sendReset.isPending}
                  className="inline-flex items-center gap-2 rounded-xl border border-white/15 bg-white/[0.04] px-4 py-2 text-sm font-bold text-white transition hover:bg-white/[0.08] disabled:opacity-50"
                >
                  {sendReset.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />} Send reset email
                </button>
              </div>
              {pwMsg && (
                <p className={`mt-2 text-xs ${pwMsg.ok ? "text-emerald-300" : "text-red-300"}`}>{pwMsg.text}</p>
              )}
            </div>
          </section>

          {/* ===== Collaboration pointer ===== */}
          <section className="rounded-3xl border border-cyan-300/20 bg-cyan-400/10 p-5 text-cyan-50">
            <div className="flex items-start gap-3">
              <Users className="mt-0.5 h-5 w-5 text-cyan-200" />
              <div className="flex-1">
                <div className="font-black">Build together in the same workspace</div>
                <p className="mt-1 text-sm text-cyan-100/85">Invite teammates by username, assign editor or viewer roles, chat in real time, and see every action in the shared activity feed — all per project.</p>
                <a href="/collaborators" className="mt-3 inline-flex items-center gap-2 rounded-xl bg-cyan-400/90 px-4 py-2 text-sm font-bold text-slate-900 transition hover:bg-cyan-300">
                  <Users className="h-4 w-4" /> Open collaboration hub
                </a>
              </div>
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
                  <option value="toolbox_only">Toolbox assets only — ask before fallback</option>
                  <option value="both">Toolbox assets + scripted systems</option>
                  <option value="procedural">Procedural build — AI generates everything from scratch (no Toolbox)</option>
                </select>
                <div className="mt-2 inline-flex items-center gap-1.5 text-xs text-muted-foreground"><Boxes className="h-3.5 w-3.5" /> Procedural mode makes the AI build maps, props, NPCs, and vehicles from primitives, terrain, and run_lua — great for one-of-a-kind worlds.</div>
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

          <section className="rounded-3xl border border-red-500/30 bg-red-500/[0.05] p-5 shadow-2xl shadow-red-950/20 backdrop-blur sm:p-6">
            <SectionTitle
              icon={<Trash2 className="h-4 w-4" />}
              title="Danger zone"
              description="Permanently delete your BloxSmith account. This removes your profile, projects, chat history, and all associated data. This action cannot be undone."
            />
            <div className="mt-5 space-y-3 rounded-2xl border border-red-500/30 bg-black/30 p-4">
              <label className="block">
                <span className="mb-2 block text-xs font-black uppercase tracking-wide text-red-200">Type DELETE to confirm</span>
                <input
                  type="text"
                  value={deleteConfirm}
                  onChange={(e) => { setDeleteConfirm(e.target.value); setDeleteError(null); }}
                  placeholder="DELETE"
                  className="w-full rounded-xl border border-red-500/30 bg-black/40 px-3 py-2 text-sm text-white placeholder:text-slate-500 outline-none focus:border-red-400"
                />
              </label>
              {deleteError && <p className="text-xs text-red-300">{deleteError}</p>}
              <button
                onClick={() => {
                  if (deleteConfirm !== "DELETE") { setDeleteError("Type DELETE to confirm."); return; }
                  if (!window.confirm("Permanently delete your account and all your data? This cannot be undone.")) return;
                  deleteAcct.mutate();
                }}
                disabled={deleteAcct.isPending || deleteConfirm !== "DELETE"}
                className="inline-flex items-center gap-2 rounded-2xl bg-red-500/90 px-5 py-2.5 text-sm font-black text-white transition hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {deleteAcct.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                Delete my account & data
              </button>
            </div>
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


async function resizeImageToJpeg(file: File, maxSize: number, quality: number): Promise<Blob> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = reject;
    r.readAsDataURL(file);
  });
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = reject;
    i.src = dataUrl;
  });
  const size = Math.min(maxSize, Math.max(img.width, img.height));
  const canvas = document.createElement("canvas");
  canvas.width = size; canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D not supported");
  // Cover-crop centered
  const scale = Math.max(size / img.width, size / img.height);
  const sw = img.width * scale;
  const sh = img.height * scale;
  ctx.fillStyle = "#0f172a";
  ctx.fillRect(0, 0, size, size);
  ctx.drawImage(img, (size - sw) / 2, (size - sh) / 2, sw, sh);
  return await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Encode failed"))), "image/jpeg", quality),
  );
}
