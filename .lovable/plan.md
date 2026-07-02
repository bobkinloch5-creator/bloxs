# Per-Project AI Workspace

## Where it lives

- Route: `/project/$projectId` (recreated). Dashboard, History, Collaborators, Models, Admin "Open" links point here again.
- Left rail: project switcher (Recent Projects) so switching a project fully swaps the workspace.

## Project Header (sticky)

- Thumbnail (click → change)
- Name (click → rename inline)
- Save status: `✅ Saved` / `● Unsaved` (based on `updated_at` vs local edits)
- Last saved: relative time
- Studio connection: 🟢 Connected / 🔴 Not Connected (from `plugin_sessions` for this user + this `projectId`)
- Current Build Mode chip (Fast / Smart / Deep) — click opens BuildModeSelector
- BloxSmith Agent Status: Ready / Working / Error (from latest `agent_runs` row for this project)

## Prompt bar (top, sticky under header)

- Textarea + Send. Every submit is scoped to `projectId`.
- Reuses existing chat plumbing; nothing on the dashboard prompt changes.

## Tabs

1. **Chat** — `chat_messages` + `project_chat_messages` for this project. Streaming reply, prompt history search.
2. **Builds** — `build_history` + `build_milestones` list, click a row → detail drawer (diff, files touched, model, mode).
3. **Activity** — merged feed from `project_activity`, `plugin_actions`, `agent_runs`, `execution_reports`, `model_generations`, `ui_generations`, filterable by kind.
4. **Files** — `project_assets` grouped by kind: Scripts / UI / Systems / Assets / Animations / Audio / Reports / Build Logs.
5. **Reports** — `project_qa_reports`, `execution_reports`, `playtest_reports`, `studio_errors`.
6. **Settings** — see Project Settings below.

## Project Context (fed to AI)

Server-side prompt builder pulls, per project:
- Last N chat turns
- Recent build summaries
- File index (names + kinds) from `project_assets`
- `project_memory` entries
- Recent errors from `studio_errors`

Existing `agent_runs` / model-router path stays; we just wire it to always include this context payload for the current `projectId`.

## Statistics

Computed on demand (server function, no new table):
- Total builds, scripts, UI generations, assets, model generations
- Total AI messages, tokens used, credits spent
- Studio pushes, autofixes, error count
- First created / last active

Rendered in a "View Statistics" drawer + the Settings tab summary card.

## ⋮ Project Menu

Single component reused in header, dashboard cards, history rows, collaborators list.

| Item | Behavior |
|---|---|
| 📂 Open | Navigate to `/project/$projectId` |
| ✏️ Rename | Inline modal → `projects.name` |
| 🖼 Change Thumbnail | Upload via `supabase.storage` bucket `project-thumbnails`, save URL to `projects.thumbnail_url` |
| ⭐ Favorite | Toggle `projects.is_favorite` |
| 📌 Pin | Toggle `projects.pinned_at` (nullable timestamp; sorted first on dashboard) |
| 📋 Duplicate | Server fn: copy row + assets + memory (not chat/history) |
| 📤 Export | Server fn returns JSON blob (project + assets + memory + build_history) → download |
| 📥 Import | File input → server fn creates new project from JSON |
| 🔄 Refresh | Invalidate all Query keys for this project |
| 📊 View Statistics | Opens Stats drawer |
| 📜 View Build History | Jump to Builds tab |
| 💬 View Chat History | Jump to Chat tab |
| 🔗 Copy Project Link | Copy `${origin}/project/${id}` to clipboard (works today; "future" sharing UI TBD) |
| 👥 Manage Collaborators | Opens existing collaborators panel scoped to this project |
| ⚙ Project Settings | Jump to Settings tab |
| 🗂 Archive | Set `projects.archived_at`; hide from default lists |
| 🗑 Delete | Confirm modal → delete |

## Project Settings tab

Editable fields:
- Name, Description, Thumbnail
- Visibility: Private / Public (`projects.is_public`)
- Build Mode default (`projects.default_build_mode`)
- AI Preferences: model preference, execution mode, language
- Plugin Connection: shows status + "Copy plugin token" (existing `regenerate_my_plugin_token` RPC)
- Roblox Experience Link (`projects.roblox_place_id`, `roblox_universe_id`) if user has Roblox connected

## Data model changes

New columns on `public.projects`:
- `thumbnail_url text`
- `is_favorite boolean default false`
- `pinned_at timestamptz`
- `archived_at timestamptz`
- `is_public boolean default false`
- `default_build_mode text default 'smart'` (check: fast/smart/deep)
- `default_execution_mode text default 'safe'`
- `default_model text`
- `default_language text`
- `roblox_place_id bigint`, `roblox_universe_id bigint`
- `description text` (if not present)

New storage bucket: `project-thumbnails` (public read, owner write via RLS).

No new tables — everything else reuses existing tables.

## Technical notes

- All reads via server functions with `requireSupabaseAuth` and `can_access_project` check.
- `projects` RLS already handles owner + collaborators; new columns inherit.
- Sidebar switcher preloads recent projects on hover (TanStack Router `preload="intent"`).
- Query keys namespaced `["project", projectId, ...]` so switching projects cleanly swaps caches.
- Reuses existing components: `BuildModeSelector`, `QaAndVisualsCard`, `AutoGeniusCard`, `AgentPipelineCard`.

## Out of scope (not built now)

- Real-time multiplayer cursors in the workspace
- Public shareable read-only project pages (link copy works; landing page later)
- Cross-project asset library
