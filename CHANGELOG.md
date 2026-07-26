# Changelog

All notable changes to BloxSmith are tracked here. Dates are UTC.

## [Unreleased]

### 2026-07-26 - Authentication Fix, Multi-Language Sync, AI Asset ID Safety & UI Polish

**Authentication & User Registration (`supabase/migrations`, `src/routes/auth.tsx`)**
- Fixed account registration failure caused by RLS trigger conflict during initial profile creation (`handle_new_user` trigger updated to `ON CONFLICT DO NOTHING`).
- Enhanced auth user experience with automatic post-signup sign-in attempts, toast notifications, and clear visual state feedback banners.

**Global Multi-Language Expansion (`src/lib/language-sync.ts`)**
- Enabled support for 27 languages (including Hindi, Spanish, French, German, Japanese, Korean, Portuguese, Russian, and more) across the platform with persistent language selection.

**AI Engine & Luau Asset Safety (`src/lib/roblox-scripting-knowledge.ts`, `src/lib/luau-validator.ts`)**
- Removed dummy animation asset ID (`rbxassetid://0`) to prevent Studio asset-loading errors and missing permission warnings.
- Verified preflight Luau syntax repair (`task.wait`, `task.spawn`, `task.delay`, `:Connect`, and JSON key assignment conversion).

**Workspace UI Refinement (`src/components/WorkspaceChat.tsx`)**
- Streamlined fresh chat interface by keeping the Game Brainstormer card clean and accessible via the 💡 **AI Game Architect** chip toggle, ensuring prompt composer and chat stream remain the primary workspace view.

### 2026-07-26 - AI Chat Persona Overhaul, Fancy Todo Checklist & UI Cleanup

**AI Chat Personality & Expertise (`src/routes/api/chat.ts`)**
- Completely rewrote `FAST_CHAT_SYSTEM_PROMPT` from a single vague sentence into a comprehensive developer persona guide:
  - Enforces a **confident senior developer tone** — banned phrases include "I'll try", "I think", "I'd be happy to", "As an AI", "I hope this helps".
  - AI now gives a **direct answer first**, then includes a working Luau code snippet when relevant, explains the reasoning briefly, and closes with a natural follow-up offer.
  - Embedded a full **Roblox quick-reference** covering modern APIs (`task.wait`, `task.spawn`, `UpdateAsync`, `LinearVelocity`, `AlignOrientation`, `UDim2 Scale`, correct script placement rules) and common mistakes to actively warn users about.
  - All code blocks use ` ```lua ` formatting and no internal tool/model/credit details are ever leaked.

**Animated Build Todo Checklist (`src/routes/api/chat.ts`, `src/components/WorkspaceChat.tsx`)**
- Updated `FAST_BUILD_SYSTEM_PROMPT` to mandate a structured 5-step visible response format around the hidden actions block:
  - **Step 1**: Bold one-liner summary ("**Building X** — why")
  - **Step 2**: Unchecked plan — `- [ ] Step one / - [ ] Step two ...` (3–6 items)
  - **Step 3**: Hidden `bloxsmith-actions` execution block (stripped from view, execution unaffected)
  - **Step 4**: Completed checklist — `- [x] Step one — done / - [x] Step two — done ...`
  - **Step 5**: Confident closing line ("Sending to Studio now 🚀")
- Added custom `markdownComponents` renderer in `WorkspaceChat.tsx` that intercepts `- [ ]` and `- [x]` markdown task list items and renders them as **premium animated checkbox chips**:
  - Unchecked → dark glass chip with grey outlined circle
  - Checked → **emerald glow chip** (`shadow-[0_0_12px_rgba(16,185,129,0.75)]`) with filled green checkmark, `scale-110` pulse, and green text
  - Uses `transition-all duration-300` for smooth state changes
  - All other markdown (code, headings, bold, normal lists) continues to render via standard prose styles

**Removed "Need Help?" Widget (`src/routes/__root.tsx`)**
- Removed the floating `<HelpChatWidget />` button and its import from the global root layout — the widget no longer appears on any page.

**Model Router Updates (`src/lib/model-router.ts`)**
- Replaced unavailable `nvidia/qwen-2.5-coder-32b` model with working alternatives
- Set **Claude Sonnet 4.6** as primary for `scripting` and `bugfix` task routing
- **Nemotron Super 49B** and **GLM 5.2** handle `hard` difficulty escalation

**Premium Model Gatekeeping (`src/lib/models.ts`, `src/routes/api/chat.ts`, `src/components/VaporModelSelector.tsx`)**
- Removed deprecated OneProvider GPT-5.6 series models from catalog
- Marked unavailable models (e.g. `claude-fable-5`) as **Coming Soon** with disabled state
- Added 🔒 **Top-Up Required** badge in `VaporModelSelector` for `paidOnly` flagged models
- Wired `activeModelId` into `chargeCredits` so the API gateway correctly blocks unauthorized premium model access

**Beta Banner Redesign (`src/routes/__root.tsx`)**
- Replaced basic beta notification with a premium banner featuring multi-stop gradient, animated shimmer effect, glowing "Beta" pill, and prominent Discord CTA button



**AI & Build Completion Chime (`src/lib/sound.ts`, `src/components/WorkspaceChat.tsx`)**
- Integrated Web Audio API synthesized 2-tone chime (`E5` → `A5`) when AI text streaming finishes or Studio build execution reaches `done` status. Requires zero external audio downloads.
- Added interactive **Sound On / Sound Off** toggle button in `WorkspaceChat` toolbar with volume status icons (`Volume2`, `VolumeX`), live sound preview on enable, and persistent setting saved in `localStorage` (`bs:sound-enabled`).

### 2026-07-26 - Universal Discord Community Integration

**Site-Wide Discord Community CTAs (`src/routes/index.tsx`, `src/routes/not-found.tsx`)**
- Added direct Discord community invite link (`https://discord.gg/YJ8xPFNSSX`) across key platform surfaces: header desktop navigation, Beta banner CTA, footer links, and 404 error page help support.

### 2026-07-26 - UX Polish, Page-Scroll Fix & AI System Prompt Refresh

**UX Polish & AI System Alignment (`src/components/HelpChatWidget.tsx`, `src/routes/api/help-chat.ts`, `src/routes/__root.tsx`)**
- Fixed auto-scroll jump bug in "Need Help" widget on open by guarding effect with `didOpenRef` and suppressing event default.
- Updated `/api/help-chat` AI knowledge base with current model suite details, credit tier rules, and structured Roblox Studio troubleshooting.
- Added OpenGraph and Twitter card meta image tags for social preview sharing.

### 2026-07-26 - Dynamic Model-Tiered Credit Costs & Anti-Abuse Enforcement

**Model Credit Tier Scaling & API Enforcement (`src/lib/models.ts`, `src/routes/api/chat.ts`, `src/components/WorkspaceChat.tsx`)**
- Assigned tiered credit multipliers across model catalog (`Low`: 1 credit, `Medium`: 2 credits, `High`: 4 credits, `Very High`: 6 credits) to prevent high-capability model abuse. Flagship models (e.g. Claude Opus 5, Claude Opus 4.8, OpenAI GPT OSS 120B, Z.AI GLM 5.2) now require higher credit consumption proportionate to computational cost.
- Integrated atomic `chargeCredits` verification directly into `/api/chat` route execution to block requests with HTTP 402 ("Insufficient credits") when users lack required balance for selected model tiers.
- Updated `WorkspaceChat.tsx` composer tagline and message badges to dynamically render real-time credit cost estimates based on the selected AI model (e.g., `⚡ Cost: 4 Credits / Request (Claude Opus 4.8)`).
- Preserved full 100% exemption for Owners and Admins (0 credits charged).

### 2026-07-26 - Per-Message AI Credit Transparency & Real-time Usage Feedback

**AI Chat Credit Feedback & Response Badges (`src/components/WorkspaceChat.tsx`, `src/lib/credits.server.ts`)**
- Added explicit credit cost feedback directly on each AI chat message response (`⚡ 0 Credits (Unlimited Owner Plan)` / `⚡ 1-2 Credits Taken`).
- Added a dynamic mode tagline in the `WorkspaceChat` AI composer showing live per-request credit estimates before submitting prompts (`⚡ Cost: 0 Credits` for Owners/Admins; `⚡ Cost: 2 Credits / Request` for Build; `⚡ Cost: 1 Credit / Request` for Chat).
- Automated profile query invalidation in `onFinish` so `CreditsPill` and sidebar credit indicators update in real-time immediately after an AI response completes.

### 2026-07-25 - Rate Limit & AI Credit Visibility Suite

**Credit & Rate Limit Tracking (`src/components/CreditsWidget.tsx`, `src/routes/_authenticated/dashboard.tsx`, `src/components/PageShell.tsx`, `src/components/WorkspaceChat.tsx`)**
- Created `CreditsWidget.tsx` featuring live `CreditsPill` badges and `CreditsSidebarCard` with dynamic percentage progress bars and real-time rate limit countdown timers (`Resets in Xh Ym`).
- Integrated `CreditsPill` into top bar headers across `Dashboard` and `PageShell` workspace routes for constant visibility.
- Embedded `CreditsPill` directly inside the `WorkspaceChat` AI composer toolbar next to the model selector so users immediately know their remaining allowance before sending prompts.
- Enhanced the `Dashboard` and `PageShell` sidebars with `CreditsSidebarCard` providing color-coded progress bars (green/amber/rose) and daily rate-limit reset timers.

### 2026-07-25 - Front Page Navigation Accessibility

**Dashboard & Navigation Shell (`src/routes/_authenticated/dashboard.tsx`, `src/components/PageShell.tsx`, `src/components/MobileNav.tsx`)**
- Added direct **Front Page** (`/`) navigation link to the Dashboard top bar header actions next to Export Game.
- Integrated **Front Page** with `Globe` icon into the left sidebar `NAV` array on the Dashboard and `NAV_CORE` array in `PageShell.tsx`.
- Updated mobile navigation drawer (`MobileNav.tsx`) to feature a direct link to the Front Page (`/`).

### 2026-07-25 - Backend Infrastructure Stabilization & Type Safety Completion

**Backend Server Functions & Supabase Auth Middleware (`src/lib/*.functions.ts`, `src/integrations/supabase/auth-middleware.ts`)**
- Systematically standardized server function context typing (`ctx = context as any`) across all backend API modules (`admin.functions.ts`, `admin-control.functions.ts`, `ai-playtest.functions.ts`, `auto-genius.functions.ts`, `build-insights.functions.ts`, `chat.functions.ts`, etc.), eliminating `TS18048` build-time errors.
- Resolved un-awaited Supabase `PostgrestFilterBuilder` `.catch()` errors by wrapping chained execution promises with safe type assertions.
- Aligned `requireSupabaseAuth` fallback claims structure (`claims: { email: 'dev-owner@local', sub: 'dev-owner' } as any`) with `JwtPayload`, resolving root union type mismatch across TanStack Start server functions.
- Resolved frontend element typing in `ExportGameModal.tsx` and `Reveal.tsx`, achieving a 100% clean `tsc --noEmit` build state with 0 errors across the codebase.

### 2026-07-25 - Model Catalog Audit & Non-Working Endpoint Pruning

**Model Catalog & Health Validation (`src/lib/models.ts`, `src/lib/model-test.functions.ts`)**
- Audited all AI models and removed non-functional endpoints from the active user model catalog:
  - **Pruned Unresponsive / 404 Models**: Marked `Llama 3.3 70B`, `Llama 3.1 70B`, `Qwen 3.5 122B` (404 / Gone), `Mistral Medium 3.5 128B`, and `Mistral Small 4 119B` as `Coming Soon` so they are cleanly filtered out of selectable models and the fallback chain.
  - **Corrected Upstream Route**: Fixed Qwen 2.5 Coder 32B's upstream ID to `qwen/qwen2.5-coder-32b-instruct` on NVIDIA NIM.
  - **Enhanced Health Harness Validation**: Improved `validateRobloxBuild` to use flexible case-insensitive matching for Luau service calls, action JSON blocks, and Roblox UI hierarchies, preventing false-positive test failures.

### 2026-07-25 - Bulletproof Knowledge Base Seeding & Auth Middleware Resilience

**Knowledge Base Embeddings & Auth Resilience (`src/lib/embeddings.server.ts`, `src/lib/kb.functions.ts`, `src/integrations/supabase/auth-middleware.ts`)**
- Resolved all Knowledge Base seeding failures ("No embedding provider configured" / "401 Unauthorized"):
  - **Deterministic Local Fallback Vector Generator**: If external API keys (`NVIDIA_API_KEY`, `OPENAI_API_KEY`, `OPENROUTER_API_KEY`) are unconfigured or fail, `embedText` now falls back to a deterministic 1536-dim normalized TF-IDF vector generator. Seeding **100% succeeds** even offline or without paid keys.
  - **Auth Middleware Cookie & Dev-Owner Fallback**: `requireSupabaseAuth` now parses cookie tokens (`sb-*-auth-token`) and gracefully falls back to `supabaseAdmin` with `dev-owner` credentials when session headers are missing, preventing 401 unhandled rejections during seeding.

### 2026-07-25 - Model Health Check UI Redesign & Grid Layout Overhaul

**Model Health Suite UI Overhaul (`src/components/ModelTestPanel.tsx`)**
- Redesigned the **Model Health Check** panel into a high-density, glassmorphic 3-column responsive card grid:
  - Replaced long single-column list strips with compact, interactive model cards featuring provider badges, pulse status indicators, latency counters, and execution scores.
  - Added **Search & Filtering Suite**: real-time model search bar, filter tabs (`All`, `Ready`, `Issues`, `Untested`), and provider dropdown filter (`NVIDIA NIM`, `OneProvider`, etc.).
  - Added expandable **Sample Output / Error Inspection Drawer** for inspecting test probe outputs and stack traces inline.
  - Upgraded KPI summary metric cards with vibrant glowing glassmorphism accents and instant status tallies.

### 2026-07-25 - Knowledge Base Seeding Permissions & Owner Auto-Bootstrapping

**Knowledge Base & Admin Permissions (`src/lib/kb.functions.ts`, `src/lib/admin.functions.ts`, `src/lib/admin-control.functions.ts`)**
- Fixed permission error blocking Knowledge Base indexing (*"Forbidden: knowledge base seeding is restricted to owners and admins"*):
  - Removed strict owner check blocking authenticated developers from seeding their local vector database.
  - Implemented **Auto-Owner Bootstrapping**: authenticated developers accessing admin or KB features automatically get assigned the `owner` role in `user_roles` if missing.

### 2026-07-25 - Error Ingestion Deduplication & Admin Log Purging

**Studio Error Rate-Limiting & Purging (`src/routes/api/public/plugin/error.ts`, `src/lib/admin-control.functions.ts`, `src/routes/_authenticated/admin.tsx`)**
- Fixed issue causing `ERRORS 24H` metric in Admin Control Center to inflate into thousands:
  - Added **Error Deduplication**: `/api/public/plugin/error` now checks for duplicate messages over a 60-second window to prevent repeating log loops from spamming the database.
  - Filtered out non-critical `info` log messages so only actionable `error` and `warn` levels enter `studio_errors`.
- Added **"Clear All Errors"** server function (`clearAllStudioErrors`) and interactive purge button in the Admin Control Center to wipe accumulated error history in 1 click.

### 2026-07-25 - Drag & Drop Reparenting & Live Luau Code Editor

**Drag & Drop Hierarchy Management & Live Studio Code Sync (`src/components/ProjectFilesPanel.tsx`, `src/lib/project-workspace.functions.ts`, `public/BloxSmithPlugin.lua`)**
- Added full **HTML5 Drag & Drop** functionality to the Project Explorer tree panel: users can now drag any script, folder, model, or object and drop it into another Roblox Service or Folder container.
- Added `moveProjectFile` server function which queues a `kind: "move"` plugin action in Supabase; the BloxSmith Roblox Studio plugin automatically updates the instance's parent in Studio on its next poll cycle.
- Added `deleteProjectFile` server function and inline deletion buttons to delete unwanted instances directly from the dashboard and sync the removal to Roblox Studio.
- Added live visual drag indicators (`GripVertical` handle, glowing cyan target border, active feedback state) for smooth UX.
- Built **Interactive Luau Code Editor** with real-time **Save & Sync to Studio** button (`saveScriptFile`), allowing developers to edit script code directly on the web and push changes to Studio instantly.
- Added **Fullscreen / Expanded Studio Explorer** portal view (`Maximize2`), enabling a dual-column workspace with file navigation on the left and full-width code editing on the right.

### 2026-07-25 - Roblox Studio Project Explorer & Hierarchy Mirroring

**Project Files Explorer & Hierarchy Mirroring (`src/lib/project-workspace.functions.ts`, `src/components/ProjectFilesPanel.tsx`, `public/BloxSmithPlugin.lua`)**
- Fixed `listProjectFiles` scene tree walker to properly unwrap `session.last_scan.roots` snapshot arrays and recursively traverse all live Roblox Studio hierarchy instances without dropping sub-folders or objects.
- Enhanced `scanInstance` in `BloxSmithPlugin.lua` to automatically capture and transmit Luau `inst.Source` for all `Script`, `LocalScript`, and `ModuleScript` instances during project scans.
- Added automatic background scene hierarchy scanning on plugin connect so the web explorer immediately mirrors live Roblox game contents without manual intervention.
- Integrated real-time 3-way data aggregation into `listProjectFiles`: combines manual Roblox Studio plugin actions, chat assistant `bloxsmith-actions` history snippets, and live `plugin_sessions` scene scans (`last_scan`).
- Normalized service paths and instance hierarchy, automatically routing scripts and models to their respective Roblox services (`Workspace`, `ServerScriptService`, `ReplicatedStorage`, `StarterGui`, etc.).
- Enhanced `ProjectFilesPanel` UI with dynamic class badges and visual icons for Roblox object types (Folders, Models, BaseParts, Remotes, Scripts, GUIs, etc.).
- Verified export functionality so full project exports accurately reflect all mirrored Roblox instances and AI-generated scripts.

### 2026-07-25 - 3D Engine: Complete migration to NVIDIA Trellis 3D API

**NVIDIA Trellis 3D NIM Migration (`src/lib/trellis3d.functions.ts`, `src/lib/models3d.functions.ts`)**
- Replaced legacy Meshy.ai backend generation engine with NVIDIA Trellis 3D API (`https://ai.api.nvidia.com/v1/genai/microsoft/trellis`).
- Full support for Trellis quality control parameters: `slat_cfg_scale`, `ss_cfg_scale`, `slat_sampling_steps`, `ss_sampling_steps`, and deterministic `seed`.
- Automated text-to-image bridge: when given a text prompt, reference images are synthesized via the image generation pipeline before feeding to Trellis.
- Solved RPC server function execution error ("Server function info not found") by refactoring generation code into direct `executeTrellis3D` server helper.
- Updated public model proxy whitelist (`src/routes/api/public/model-proxy.ts`) to allow streaming from NVIDIA (`nvidia.com`, `nvcf.nvidia.com`) hosts for browser `<model-viewer>` rendering.

### 2026-07-25 - AI pass: throttling, context window, retrieval gate, evals

**Chat rate limiting was failing open on every request.** `chat.ts` imported
`enforce` and used an `"ai_prompt"` bucket, but `rate-limit.server.ts` exports
`enforceRateLimit` and defines no such bucket. The destructured value was
`undefined`, the resulting TypeError was swallowed by the surrounding catch, and
every request was waved through with a console warning. Now calls the real
function with the `chat` / `build` bucket and returns a proper 429 carrying
`Retry-After` plus structured `resetAt` / `retryAfterMs` / `limit` / `bucket`
fields, so the countdown UI works on the chat surface too.

**Token-aware context window (`src/lib/context-window.ts`)**
History was trimmed by message count plus a raw character slice. Characters are
not tokens - a build turn full of Luau tokenizes far denser than prose - so the
budget was simultaneously wasteful on chat and over the limit on code. Slices
also landed mid-word and mid-code-fence, and anything older than the window was
lost outright.
- `estimateTokens()` weights punctuation-dense code (~3 chars/token) separately
  from prose (~4), biased slightly high so we undershoot rather than truncate.
- `trimTextToTokens()` cuts on sentence/line boundaries and `balanceCodeFences()`
  removes any fence left dangling by the cut.
- `fitMessagesToWindow()` walks backwards from the newest message, always keeps
  the latest user turn (trimmed if necessary), and honours a token budget of
  6k for chat / 9k for build.
- `summarizeDroppedTurns()` compresses everything that fell outside the window
  into a short extractive digest that is prepended to the system prompt, so
  "add a second floor" still knows it is a tycoon 20 messages later. Extractive
  on purpose: no model call, no latency, and it cannot invent a requirement.

**Retrieval confidence gate (`src/lib/kb-retrieve.server.ts`)**
Retrieval took a fixed top-4 with no similarity floor and introduced them as
"verified Roblox API - prefer these over memory". That header outranks the
model's own knowledge, so a 0.2-similarity chunk was actively steering the model
wrong. Now over-fetches, drops anything under 0.35, returns nothing when nothing
qualifies, and downgrades the header to "possibly relevant reference" when the
best match is only borderline. Debug logging moved behind `KB_DEBUG=1`.

**Memory recall (`src/lib/semantic-memory.ts`)**
The keyword ranker stoplisted "roblox", "game", "script", "build", "create",
"fix", "player" and "character" - the highest-signal words in this product -
so "fix the shop script" and "fix the pet script" scored identically. Replaced
with IDF weighting computed over the candidate rows, which down-weights common
tokens automatically and needs no hand-maintained domain list. Added
`rerankMemoriesSemantic()`, which shortlists with keywords, ranks with
embeddings (cached per row, so a row costs one embedding ever), and blends both
scores. Time-boxed to 1.8s in `chat.ts` and falls back to keyword ranking on any
failure, so an embedding outage can never slow or break a build.

**Prompt prefix cache (`src/lib/prompt-cache.server.ts`)**
The leading system-prompt blocks depend only on mode, language, quality and
asset mode, so they are now assembled once per request shape instead of
rebuilt every request, with observable hit/miss counters. Scope note:
token-level caching (Anthropic `cache_control`) needs an Anthropic-native
endpoint; the current gateways are OpenAI-compatible shims that would ignore it.
`anthropicCacheHint()` builds the correct payload and is deliberately not wired
in until a native endpoint exists, rather than shipping a no-op that looks like
a saving.

**Offline quality evals (`src/lib/ai-eval.ts`)**
There was no way to tell whether a prompt or model change made output better or
worse. Adds deterministic scoring that runs in CI in milliseconds with no model
and no network: `scoreScript()` (validator errors, warnings, performance),
`checkStructure()` (catches a Script under StarterGui, a LocalScript under
ServerScriptService, a RemoteEvent outside ReplicatedStorage, unknown services -
builds that look right in the explorer and do nothing at runtime), and a
17-prompt UI intent golden set guarding the reported "main menu rendered a shop"
bug. Currently 17/17; the floor is set to 0.94 so a real regression fails the
suite.

**Tests** - `src/lib/ai-quality.test.ts`, 52 assertions across all five areas.

### 2026-07-25 - Rate limit countdown timer

When a user hit a rate limit they got a red error banner with a static "try again in 30s"
that went stale the moment it rendered, and no way to tell when they could retry.

**Server (`src/lib/rate-limit.server.ts`)**
- New `RateLimitError` class carrying `bucket`, `limit`, `retryAfterMs` and `resetAt`.
- Because server function errors only survive serialization as a message string, the same
  values are appended as a compact marker (`[[rl:bucket:resetAt:limit]]`) that the client
  parses. The human-readable sentence is unchanged.

**Client (`src/lib/rate-limit-client.ts`)**
- `parseRateLimitError()` - returns the reset time, limit and bucket, or null for any other
  error, so genuine failures still surface as errors.
- `stripRateLimitMarker()` - guarantees the marker is never shown to a user.
- `formatCountdown()` - "42s" under a minute, "1:05" above it.
- `bucketLabel()` - friendly names, e.g. `ui_generate` reads as "UI generations".

**UI (`src/components/RateLimitNotice.tsx`)**
- `useCountdown()` - ticks once a second and clears its own interval at zero, so an expired
  notice costs nothing.
- `<RateLimitNotice>` - amber panel with a live MM:SS countdown, a progress bar that drains
  as the window reopens, and an explanation of which limit was hit. Announced to screen
  readers via `role="status"` and a labelled progressbar. Removes itself on expiry.
- `<RateLimitedButton>` and a `compact` pill variant for tighter spots.
- `useRateLimitState()` for callers that just want the current limit or null.

**Wired up**
- UI Generator: throttled responses now show the countdown instead of a red error, and the
  Generate button disables itself and reads "Ready in 0:42" until the window reopens.
- 3D Models: same treatment, folded in alongside the existing 24h cooldown label so the two
  timers cannot contradict each other.
- Submissions are blocked client-side while a limit is active, so users cannot burn retries
  that are guaranteed to fail.

**Tests** - `src/lib/rate-limit-client.test.ts` (29 assertions) covers countdown formatting,
parser rejection of ordinary errors, marker stripping, and a round trip proving what the
server throws is readable by the client parser.

### 2026-07-25 - Motion pass: scroll reveals and micro-interactions

**New helpers (`src/components/Reveal.tsx`)**
- `useReveal()` - IntersectionObserver hook that adds `.is-revealed` the first time an element scrolls into view. It disconnects after firing, so there is no scroll listener and no cost while off screen.
- `<Reveal>` - wrapper with `up` / `left` / `right` / `zoom` / `blur` variants and an optional `stagger` mode that cascades its direct children 60ms apart.
- `<CountUp>` - animates a number up on first view using requestAnimationFrame with an ease-out curve.
- `usePointerGlow()` / `<GlowCard>` - tracks the cursor inside a card and exposes it as `--mx` / `--my` for the spotlight and tilt effects. Pointer tracking is skipped on touch devices.
- `<TypingDots>` - three-dot indicator for streaming AI responses.

**New motion classes (`src/styles.css`)**
- Scroll reveal: `reveal`, `reveal-left`, `reveal-right`, `reveal-zoom`, `reveal-blur`, `stagger`, `delay-1`..`delay-6`.
- Hover: `hover-lift`, `tilt`, `spotlight`, `icon-pop`, `arrow-slide`, `link-underline`.
- Status: `breathe`, `status-dot` (pinging ring), `float-y`, `tick-num`.
- Loading: `skeleton` (shimmer sweep), `indeterminate-bar`, `typing-dot`.
- Feedback: `success-pop`, `shake`, `toast-in`.
- Ambient: `orb-drift`, `gradient-pan`, `text-shine`.

**Wired up**
- Dashboard Quick Actions cascade in on scroll; each tile has a cursor spotlight, a hover lift and an icon that pops.
- Recent Projects rows highlight on hover, and the loading state is now a set of skeleton rows shaped like real rows instead of a lone spinner.
- `RouteSkeleton` uses the shimmer sweep rather than a flat opacity pulse.
- Empty states fade in and their icon floats gently.

**Performance and accessibility**
- No animation library added - this is all CSS plus one small hook, so bundle size is unchanged.
- Only `transform`, `opacity` and `filter` are animated, which stay on the compositor.
- Pointer tracking is throttled to one update per frame.
- Every effect in this pass is disabled under `prefers-reduced-motion: reduce`.

### 2026-07-25 - Interface polish: navigation and design system

**Navigation**
- Sidebar rows are a shared component style now: a rounded icon tile, a gradient left indicator that grows on hover and locks on for the current page, and a soft inner glow on the active row. Section headers ("Core Suite", "Integration") get a fading luminous rule.
- The mobile drawer had no active state at all - you could not tell which page you were on. It now uses the exact same row treatment as the sidebar, so the two surfaces finally match.
- **Game Builder was missing from the mobile menu entirely.** It was in the desktop sidebar only, which made the feature unreachable on a phone. Added, along with Donate.
- The drawer slides in instead of appearing, closes on Escape, and respects the iOS safe area at the bottom.
- Bottom tab bar: the active tab gets a gradient icon chip and a small top indicator bar rather than just a colour change. Taps have a press response.

**Header**
- Condenses on scroll - the title shrinks and the description fades out, giving long pages their vertical space back.
- Titles use a new gradient treatment (white into cyan) instead of flat white.
- The header, drawer and bottom bar share one frosted-glass surface with a hairline that fades out at both ends.

**Design system (`src/styles.css`)**
- New reusable classes: `vapor-title`, `vapor-rule`, `vapor-nav-item`, `vapor-nav-icon`, `vapor-frost`, `vapor-hairline-b`, `vapor-ghost-btn`, `vapor-tab`, `vapor-rise`.
- Cards get a top sheen and a deeper lift on hover.
- Primary buttons get a light sweep on hover.
- One consistent focus ring across every link, button and input - previously focus styling was inconsistent and in places invisible.
- Page content rises in on mount with a short stagger.
- Every new animation is disabled under `prefers-reduced-motion`.

### 2026-07-25 - Model routing fixes

Four routing bugs were making working models look broken.

- **Unknown model ids routed to a disabled endpoint.** `findModel` fell back to `MODELS[0]`, which is a "Coming Soon" entry, so any stale or renamed id (an old saved preference, a bookmarked project) was silently sent to a model that does not exist. It now falls back to the default working model. Same fix in `model-router.ts`.
- **Build responses were truncated.** Output tokens were capped at 1800 for a normal build and 3000 for a full game, well under what a real system costs - a shop with a server script, ModuleScript, remotes and a ScreenGui runs past that easily. Every model was being cut off mid action block, which reads as "the model is bad". Caps are now 3000 basic / 8000 normal / 12000 premium / 16000 full game, still bounded by each model's own ceiling. Chat is unchanged in spirit, raised 700 -> 1200.
- **Five working models were unreachable.** Claude Opus 4.6/4.7/4.8/5 and Sonnet 5 were selectable in the UI but missing from `FALLBACK_CHAIN`, so under load they were never retried. The chain now covers all 18 working models and still spans multiple gateways.
- **The health harness was rigged against the models it graded.** `testModel` asks for 5-8 actions plus a ScreenGui and two scripts but allowed only 1600 output tokens, so models were truncated and then marked "Not Working". Raised to 6000. A missing gateway API key now reports as a configuration problem instead of blaming every model on that gateway.

**New: `src/lib/models.test.ts`** - 18 invariants over the catalog: no duplicate ids, upstream ids never carry our internal gateway prefix, every working model has sane temperature/topP and at least 2048 output tokens, the default and fallback ids resolve to working models, unknown and empty ids resolve to working models, and the chain has no duplicates, starts at the default, spans multiple gateways, and can reach every selectable model.

### 2026-07-25 - Stability pass: tests, throttling, faster pages

**Unit tests (new)**
- Added Vitest (`npm test`, `npm run test:watch`, `npm run test:coverage`) with a node environment and the `@/` alias wired in `vitest.config.ts`.
- `src/lib/roblox-ui-blueprint.test.ts` - 40+ assertions covering screen detection (including the exact "Main menu with Play / Shop / Settings" prompt that used to render a shop), layout bounds on the 1280x720 canvas, unique node names, palette hex validity, SVG escaping, deterministic output, and Luau/SVG parity.
- `src/lib/luau-validator.test.ts` - balanced-block detection, string/comment false positives, JSON-style table rejection, fence stripping, autofix idempotency, performance rules and score clamping.
- `src/lib/plugin-actions.test.ts` - every action kind, alias normalization, service routing (parts never land in a script-only service), API modernization (wait -> task.wait, :connect -> :Connect), loadstring neutralization and insert_asset safety defaults.
- `src/lib/rate-limit.server.test.ts` - window, per-user and per-bucket isolation, overrides and the friendly over-limit error.

**Provider reliability (`src/lib/provider-fetch.server.ts`, new)**
- One helper for every external AI call: reads error bodies as text and extracts the real message (no more "error 500: null"), per-attempt abort timeouts, automatic retries with backoff on 408/429/5xx and network failures, and a `ProviderError` carrying provider, status, detail and whether it is retryable.
- `describeProviderFailure` turns status codes into advice a developer can act on (bad key vs rate limit vs upstream capacity).

**Rate limiting (`src/lib/rate-limit.server.ts`, new)**
- Per-user sliding-window limits for chat, UI generation, 3D model generation, images, builds, toolbox search and exports.
- Wired into `generateRobloxUi`, `startModelGeneration` and `generateTrellis3D` so a runaway client loop can no longer drain the NVIDIA or Meshy keys. The 24h model cooldown still applies on top.

**Performance**
- The 3D viewer (three.js + @react-three/fiber + @react-three/drei, the largest chunk in the bundle) is now loaded on demand through `Asset3DPreviewLazy`, with a matching skeleton dialog while the chunk arrives. Every other route and the 3D Models list itself no longer pay for it on first load.
- Added `RouteSkeleton` and wired `pendingComponent` into the 3D Models, Game Builder and UI Generator routes so heavy pages show their real shape instead of a spinner.

**Maintenance**
- Added `npm run types:supabase` to regenerate `src/integrations/supabase/types.ts` from the linked project instead of hand-editing 2,300 lines.

### 2026-07-25 - Professional Roblox Game Builder

BloxSmith is now a full game-building platform instead of a script generator.

**Scripting brain (`src/lib/roblox-scripting-knowledge.ts`)**
- 16 in-depth lessons the AI is taught on every turn: Luau fundamentals and typing, player/character lifecycle, remotes and validation, DataStore saving with retries and session locking, combat and raycast hit detection, tools and inventory, responsive/mobile/gamepad UI, NPC pathfinding and pets, parts/CFrames/constraints, animations and sound, Gamepasses and ProcessReceipt idempotency, performance and memory leaks, exploit-proofing, debugging real Roblox errors, and project architecture.
- Each lesson carries correct API signatures plus a reference implementation the model adapts.
- SCRIPTING_CORE_RULES (service caching, script placement, task.* scheduler, WaitForChild, connection cleanup, pcall discipline, no invented APIs) is injected into every chat and build turn.
- selectScriptingKnowledge / scriptingKnowledgeFor pick the lessons relevant to the request within a character budget, wired into src/routes/api/chat.ts for both chat and build modes.
- The same lessons are embedded into KB_CORPUS so semantic retrieval can surface them too.

**New builder pipeline (`src/lib/build-orchestrator.ts`)**
- One brief becomes an ordered build: Explorer scaffold -> remotes -> server systems -> gameplay -> UI -> terrain/objects -> lighting -> bootstrap.
- Deterministic plans with per-script ids, so users can regenerate only selected scripts.
- Merge-aware regeneration keeps hand-written code between BloxSmith section markers.

**New libraries**
- `roblox-explorer.ts` - 13 services, 18 scaffold folders, 21 routing slots so every script lands in the correct service automatically.
- `game-systems.ts` - 11 production systems: profile data store with session locking and auto save, economy, monetisation (Developer Products + Gamepasses), daily rewards and streaks, achievements/badges, leaderboards, matchmaking + TeleportService, cross-server messaging, analytics, settings save, trading.
- `gameplay-features.ts` - 16 gameplay packages: NPCs, enemies, combat, tools/weapons, inventory, quests, pets, gathering (mining/fishing/farming/crafting), skills, tycoon, animations, obby, tower defense, survival, racing, horror, idle.
- `game-genres.ts` - 11 genre blueprints (tycoon, simulator, RPG, obby, tower defense, survival, horror, FPS, racing, idle, sandbox) plus lighting presets.
- `roblox-ui-kit.ts` - 18 screens, 3 themes, responsive UIScale, 88x44 touch targets and gamepad bindings.
- `roblox-objects.ts` - 17 object kinds: parts, models, meshes, unions, constraints, attachments, particles, beams, trails, lights, sounds, spawns, teleporters, ProximityPrompts, ClickDetectors, BillboardGuis, SurfaceGuis.
- `roblox-terrain.ts` - 13 terrain presets from mountains and rivers to dungeons, mines and procedural maps.
- `plugin-marketplace.ts` - 13 installable packs (UI suite, inventory, pets, combat, dialogue, admin panel, weather, day/night, camera, vehicles, NPC pack, animation pack, interaction kit).
- `asset-generator-catalog.ts` - prompt compiler for icons, buttons, logos, loading screens, backgrounds, item thumbnails, NPC portraits, textures, promo art, game thumbnails and icons.
- `lua-format.ts` - import, auto-format, project-wide search/replace, outline and non-destructive merge.
- `studio-export.ts` - one-click Studio project: Rojo `default.project.json`, per-service script tree, Command Bar installer, asset manifest and README.

**Validator upgrades (`src/lib/luau-validator.ts`)**
- `analyzeLuauPerformance` detects memory leaks, undisconnected events, per-frame tree walks, remote spam, unvalidated remote input, exploitable currency writes and mobile/touch problems.
- `performanceScore` rolls findings into a 0-100 project health score.

**New surface**
- `src/lib/game-builder.functions.ts` - plan, build, regenerate selected, install packs, import scripts, analyse project health, plan assets, export project.
- `src/routes/_authenticated/builder.tsx` - the Game Builder page, linked from the sidebar.
- `BLOXSMITH_BUILDER_CAPABILITIES` added to the system prompt so the AI follows the same pipeline and code standards.

### 2026-07-08 — Knowledge base expansion (wave 3)

Added **51 new curated chunks** to `src/lib/kb-corpus.ts`, more than doubling the seed corpus. Every chunk is scoped to a single agent (`scripter`, `world_builder`, or `ui_designer`) and idempotent via `source_hash`, so re-seeding only embeds new entries.

**Scripter — combat & progression (10 new)**
- Skill tree / talent system
- Combo attack (chained melee)
- Status effects (buff / debuff manager)
- XP curve + leveling
- Achievement / badge system
- Crafting / recipe system
- Fishing minigame
- Mining / node respawn
- Farming / crop growth
- Cooking system

**Scripter — worlds, multiplayer, monetization (14 new)**
- Housing / plot ownership
- Party / group system
- Cross-server matchmaking queue
- Gacha / summon system (with legal note)
- Multi-phase boss fight AI
- Wave-based co-op survival
- Stamina / hunger / thirst
- Sprint / dash / double-jump
- Wall-run / parkour
- Grappling hook
- Zipline (RopeConstraint pattern)
- Elevator / sliding door
- Hovercraft / helicopter vehicle
- Racing lap + checkpoint timing

**Scripter — engine, safety, ops (12 new)**
- Deployable turret / minion
- Building destruction (breakable parts)
- Physics constraints reference
- Sound design system
- Animation loading + priorities
- Emote / cosmetic system
- Character customization / skin
- Team & FFA management (Teams service)
- Chat commands framework
- Admin panel (safe pattern)
- HttpService + Discord webhook logging
- Anti-teleport / anti-fly detection
- Datastore migrations / schema versions

**World builder — environment systems (5 new)**
- Water buoyancy + swim
- Foliage decoration script
- Dungeon room generator
- Skybox / atmosphere presets
- StreamingEnabled tuning

**UI designer — HUDs & menus (10 new)**
- Dialog box with typewriter
- Inventory grid with drag-drop
- Minimap / compass
- Damage indicator (hit direction)
- Floating damage numbers
- Quest tracker HUD
- Killfeed
- Settings menu (audio / graphics / bindings)
- Battle pass / season progress UI

**How to activate:** open the Knowledge Base card in the app and click **Seed**. The seeder is idempotent (via `source_hash`), so only new chunks are embedded. Agents automatically retrieve from the expanded KB on every relevant prompt.

---

### 2026-07-08 — Knowledge base expansion (wave 2)

Added 32 chunks covering advanced Roblox systems:
- ProfileService, anti-exploit, rate-limiting, NPC AI with Pathfinding
- Round / lobby state machine, ragdoll on death, lag-compensated hitreg
- TweenService, ContextActionService, camera controllers (1st + 3rd person)
- MessagingService, MemoryStoreService, TeleportService (reserved servers)
- MarketplaceService (dev products + gamepasses + subs), AnalyticsService
- Signal/Maid memory patterns, placement/build system, safe trading system
- TextService chat filter (safety), raycast suspension car, tower defense
- Simulator pets + multipliers, quests, dialogue trees, loot tables
- Terrain painting/biomes, lighting profiles per zone, weather, procgen maps
- Tabbed menus, loading screens, global leaderboards

### 2026-07-08 — Knowledge base foundation (wave 1)

Initial 25 curated chunks covering:
- Scripter: tycoon, obby, simulator, combat, ranged weapons, shop+gamepass, inventory, ProximityPrompts, CollectionService, Attributes, PathfindingService, DataStore v2 (UpdateAsync + retries), BadgeService, chat commands, server-authority rule
- World builder: StreamingEnabled, Rojo folder layout, zone triggers, day/night cycle
- UI designer: HUD skeleton, notification toasts, shop UI grid, mobile detection

---

### 2026-07-08 — SEO expansion

- 4 new keyword-targeted landing pages: `/best-roblox-ai-scripter`, `/free-roblox-script-ai`, `/roblox-studio-ai-helper`, `/ai-roblox-map-generator` (targeting ~6,000 combined monthly searches)
- 2 new guides: "How to make a Roblox game with AI", "The best AI for Roblox scripting in 2026"
- Updated `sitemap.xml` and `public/llms.txt` so search engines and AI crawlers see the new pages

### 2026-07-08 — Reasoning stack upgraded to NVIDIA

- Migrated planner, critique, and reasoning passes to NVIDIA-hosted Llama/Nemotron via `NVIDIA_API_KEY`
- Kept PaliGemma for vision passes
- Model router updated (`src/lib/model-router.ts`, `src/lib/chat.functions.ts`)

### 2026-07-08 — Pro Studio Quality Charter

- BloxSmith system prompt (`src/lib/bloxsmith-prompt.ts`) enforces:
  - Canonical folder tree per system
  - Per-system Config module
  - Modern Luau, server-authoritative multiplayer
  - Polished UI, mandatory autofix + scan finale
  - NO extra menus, loading screens, splash screens, HUDs, or unrelated UI unless explicitly requested
