# Changelog

All notable changes to BloxSmith are tracked here. Dates are UTC.

## [Unreleased]

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
