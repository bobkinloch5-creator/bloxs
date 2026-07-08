## Auto-Playtest v2

Turns the existing Playtest feature into a real verification loop that fires automatically after every build batch, captures deep runtime evidence (errors, warnings, spawn, UI, interactions, remotes, DataStore, perf, screenshots), then hands failures to the AI which patches and re-tests up to 4 times.

### Behavior

1. **Auto-trigger.** After Studio successfully applies a build batch (any `apply_actions` that materially changes scripts/instances/RemoteEvents/DataStore/spawns/UI), the plugin queues a Playtest run automatically. Cosmetic no-op batches skipped.
2. **Verification phases** (each returns pass/fail + evidence):
   - **Compile/load** — collect `ScriptContext.Error`, `LogService.MessageOut` warnings, `_G` load failures.
   - **Player spawn** — spawn a `Player` (Play Solo), assert `Character`, `HumanoidRootPart`, `Humanoid.Health > 0`, and `SpawnLocation` reachability.
   - **UI** — for every `ScreenGui` under `StarterGui`: assert it clones into `PlayerGui`, all `Frame`/`TextButton`/`ImageButton` render `Visible=true` with non-zero `AbsoluteSize`, no `nil` refs in scripts.
   - **Interactions** — auto-probe: fire every `ClickDetector.MouseClick`, every `ProximityPrompt.Triggered`, every `Tool.Activated`, every `TextButton.MouseButton1Click` once with a fake player context; log side effects and errors.
   - **Remotes** — for every `RemoteEvent`/`RemoteFunction`: fire once from both sides with dummy args, assert listener count > 0 and no error thrown; flag orphan remotes (no listener) as medium.
   - **DataStore/saves** — dry-run `GetAsync` + `SetAsync` on a scratch key using `DataStoreService` in Studio (Studio's built-in emulation), assert set→get round-trip.
   - **Loops/perf** — sample `Heartbeat` for 3s: flag > 200ms frame stalls, > 200MB memory delta, or scripts that never yield in 2s (via `debug.profilebegin`).
   - **Viewport screenshots** — capture 3 frames (start / mid / end) via `Camera → ViewportFrame → GetImage` (Studio API) and upload to Supabase storage.
3. **Report ingest.** Plugin POSTs findings + metrics + screenshot URLs to `/api/public/plugin/playtest/report` (already exists; extended schema).
4. **AI auto-fix loop.** When the report has any `critical` or `high` finding, the chat pipeline auto-runs the `Fix errors` polish action with the report attached as evidence (up to **4 retries**). After each retry, plugin re-runs Playtest. Loop stops on: all-green, hit 4 retries, or the same finding fingerprint appears twice in a row (stuck).
5. **UI.** The `AiPlaytestCard` on the workspace shows a live status pill (Running / Passed / Failed / Retrying 2/4), a phase-by-phase table, screenshot thumbnails, expandable finding details with the AI's fix diff, and a "Stop auto-fix" button.

### Files to change

Backend / DB
- **Migration** — extend `playtest_reports` with `run_id`, `attempt`, `parent_run_id`, `phase_results jsonb`, `screenshot_urls text[]`, `status text` (`running|passed|failed|stuck|stopped`), `duration_ms int`. Add storage bucket `playtest-screenshots` (public read). Grants + RLS aligned with existing playtest_reports policies.
- **`src/routes/api/public/plugin/playtest/report.ts`** — accept the new fields; auto-create `run_id` if missing; return `{ should_autofix: boolean, attempt: number }` so the plugin knows whether to wait.
- **New `src/routes/api/public/plugin/playtest/upload-screenshot.ts`** — signed direct upload endpoint (token-authenticated) that pipes to the `playtest-screenshots` bucket.
- **New `src/lib/playtest-autofix.functions.ts`** — server fn `queuePlaytestAutofix(runId)` that reads the last report, builds a targeted Fix prompt (findings + phase evidence + screenshot URLs), calls the existing chat pipeline in autonomous mode, and marks retry number.
- **Extend `src/lib/ai-playtest.functions.ts`** — add `getRunTimeline(runId)` returning attempts in order for the UI.

Plugin (`public/BloxSmithPlugin.lua`)
- Add `Playtest` module (~350 LOC): `runAll()` orchestrates phases, each phase is a pcall'd function returning `{ pass, findings[], evidence }`. Reuses existing `LogService` hooks.
- Screenshot helper: `Camera:GetRenderCFrame()` + `ViewportFrame`, saved via `HttpService` multipart POST to the new upload endpoint.
- Hook into `applyActionsBatch` completion: if `batchWasMaterial(actions)` then `Playtest.runAll({ auto = true, parent_run_id = last_run_id })`.
- Poll `/api/public/plugin/playtest/next-action?run_id=` for the autofix loop directive (`wait_for_ai`, `rerun`, `stop`).

Chat / AI
- **`src/routes/api/chat.ts`** — when message metadata contains `playtest_run_id`, prepend a `PLAYTEST FAILURE CONTEXT` block with the failing findings + phase evidence, and set the model to `Fix errors` mode with the run_id echoed back in the response so the loop can attribute the fix.
- **`src/lib/bloxsmith-prompt.ts`** — append a small `PLAYTEST AUTOFIX` rules block: "when given a playtest run context, output only the minimum diff that resolves the listed findings; no unrelated changes; never claim success without listing which finding IDs your fix targets."

UI
- **`src/components/AiPlaytestCard.tsx`** — new sections: live phase table, retry counter (`Attempt 2 / 4`), screenshot strip (3 thumbs), per-finding fix-diff expander, Stop button (calls `stopPlaytestLoop(runId)`).
- **`src/components/ChangelogNotifications.tsx`** — new changelog entry summarizing v2.

### Technical details

- **Material-change detection**: batch is material if it adds/edits any `Script`/`LocalScript`/`ModuleScript`, any `RemoteEvent`/`RemoteFunction`, any instance whose class is in `{"Tool","ClickDetector","ProximityPrompt","SpawnLocation","ScreenGui"}`, any `DataStoreService` call, or any change under `StarterPlayer|StarterGui|StarterPack|ServerScriptService|ReplicatedStorage`. Pure `Part` color/material tweaks are non-material.
- **Screenshot storage**: bucket `playtest-screenshots`, public read; keys `{user_id}/{run_id}/{attempt}-{phase}.png`. TTL cleanup handled by a `pg_cron` job scheduled for 7 days.
- **Loop guard**: `stuck` when two consecutive attempts have identical `finding_fingerprint` (sha1 of sorted `severity|category|title|path`). Retry cap = 4 (user-selected).
- **Concurrency**: plugin sets `plugin_sessions.playtest_status` to `busy` while a run is in-flight so other pipelines don't fire a second run.
- **Autofix chat call**: uses the same `qwen-2.5-coder-32b` (FALLBACK_MODEL_ID) that Polish/Fix already runs on; timeout 20s per attempt; abort + mark `stopped` on user click.
- **Auth**: every plugin POST validates `plugin_token` (already the pattern for `/api/public/plugin/*`). Storage upload uses a short-lived signed URL minted server-side to keep the service role key off the plugin.

### Out of scope

- Real playtest in a Roblox cloud runner (not possible from the plugin; runs are in-Studio Play Solo).
- Perfect viewport screenshots on machines with the Studio API disabled — falls back to "screenshot unavailable" note in the report.
- Editing external DataStores in production; only Studio's local emulation is exercised.
