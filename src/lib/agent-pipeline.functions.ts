// ============================================================================
// Multi-Agent Pipeline (v2)
// ----------------------------------------------------------------------------
// Six specialist agents collaborate like a tiny game studio:
//   Planner → (World Builder + Scripter + UI Designer in parallel) → QA → Critic
// Upgrades over v1:
//   • Planner uses the same turbo flash model as the rest of the pipeline so
//     execution starts quickly.
//   • Critic (LLM-as-judge) scores 1-10 across "matches prompt / runs / fun".
//     Score <7 triggers ONE auto re-plan with the critique injected.
//   • Streaming agent thoughts: each agent uses streamText() and we flush the
//     partial transcript into agent_runs.summary every ~400ms so the UI
//     (which already polls every 1.5s) shows live reasoning instead of a
//     mute spinner. Pure "feels like magic" upgrade — no UI changes needed.
// ============================================================================
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { streamText } from "ai";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { getFallbackModel, getPlannerModel } from "@/lib/ai-gateway.server";
import { parseActions } from "@/lib/bloxsmith-prompt";
import { normalizePluginAction } from "@/lib/plugin-actions";
import { summarizeSceneScan } from "@/lib/scene-digest.server";
import { retrieveKnowledge } from "@/lib/kb-retrieve.server";
import { detectSingleAssetIntent, detectNarrowScopeIntent, searchRobloxToolbox, validateAssetIds, sanitizeInsertAssetActions, type NarrowScope } from "@/lib/roblox-toolbox.server";

export const AGENTS = [
  "planner",
  "world_builder",
  "scripter",
  "ui_designer",
  "qa",
  "critic",
] as const;
export type AgentName = (typeof AGENTS)[number];

const StartInput = z.object({
  projectId: z.string().uuid(),
  prompt: z.string().min(3).max(4000),
});

const ListInput = z.object({
  projectId: z.string().uuid(),
  limit: z.number().int().min(1).max(20).optional(),
});

const GetInput = z.object({ pipelineId: z.string().uuid() });

interface AgentContext {
  prompt: string;
  projectName: string;
  projectType: string;
  sceneDigest: string;
  memoryBlock: string;
  planSummary: string;
  critique?: string;
  knowledgeBlock?: string;
  toolboxBlock?: string;
  narrowScope?: NarrowScope;
}

function explicitToolboxAssetRequest(prompt: string) {
  return /\b(toolbox|creator\s*store|insert\s+(?:a\s+|an\s+|one\s+)?(?:asset|model)|(?:asset|model)\s+(?:from|in)\s+(?:toolbox|creator\s*store)|free\s+(?:roblox\s+)?model)\b/i.test(prompt);
}

function toolboxSearchQuery(prompt: string) {
  const label = singleAssetLabel(prompt);
  const cleaned = prompt
    .replace(/\b(please|fix|that|this|didn'?t|didint|doesn'?t|won'?t|not|also|already|asked|for|me|to|it|can\s+you|could\s+you|would\s+you|i\s+(?:also\s+)?asked\s+for|give\s+me|add|insert|put|place|spawn|find|search|use|from|in|into|my|the|a|an|one|single|just|only|safe|free|authorized|public|roblox|toolbox|creator\s*store|asset|assets|model|models)\b/gi, " ")
    .replace(/[^a-z0-9\s-]/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (cleaned.length >= 2 && label !== "asset") return cleaned.slice(0, 80);
  return label === "asset" ? "classic roblox model" : `${label} model`;
}

function singleAssetLabel(prompt: string) {
  const known = prompt.match(/\b(house|car|truck|vehicle|tree|rock|chair|table|couch|sofa|bed|lamp|sword|pistol|gun|rifle|bow|weapon|npc|zombie|dog|cat|pet|door|sign|chest|barrel|crate|building|shop|tower|boat|plane|bench|fence|wall|window|flower|bush|statue|fountain|cannon|hat|spaceship|dragon|hoverboard|mailbox|arcade|robot|mech|drone|helicopter|tank|castle|throne|piano|guitar|drum|bike|motorcycle|scooter|skateboard|surfboard|treehouse|tent|campfire|lantern|clock|mirror|painting|bookshelf|desk|dumpster|trashcan|streetlight|traffic|hydrant|atm|vending|jukebox)\b/i);
  if (known) return known[1].toLowerCase();
  // Generic extraction: "add/insert/give me/spawn/drop/place/put a <noun...>"
  const generic = prompt.toLowerCase().match(/(?:add|insert|give\s+me|get\s+me|get|spawn|drop|place|put|bring)\s+(?:me\s+)?(?:a|an|one|1|just\s+one)\s+([a-z][a-z0-9\s'-]{1,40})$/i);
  if (generic?.[1]) return generic[1].trim().split(/\s+/).slice(-3).join(" ").slice(0, 40);
  // Bare noun phrase fallback ("spaceship", "medieval dragon").
  const bare = prompt.trim().toLowerCase();
  if (/^[a-z][a-z0-9\s-]{0,40}$/i.test(bare)) return bare.split(/\s+/).slice(0, 4).join(" ");
  return "asset";
}

function singleAssetName(prompt: string) {
  const noun = singleAssetLabel(prompt).replace(/[^\w\s-]+/g, "").trim();
  const parts = noun.split(/\s+/).filter(Boolean).map((w) => w[0].toUpperCase() + w.slice(1));
  const base = parts.join("") || "Asset";
  return `${base}_01`.slice(0, 60);
}

// ── Insert-asset sanitizer ──────────────────────────────────────────────
// The LLM can hallucinate asset IDs or pick assets the creator has since
// privated. Before actions are persisted to plugin_actions we validate the
// asset_id + fallback_ids against Roblox's public toolbox-details API, promote
// the first surviving fallback into the primary slot, and if nothing survives
// try a live toolbox search keyed off source_query. If that also fails, drop
// the action rather than shipping an insert we know will 401 in Studio.
// Sanitizer moved to roblox-toolbox.server.ts and shared with chat.ts and the
// user-driven Toolbox picker so every path validates asset IDs the same way.

async function buildVerifiedToolboxInsert(prompt: string, singleAssetOnly: boolean) {
  const query = toolboxSearchQuery(prompt);
  const found = await searchRobloxToolbox(query, "Model", 10, { singleAssetOnly });
  const picked = found.results[0];
  if (!picked) return undefined;
  const name = singleAssetOnly ? singleAssetName(prompt) : (picked.name || "ToolboxAsset").replace(/[^\w\s-]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 80) || "ToolboxAsset";
  return normalizePluginAction({
    kind: "insert_asset",
    parent_path: "Workspace",
    name,
    payload: {
      ...(picked.insertPayload ?? {}),
      asset_id: picked.id,
      fallback_ids: (picked.fallbackIds ?? []).slice(0, 3),
      asset_name: picked.name,
      creator_name: picked.creatorName,
      source_query: picked.sourceQuery ?? query,
      toolbox_only: true,
      free_only: true,
      no_scripts: true,
      strip_scripts: true,
      allow_scripts: false,
      disable_procedural_fallback: true,
      ground_snap: true,
      anchor: true,
      ...(singleAssetOnly ? {
        single_asset_only: true,
        extract_single: false,
        preserve_hierarchy: true,
        exact_quantity: 1,
        max_children: 1000,
        max_scripts: 0,
        reject_pack_names: true,
        stop_after_insert: true,
        clean_name: name,
      } : {}),
    },
  });
}

async function buildToolboxCandidateBlock(prompt: string, singleAssetOnly: boolean) {
  if (!explicitToolboxAssetRequest(prompt) && !singleAssetOnly) return "";
  try {
    const query = toolboxSearchQuery(prompt);
    const found = await searchRobloxToolbox(query, "Model", 6, { singleAssetOnly });
    if (found.results.length === 0) return `\n\nVERIFIED TOOLBOX SEARCH: No safe public Creator Store model was found for "${query}". Do not invent an asset id.`;
    const rows = found.results.slice(0, 5).map((r, i) => {
      const fallbacks = (r.fallbackIds ?? []).slice(0, 3).join(", ");
      return `${i + 1}. ${r.name} — asset_id ${r.id}${fallbacks ? `; fallback_ids ${fallbacks}` : ""}; creator ${r.creatorName || "unknown"}; query "${r.sourceQuery ?? query}"`;
    }).join("\n");
    return `\n\nVERIFIED TOOLBOX SEARCH RESULTS (use these exact numeric IDs for insert_asset; never invent IDs):\n${rows}`;
  } catch {
    return "";
  }
}



function agentSystemPrompt(agent: AgentName): string {
  const base = `You are a specialist agent inside the BloxSmith multi-agent Roblox Studio pipeline. Output rules:\n- Be terse. 1–3 short paragraphs of plan, then the action block.\n- Emit EXACTLY ONE fenced \`\`\`bloxsmith-actions block containing a JSON array of actions for YOUR specialty only.\n- Supported kinds include: insert_asset, run_lua, script, localscript, modulescript, screengui, remoteevent, remotefunction, part, terrain, setting, organize_project, autofix_project, scan_project, playtest, snapshot.\n- STRONGLY PREFER script / localscript / modulescript over run_lua. Reserve run_lua for one-off Studio edits that must run at build time (terrain sculpting, Lighting property tweaks, quick placement). Never ship gameplay logic through run_lua — it runs once and disappears.\n- Every insert_asset must include a real numeric asset_id AND 2-3 fallback_ids. Never invent asset IDs — only use IDs that came from a toolbox search result in this session. If you don't have verified IDs, emit part/model/run_lua instead.\n- All Luau must compile: modern task.* APIs, :Connect with capital C, pcall around DataStore/HttpService/MarketplaceService/TeleportService, guard :FindFirstChild before indexing. Never call Lighting:GetEffect or Workspace:GetPart — those don't exist and crash with "attempt to call a nil value".\n- Never emit empty folders, TODOs, placeholders, or fake assets.\n- Reference existing instances from the scene digest by exact path — never duplicate them.\n- Think out loud BEFORE the action block — your reasoning is streamed live to the user. Narrate decisions in the present tense ("Designing combat as melee-only because…"). Keep it readable, not a wall of text.\n`;
  switch (agent) {
    case "planner":
      return `You are the PLANNER agent, running on an extended-reasoning model. You do NOT emit bloxsmith-actions. Your job: read the request, the existing scene, project lore, and any prior critique, then output a tight build graph the other agents will follow.\n\nThink out loud BEFORE the final plan — narrate tradeoffs ("Choosing wave-based survival over open-world because the scene has no terrain yet…"). Your reasoning is streamed live.\n\nSCOPE / QUANTITY DETECTION (CRITICAL): before writing the plan, parse the request for explicit quantity words (\"1\", \"one\", \"single\", \"just\", \"only\", \"a\", \"an\") and for single-asset nouns (house, car, tree, sword, gun, NPC, chair, lamp, sign, gate, rock, boat, plane, pet, prop). If the request is a single-asset insert (e.g. \"add a house\", \"1 car\", \"just one tree\"), the plan MUST be: World Builder = ONE insert_asset for the single best safe FREE authorized Toolbox model in that exact category (with 2-3 fallback_ids), placed near spawn, clean-named, NO kit-unpacking, NO furniture, NO signs, NO lights, NO terrain, NO duplicates; Scripter = none; UI Designer = none; QA = none; acceptance = \"one <noun> visible at spawn\". Do NOT expand a single-asset request into a system, map, or theme. Only plan a full multi-agent build when the user names a system (\"shop\", \"tycoon\", \"obby\", \"neighborhood\") or asks to complete an existing one.\n\nFinal plan format (markdown, max 240 words):\n1. **Goal** — 1 sentence.\n2. **World Builder tasks** — bullet list of map/terrain/lighting/Toolbox assets to insert.\n3. **Scripter tasks** — bullet list of scripts/remotes/datastores/gameplay loops.\n4. **UI Designer tasks** — bullet list of ScreenGuis/HUD/menus.\n5. **QA acceptance criteria** — bullet list of what "shipped" looks like.\n\nDo not include code or action JSON.`;
    case "world_builder":
      return `${base}\nYou are the WORLD BUILDER. Your slice: terrain, lighting, sky, spawn locations, environment props, map layout, and inserting safe Toolbox model assets. Use insert_asset for real visual content when an asset id is known, otherwise use run_lua for terrain/lighting/placement. Do NOT write gameplay scripts or UI. End with an organize_project action grouping your additions into a clearly named folder.\n\nSINGLE-ASSET RULE (CRITICAL): if the Planner's plan or user request is for ONE item (\"a house\", \"1 car\", \"single tree\", \"just one X\"), emit EXACTLY one insert_asset action — the single best safe FREE authorized Toolbox match for that exact noun, with 2-3 fallback_ids of equally safe alternatives. Place it once, ground-snapped, near spawn, with a clean Name matching the noun (e.g. \"House\"). Do NOT also insert furniture, signs, streetlights, fences, roads, terrain, decorations, NPCs, props, additional houses, or any \"kit contents\". Do NOT unpack a model into its child parts. Do NOT chain multiple insert_asset calls to \"make it look better\". Skip the organize_project step for a single-asset insert — one model in Workspace is already organized. When in doubt, insert less.`;
    case "scripter":
      return `${base}\nYou are the SCRIPTER — a senior Roblox engineer who ships production-ready Luau. Your slice: ServerScripts, LocalScripts, ModuleScripts, RemoteEvents, RemoteFunctions, gameplay loops, and every system in the BloxSmith Script Library below. All Luau must be complete, runnable, and connected — no stubs, no TODOs. Wire every remote on both server and client. Do NOT build maps or UI (the UI Designer owns ScreenGuis).\n\nSCRIPT LIBRARY — you can build any of these on request. Use the canonical structure for the category:\n• Gameplay: Health, Stamina, Hunger, Mana, XP/Leveling, Skill Trees, Classes, Character Stats, Respawn, Checkpoints, Save/Load, Daily Rewards, Achievements.\n• Combat: Sword, Guns (raycast + FastCast pattern), Magic, Bow, Abilities, Hit Detection (server-authoritative with client prediction), Combos, Blocking, Dodge Roll, Boss AI, Damage Numbers, Status Effects.\n• Inventory: Inventory grid, Equipment slots, Hotbar, Item Pickup (ProximityPrompt), Drops, Consumables, Crafting recipes, Storage chests, Trading (2-side confirm).\n• Economy: Currency (leaderstats + DataStore), Shop, NPC Shops, Sell, Buy, Trade, Auction House, Loot Tables (weighted), Random Drops, Rewards.\n• NPCs: Dialogue trees, Patrol AI, Follow, Guards, Merchants, Quest NPCs, Friendly NPCs, Enemy AI (pathfinding), Boss AI (phase-based).\n• Quests: Main / Side / Daily / Objective tracking, Rewards, Dialogue, Cutscenes (TweenService camera).\n• Building: Placement, Grid, Rotation, Snapping, Deleting, Upgrading, Permissions.\n• Vehicles: Cars (VehicleSeat + constraints), Boats (buoyancy), Planes, Helicopters, Mounts, Drift, Nitro, Fuel.\n• Pets: Pet system, Egg Hatching (weighted), Levels, Abilities, Following (BodyPosition/AlignPosition), Pet Inventory.\n• World: Teleporters, Portals, Safe Zones (Region3/Zone+), Spawn Points, Region Detection, Weather, Day/Night (Lighting.ClockTime tween), Seasons.\n• Audio: Background Music, Ambient, Footsteps, Combat, UI, Zone Music (SoundGroups).\n• Effects: Particles (ParticleEmitter), Trails, Tween Animations, Camera Shake, Screen Effects, Explosions.\n• Mobile: UserInputService.TouchEnabled detection, on-screen buttons, auto-scale, responsive UI, gestures.\n• Multiplayer: Matchmaking, Teams, Party, Guilds, Friends, Chat filters, Voice-ready architecture.\n• Security: Remote validation, Anti-exploit (server-authoritative), Rate limiting per player, Data validation (type + range), Secure Remotes (never trust client), Permission checks.\n• Data: DataStore + ProfileService-style pattern (session lock, retry, versioned schema, deep-copy on load), Auto Save (task.delay loop), Backup Save, Inventory Save, Settings Save.\n• Admin: Commands (:kick :ban :announce :give), Moderation, Player Management, Announcements, Kick/Ban (DataStore ban list), Logs.\n\nGENRE AWARENESS: when the request names a genre (RPG, MMORPG, Simulator, Tycoon, Obby, Horror, Survival, FPS, Battle Royale, Tower Defense, Dungeon Crawler, City Builder, Farming, Fishing, Racing, Sandbox, Roleplay, Incremental/Idle), assemble the systems that genre actually needs — don't ship an obby with a crafting bench or a tycoon with a battle-royale zone.\n\nARCHITECTURE STANDARDS (every script must follow):\n1. Modular — put shared logic in ModuleScripts under ReplicatedStorage (client-safe) or ServerStorage/ServerScriptService (server-only). No 2000-line god scripts.\n2. Server-authoritative — the client REQUESTS via RemoteEvent, the server VALIDATES (rate limit + range + ownership + cooldown) and mutates state. Never trust the client for damage, currency, position, or inventory writes.\n3. Modern Luau — task.wait / task.spawn / task.delay (never wait/spawn/delay). :Connect (capital C). typeof() over type() for Instances. String interpolation \`\`\`\`\`{var}\`\`\`\` for Luau. type annotations on ModuleScript public APIs.\n4. Runtime safety — guard :FindFirstChild with \`if inst then\`. pcall every DataStore/HttpService/MarketplaceService/TeleportService call with retry (3 attempts, exponential backoff). Only call documented APIs (Lighting has no :GetEffect / :GetChildrenOfClass — use :GetChildren() + ClassName filter or :FindFirstChildOfClass).\n5. Naming — PascalCase for Instances, camelCase for locals, SCREAMING_CASE for constants, verb-first for functions (giveCoins, takeDamage). No "Script" "Script1" "LocalScript2".\n6. Organization — group by feature under ReplicatedStorage/Shared, ServerScriptService/Server/<Feature>/, StarterPlayerScripts/Client/<Feature>/. Every remote lives in ReplicatedStorage/Remotes/<Feature>/ with a clear name.\n7. Performance — no while true do task.wait() polling loops when RunService.Heartbeat / .PostSimulation or an event will do. Cache service lookups at module top. Use Region3 / OverlapParams / RaycastParams (never GetChildren + magnitude scans every frame).\n8. Mobile-aware — when a system exposes input, detect UserInputService.TouchEnabled and provide an on-screen equivalent (button, ContextActionService with CreateTouchButton=true).\n9. Integration first — before adding a new leaderstats/DataStore/Remotes folder, check the scene digest for an existing one and EXTEND it. Never replace working systems.\n10. Every ModuleScript returns a table with a documented public API and no side effects at require time.\n\nRuntime safety anti-patterns (violating any of these causes "attempt to call a nil value" / "attempt to index nil"):\n- Never shadow a service or function with a local of the same name (\`local Lighting = ...\` then later \`Lighting(...)\`).\n- Connect events with \`:Connect(fn)\` — \`:connect\` is removed.\n- Workspace has no :GetPart. Lighting has no :GetEffect.\n- pcall any external service call.`;
    case "ui_designer":
      return `${base}\nYou are the UI DESIGNER. Your slice: ScreenGuis (main menu, HUD, shop, inventory, settings, quest UI, loading screen, notifications, mobile controls). Build PREMIUM production-ready Roblox UI — never plain gray boxes, never placeholder colors, never tiny unreadable text, never misaligned or overlapping frames.\n\nPREMIUM QUALITY BAR (every ScreenGui must meet ALL of these):\n1. Root frame uses scale-based UDim2 (e.g. UDim2.fromScale(0.4, 0.5)) so it scales on phone/tablet/desktop. Add UIAspectRatioConstraint for panels that must keep a shape.\n2. Rounded corners on every panel and button — UICorner with CornerRadius = UDim.new(0, 12) for panels, UDim.new(0, 8) for buttons.\n3. Subtle border — UIStroke Thickness=1.5, Color = a slightly lighter shade of the panel bg, Transparency=0.4.\n4. Depth — UIGradient on the panel bg (top-to-bottom, from a lighter to slightly darker shade of the base color) OR a subtle drop-shadow ImageLabel behind it.\n5. Consistent modern dark palette by default: panel bg Color3.fromRGB(24, 26, 34), inner surface (36, 40, 52), accent (94, 129, 244) or (255, 105, 180), success (72, 199, 142), danger (232, 90, 90), text primary (240, 242, 248), text muted (168, 175, 195). Only deviate when the user asks for a specific theme (cartoon, neon, retro).\n6. Typography — TitleLabel Font=Enum.Font.GothamBold TextSize>=22; BodyLabel Font=Enum.Font.Gotham TextSize>=16; ButtonLabel Font=Enum.Font.GothamMedium TextSize>=18. TextScaled=false unless the label is inside a fixed-size shrink target — then use TextScaled=true + TextWrapped=true + a UITextSizeConstraint MaxTextSize=28 MinTextSize=12. TextColor always high-contrast against the bg it sits on.\n7. Spacing — every list/grid uses UIListLayout or UIGridLayout with Padding = UDim.new(0, 10) and SortOrder=Enum.SortOrder.LayoutOrder. Every panel has UIPadding PaddingTop/Bottom/Left/Right = UDim.new(0, 16).\n8. Mobile-safe — every TextButton/ImageButton is at least 44x44 px effective size; on phone the whole ScreenGui.IgnoreGuiInset=true and the panel anchors with AnchorPoint=Vector2.new(0.5,0.5) Position=UDim2.fromScale(0.5,0.5).\n9. Hover / press feedback — LocalScript that on MouseEnter tweens BackgroundColor3 to accent-lightened and Size *1.03 (150ms Quad Out), on MouseLeave tweens back, on Activated flashes to accent then back (100ms). Every button must have this — no dead buttons.\n10. Open/close animation — the root frame tweens Size from UDim2.fromScale(0,0) to its target size with BackEasing Out 300ms on open, and reverses on close. Use TweenService, never wait+step manually.\n11. Organized Explorer hierarchy — ScreenGui named exactly (MainMenu, ShopUI, InventoryUI, SettingsMenu, QuestUI, HealthBar, CurrencyUI, LoadingScreen, MobileControls, AdminPanel, GamepassShop). Under it: 'Root' Frame → 'Header' / 'Body' / 'Footer' children with descriptive names. No 'Frame' 'Frame1' 'Frame2'. ResetOnSpawn=false for menus/HUD.\n12. Wire every button — every TextButton.Activated connects to something real: fire a RemoteEvent the Scripter created, toggle a sibling frame's Visible, or print a labeled action. Never leave a button with no handler.\n\nUse the 'screengui' action for the shell + hierarchy, and one 'localscript' action per ScreenGui for the hover/press/open/close/wire logic. Prefer explicit Instance.new(...) + property assignment in run_lua/localscript over vague descriptions. Build ONLY the GUI the user asked for — do NOT also add other ScreenGuis, gameplay scripts, maps, NPCs, or systems. If the request is narrow (one button, one label), still meet the quality bar for that single element (rounded corners, padding, hover, correct font/size, high-contrast text) but do not add unrelated UI.`;

    case "qa":
      return `${base}\nYou are the QA agent. Your slice: queue a playtest action plus a scan_project + autofix_project pass. Optionally insert one run_lua "smoke test" that prints PASS/FAIL lines for the acceptance criteria the Planner listed. Keep output small — 2–4 actions max.`;
    case "critic":
      return `You are the CRITIC agent — an LLM-as-judge. You do NOT emit bloxsmith-actions. You read the user's request, the Planner's plan, and a summary of every agent's output, then score the build.\n\nThink out loud BEFORE the verdict (it streams live to the user).\n\nFinal verdict format (strict, parsable):\n\n**SCORES**\n- matches_prompt: <1-10>\n- will_run: <1-10>\n- is_fun: <1-10>\n- overall: <1-10>\n\n**STRENGTHS** (1-3 bullets)\n**WEAKNESSES** (1-3 bullets)\n**REVISION** (only if overall < 7)\n- Concrete instructions for the Planner to use on a re-plan. Be specific: which agent missed what, what to add or cut.\n\nOverall < 7 means "ship-blocker — re-plan needed".`;
  }
}

function buildAgentPrompt(agent: AgentName, ctx: AgentContext, agentSummaries?: Record<string, string>): string {
  const sceneBlock = ctx.sceneDigest && ctx.sceneDigest !== "(no scene scan available yet)"
    ? `\n\nCURRENT STUDIO SCENE (real world model — do not duplicate or invent paths):\n${ctx.sceneDigest}`
    : "\n\nCURRENT STUDIO SCENE: empty workspace.";
  const planBlock = ctx.planSummary
    ? `\n\nPLAN FROM PLANNER (your single source of truth for what to build):\n${ctx.planSummary}`
    : "";
  const memBlock = ctx.memoryBlock ? `\n\n${ctx.memoryBlock}` : "";
  const kbBlock = ctx.knowledgeBlock ? `\n\n${ctx.knowledgeBlock}` : "";
  const toolboxBlock = ctx.toolboxBlock ? ctx.toolboxBlock : "";
  const critiqueBlock = ctx.critique
    ? `\n\nPRIOR CRITIQUE — the previous attempt scored too low. Address these issues in this re-plan:\n${ctx.critique}`
    : "";

  if (agent === "critic" && agentSummaries) {
    const summaries = Object.entries(agentSummaries)
      .map(([a, s]) => `### ${a.toUpperCase()}\n${s.slice(0, 800)}`)
      .join("\n\n");
    return `USER REQUEST: ${ctx.prompt}\n\nPROJECT: ${ctx.projectName} (${ctx.projectType})${memBlock}${sceneBlock}${planBlock}\n\nAGENT OUTPUT SUMMARIES:\n${summaries}\n\nNow score the build per the rubric.`;
  }

  const scopeBlock = ctx.narrowScope
    ? `\n\nSCOPE LOCK — the user asked for a NARROW single-item build (${ctx.narrowScope}). Emit ONLY the single specific thing requested and nothing else. No extra assets, scripts, GUIs, folders, systems, decorations, or "nice-to-haves". If you would normally add polish or supporting content, DO NOT. Ship exactly one item.`
    : "";
  return `USER REQUEST: ${ctx.prompt}\n\nPROJECT: ${ctx.projectName} (${ctx.projectType})${memBlock}${sceneBlock}${planBlock}${kbBlock}${toolboxBlock}${critiqueBlock}${scopeBlock}\n\nNow do YOUR slice as the ${agent.replace("_", " ").toUpperCase()} agent.`;
}

// runAgent: streams the model output and flushes partial transcripts to the
// DB every ~400ms so the UI sees live thinking. Returns the final parsed
// content + actions.
async function runAgent(
  agent: AgentName,
  ctx: AgentContext,
  onPartial: (partial: string) => void,
  agentSummaries?: Record<string, string>,
) {
  const fb = agent === "planner" ? getPlannerModel() : getFallbackModel();
  const result = streamText({
    model: fb.model,
    system: agentSystemPrompt(agent),
    prompt: buildAgentPrompt(agent, ctx, agentSummaries),
    ...(fb.modelSettings?.temperature !== undefined
      ? { temperature: fb.modelSettings.temperature }
      : { temperature: agent === "critic" ? 0.2 : 0.4 }),
    ...(fb.modelSettings?.topP !== undefined ? { topP: fb.modelSettings.topP } : {}),
    ...(fb.extraBody ? { providerOptions: { nvidia: fb.extraBody as Record<string, never> } as never } : {}),
    maxOutputTokens: agent === "planner" ? 360 : agent === "critic" ? 220 : agent === "scripter" || agent === "ui_designer" ? 3200 : 1800,
  });

  let full = "";
  let lastFlush = 0;
  for await (const chunk of result.textStream) {
    full += chunk;
    const now = Date.now();
    if (now - lastFlush > 400) {
      lastFlush = now;
      // Fire and forget — DB write must not block the stream.
      onPartial(full.slice(0, 1500));
    }
  }
  // Final flush.
  onPartial(full.slice(0, 1500));

  const parsed = parseActions(full);
  return {
    text: parsed.cleanContent.trim() || full.trim(),
    actions: parsed.actions.map(normalizePluginAction),
  };
}

// Extracts the "overall" score (1-10) from the Critic's verdict block.
function parseCriticScore(text: string): { overall: number; revision: string } {
  const overallMatch = text.match(/overall\s*[:\-]\s*(\d+(?:\.\d+)?)/i);
  const overall = overallMatch ? Math.max(0, Math.min(10, parseFloat(overallMatch[1]))) : 7;
  const revIdx = text.toLowerCase().indexOf("**revision**");
  const revision = revIdx >= 0 ? text.slice(revIdx).replace(/\*\*revision\*\*/i, "").trim() : "";
  return { overall, revision };
}

export const startAgentPipeline = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => StartInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // ── Validate project exists and belongs to caller (RLS enforces ownership) ──
    let project: { id: string; name: string | null; game_type: string | null } | null = null;
    try {
      const { data: row, error: projErr } = await supabase
        .from("projects")
        .select("id, name, game_type")
        .eq("id", data.projectId)
        .maybeSingle();
      if (projErr) throw new Error(projErr.message);
      project = row;
    } catch (e) {
      throw new Error(`Couldn't load this project. ${e instanceof Error ? e.message : ""}`.trim());
    }
    if (!project) {
      throw new Error("Project not found — it may have been deleted or you don't have access.");
    }

    // ── Create the pipeline run ──
    let pipelineId: string;
    try {
      const { data: pipeline, error: pipeErr } = await supabase
        .from("agent_pipeline_runs")
        .insert({
          project_id: data.projectId,
          user_id: userId,
          prompt: data.prompt,
          status: "running",
        })
        .select("id")
        .single();
      if (pipeErr || !pipeline) throw new Error(pipeErr?.message ?? "insert returned no row");
      pipelineId = pipeline.id as string;
    } catch (e) {
      throw new Error(`Couldn't start a pipeline run. ${e instanceof Error ? e.message : ""}`.trim());
    }

    const seedRows = AGENTS.map((agent, i) => ({
      pipeline_id: pipelineId,
      user_id: userId,
      agent,
      status: "pending",
      position: i,
    }));
    // Best-effort: if seeding the agent rows fails, the pipeline still runs;
    // the UI just won't show pending placeholders. Log and continue.
    try {
      const { error: seedErr } = await supabase.from("agent_runs").insert(seedRows);
      if (seedErr) console.error("agent_runs seed failed:", seedErr.message);
    } catch (e) {
      console.error("agent_runs seed threw:", e);
    }

    const [{ data: session }, { data: memories }] = await Promise.all([
      supabase
        .from("plugin_sessions")
        .select("last_scan")
        .eq("user_id", userId)
        .maybeSingle(),
      supabase
        .from("project_memory")
        .select("key, value, kind, importance")
        .eq("project_id", data.projectId)
        .order("importance", { ascending: false })
        .limit(20),
    ]);

    const digest = summarizeSceneScan(session?.last_scan ?? null);
    const memBlock = memories && memories.length > 0
      ? `PROJECT LORE (do not contradict):\n${memories.map((m) => `• [${m.kind}] ${m.key}: ${String(m.value).slice(0, 200)}`).join("\n")}`
      : "";

    const narrowScope: NarrowScope = detectNarrowScopeIntent(data.prompt);
    const singleAssetPipeline = narrowScope === "single_asset";
    const narrowPipeline = narrowScope !== null;
    const toolboxRequested = explicitToolboxAssetRequest(data.prompt);
    const ctx: AgentContext = {
      prompt: data.prompt,
      projectName: project.name ?? "Project",
      projectType: project.game_type ?? "Roblox game",
      sceneDigest: digest.text,
      memoryBlock: memBlock,
      planSummary: "",
      toolboxBlock: await buildToolboxCandidateBlock(data.prompt, singleAssetPipeline || toolboxRequested),
      narrowScope,
    };

    const markAgent = async (
      agent: AgentName,
      patch: Partial<{ status: string; summary: string; actions_count: number; started_at: string; completed_at: string }>,
    ) => {
      await supabase
        .from("agent_runs")
        .update(patch)
        .eq("pipeline_id", pipelineId)
        .eq("agent", agent);
    };

    // Streaming partial-writer for an agent. Fires DB updates but never throws
    // into the stream loop.
    const partialWriter = (agent: AgentName) => (partial: string) => {
      void supabase
        .from("agent_runs")
        .update({ summary: partial })
        .eq("pipeline_id", pipelineId)
        .eq("agent", agent)
        .then(() => undefined, () => undefined);
    };

    const allActions: ReturnType<typeof normalizePluginAction>[] = [];
    const summaries: Record<string, string> = {};

    // ── 1. Planner ──
    try {
      await markAgent("planner", { status: "running", started_at: new Date().toISOString() });
      const result = await runAgent("planner", ctx, partialWriter("planner"));
      ctx.planSummary = result.text;
      summaries.planner = result.text;
      await markAgent("planner", {
        status: "done",
        summary: result.text.slice(0, 1500),
        actions_count: 0,
        completed_at: new Date().toISOString(),
      });
    } catch (e) {
      await markAgent("planner", {
        status: "failed",
        summary: e instanceof Error ? e.message : "planner failed",
        completed_at: new Date().toISOString(),
      });
      await supabase
        .from("agent_pipeline_runs")
        .update({
          status: "failed",
          error_message: e instanceof Error ? e.message : "planner failed",
          completed_at: new Date().toISOString(),
        })
        .eq("id", pipelineId);
      return { pipelineId, ok: false };
    }

    // Inner helper: run the middle 3 + QA. Used both for the first pass and
    // the re-plan pass if the critic scores it too low.
    const runMiddleAndQA = async () => {
      // Narrow scope: pick exactly ONE specialist. Never expand across specialties.
      let middle: AgentName[];
      if (narrowScope === "single_asset") middle = ["world_builder"];
      else if (narrowScope === "single_script") middle = ["scripter"];
      else if (narrowScope === "single_ui") middle = ["ui_designer"];
      else middle = ["world_builder", "scripter", "ui_designer"];

      const retrievalQuery = `${data.prompt}\n\n${ctx.planSummary}`;
      const [kbWorld, kbScripter, kbUi] = await Promise.all([
        middle.includes("world_builder") ? retrieveKnowledge(supabase, "world_builder", retrievalQuery, 2) : Promise.resolve(""),
        middle.includes("scripter") ? retrieveKnowledge(supabase, "scripter", retrievalQuery, 3) : Promise.resolve(""),
        middle.includes("ui_designer") ? retrieveKnowledge(supabase, "ui_designer", retrievalQuery, 2) : Promise.resolve(""),
      ]);
      const kbByAgent: Record<string, string> = {
        world_builder: kbWorld,
        scripter: kbScripter,
        ui_designer: kbUi,
      };
      await Promise.all(
        middle.map(async (agent) => {
          try {
            await markAgent(agent, { status: "running", started_at: new Date().toISOString() });
            const agentCtx: AgentContext = { ...ctx, knowledgeBlock: kbByAgent[agent] };
            const result = await runAgent(agent, agentCtx, partialWriter(agent));
            allActions.push(...result.actions);
            summaries[agent] = result.text;
            await markAgent(agent, {
              status: "done",
              summary: result.text.slice(0, 1200),
              actions_count: result.actions.length,
              completed_at: new Date().toISOString(),
            });
          } catch (e) {
            await markAgent(agent, {
              status: "failed",
              summary: e instanceof Error ? e.message : `${agent} failed`,
              completed_at: new Date().toISOString(),
            });
          }
        }),
      );

      if (narrowPipeline) {
        const skipReason = narrowScope === "single_asset"
          ? "Skipped: single-asset request — one insert only, no scripts/UI/QA."
          : narrowScope === "single_script"
          ? "Skipped: single-script request — one script only, no assets/UI/QA."
          : "Skipped: single-UI request — one UI element only, no assets/scripts/QA.";
        const skipAgents = (["world_builder", "scripter", "ui_designer", "qa"] as AgentName[]).filter(
          (a) => !middle.includes(a),
        );
        await Promise.all(skipAgents.map((agent) =>
          markAgent(agent, {
            status: "done",
            summary: skipReason,
            actions_count: 0,
            completed_at: new Date().toISOString(),
          }),
        ));
        for (const a of skipAgents) summaries[a] = skipReason;
        summaries.qa = skipReason;
        await markAgent("qa", {
          status: "done",
          summary: skipReason,
          actions_count: 0,
          completed_at: new Date().toISOString(),
        });
        return;
      }


      try {
        await markAgent("qa", { status: "running", started_at: new Date().toISOString() });
        const result = await runAgent("qa", ctx, partialWriter("qa"));
        allActions.push(...result.actions);
        summaries.qa = result.text;
        await markAgent("qa", {
          status: "done",
          summary: result.text.slice(0, 1200),
          actions_count: result.actions.length,
          completed_at: new Date().toISOString(),
        });
      } catch (e) {
        await markAgent("qa", {
          status: "failed",
          summary: e instanceof Error ? e.message : "qa failed",
          completed_at: new Date().toISOString(),
        });
      }
    };

    // ── 2. First pass: Builder + Scripter + UI in parallel, then QA ──
    await runMiddleAndQA();

    // ── 3. Critic scores the build ── (skipped for narrow single-item requests)
    let criticScore = 10;
    if (narrowPipeline) {
      await markAgent("critic", {
        status: "done",
        summary: "Skipped: narrow single-item request — no critic/re-plan needed.",
        actions_count: 0,
        completed_at: new Date().toISOString(),
      });
    } else {
    try {
      await markAgent("critic", { status: "running", started_at: new Date().toISOString() });
      const result = await runAgent("critic", ctx, partialWriter("critic"), summaries);
      const parsed = parseCriticScore(result.text);
      criticScore = parsed.overall;
      await markAgent("critic", {
        status: "done",
        summary: `Score ${parsed.overall}/10\n\n${result.text.slice(0, 1300)}`,
        actions_count: 0,
        completed_at: new Date().toISOString(),
      });

      // ── 4. Auto re-plan loop (one shot) if score is too low ──
      if (parsed.overall < 7 && parsed.revision) {
        ctx.critique = parsed.revision;

        // Reset middle + QA agents to pending so the UI shows them re-running.
        await supabase
          .from("agent_runs")
          .update({ status: "pending", summary: null, actions_count: 0, started_at: null, completed_at: null })
          .eq("pipeline_id", pipelineId)
          .in("agent", ["world_builder", "scripter", "ui_designer", "qa"]);

        // Re-run planner with the critique baked in.
        await markAgent("planner", { status: "running", summary: "Re-planning with critic feedback…" });
        const replan = await runAgent("planner", ctx, partialWriter("planner"));
        ctx.planSummary = replan.text;
        summaries.planner = replan.text;
        await markAgent("planner", {
          status: "done",
          summary: `🔁 Re-plan\n\n${replan.text.slice(0, 1400)}`,
          completed_at: new Date().toISOString(),
        });

        // Clear old action collection and re-run middle + QA fresh.
        allActions.length = 0;
        await runMiddleAndQA();
      }
    } catch (e) {
      await markAgent("critic", {
        status: "failed",
        summary: e instanceof Error ? e.message : "critic failed",
        completed_at: new Date().toISOString(),
      });
    }
    }


    // ── 5. Queue all collected actions for the Studio plugin ──
    //    Always append a final `playtest` action tagged with this pipeline_id.
    //    When the plugin posts findings back to /api/public/plugin/playtest/report,
    //    the report endpoint links the report to this pipeline and either marks
    //    it `clean` or `report_ready`, which the UI uses to auto-trigger a
    //    repair pass (runPipelineRepair) — closing the build → verify → fix loop.
    if (singleAssetPipeline) {
      const cleanName = singleAssetName(data.prompt);
      let firstInsert = allActions.find((a) => a.kind === "insert_asset");
      if (!firstInsert) {
        firstInsert = await buildVerifiedToolboxInsert(data.prompt, true);
      }
      allActions.length = 0;
      if (firstInsert) {
        allActions.push({
          ...firstInsert,
          parent_path: "Workspace",
          name: cleanName,
          payload: {
            ...(firstInsert.payload ?? {}),
            toolbox_only: true,
            free_only: true,
            no_scripts: true,
            strip_scripts: true,
            allow_scripts: false,
            disable_procedural_fallback: true,
            single_asset_only: true,
            extract_single: false,
            preserve_hierarchy: true,
            exact_quantity: 1,
            max_children: 1000,
            max_scripts: 0,
            reject_pack_names: true,
            stop_after_insert: true,
            ground_snap: true,
            anchor: true,
            clean_name: cleanName,
          },
        });
      }
    } else if (toolboxRequested && !allActions.some((a) => a.kind === "insert_asset")) {
      const insert = await buildVerifiedToolboxInsert(data.prompt, true);
      if (insert) allActions.unshift(insert);
    }

    const hasPlaytest = allActions.some((a) => a.kind === "playtest");
    if (!narrowPipeline && !hasPlaytest) {
      allActions.push({
        kind: "playtest",
        parent_path: "Workspace",
        name: "BloxSmith_AutoVerify",
        payload: { reason: "auto_verify_after_build" },
      });
    }

    // ── 5a. Authorize every insert_asset before queuing ──
    // The LLM sometimes hallucinates asset IDs, or picks an asset the creator
    // later privated. Validate against the Roblox toolbox details API, drop any
    // unauthorized/private IDs, and if the primary is bad but a fallback is
    // valid, promote it. If NOTHING remains valid, replace the primary with a
    // fresh live-search pick keyed off source_query so the build never queues
    // a doomed insert. When a fresh pick isn't available, drop the action and
    // log a warning instead of failing the whole build.
    await sanitizeInsertAssetActions(allActions);

    const withMeta = allActions.map((a, i) => ({
      project_id: data.projectId,
      user_id: userId,
      kind: a.kind,
      parent_path: a.parent_path,
      name: a.name,
      payload: {
        ...(a.payload ?? {}),
        _bloxsmith: {
          execution_mode: "fast",
          structured: true,
          multi_agent: true,
          pipeline_id: pipelineId,
          critic_score: criticScore,
        },
      },
      position: i,
    }));

    if (withMeta.length > 0) {
      await supabase.from("plugin_actions").insert(withMeta);
    }

    await supabase
      .from("agent_pipeline_runs")
      .update({
        status: "done",
        total_actions: withMeta.length,
        verification_status: "awaiting",
        completed_at: new Date().toISOString(),
      })
      .eq("id", pipelineId);

    return { pipelineId, ok: true, totalActions: withMeta.length, criticScore };
  });

// ============================================================================
// runPipelineRepair — second pass triggered by the playtest report.
// Loads the linked playtest_report, distills critical/high findings into a
// repair brief, and runs the Scripter agent (the catch-all fixer) with those
// findings as critique. Queues the resulting fix actions back to the plugin.
// ============================================================================
const RepairInput = z.object({ pipelineId: z.string().uuid() });

export const runPipelineRepair = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => RepairInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: pipeline, error: pipeErr } = await supabase
      .from("agent_pipeline_runs")
      .select("id, project_id, prompt, verification_status, latest_report_id")
      .eq("id", data.pipelineId)
      .eq("user_id", userId)
      .maybeSingle();
    if (pipeErr || !pipeline) throw new Error("Pipeline not found.");
    if (pipeline.verification_status === "repairing" || pipeline.verification_status === "repaired") {
      return { ok: true as const, skipped: true, reason: "already_repaired", fixesQueued: 0 };
    }
    if (!pipeline.latest_report_id) {
      return { ok: true as const, skipped: true, reason: "no_report", fixesQueued: 0 };
    }

    // Mark repairing so the UI stops re-triggering.
    await supabase
      .from("agent_pipeline_runs")
      .update({ verification_status: "repairing" })
      .eq("id", pipeline.id);

    const { data: report } = await supabase
      .from("playtest_reports")
      .select("findings, summary")
      .eq("id", pipeline.latest_report_id)
      .maybeSingle();

    type Finding = { severity?: string; category?: string; title?: string; detail?: string; path?: string; suggested_fix?: string };
    const findings = (Array.isArray(report?.findings) ? (report!.findings as Finding[]) : [])
      .filter((f) => f.severity === "critical" || f.severity === "high");

    if (findings.length === 0) {
      await supabase
        .from("agent_pipeline_runs")
        .update({ verification_status: "repaired", repair_actions_count: 0 })
        .eq("id", pipeline.id);
      return { ok: true as const, skipped: true, reason: "no_blockers", fixesQueued: 0 };
    }

    const critique = findings
      .slice(0, 12)
      .map((f, i) => `${i + 1}. [${f.severity?.toUpperCase()}] ${f.title ?? "issue"} — ${f.detail ?? ""}${f.path ? ` (at ${f.path})` : ""}${f.suggested_fix ? ` · fix: ${f.suggested_fix}` : ""}`)
      .join("\n");

    // Load project context for the repair agent.
    const { data: project } = await supabase
      .from("projects")
      .select("name, game_type")
      .eq("id", pipeline.project_id)
      .maybeSingle();
    const { data: session } = await supabase
      .from("plugin_sessions")
      .select("last_scan")
      .eq("user_id", userId)
      .maybeSingle();
    const digest = summarizeSceneScan(session?.last_scan ?? null);

    const repairCtx: AgentContext = {
      prompt: pipeline.prompt,
      projectName: project?.name ?? "Project",
      projectType: project?.game_type ?? "Roblox game",
      sceneDigest: digest.text,
      memoryBlock: "",
      planSummary: `AUTO-REPAIR PASS — the previous build was executed in Studio and a playtest audit found ${findings.length} blocking issue(s). Fix every one of them. Do not rebuild anything that is already working.`,
      critique,
      knowledgeBlock: await retrieveKnowledge(supabase, "scripter", critique, 4),
    };

    const result = await runAgent("scripter", repairCtx, () => undefined);

    const repairActions = result.actions.map((a, i) => ({
      project_id: pipeline.project_id,
      user_id: userId,
      kind: a.kind,
      parent_path: a.parent_path,
      name: a.name,
      payload: {
        ...(a.payload ?? {}),
        _bloxsmith: {
          execution_mode: "fast",
          structured: true,
          multi_agent: true,
          pipeline_id: pipeline.id,
          repair_pass: true,
        },
      },
      position: i,
    }));

    if (repairActions.length > 0) {
      await supabase.from("plugin_actions").insert(repairActions);
    }

    await supabase
      .from("agent_pipeline_runs")
      .update({
        verification_status: "repaired",
        repair_actions_count: repairActions.length,
      })
      .eq("id", pipeline.id);

    return { ok: true as const, skipped: false, fixesQueued: repairActions.length, blockerCount: findings.length };
  });

// queueManualPlaytest — user-triggered "Test now" button. Enqueues a single
// playtest action on the plugin so it audits the current place and posts a
// fresh report. If a pipeline id is given, the report links back to it.
const ManualPlaytestInput = z.object({
  projectId: z.string().uuid(),
  pipelineId: z.string().uuid().optional(),
});
export const queueManualPlaytest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => ManualPlaytestInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    if (data.pipelineId) {
      await supabase
        .from("agent_pipeline_runs")
        .update({ verification_status: "awaiting" })
        .eq("id", data.pipelineId)
        .eq("user_id", userId);
    }
    const { error } = await supabase.from("plugin_actions").insert({
      project_id: data.projectId,
      user_id: userId,
      kind: "playtest",
      parent_path: "Workspace",
      name: "BloxSmith_ManualTest",
      payload: {
        reason: "manual_test_now",
        _bloxsmith: {
          execution_mode: "fast",
          structured: true,
          pipeline_id: data.pipelineId ?? null,
          manual: true,
        },
      },
      position: 0,
    });
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

export const listAgentPipelines = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => ListInput.parse(input))
  .handler(async ({ data, context }) => {
    const { data: pipelines, error } = await context.supabase
      .from("agent_pipeline_runs")
      .select("id, prompt, status, total_actions, error_message, created_at, completed_at, verification_status, latest_report_id, repair_actions_count")
      .eq("project_id", data.projectId)
      .order("created_at", { ascending: false })
      .limit(data.limit ?? 5);
    if (error) throw new Error(error.message);
    if (!pipelines || pipelines.length === 0) return { pipelines: [] };

    const { data: agents } = await context.supabase
      .from("agent_runs")
      .select("pipeline_id, agent, status, summary, actions_count, position, started_at, completed_at")
      .in("pipeline_id", pipelines.map((p) => p.id))
      .order("position", { ascending: true });

    const byPipeline = new Map<string, typeof agents>();
    for (const a of agents ?? []) {
      const arr = byPipeline.get(a.pipeline_id) ?? [];
      arr.push(a);
      byPipeline.set(a.pipeline_id, arr);
    }

    return {
      pipelines: pipelines.map((p) => ({
        ...p,
        agents: byPipeline.get(p.id) ?? [],
      })),
    };
  });

export const getAgentPipeline = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => GetInput.parse(input))
  .handler(async ({ data, context }) => {
    const { data: pipeline, error } = await context.supabase
      .from("agent_pipeline_runs")
      .select("id, project_id, prompt, status, total_actions, error_message, created_at, completed_at")
      .eq("id", data.pipelineId)
      .maybeSingle();
    if (error || !pipeline) throw new Error("Pipeline not found");

    const { data: agents } = await context.supabase
      .from("agent_runs")
      .select("agent, status, summary, actions_count, position, started_at, completed_at")
      .eq("pipeline_id", data.pipelineId)
      .order("position", { ascending: true });

    return { pipeline, agents: agents ?? [] };
  });
