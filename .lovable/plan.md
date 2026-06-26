
## Root cause of the "everything goes to Owner Admin" bug

In `src/routes/_authenticated/dashboard.tsx`, the sidebar nav array literally points six items at `/admin`:

```
{ key: "chat",  to: "/admin" },  // AI Chat
{ key: "ideas", to: "/admin" },  // Game Ideas
{ key: "ui",    to: "/admin" },  // UI Generator
{ key: "co",    to: "/admin" },  // Collaborators
{ key: "mcp",   to: "/admin" },  // MCP / Tools
{ key: "hist",  to: "/admin" },  // History
```

There is no auto-redirect logic — every tab is hardcoded to `/admin`. Fix = point each link at its real route and create those routes.

Owner Admin link also needs to be gated behind `profile.is_admin` so normal users never see it.

---

## Plan (executed across multiple turns, in this order)

### Turn 1 — Routing bug + page shells (highest priority, fixes "nothing works")

1. **Create new authenticated route files**, each with a real header, description, content cards, empty states, and the shared Roblox background:
   - `_authenticated/chat.tsx` → AI Chat hub (model picker + recent threads + "Open in project" CTA, since chat is per-project)
   - `_authenticated/ideas.tsx` → Game Ideas board (cards from existing IDEAS list + "Start project")
   - `_authenticated/ui-generator.tsx` → UI Generator (prompt box + style picker + result grid, calls `generateText` server fn)
   - `_authenticated/collaborators.tsx` → Collaborators (per-project invite list, empty state explaining beta)
   - `_authenticated/mcp.tsx` → MCP / Tools (cards: Studio Plugin, Cursor, Codex, GitHub, Local Agent, Custom MCP w/ status)
   - `_authenticated/history.tsx` → History (lists rows from `build_history` table for the user)
   - `_authenticated/admin.models.tsx` → AI Models (owner-only, lists `MODELS` from `src/lib/models.ts` with real status)
   - `_authenticated/admin.model-test.tsx` → Model Test (owner-only, runs real test prompts)

2. **Update sidebar nav** in `dashboard.tsx` (and the in-project sidebar in `project.$projectId.tsx`) to point at the new routes. Gate `Owner Admin` link by `profile.is_admin`.

3. **Remove the "default redirect to /admin"** — confirm `_authenticated/route.tsx` and login flow only redirect to `/dashboard`, never `/admin` automatically. (Current `route.tsx` is clean; verify auth.tsx + index redirect target.)

### Turn 2 — Global Roblox-themed background + shared page chrome

1. Add a single `<RobloxBackdrop />` component in `src/components/RobloxBackdrop.tsx`: dark gradient + blue glow blobs + SVG grid + floating cube SVGs + soft vignette, theme-aware via CSS vars already in `styles.css`.
2. Add a `<PageShell title, description, actions, accent>` wrapper used by every new page so they all share header + breathing room + right-panel slot.
3. Mount `<RobloxBackdrop />` once in `_authenticated/route.tsx` as a fixed `-z-10` layer so it covers Projects, Settings, Plugin, Admin, all new pages. Also mount on the public landing/auth pages via `__root.tsx` (behind their existing content).
4. Per-page accent tint passed into `<RobloxBackdrop accent="chat|ideas|ui|admin|...">`.

### Turn 3 — AI Chat reliability + real error messages + fallback

Edit `src/routes/api/chat.ts`:
1. Replace the "Something went wrong" catch with structured JSON errors that surface the actual reason: missing `LOVABLE_API_KEY`, invalid model id, missing projectId, missing messages, 402 credits exhausted, 429 rate-limited, 5xx upstream. Each returns a clear `error.message` the UI can render.
2. Wrap the `streamText` call so a failed primary model auto-retries once with `FALLBACK_MODEL_ID` from `src/lib/models.ts`. Tag the assistant message with which model actually responded.
3. **Do not deduct credits on failure** — move the credit decrement to `persistFinish` only on successful completion (it currently can run before stream errors surface).
4. Update the chat client in `project.$projectId.tsx` to read the structured error and toast the real reason instead of a generic message.

### Turn 4 — Owner Admin dashboard expansion + Model Test runner

1. Expand `_authenticated/admin.tsx` into a real dashboard: total users, signups today, recent users table, recent projects table, plugin online count, AI model status grid, quick actions. All data from existing `getAdminOverview` server fn — extend it as needed.
2. `_authenticated/admin.model-test.tsx` calls a new owner-only `runModelTest` server fn that:
   - Iterates selected models (or all), sends a fixed Roblox-relevant prompt to each via `streamText` + `generateText`, captures response time + error + pass/fail.
   - Stores last-tested timestamp + status per model in a new `model_test_results` table (migration with proper GRANTs + RLS scoped to admins via `has_role`).
3. Page UI: "Test one", "Test all", "Retest failed", "Disable", "Set default", "Set fallback" buttons. Shows real status per model; models with `status="Failed"` are filtered out of the user-facing picker.

### Turn 5 — Polish + cleanup

1. Remove all "Coming Soon" badges from working pages.
2. Theme audit: confirm Default / Grey / Light themes all swap backgrounds, cards, sidebars, buttons, text (already wired in `styles.css` — verify on new pages).
3. Add `head()` per-route metadata (title + description) for every new page.
4. Verify build + nav by clicking through each tab in the preview.

---

## Technical notes

- New tables: `model_test_results (id, model_id, status, error_message, latency_ms, tested_at, tested_by)` with `GRANT SELECT, INSERT ON ... TO authenticated`, RLS allowing admins (`has_role(auth.uid(), 'admin')`) read + insert, plus service_role full.
- No new secrets needed — `LOVABLE_API_KEY` already provisioned.
- No new packages.
- All AI calls remain in TanStack server functions / `src/routes/api/chat.ts` — keys never leave the server.
- Files I will NOT touch: `src/integrations/supabase/*` autogen files, `src/routeTree.gen.ts`.

---

## Scope NOT in this plan (call out before approving)

- I won't redesign the **landing page**, **auth page**, **terms/privacy**, **support**, **docs** screens beyond adding the shared Roblox background. Full redesign of those is a separate large effort — say the word and I'll add a turn 6 for it.
- I won't build real Cursor / Codex / GitHub MCP integrations — the MCP page will show connection cards with accurate "not connected" status, not fake green checkmarks.
- The **UI Generator** in turn 1 generates structured UI JSON via the AI gateway but does not push to Studio yet (Studio plugin push is separate work).
