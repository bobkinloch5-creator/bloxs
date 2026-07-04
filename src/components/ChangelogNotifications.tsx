import { useEffect, useRef, useState } from "react";
import { Bell, Bot, Box, Brain, CheckCircle2, Gauge, ImageIcon, Lightbulb, ListChecks, ScrollText, ShieldCheck, Sparkles, Users, Wrench } from "lucide-react";

const CHANGELOG_VERSION = "2026-07-04-full-city-placement-scripts";

const CHANGELOG_ITEMS = [
  {
    title: "📌 Perfect placement — nothing floats, nothing clips (raycast ground-snap + overlap resolver)",
    date: "Jul 4",
    icon: Wrench,
    body: "Rebuilt the map arrange pass so every inserted asset lands exactly where it belongs. Ground snap now RAYCASTS straight down from 5000 studs above each asset and drops the bottom of its bounding box onto whatever the ray hits — terrain, baseplate, or a neighbor that was placed earlier in the same build — instead of blindly setting Y = size/2. A new overlap resolver runs before snap: it walks every already-placed model and, if bounding boxes overlap, pushes the new asset outward along the axis of overlap until it's flush against its neighbors with a 4-stud gap. All parts are anchored + collision-enabled BEFORE the raycast fires so subsequent assets actually stack on top of previously placed buildings instead of clipping through them. Result: no more floating buildings, no more props buried in the ground, no more two skyscrapers occupying the same lot.",
  },
  {
    title: "🏙️ 'Build me a full city' now builds a full city (30–40 real Toolbox assets)",
    date: "Jul 4",
    icon: Sparkles,
    body: "Massively expanded the city composition pipeline. When you say 'full/whole/entire/big/huge city', BloxSmith now runs up to 24 Toolbox search categories (skyscrapers, apartments, houses, shops, restaurants, gas stations, street lights, traffic signs, benches, trees, cars, plus the base variant map kit) instead of the old 5, takes UP TO 5 picks per category instead of 1, and drops them onto an auto-generated 8×5 = 40-slot grid at 140-stud spacing with alternating cardinal rotations, a central road row, and an outer decor ring. Every asset still lands as a full Toolbox package (preserve_hierarchy) and gets ground-snapped + district-organized by the new raycast arrange pass. Smaller prompts still get a proportional 5×3 grid.",
  },
  {
    title: "🛠️ Auto-fixed Luau — no more deprecated wait()/spawn()/:connect crashes",
    date: "Jul 4",
    icon: Wrench,
    body: "Every generated script (script, localscript, modulescript, run_lua) now runs through a deterministic auto-fix pass BEFORE it ships to Studio. Fixes applied automatically: wait(n) → task.wait(n), spawn(function → task.spawn(function, delay(n, fn) → task.delay(n, fn), :connect( → :Connect( (Roblox removed the lowercase form, and this alone kills a huge class of 'attempt to call a nil value' errors), loadstring(...) calls replaced with a nil-returning stub so scripts still parse instead of throwing at load, and stray markdown fences stripped. Combined with the existing prompt guardrails (server-authoritative code, RemoteEvent wiring, --!strict, StarterGui + LocalScript pipelines), scripts + UI now go into Roblox with the most common LLM landmines already defused.",
  },
  {
    title: "🔌 Plugin no longer disconnects randomly (heartbeat during Play Test + 30s error tolerance)",
    date: "Jul 4",
    icon: Wrench,
    body: "Fixed the plugin flipping to offline out of nowhere. Old behavior: 3 consecutive failed polls (~3 seconds of ANY hiccup — WiFi blip, server cold-start, Studio backgrounded) forced a disconnect, and Play Test / Paused states skipped the heartbeat entirely so the website flipped to offline within 30s even though the plugin was fine. New behavior: heartbeat pings /api/public/plugin/poll every second REGARDLESS of Play Test or Paused (actions are skipped, session stays green), and the disconnect threshold is bumped from 3 to 30 consecutive errors — so it only gives up after a full 30 seconds of continuous failures instead of a 3-second blip. Bumped plugin to v2.1.8 — re-download it on the Plugin page.",
  },


  {
    title: "🎨 Instant 3D previews — no more 'needs GLB or glTF' warning (Plugin v2.1.1)",
    date: "Jul 1",
    icon: Box,
    body: "Every generated 3D model now shows the interactive Sketchfab-style viewer automatically. Removed the 'Website preview needs GLB or glTF' warning and the manual 'Refresh 3D file' button — when a job finishes without a saved GLB yet, the card silently auto-polls Meshy every 4 seconds (up to 20 attempts) and swaps to the live 3D viewer as soon as the GLB is ready. While it's preparing, the card shows a subtle 'Preparing 3D preview…' spinner over the thumbnail. The viewer supports drag-to-rotate, scroll/pinch zoom, right-drag pan, mobile touch, PBR lighting with soft shadows, a neutral environment map, and a Fullscreen button. Downloads remain available in every format Meshy returned (GLB, glTF, FBX, OBJ, USDZ, STL, BLEND, MTL) with an 'All formats' button that also grabs the texture maps. Also surfaced the current Roblox Studio plugin version (v2.1.1) on the Plugin page — visible in the header pill and on the Download button — so everyone can confirm they're on the latest build.",
  },
  {
    title: "🎬 Rig + Animate now preview and animate in the browser (GLB output)",
    date: "Jul 1",
    icon: Wrench,
    body: "Fixed 'Website preview needs GLB or glTF' after rigging or animating a character with Meshy. Meshy's /v1/rigging and /v1/animations endpoints default to FBX, which the in-browser <model-viewer> cannot play, so the rigged/animated card only showed the thumbnail with a MODEL FILE warning. Both server calls now pass output_format: \"glb\" and target_formats: [\"glb\", \"fbx\"], so Meshy emits a real GLB that the site loads and plays directly, while still keeping FBX available for Roblox/Blender export. New rig and animation jobs render and animate live in the model card; older FBX-only jobs need a fresh rig/animate pass to pick up the GLB.",
  },
  {
    title: "🦴 Fixed Meshy character rigging (auto-remesh 'Not found' error)",
    date: "Jul 1",
    icon: Wrench,
    body: "Rigging a Meshy character was failing with 'Meshy could not start the rig, and auto-remesh failed too: Not found'. Root cause: the auto-remesh fallback was POSTing to `/openapi/v2/remesh`, which doesn't exist — Meshy's Remesh API is v1. Fixed by calling `/v1/remesh` (create) and `/v1/remesh/:id` (poll) per the official docs, dropping the deprecated `resize_height` parameter, adding `target_formats: [\"glb\"]` so the remesh output is rig-ready, and passing `height_meters: 1.7` on the initial rigging call so scaling matches Meshy's expected humanoid height. Broadened the fallback trigger so mesh-side failures (face count, topology, pose estimation, 400/422, 'not found' on stale task) all correctly enter the remesh → re-chain rigging flow. The error surfaced to the UI now explains what to try next: rigging needs a textured HUMANOID model with clear limbs facing +Z — use a fresh text-to-3D refine, not a re-texture or animation output. Character → Rig → Animate now works end-to-end.",
  },
  {
    title: "🌍 Procedural toggle now strictly controls Toolbox vs procedural output",
    date: "Jul 1",
    icon: ShieldCheck,
    body: "Fixed the Procedural Generation toggle so it fully controls AI behavior. When Procedural = OFF, a new strict enforcement pass runs after every build turn: all `part`, `model`, and `terrain` actions are stripped, plus any `run_lua` action whose Luau creates `Instance.new(\"Part/MeshPart/WedgePart/Model/SpawnLocation\")` or calls `Terrain:Fill/Set` — placeholder blocks, procedural trees, procedural rocks, procedural terrain, and visible-grass parts never reach Studio. If nothing insertable survives, BloxSmith automatically runs the Toolbox Asset Finder on the cleaned prompt to rescue the request with a real Creator Store model; if the Creator Store genuinely has no safe match, the reply says so instead of silently falling back. The visibleGrass enforcement (grass surface + terrain grass decoration) is now gated behind `proceduralFallbackAllowed` so it only runs when the toggle is ON, and system installers (Production Systems, UI/Systems, Single UI/Script, Recovery, Scan_*) are correctly whitelisted so DataStore/Economy/Inventory/Combat/Quests/Pets and StarterGui builds keep working with Procedural OFF. Smart Toolbox Picker toast text is corrected: the plugin auto-polls, so 'Insert' now says the asset is queued and the plugin will insert it on the next poll (~2s) — no manual Sync step exists.",
  },
  {
    title: "📜 Production Lua templates: DataStore, Economy, Inventory, Combat, Quests, Pets",
    date: "Jul 1",
    icon: ScrollText,
    body: "Added a production-ready Luau template library (src/lib/lua-templates.ts) that BloxSmith drops directly into Roblox Studio as complete ModuleScripts under ServerScriptService.BloxSmith_Systems with an auto-generated Bootstrap Script. Keyword-triggered per request: DataStore (session-locked GetAsync/UpdateAsync with exponential-backoff retry, deep-copied defaults, PlayerRemoving + BindToClose save), Economy (atomic Add/Spend for coins/gems with automatic leaderstats sync), Inventory (stack-based, 40-slot capacity, RemoteEvent replication), Combat (server-authoritative TakeDamage with 24-stud range check and 0.35s per-attacker cooldown), Quests (progress tracking, reward payout via Economy, persisted via DataStore), Pets (equip/unequip with AlignPosition/AlignOrientation follower, restored on CharacterAdded). Dependencies auto-include — asking for Quests pulls Economy + DataStore, asking for Inventory pulls DataStore. Full templates are complete production Luau, not stubs, and the install action is followed by a scan_project verification so the build isn't reported done until Studio confirms the ModuleScripts landed.",
  },
  {
    title: "🏔️ Biome packs: snow, desert, beach, volcano, castle, dungeon, space",
    date: "Jul 1",
    icon: Sparkles,
    body: "Extended the procedural generator with seven new biome packs that trigger automatically from keywords. Snow (snowy/arctic/tundra/ice/winter): snow terrain fill, pine trees with snow-capped cones, iceberg. Desert (desert/dune/cactus/sahara): sand terrain, rolling dunes, cacti with arms. Beach (beach/shore/coast/tropical): split sand/water terrain, palm trees with radial fronds, ocean surface. Volcano (volcano/lava/magma/crater): stacked basalt cone, neon lava pool, lava river, rock-fill crater. Castle (castle/fortress/keep/citadel/palace/throne): keep, four corner towers with roofs, gate, outer stone walls. Dungeon (dungeon/catacomb/crypt/cavern): tiled cobblestone corridor with walls, ceilings, wall torches (real PointLights), treasure chest at the end. Space (space/spaceship/space station/nebula/orbital): metal platform with neon glow strip, four support pillars, translucent ForceField dome, dark space Lighting + low-density atmosphere. All biomes coexist with existing tree/rock/water/road/house/vehicle/NPC/spawn detection, respect verification (min_created check on the BloxSmith_Procedural_Generation root), and inherit the same organize_project + scan_project follow-up so Studio confirms creation before the build is reported done.",
  },
  {
    title: "🔑 Authenticated Roblox Creator Store / Toolbox search",
    date: "Jul 1",
    icon: ShieldCheck,
    body: "BloxSmith now attaches your Roblox Open Cloud API key (x-api-key) to every apis.roblox.com Creator Store, Toolbox, and asset-details request. Authenticated calls lift the anonymous rate limits that were causing intermittent 'no safe public model found' responses on popular searches (houses, trees, cars, NPCs, weapons), so live Toolbox results are noticeably more reliable and BloxSmith falls back to procedural or run_lua only when the Creator Store genuinely has no safe insertable match. Safety filters (free, public, insertable, script-quarantine, ground-snap, group into a named folder, fallback IDs) are unchanged.",
  },
  {
    title: "🌳 Procedural asset generation + verified Studio execution",
    date: "Jul 1",
    icon: CheckCircle2,
    body: "Fixed the split between Procedural Generation and Toolbox mode. When Procedural Generation is ON, BloxSmith now removes Toolbox search tools from the AI turn unless you explicitly ask for Toolbox, strips any accidental insert_asset actions, and injects a deterministic procedural generator that creates real Studio instances for trees, bushes, rocks, grass, flowers, hills/mountains, rivers/lakes, roads/paths, houses/buildings, fences, street lights, bridges, props, furniture, vehicles, NPCs, decorations, terrain, lighting, and spawn points from original Parts/Terrain/Luau. When Procedural Generation is OFF, visual assets stay Toolbox-only with safe public free insertable assets and no procedural placeholder fallback. The AI response text is also sanitized so it cannot say Done/Successfully added/Live in Studio before verification. The plugin now carries run_lua verification results back to the server and can fail an action if the expected generated root/instance count is missing, so builds are marked complete only after Studio actually confirms creation or insertion.",
  },
  {
    title: "🌍 Procedural Generation toggle + strict one-request-one-result scope",
    date: "Jul 1",
    icon: Sparkles,
    body: "Added a 🌍 Procedural Generation toggle right next to the Build button in the AI Workspace composer, with a clear On/Off badge and a tooltip explaining what it does. When OFF (default), BloxSmith builds only exactly what you asked for — 'add a house' inserts one safe free Roblox Toolbox house and nothing else: no terrain, no trees, no roads, no NPCs, no lighting tweaks, no UI, no scripts, no extra decorations. When ON, BloxSmith may intelligently expand the build with terrain, foliage, roads, decorations, and natural details to keep the scene consistent with your game's theme. The toggle persists across sessions via localStorage and overrides the profile-level asset_mode default so per-build intent always wins. Server-side, /api/chat now reads proceduralGeneration from the request body and forces assetMode=procedural + proceduralFallbackAllowed=true when ON, or assetMode=toolbox_only + proceduralFallbackAllowed=false when OFF, before any Toolbox search or plan step runs. Toolbox asset search continues to prioritize safe, public, free, insertable Creator Store models and script generation continues to emit complete, production-ready, error-handled Luau — never placeholder stubs. One request now truly equals one result unless you flip the toggle.",
  },
  {
    title: "✅ Studio builds now require plugin verification",
    date: "Jul 1",
    icon: CheckCircle2,
    body: "Fixed the critical silent-success pipeline where BloxSmith could say a build was done before Roblox Studio actually confirmed execution. Build replies now say actions are queued and waiting for Studio verification, the chat stores assistant builds as sending until the plugin reports results, /api/public/plugin/poll logs every heartbeat and sent batch, and /api/public/plugin/complete updates the assistant message to done only when every action succeeds or failed with the exact Studio error when anything breaks. The composer now shows a live verification panel with queued, sent, done, failed, and duration counts so a build is never treated as complete when Studio inserted nothing. The Roblox plugin also sends its token in the body on every request, logs HTTP timing/errors, auto-reconnects after repeated poll failures, ignores stale saved project filters so the newest active project queue is pulled, and updates its project id from received actions.",
  },
  {
    title: "🧰 Toolbox works with ANY asset type — not just houses",
    date: "Jul 1",
    icon: Box,
    body: "Broadened the Toolbox single-asset detector so any noun works, not just the hard-coded shortlist. The regex still fast-paths common items (house, car, tree, sword, NPC, chair, sign, etc.) and now also matches spaceship, dragon, hoverboard, mailbox, arcade machine, robot, mech, drone, helicopter, tank, castle, throne, piano, guitar, bike, motorcycle, treehouse, tent, campfire, lantern, clock, mirror, painting, bookshelf, desk, dumpster, streetlight, hydrant, ATM, vending machine, jukebox, and more. On top of that, a generic fallback catches any phrasing shaped like 'add / insert / give me / spawn / drop / place / put a <thing>' AND bare noun phrases up to 4 tokens ('spaceship', 'medieval dragon'), so completely novel requests route straight to a single Toolbox search + one insert_asset with fallbacks — same safety filters, same InsertService validation, same ground-snap. singleAssetName sanitizes multi-word nouns into a clean PascalCase Studio name ('MedievalDragon_01'). Pack keywords (tycoon, obby, city, neighborhood, arena, full game, etc.) still opt out into the full multi-agent build.",
  },
  {
    title: "🧰 Toolbox assets actually execute in Studio now",
    date: "Jul 1",
    icon: ShieldCheck,
    body: "Fixed the pipeline where Toolbox assets were being found but never inserted into Roblox Studio. Two bugs were dropping every insert_asset before it reached the plugin: (1) validateAssetIds was fail-CLOSED — any asset the Roblox toolbox-details endpoint omitted or that came back during a 429/500 was marked \"not_found_or_private\" and blocked, which nuked most legitimate free public models. It's now fail-OPEN: only EXPLICIT bad signals (visibilityStatus != 0, paid_asset, published: false) block an asset. Missing fields, API errors, or omitted rows are treated as valid — Studio's InsertService is the ultimate judge and the blacklist catches the few that genuinely fail. (2) A single Studio insert failure was blacklisting the primary asset_id AND every fallback_id in the payload, so the plugin's own retry loop had nothing left to try and the next \"add a house\" request found its rescue candidates already blacklisted too. The blacklist now only ever adds the specific asset that failed (parsed from the Roblox error message when possible, else the primary) — fallbacks are preserved so the plugin can actually retry them, and future searches still have a full pool. Result: \"Add a house from Toolbox\" now searches → picks a safe public free model → queues one insert_asset with 2-3 fallback_ids → the plugin polls it → InsertService inserts it → ground-snapped and anchored at spawn.",
  },
  {
    title: "🔌 MCP Server Connections + Chat-only image generation",
    date: "Jul 1",
    icon: Sparkles,
    body: "Added a dedicated MCP Server Connections page at /mcp-servers (also linked in the sidebar under Integration → MCP Servers). Add any Model Context Protocol Streamable-HTTP server by name + URL + optional bearer token; BloxSmith immediately POSTs a tools/list JSON-RPC call with the required Accept: application/json, text/event-stream header, parses either JSON or SSE responses, and shows the connection status, the human-readable failure reason if it can't reach the server, every tool the server exposes (name + description), the last-tested timestamp, and an Enabled toggle. Each connection has Test (re-runs tools/list and refreshes the cached tool list), Enabled on/off, and Disconnect. Rows are per-user with RLS. The Image button in the composer now always uses Chat Mode so image generation never triggers Build Mode or a Studio insert — it flips the mode to Chat before sending. Chat Mode already exposes generate_image (real subjects — logos, thumbnails, icons, dogs, characters, promo art) and generate_ui_concept (Roblox ScreenGui mockups) tools; each generated image still renders inline with Save (writes into project_assets), Download (PNG), and Regenerate.",
  },
  {
    title: "🧰 Toolbox: authorized-only inserts + runtime blacklist",
    date: "Jul 1",
    icon: ShieldCheck,
    body: "Fixed the \"User is not authorized to access Asset / InsertService failed\" loop. Every insert_asset action — from the Smart Toolbox picker, the AI chat's auto-picker, and the multi-agent build pipeline — now runs through the same sanitizer before it reaches the plugin: asset_id + fallback_ids are validated against Roblox's toolbox-details API (public visibility, free, published, purchasable), private / off-sale / deleted / moderated IDs are dropped, the first surviving fallback is promoted into the primary slot, and if nothing survives a live Toolbox search keyed off source_query rescues the action (with a second validation pass on the rescue candidates so we never promote another 401). Rows that can't be rescued are dropped cleanly instead of failing the whole build. Added a runtime asset blacklist: when Studio reports a failed insert with \"not authorized\", \"InsertService\", \"failed to load asset\", or \"asset private/deleted/moderated/unauthorized\", the offending asset_id and its fallback_ids are added to an in-memory blacklist and never re-suggested — Toolbox search filters blacklisted IDs out of results, validateAssetIds marks them blocked, and the sanitizer refuses to promote them. Single-asset requests (\"add a house\") still get exactly one insert, ground-snapped and anchored, with scripts stripped and packs rejected.",
  },
  {
    title: "⏹ Stop button + accurate image generation + UI Generator link",
    date: "Jul 1",
    icon: Sparkles,
    body: "Added a clear red Stop button that replaces the Build / Send button the moment the AI starts working — while planning, streaming, running a build, or generating an image. Clicking Stop cancels the in-flight AI response, aborts the server-side stream (streamText now receives request.signal so the model and tool loop actually stop instead of quietly continuing to burn credits), halts image generation and any pending Studio actions, and the button flips back to Build / Send. A '⏹ Stopped by user.' badge appears under the chat so it's obvious the run was canceled on purpose and not a crash. Fixed image generation routing: asking for 'an image of a dog' now generates a real dog image via the Lovable AI Gateway (openai/gpt-image-2) instead of a Roblox GUI mockup. The single generate_image tool was split into two tools with clear intent — generate_image for real subjects (animals, characters, objects, logos, thumbnails, game icons, badges, shop/item icons, character/map concept art, promo art, banners) and generate_ui_concept for Roblox ScreenGui / in-game UI mockups (menus, HUDs, shop panels, inventory panels, loading screens, gamepass UI, quest UI, health/XP bars, mobile controls). A safety net in generate_image also detects UI keywords in the prompt and reroutes to the UI concept renderer, and vice versa, so the tool the model picks is corrected before the wrong image ships. Style / kind hints (logo, icon, thumbnail, character concept, etc.) are appended to the image prompt so the composition matches what the user asked for. Added a UI Generator entry to the dashboard side nav and Quick Actions grid so /ui-generator is reachable from Home in one click.",
  },

  {
    title: "📁 Open Project now fully restores your workspace",
    date: "Jul 1",
    icon: Sparkles,
    body: "Clicking Open on any project — from the Recent Projects list on Home or from the Projects grid — now instantly loads that project's complete workspace instead of relying on a URL redirect that could leave the interface out of sync. The dashboard listens for active-project changes across pages, tabs, the ProjectMenu, and the New Project modal via a shared bs:active-project-changed event plus the browser's storage event, so the composer, chat history, and banner all update together. A prominent 📁 Active Project banner now sits at the top of the AI Workspace and always shows the current project's thumbnail, name, game type, build count, last-updated time, and a Switch project button — so you always know which project you're working on. When a project opens, BloxSmith Agent automatically restores everything already saved to it: previous AI chat messages (loaded via chat_messages keyed to the project), previous prompts and build history, generated images and assets (project_assets), project memory notes (project_memory), project description/settings, plugin/Studio connection status, and the game type/style/target the project was created with — all fed back into the system prompt so the AI continues the conversation naturally instead of acting like a brand-new project. Every subsequent chat message, build, generated script, generated image, and memory update keeps auto-saving to the active project (server-side onFinish for chat, saveProjectAsset for images, project_memory upserts during builds). Opening a project also smooth-scrolls to the composer so you land exactly where you left off.",
  },

  {
    title: "➕ New Project button now opens a real project setup flow",
    date: "Jul 1",
    icon: Sparkles,
    body: "Clicking + New Project on the dashboard or the Projects page no longer wipes the interface or silently spawns a blank \"New Game <date>\" project. It now opens a focused modal that stays on top of your workspace and asks for the details the AI actually needs: Project Name, Game Type (Tycoon, Obby, Simulator, RPG, Horror, Fighting, Racing, Roleplay, Tower Defense, Shooter, Adventure, Puzzle, Custom), Style (Cartoon, Realistic, Low Poly, Anime, Neon/Cyberpunk, Fantasy, Sci-Fi, Cute, Dark/Horror, Retro, Minimal), Target Device (PC, Mobile, Console, PC + Mobile, All Devices), Build Goal (Prototype quickly, Full playable game, Learn/experiment, Polish an existing idea, Publish to Roblox), and an optional Description. The modal saves those details into the project brief so every AI turn — Chat and Build — sees the full context of what you're making. Build Mode also stops silently creating projects from your prompt text: if no project is active it opens the same modal instead, so the AI never guesses what game you meant.",
  },


  {
    title: "🧠 Friendlier BloxSmith Agent + inline image generation in chat",
    date: "Jul 1",
    icon: Sparkles,
    body: "BloxSmith Agent now talks like a real Roblox developer instead of a debug console. The system prompt was rewritten: no more \"Running actions…\", \"Searching Toolbox…\", \"Understanding request…\", raw JSON, tool names, action payloads, or internal field names leaking into replies. Every build reply now follows a short human shape — a one-line \"🧠 Building Your Request\" intro, a small \"Here's what I'll do\" checklist (Find asset ✅ Position ✅ Configure ✅ Test ✅ Send to Studio ✅), then a warm \"🎉 Done!\" recap that clearly confirms it executed inside Roblox Studio. Banned filler phrases (\"I think\", \"Sorry\", \"I'll try\", \"As an AI\") stay banned. The chat renderer also strips the internal ```bloxsmith-actions``` / ```json``` fenced blocks and lingering status lines from the visible message so users never see them again — the executable block still ships to the plugin pipeline, it's just hidden from prose. Loading status changed from a bare \"Thinking…\" to \"Planning your build…\" then \"Building and sending to Studio…\" as the reply streams. Vision was tightened: attached screenshots (game concept art, UI mocks, error shots, layout refs) must be analyzed and rebuilt in Studio — the agent restates what it sees and recreates the layout with safe Toolbox assets + matching materials/colors/lighting instead of ignoring the image. Image generation is now available inside the AI chat via a new generate_image tool wired into both Chat and Build modes — asking for a logo, thumbnail, game icon, loading-screen art, badge, shop icon, item icon, character/map concept, promo art, or banner triggers real image generation. The result renders inline with Save (writes into project_assets on the current project), Download (PNG), and Regenerate (asks for a fresh variation) controls, and auto-classifies as logo / thumbnail / icon / loading_screen / badge so it categorizes cleanly in the project image library.",
  },

  {
    title: "🧰 Toolbox asset requests now always queue a real insert",
    date: "Jul 1",
    icon: Box,
    body: "Fixed the case where asking BloxSmith for a Toolbox / Creator Store asset could return a plan or fallback build without actually sending an insert_asset action to Studio. The agent pipeline now runs a verified Toolbox search before world-building, injects the safe numeric asset IDs into the agent prompt, accepts both asset_id/fallback_ids and assetId/fallbackIds shapes, rescues missing asset IDs from source_query/name, and adds a deterministic verified insert when the user explicitly asks for a toolbox asset but the model forgets to emit one. The insert stays safe: public/free only, scripts stripped, unauthorized IDs promoted to safe fallbacks or replaced by live-search results before the plugin receives the action.",
  },

  {
    title: "🛡️ Authorized-asset firewall + Luau nil-call guard",
    date: "Jul 1",
    icon: ShieldCheck,
    body: "Fixed the \"User is not authorized to access Asset\" / \"InsertService failed\" / \"attempt to call a nil value\" chain that made Studio builds partially fail. Every insert_asset action is now validated against Roblox's toolbox-details API before it's queued to the plugin: private, off-sale, unpublished, or non-existent asset IDs are dropped, the first surviving fallback_id is promoted into the primary slot, and if nothing survives the pipeline runs a live toolbox search keyed off source_query to rescue the action. If a rescue asset also can't be found, the doomed insert is dropped cleanly instead of failing the entire build — every other action still ships. The Luau validator now warns on the most common \"nil value\" traps that used to reach Studio: Lighting:GetEffect, Workspace:GetPart, :connect (lowercase), and the legacy wait/spawn/delay globals — nudging the model toward :FindFirstChildOfClass, :Connect, and task.wait/spawn/delay. Agent prompts were tightened to strongly prefer script/localscript/modulescript over run_lua (run_lua is now reserved for build-time terrain/Lighting tweaks), forbid inventing asset IDs, and require pcall guards on DataStore/HttpService/MarketplaceService/TeleportService calls.",
  },

  {
    title: "📚 BloxSmith Script Library — production-ready Roblox systems",
    date: "Jul 1",
    icon: Sparkles,
    body: "Expanded the Scripter agent's system prompt into a full script-library brief: an explicit catalog of every gameplay, combat, inventory, economy, NPC, quest, building, vehicle, pet, world, audio, effects, mobile, multiplayer, security, data, and admin system it can build on request (Health/Stamina/Hunger/Mana/XP/Skill Trees/Classes, Sword/Guns raycast+FastCast/Magic/Bow/Combos/Blocking/Dodge Roll/Boss AI phase-based/Status Effects/Damage Numbers, Inventory/Equipment/Hotbar/ProximityPrompt pickup/Crafting/Trading, Currency+DataStore Shops/Auction House/Weighted loot, Dialogue trees/Patrol/Follow/Enemy AI pathfinding, Quests + cutscenes, Placement/Grid/Snap building, Vehicles with VehicleSeat+constraints/Boats buoyancy/Planes/Nitro/Fuel, Pets + Egg Hatching + Following, Teleporters/Portals/Zone+ safe zones/Weather/Day-Night, SoundGroups, Particles/Trails/Camera Shake/Explosions, Mobile touch detection + on-screen buttons, Matchmaking/Teams/Party/Guilds, Anti-exploit + Rate limits + Data validation, DataStore ProfileService-style session lock + retry + versioned schema + Auto Save, Admin commands/Ban list). Added genre awareness — RPG, MMORPG, Simulator, Tycoon, Obby, Horror, Survival, FPS, Battle Royale, Tower Defense, Dungeon Crawler, City Builder, Farming, Fishing, Racing, Sandbox, Roleplay, Incremental/Idle — so the agent assembles only the systems that genre actually needs. Added a 10-point architecture standard every generated script must follow: modular ModuleScripts (no god scripts), server-authoritative Remotes with rate-limit + range + ownership + cooldown validation, modern Luau only (task.wait/spawn/delay, :Connect capital C, string interpolation, type annotations on public APIs), runtime-safety guards + pcall retries on DataStore/HttpService/MarketplaceService/TeleportService, clear PascalCase/camelCase/SCREAMING_CASE naming, feature-grouped folder layout under ReplicatedStorage/ServerScriptService/StarterPlayerScripts with Remotes under ReplicatedStorage/Remotes/<Feature>, performance discipline (Heartbeat/PostSimulation over while true loops, cached service lookups, Region3/OverlapParams/RaycastParams instead of per-frame magnitude scans), mobile awareness (UserInputService.TouchEnabled → ContextActionService touch buttons), integration-first (extend existing leaderstats/Remotes/DataStore folders instead of replacing them), and every ModuleScript returns a table with a documented public API and no side effects at require time. Scope Lock still applies — asking for one script gives you one polished script, not a whole game.",
  },

  {
    title: "🎨 Premium GUI generation — no more placeholder gray boxes",
    date: "Jul 1",
    icon: Sparkles,
    body: "Rewrote the UI Designer agent's system prompt with a strict 12-point premium quality bar every generated ScreenGui must meet: scale-based UDim2 + UIAspectRatioConstraint for cross-device sizing, UICorner rounded corners on every panel (12px) and button (8px), UIStroke 1.5px subtle border, UIGradient depth on panel backgrounds, a consistent modern dark palette (panel #181A22, surface #242834, accent indigo #5E81F4, success #48C78E, danger #E85A5A, text #F0F2F8/#A8AFC3) that only deviates when the user asks for a specific theme (cartoon/neon/retro), typography locked to GothamBold 22+ for titles / Gotham 16+ for body / GothamMedium 18+ for buttons with proper TextScaled + UITextSizeConstraint fallbacks and high-contrast text, UIListLayout/UIGridLayout with 10px padding + UIPadding 16px around every panel, 44x44+ mobile-safe tap targets with IgnoreGuiInset and centered anchoring, hover/press feedback (BackgroundColor3 tween + 1.03x size on MouseEnter, flash on Activated) on EVERY button via LocalScript, BackEasing Out open/close tween on the root frame, organized Explorer hierarchy with real names (MainMenu, ShopUI, InventoryUI, SettingsMenu, QuestUI, HealthBar, CurrencyUI, LoadingScreen, MobileControls, AdminPanel, GamepassShop → Root → Header/Body/Footer) and ResetOnSpawn=false for menus/HUD, and every TextButton.Activated wired to a real handler (RemoteEvent fire, sibling Frame toggle, or labeled print). Scope Lock still applies — asking for one button gives you one polished button, not a full HUD.",
  },


  {
    title: "🎯 Scope Lock — ask for one thing, get one thing",
    date: "Jul 1",
    icon: Sparkles,
    body: "Fixed the AI overbuilding on narrow prompts. The pipeline now detects three narrow single-item scopes — single_asset (\"one house\", \"a car\", \"add a tree\"), single_script (\"one script that heals the player\", \"add a remoteevent handler\"), and single_ui (\"one button\", \"add a screen gui label\") — and routes ONLY the matching specialist: World Builder for single_asset, Scripter for single_script, UI Designer for single_ui. The other two specialists, QA, Critic, auto-replan, and the automatic playtest step are all skipped for narrow requests, so no extra scripts, GUIs, folders, decorations, or systems are ever added. A hard SCOPE LOCK line is also injected into the specialist's prompt reminding it to ship exactly one item and to skip \"nice-to-have\" polish. The noun list was broadened (buttons, labels, screengui, script, remoteevent, coin, part, brick, spawn, checkpoint, portal, ladder, bridge, platform, banner, etc.) and pack/full-game keywords (tycoon, obby, simulator, neighborhood, city, arena, dungeon) still opt out into the full multi-agent build. Broader requests (\"build a shop\", \"make a tycoon\", \"full game\") continue to run the full Planner → Builder + Scripter + UI → QA → Critic pipeline exactly as before.",
  },


  {
    title: "🪄 Prompt Wand is back + Build is now the default mode",
    date: "Jul 1",
    icon: Sparkles,
    body: "The composer on the home workspace now opens in Build mode by default — clicking Build actually generates Studio actions and pushes them into the connected Roblox game instead of falling back to a chat reply. A wand 'Improve' button lives right next to Attach: it rewrites short prompts (e.g. 'make a zombie game') into a full build brief (spawn area, NPCs, combat, health, waves, UI, lighting, sounds, mobile controls) before you send. Chat vs Build remain fully separate — Chat still never touches Studio or creates projects, Build still executes end-to-end via the plugin poll/complete pipeline.",
  },


  {
    title: "🧱 Plugin no longer crashes with 'Out of local registers'",
    date: "Jul 1",
    icon: Sparkles,
    body: "Fixed the Studio error `Script:1872: Out of local registers when trying to allocate tlSet: exceeded limit 200`. The whole TIMELINE snapshot/restore section (readers, per-class capture map, tlCapture/tlCountByKind, Actions.snapshot, tlClearRoot, tlSet/tlEnum, the tlApply.<Class> table, tlApplyProps and tlRebuild) was declared as flat `local`s inside the main chunk and pushed the file past Luau's 200-locals-per-function limit right at the tlSet declaration. That whole section is now wrapped in an immediately-invoked function so all ~30 of those locals live in their own register frame and no longer count against the main chunk. tlClearRoot and tlRebuild stay forward-declared at the outer scope (as before) and are simply assigned from inside the IIFE, so Actions.restore_snapshot keeps working. No behavior change — snapshots, milestones, and restores work exactly the same, the plugin just loads cleanly again.",
  },
  {
    title: "🔌 Plugin pairing + Studio execution restored",
    date: "Jul 1",
    icon: Sparkles,
    body: "Fixed a regression from a previous security patch where the plugin_pair_codes trigger nulled plugin_token as soon as you clicked Approve, so Roblox Studio never received the token, pair.poll returned 'pending' forever, and every subsequent /plugin/poll and /plugin/complete request came back with 'invalid token' — which is why Approve looked frozen and why nothing ever executed inside Studio after a Build. The trigger now only clears plugin_token AFTER the plugin has actually picked the token up (picked_up_at), matching the original design. Effect: Approve responds immediately, the website flips to 'Plugin connected', Studio switches to Connected within a couple of seconds, and generated actions flow through /api/public/plugin/poll and get executed and confirmed via /api/public/plugin/complete like before. No plugin re-install required.",
  },
  {
    title: "💬 Real Chat mode + composer contrast fixes + no more duplicate image button",
    date: "Jul 1",
    icon: Sparkles,
    body: "The Home composer now has a real Chat / Build toggle at the top. Chat mode talks to the BloxSmith Agent for planning, questions, brainstorming, and prompt refinement — it never auto-creates a project and never runs a Studio build; the send button becomes 'Send' and posts to /api/chat with mode:'chat', which the server was already wired to treat as a plain conversational turn (no tools, no action compilation, no auto-execute). Build mode keeps its old behavior: creates a project on first send if none is active, streams the plan, and compiles Studio actions with the selected Smart/Fast/Deep quality. Fixed the AI-not-responding case where the Supabase bearer token wasn't attached — the transport now re-reads the token on every send. Removed the duplicate 'Shot' image button; the single Attach button already accepts images plus .rbxm/.rbxmx/.lua/.luau/.json/.txt/.md up to 4 files × 8MB each, on both desktop and mobile. Visibility pass: composer border white/8→white/15 and bg white/[0.02]→white/[0.04], Attach and Smart Build buttons now border-white/20 bg-white/[0.06] text-slate-100 (was white/10 slate-300), placeholder slate-500→slate-400, message stream border white/5→white/10 and bg black/20→black/40, user bubble is now solid indigo-500 with white text (was translucent), assistant bubble has a proper border, attachment thumbnails have a stronger border, and the Build mode dropdown popup is now on #12122a with slate-100 text so the descriptions are readable.",
  },
  {
    title: "🕹️ Roblox-style dashboard background + owner unlimited 3D generations",
    date: "Jul 1",
    icon: Sparkles,
    body: "Home / dashboard now sits on a premium Roblox-inspired ambient background — a dark neon voxel scene fixed behind the layout with a soft blur, indigo/fuchsia radial glows, and a strong dark gradient overlay so every card, header pill, and piece of text stays fully readable on desktop, tablet, and mobile. The background is decorative (aria-hidden) and pointer-events-none so it never blocks the New Project button, ProfileMenu, or the composer. Owner account (bobkinloch5@gmail.com) is now guaranteed unlimited 3D model generations: a migration ensures the account has both 'owner' and 'admin' rows in user_roles, sets profiles.plan to 'Owner', and pins credits + max_credits to 1,000,000. The existing owner/admin check in startModelGeneration and getModelStatus (via has_role) already skips the 24h cooldown, so with the roles now guaranteed the Generate button on /models never shows a timer, no daily cap, and no rate limit for the owner. No changes to how limits work for other users.",
  },
  {
    title: "🦴 Meshy AI rigging + cleaner build dropdown + fixed notifications overlay",
    date: "Jul 1",
    icon: Sparkles,
    body: "New Rig button in the 3D Models viewer runs Meshy AI's auto-rigging (POST /v1/rigging) to add a humanoid skeleton and skin weights to a generated model, then any of the Animate presets can play on it. The Animate button now has a matching tooltip explaining it works best on rigged characters. Build-mode dropdown in the Home composer now shows a real description under each option — Smart Build (balanced, recommended), Fast Build (fastest, for prototypes), Deep Build (highest quality, deeper planning) — instead of three bare labels. The BloxSmith updates notifications panel no longer opens as an oversized popover that covered the New Project button in the header: it now anchors at fixed right/top with a light dim backdrop, is capped at 360px wide and 72vh tall, and closes on any outside tap so header actions stay clickable. Under the hood: new rigModel serverFn in src/lib/models3d.functions.ts, 'rig' added to the model_generations.mode check constraint via migration, rig task polling reuses the existing pollModelGeneration path against Meshy's /v1/rigging/{task_id}.",
  },
  {
    title: "🤖 Build button, Attach & Shot now actually work",
    date: "Jul 1",
    icon: Sparkles,
    body: "The Home / AI Workspace composer is wired to the real BloxSmith Agent again. Build now streams a real reply from /api/chat scoped to the currently open project (from localStorage bs:activeProjectId) instead of silently creating an empty project. When no project is active, the first Build creates one from your prompt and continues the conversation inside it — Build never randomly spawns projects otherwise. A new src/components/WorkspaceChat.tsx owns the composer: loads existing chat_messages when you switch projects, streams the assistant reply inline with markdown, shows attached image thumbnails, and surfaces gateway errors. The Attach paperclip opens a real file picker (images + .rbxm/.rbxmx/.lua/.luau/.json/.txt/.md, up to 4 files, 8MB each). The Shot camera icon opens an image/screenshot picker (uses the device camera on mobile). Selected images are sent as file parts to the AI so it can see them, and non-image files fold their names into the prompt. Smart Build / Fast Build / Deep Build now maps to the API's buildQuality + executionMode. Added a small \"Active project: name · Switch project\" line under the composer so it's obvious which project the build will target.",
  },
  {
    title: "🔌 Removed the Roblox account connection",
    date: "Jul 1",
    icon: Sparkles,
    body: "The 'paste a code into your Roblox profile description' verification flow has been removed. Deleted src/lib/roblox-connect.functions.ts (startRobloxConnect, verifyRobloxConnect, refreshRobloxProfile, disconnectRoblox, setRobloxPublic). Deleted the Roblox Account card from /settings — no more Connect / Verify / Refresh / Disconnect / Public-on-profile controls or verification code UI. The plain 'Roblox username' text field in Settings → Identity stays, since it's just profile info. Existing roblox_* database columns are untouched; nothing writes to them from the app anymore.",
  },
  {
    title: "📁 Projects page + single workspace flow",
    date: "Jul 1",
    icon: Sparkles,
    body: "Opening a project no longer sends you to a separate workspace page. The legacy /project/:id route has been removed; it now redirects to /dashboard (Home / AI Workspace) and stores the opened project id in localStorage as the active project context. New dedicated /projects page for managing every project — search, sort (recently updated / created / name), Open button, three-dot ProjectMenu, and a New Project action. Added Projects to the Home sidebar, PageShell sidebar, MobileNav drawer, and BottomNav (Projects replaced 3D Models in BottomNav; 3D Models still lives in the drawer). Recent Projects → 'View All' link on Home now goes to /projects. Route files changed: created src/routes/_authenticated/projects.tsx; src/routes/_authenticated/project.$projectId.tsx rewritten as a beforeLoad redirect (removed ~3000 lines of duplicate workspace UI). Behavior changed: creating a new project from Home no longer navigates away — it just sets the active project and stays in the workspace. _authenticated/route.tsx no longer needs to hide the BottomNav for /project/*.",
  },


  {
    title: "🗑️ One AI workspace — old pages removed",
    date: "Jul 1",
    icon: Sparkles,
    body: "Removed the legacy AI Workspace surfaces so there is only one place to build. Deleted routes: /ideas, /ui-generator, /voice, /templates. Deleted server modules: src/lib/voice-agent.functions.ts, src/lib/ui-generator.functions.ts. Deleted route files: src/routes/_authenticated/ideas.tsx, ui-generator.tsx, voice.tsx, templates.tsx. Cleaned every nav that pointed to those pages — BottomNav, MobileNav, PageShell sidebar, dashboard nav, dashboard composer's Voice link, dashboard inspiration banner, and the project page sidebar. Home (/dashboard) is now the single primary AI workspace with the prompt box, BloxSmith Agent, Quick Actions, Recent Projects, Recent Activity, Studio Status, and Build controls all in one place.",
  },
  {
    title: "📱 Fully mobile-friendly — native app feel",
    date: "Jul 1",
    icon: Sparkles,
    body: "BloxSmith is now designed mobile-first. New sticky bottom nav (Home / Projects / Templates / AI Chat / More) with thumb-reachable 56px tap targets, a slide-out drawer that lists every destination (Home, Projects, Templates, AI Chat, Toolbox, Studio Plugin, Community, Credits, Settings — plus Voice, Ideas, 3D Models, MCP, History, Docs). The dashboard header shrinks on phones, the composer uses a 16px input to stop iOS zoom, auto-grows while you type, and the Build button is a chunky 44px+ pill that always stays visible. Chip buttons, mode picker, and mobile drawer links are all 40–44px minimum for one-handed use. The last-opened top-level route is remembered in localStorage so the app re-opens where you left off. No horizontal scrolling anywhere; every card stacks vertically on small screens.",
  },
  {
    title: "🎨 Home / dashboard redesigned to match the premium reference",
    date: "Jul 1",
    icon: Sparkles,
    body: "The dashboard was rebuilt from ~900 lines of stacked cards down to a calmer, more focused workspace: a slim left sidebar (Home, Projects, Templates, AI Chat, Toolbox, Studio Plugin, Community + Credits ∞ / Settings / profile card at the bottom), a single \"Welcome back, {name} 👋\" header with a Studio-connected pill and \"Send to Studio\" / \"New Project\" actions, one large describe-your-game composer with Attach / Screenshot / Voice affordances and a Smart Build dropdown, six flat Quick Action cards (Build, Improve, Fix Errors, Toolbox, Test Game, Publish), two clean columns for Recent Projects and Recent Activity, and a single \"Need inspiration?\" banner. Removed: the giant hero card, stats strip, theme picker, mascot SVG, template grid, ideas grid, and the right-hand tips panel — all still reachable from Templates / AI Chat / Toolbox routes.",
  },
  {
    title: "🌙 Admin panel: native selects no longer flash white",
    date: "Jul 1",
    icon: ShieldCheck,
    body: "The broadcast level picker, default-model picker, and grant-credits user picker were rendering their dropdown menus with the OS default white palette on top of the dark admin surface. All three native <select> controls now have bg-[#12122a] text-slate-100 with matching [&>option] overrides, so the open menu stays dark and readable across Chrome, Safari, and Firefox.",
  },
  {
    title: "🔒 Security hardening — sensitive profile fields no longer readable",
    date: "Jul 1",
    icon: ShieldCheck,
    body: "Cross-user profile reads are now restricted at the column level: only username, display name, avatar, bio, Roblox username, plan tier, language, and join date are exposed. Sensitive fields (credits, admin flag, ban state, settings, plugin token, credits_reset_at) are no longer selectable by any authenticated user other than the owner. Badges can no longer be self-inserted — the new award_badge RPC validates eligibility server-side (project count, script count, plugin connection, etc.) before granting. Pipeline / agent runs / project memory policies tightened to authenticated-only (removed the public role). admin_settings now hides any keys prefixed secret.* or internal.* even from signed-in users.",
  },
  {
    title: "🧠 One BloxSmith Agent — model picker removed from main UI",
    date: "Jul 1",
    icon: Brain,
    body: "The visible model picker (Claude / GPT / Gemini / DeepSeek / Qwen / etc.) is gone. Every chat and build now runs under a single \"BloxSmith Agent\" pill. Under the hood the router still auto-assigns the best model per task — planning → strongest reasoning, Luau → best coding, screenshot → vision, UI → design, debugging → bugfix, quick replies → fastest — but the user sees one agent, one conversation, one memory, one build history. Advanced users can still pin a specific model at /settings/advanced (hidden route, not linked from the main UI). AI activity now shows worker roles (Planner, World Builder, Roblox Engineer, UI Designer, Asset Search, QA Tester, Optimizer) instead of raw model names.",
  },
  {
    title: "Cleaner, more premium UI",
    date: "Jul 1",
    icon: Sparkles,
    body: "Chat page decluttered: the model picker slot is now a compact agent pill in the header and composer, fewer visible controls competing for attention, tighter spacing, and consistent dark theme tokens (no more white/mismatched surfaces bleeding through). Existing feature cards were kept — no duplicate components created — but the top strip and composer footer are now noticeably calmer.",
  },
  {
    title: "New systems shipped this week",
    date: "Jul 1",
    icon: ShieldCheck,
    body: "Public developer profiles (/u/:username) with badges, dev stats, and project showcase · 7-step premium onboarding flow shown once on first sign-in · Rate limiting (per-user sliding window) on the AI chat endpoint returning 429 rate_limited · Prompt-guard client validator (length caps, spam patterns, dangerous-Luau rejection) · New AI communication style — structured 🧠/📋/🏗/📦/💻/🎨/🎵/✨/🧪/⚡/✅ responses, banned filler phrases, required Build Summary at the end of every build.",
  },

  {
    title: "Smart Brain — 5-stage plan-before-build pipeline",
    date: "Jul 1",
    icon: Brain,
    body: "New Smart Brain card on every project. Type what you want and BloxSmith runs a full pipeline before touching Studio: (1) intent analysis on a fast model, (2) context retrieval that reads scene digest + project memory + recent chat, (3) architecture drafting on the planner model, (4) parallel briefs from the right specialists (Scripter, UI Designer, Toolbox, Performance, Bugfix, QA — each on the model best suited to the task), (5) merge + validate + confidence score. The final result is a locked directive with intent, plan, build order, existing paths to reuse, and specialist notes, sent to the executor with mode auto-selected (REPAIR / UI / MAP / PRO / SMART). The executor treats the directive as authoritative: no re-planning, no clarifying questions — one clean bloxsmith-actions batch that follows the plan step-by-step, ending in autofix_project + scan_project.",
  },
  {
    title: "Autonomous Development Sessions",
    date: "Jul 1",
    icon: Bot,
    body: "New Autonomous Session card on every project: type a goal (\"Make combat feel premium\", \"Optimize for mobile\", \"Add a leaderboard + save data\") and the AI planner breaks it into 5–10 ordered tasks assigned to specialized agents — World Builder, Scripter, UI Designer, Asset Manager, Toolbox Search, Performance Optimizer, QA Tester, Security Auditor, Audio Designer, Lighting Designer, Game Designer, Economy Designer, Quest Designer. Auto-run streams each task through the existing build pipeline and only advances after the plugin's execution report comes back clean. Manual Next + Stop controls, live progress bar, per-agent chips, quality target (draft/polished/premium), and full task history are all visible in the sidebar.",
  },
  {
    title: "Post-Build AI Insights",
    date: "Jul 1",
    icon: Lightbulb,
    body: "After every build, the AI reads the fresh scene digest, latest execution report, and project memory and produces 3–6 concrete, low-friction improvements — missing spawn, mobile controls, oversized parts, exposed remotes, folder cleanup, and more. Each suggestion has a severity/area badge and a one-click Apply that fires the suggestion straight into the chat composer. A build-health % strip shows ok / failed / repaired counts and last-build duration at a glance.",
  },
  {
    title: "Project Awareness + Context Memory",
    date: "Jul 1",
    icon: Brain,
    body: "The plugin now pushes a fresh scene snapshot automatically after every apply, and every successful build upserts a last_build entry into Project Memory with the exact paths that were created. The AI reads both before generating anything and modifies existing instances at their real paths instead of duplicating systems — future prompts extend the project instead of rebuilding it.",
  },
  {
    title: "Smart Execution Engine",
    date: "Jul 1",
    icon: Wrench,
    body: "The Studio plugin now analyses the full batch of actions before executing anything: sorts them into a safe dependency order (folder → terrain → lighting → model → remote → scripts → UI → sounds → NPCs → optimization), runs pre-flight validators (parent exists, asset id valid, no duplicates, Luau balance), auto-repairs common issues (strips markdown fences from LLM script bodies, normalizes empty parent paths, name-dedupes), retries once on recoverable failures (timeouts, missing parents), and posts a full execution_report at the end so BloxSmith knows exactly what shipped.",
  },

  {
    title: "Faster AI pipeline — caching + retries",
    date: "Jun 30",
    icon: Gauge,
    body: "Added an in-memory embedding cache (30 min, 512 entries) so repeat RAG / KB queries skip the network entirely, a 5-minute KB retrieval cache keyed on (agent, query, k) that short-circuits pgvector lookups for identical prompts, and bumped Toolbox search cache TTL from 90s to 10 min. Net effect: agent retrieval steps that used to add 400–1200ms now resolve in under 5ms on repeat hits.",
  },
  {
    title: "Smart Toolbox v2 — Saved, Recent, Manual ID",
    date: "Jun 30",
    icon: Box,
    body: "Toolbox Picker now has Search / Saved / Recent tabs, persistent favorites, a Try another button that skips the current top match and re-queries, Replace mode for swapping existing assets, and a Manual Asset ID importer so you can drop in a known ID + name directly. Free + safe only badges, script-quarantine warnings, and quality tiers (Excellent / Good / Usable) stay visible on every result.",
  },
  {
    title: "MCP Server connection guide",
    date: "Jun 30",
    icon: Wrench,
    body: "MCP tab now documents the BloxSmith MCP endpoint with bearer token auth, plus copy-paste config snippets for Google Antigravity (~/.antigravity/mcp.json), Cursor (~/.cursor/mcp.json), and custom clients. Lists every available tool: list_projects, studio_status, push_script, push_part.",
  },
  {
    title: "Workspace IDE overhaul + Antigravity MCP",
    date: "Jun 30",
    icon: Sparkles,
    body: "New resizable workspace shell: drag sidebar dividers, collapse left/right panels, expand the AI chat, and toggle Focus Mode (⌘.) for a distraction-free build view. Shortcuts ⌘B / ⌘J toggle the sidebars, and your layout is saved per project. Scrollbars, smooth-scroll, and panel padding polished throughout. Added Google Antigravity MCP config card with a ready-to-use mcp.json snippet.",
  },
  {
    title: "AI Project Manager + Auto Changelog",
    date: "Jun 30",
    icon: ListChecks,
    body: "Every project now has an AI Project Manager in the Studio tab. Click Generate AI Roadmap and BloxSmith plans 6–10 ordered milestones from your project prompt (core loop, UI, data save, monetization, polish, launch), tracks % complete with a live progress bar, and lets you mark milestones done. A new Changelog tab automatically aggregates every Studio action, snapshot, QA report, optimize pass, collab event, and milestone into a single ordered feed — no more guessing what shipped.",
  },
  {
    title: "One-Click Optimize Suite",
    date: "Jun 30",
    icon: Gauge,
    body: "Five new one-click buttons in the Studio tab queue safe, curated optimization passes through your Studio plugin: Optimize FPS (anchor static parts, StreamingEnabled, kill busy loops), Optimize Memory (dedup parts, clear empty folders, reorganize), Optimize Lighting (Future lighting, balanced exposure, real shadows), Optimize Scripts (rename untitled scripts, autofix, verify scan), and Optimize Mobile (DynamicThumbstick, ShadowMap, UIScale on every ScreenGui). Each pass writes a changelog entry automatically.",
  },
  {
    title: "AI QA Report Card + Visual Generator",
    date: "Jun 30",
    icon: ShieldCheck,
    body: "New Studio tab on every project: AI QA Report scores your game out of 100 across performance, bugs, security, mobile, and UI, listing issues + auto-fixable recommendations. Visual Generator streams gpt-image-2 previews for project logos, thumbnails, icons, skyboxes, and loading screens, saved per project for reuse.",
  },
  {
    title: "Real-time Collaboration System",
    date: "Jun 30",
    icon: Users,
    body: "Invite collaborators by username, assign Editor or Viewer roles, and build together live. New Team tab on every project with a live team list, project chat (Supabase Realtime), and activity log. New /collaborators inbox for accepting invites and managing teams on projects you own.",
  },
  {
    title: "Roblox Knowledge Engine",
    date: "Jun 30",
    icon: Box,
    body: "BloxSmith now continuously pulls from Roblox Creator docs, Luau reference, and Studio API guides on every relevant prompt, then injects only verified snippets into the agent context. Outdated APIs are filtered out automatically and the AI cites the doc section it followed.",
  },
  {
    title: "Auto Genius Mode — Auto Build Perfect Game",
    date: "Jun 29",
    icon: Sparkles,
    body: "One button that runs BloxSmith like a full AI game studio. It analyzes your idea (type, complexity, features, scripts, UI style), auto-picks the best specialist model for every task (planning, scripting, UI, assets, bug-fix, performance, testing, short edits), builds a full plan with quality targets, then hands an enriched master prompt to the agent pipeline so it builds, tests, fixes, and scores the game end-to-end. No more picking models — BloxSmith picks the smartest option and explains why.",
  },

  {
    title: "Friendlier error messages everywhere",
    date: "Jun 29",
    icon: ShieldCheck,
    body: "Replaced raw stack traces with short, human messages across chat, agent pipeline, Toolbox, queue actions, undo/stop build, file attachments, and the AI gateway. Network hiccups, rate limits (429), credit exhaustion (402), expired sessions, offline Studio plugin, oversized/invalid files, and validation errors now each show their own recovery hint via toast plus an in-card banner where it helps. Added prompt length validation (max 8000 chars) and image upload guards.",
  },
  {
    title: "MiniMax M3 added",
    date: "Jun 29",
    icon: Sparkles,
    body: "New multimodal model in the picker: MiniMax M3 via NVIDIA Integrate. Accepts text plus image_url and video_url references, 8K output tokens, balanced speed/quality for Roblox prompts.",
  },
  {
    title: "Make It Playable button",
    date: "Jun 29",
    icon: CheckCircle2,
    body: "One click takes any project to a fully playable Roblox game: spawn, character + camera, mobile touch controls, main menu, loading screen, HUD, tutorial, coins/XP with leaderstats, DataStore save with autosave + BindToClose, a core gameplay loop, anchor pass, organize, autofix, scan, and a playtest report. Pinned as the first action in the project page primary bar.",
  },
  {
    title: "Smart Toolbox Engine",
    date: "Jun 29",
    icon: Box,
    body: "New Toolbox Picker on the project page: live Creator Store search by keyword and category (Model, Mesh, Decal, Audio), quick-query chips, thumbnails, verified-creator badges, quality tiers, and script-safety warnings. Insert Best Match, Insert Selected, or Insert All — every insert is toolbox-only, free-only, ground-snapped, anchored, de-duped, and scripts quarantined.",
  },
  {
    title: "AI Game Director redesign",
    date: "Jun 29",
    icon: Sparkles,
    body: "The pipeline card is now a live production feed: goal banner with the active prompt, % progress bar and live action counter, color-coded milestone checklist (Planner → World Builder → Scripter → UI Designer → QA → Critic), and a collapsible 'Show crew reasoning' for the verbose agent output.",
  },
  {
    title: "AI can test your game",
    date: "Jun 29",
    icon: CheckCircle2,
    body: "New Test now button on the Verification badge runs an AI playtest on demand, not just at end-of-build. Richer status copy shows exactly what was verified.",
  },
  {
    title: "Faster models everywhere",
    date: "Jun 29",
    icon: Sparkles,
    body: "Switched default model tiers across the agent pipeline, AI gateway, embeddings, improve flow, and model tester. Project page polling is snappier so live updates feel instant.",
  },
  {
    title: "Verified execution pipeline",
    date: "Jun 28",
    icon: CheckCircle2,
    body: "BloxSmith now documents and drives a stronger chat-to-plugin flow: plan, Toolbox search, preview, Studio execution, scan, fix, test, polish, and final report, with clearer plugin status messages for each stage.",
  },
  {
    title: "50 real builder functions",
    date: "Jun 28",
    icon: Sparkles,
    body: "Added a full BloxSmith function catalog with direct controls for full games, maps, quests, currency, shops, saves, gamepasses, enemies, weapons, vehicles, pets, teleports, rounds, admin tools, performance, safety scans, updates, project memory, and final reports.",
  },
  {
    title: "Smarter Roblox brain",
    date: "Jun 28",
    icon: Sparkles,
    body: "BloxSmith now follows a stronger Think, Inspect, Plan, Build, Test, Fix, Polish workflow with project context, asset scoring, specialized agents, and stronger no-unfinished-system rules.",
  },
  {
    title: "Complete builder controls",
    date: "Jun 28",
    icon: Sparkles,
    body: "Added build quality modes, starter game packs, one-click fix buttons, full game checklist, and asset preview actions for Insert, Replace, and Search Again.",
  },
  {
    title: "Toolbox insertion proof",
    date: "Jun 28",
    icon: ShieldCheck,
    body: "The Studio plugin now verifies inserted assets have visible 3D content, bounds, texture/mesh signals, safe scripts, clean grounding, duplicate protection, and clearer success/failure reports.",
  },
  {
    title: "Better map layout planning",
    date: "Jun 28",
    icon: Sparkles,
    body: "Map builds now plan roads/paths first, buildings second, gameplay anchors third, characters and vehicles fourth, and props/nature/lighting last for cleaner Roblox-ready placement.",
  },
  {
    title: "Full Roblox builder brain",
    date: "Jun 28",
    icon: Sparkles,
    body: "BloxSmith now has stronger instructions for complete maps, obbies, tycoons, zombie survival, racing, simulators, roleplay towns, dungeons, arenas, horror maps, pet worlds, scripts, UI, scanning, fixing, and polish.",
  },
  {
    title: "More varied real Toolbox assets",
    date: "Jun 28",
    icon: Box,
    body: "Safe Toolbox searches now rotate among top matching free/public assets and pass extra fallback IDs, so city, town, forest, vehicle, weapon, NPC, and prop requests should not keep reusing the same asset every time.",
  },
  {
    title: "Toolbox Only Mode is now the default",
    date: "Jun 28",
    icon: ShieldCheck,
    body: "BloxSmith now prioritizes real free/public Roblox Creator Store assets and blocks procedural placeholder models when Toolbox-only mode is active.",
  },
  {
    title: "Real Toolbox Asset Finder",
    date: "Jun 28",
    icon: Box,
    body: "Prompts like pistol, sports car, zombie, police station, tree, house, NPC, prop, weapon, or vehicle now search safe Toolbox results and insert real matching assets.",
  },
  {
    title: "Cleaner map building",
    date: "Jun 28",
    icon: Sparkles,
    body: "City, town, forest, road, roleplay, and map prompts now use real assets, organize them into folders, ground-snap placement, anchor parts, disable imported scripts, and scan after insertion.",
  },
  {
    title: "Safer retries and reporting",
    date: "Jun 28",
    icon: CheckCircle2,
    body: "Inserted assets carry name, ID, creator, category, quality, safety, relevance, and source-query metadata so the plugin can log exactly what worked.",
  },
  {
    title: "UI previews match generated Luau",
    date: "Jun 27",
    icon: ImageIcon,
    body: "The UI Generator preview image and copy/download Luau now come from the same blueprint so the Roblox UI should match the preview much more closely.",
  },
  {
    title: "Loading screens vary now",
    date: "Jun 28",
    icon: Wrench,
    body: "Loading screens no longer repeat the same plain BloxSmith layout. The generator and Studio build guard now produce different clean layouts based on the prompt.",
  },
];

export function ChangelogNotifications({
  buttonClassName = "bs-icon-btn",
  iconClassName = "h-4 w-4",
}: {
  buttonClassName?: string;
  iconClassName?: string;
}) {
  const [open, setOpen] = useState(false);
  const [seen, setSeen] = useState(true);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setSeen(localStorage.getItem("bloxsmith:changelog:seen") === CHANGELOG_VERSION);
  }, []);

  useEffect(() => {
    if (!open) return;
    localStorage.setItem("bloxsmith:changelog:seen", CHANGELOG_VERSION);
    setSeen(true);
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    window.addEventListener("pointerdown", onPointerDown);
    return () => window.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className={`${buttonClassName} relative`}
        title="Notifications"
        aria-label="Notifications and changelog"
        aria-expanded={open}
      >
        <Bell className={iconClassName} />
        {!seen && <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full" style={{ background: "var(--bs-danger)" }} />}
      </button>

      {open && (
        <>
          {/* Backdrop so taps outside close the panel and don't accidentally hit stuff behind it */}
          <button
            type="button"
            aria-label="Close notifications"
            className="fixed inset-0 z-40 cursor-default bg-black/20 backdrop-blur-[1px]"
            onClick={() => setOpen(false)}
          />
          <div
            className="fixed right-3 top-[64px] z-50 w-[min(92vw,360px)] max-h-[min(72vh,560px)] overflow-hidden rounded-2xl border shadow-2xl sm:right-6 sm:top-[72px]"
            style={{ background: "var(--bs-card)", borderColor: "var(--bs-border)" }}
          >
            <div className="border-b px-4 py-3" style={{ borderColor: "var(--bs-border)" }}>
              <div className="text-sm font-bold">BloxSmith updates</div>
              <div className="mt-0.5 text-xs" style={{ color: "var(--bs-muted-fg)" }}>
                Latest changes across the workspace.
              </div>
            </div>

            <div className="max-h-[calc(min(72vh,560px)-64px)] overflow-y-auto p-2">
              {CHANGELOG_ITEMS.map((item) => {
                const Icon = item.icon;
                return (
                  <div key={item.title} className="rounded-xl px-3 py-3 transition hover:bg-[var(--bs-card-2)]">
                    <div className="flex items-start gap-3">
                      <div className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-xl" style={{ background: "var(--bs-primary-soft)", color: "var(--bs-primary)" }}>
                        <Icon className="h-4 w-4" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-start justify-between gap-3">
                          <div className="text-sm font-semibold leading-snug">{item.title}</div>
                          <div className="shrink-0 text-[10px] font-semibold uppercase tracking-wide" style={{ color: "var(--bs-muted-fg)" }}>{item.date}</div>
                        </div>
                        <p className="mt-1 text-xs leading-relaxed" style={{ color: "var(--bs-muted-fg)" }}>{item.body}</p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
