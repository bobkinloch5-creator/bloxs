# Changelog

All notable changes to BloxSmith are tracked here. Dates are UTC.

## [Unreleased]

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
