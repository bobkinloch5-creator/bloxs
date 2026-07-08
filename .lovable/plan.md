
## What already works today
- Collaboration in the same workspace on the same project: `/collaborators` route + `CollabPanel` component already invite by username, assign editor/viewer roles, accept/decline invites, real-time team chat, activity feed, and comments (all wired through Supabase Realtime channels).
- Profile: display name, bio, Roblox username, language, privacy, asset mode, delete account.
- Referral invites (fixed last turn).

## Real gaps to close in this task
1. **Change username** — currently blocked by the `prevent_profile_privilege_escalation` trigger. Allow the owner of a profile to change their own `username` (case-insensitive uniqueness, 3–24 chars, `a–z 0–9 _`), rate-limited to once every 14 days.
2. **Upload profile avatar** — no upload UI or storage bucket exists. Add a public `avatars` bucket, a compressed client-side image upload (≤2 MB, square-cropped), server fn to persist `avatar_url` on the profile, and a "Remove avatar" action.
3. **Change password** — no UI exists. Add a "Password" section in Settings that calls `supabase.auth.updateUser({ password })` with current-password re-auth for email accounts, plus a link to send a reset email for OAuth accounts.

## Implementation

### DB migration
- Update `prevent_profile_privilege_escalation` so the profile owner may change `username` when the new value passes: regex `^[a-z0-9_]{3,24}$`, no other row already owns it (case-insensitive), and last change ≥ 14 days ago. Add a `username_changed_at` column to enforce the cooldown.
- Create a public `avatars` storage bucket via `storage_create_bucket` with RLS policies: anyone can `SELECT`, authenticated users can `INSERT/UPDATE/DELETE` only under `avatars/<their-uid>/…`.

### Server functions (`src/lib/profile.functions.ts`)
- `changeMyUsername({ username })` — validates format + cooldown, updates `profiles.username` + `username_changed_at`, returns new profile.
- `setMyAvatar({ url })` — writes `avatar_url` (already granted). `clearMyAvatar()` clears it and best-effort removes the storage object.
- `changeMyPassword({ current, next })` — re-authenticates via `signInWithPassword` on a scoped server client to verify current, then updates via admin API (so failures surface clearly).

### UI (`src/routes/_authenticated/settings.tsx`)
- New **Account** section with:
  - Username field + "Change username" button, cooldown countdown, live availability check.
  - Avatar block: current avatar preview, "Upload new" button (file input, client-side resize to 512×512 JPEG < 200 KB via canvas), "Remove" button.
  - Password change: current password + new password + confirm; shows "Send reset email" fallback for Google/Apple accounts.
- Toasts + inline error messages, disabled states, `useMutation` for each.

### Changelog
- Add an entry describing the new Account section (username, avatar upload, password change) and the existing collaboration surface (so users discover it).

## Out of scope for this task
- Rebuilding the collaboration UI (it exists and works).
- Real-time presence indicators (chat + activity already refresh via Supabase channels).
- Workspace-level roles beyond the existing owner/editor/viewer per project.

## Approximate file touches
- 1 migration (trigger update + `username_changed_at` column).
- 1 storage bucket call + 1 migration for `storage.objects` policies.
- `src/lib/profile.functions.ts` — 3 new fns.
- `src/routes/_authenticated/settings.tsx` — 1 new section + avatar upload helper.
- `src/components/ChangelogNotifications.tsx` — 1 new entry.
