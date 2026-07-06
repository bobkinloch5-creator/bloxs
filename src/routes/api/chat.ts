import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { convertToModelMessages, generateText, streamText, stepCountIs, tool, type ToolSet, type UIMessage } from "ai";
import { z } from "zod";
import { getProviderModel, getFallbackModel, getFallbackChain } from "@/lib/ai-gateway.server";
import { parseActions } from "@/lib/bloxsmith-prompt";
import { DEFAULT_MODEL_ID, findModel, isSelectable } from "@/lib/models";
import { detectSingleAssetIntent, searchRobloxToolbox, searchRobloxToolboxSet, sanitizeInsertAssetActions, type ToolboxCategory, type ToolboxSetRequest } from "@/lib/roblox-toolbox.server";
import { describeImageWithNvidiaPaliGemma } from "@/lib/nvidia-vision.server";
import { generateUiConceptImage } from "@/lib/ui-concept-image.server";
import { generateGeneralImage, isUiConceptRequest } from "@/lib/general-image.server";
import { normalizePluginAction } from "@/lib/plugin-actions";
import { stripCodeFences, validateLuau, type LuauIssue } from "@/lib/luau-validator";
import { summarizeSceneScan } from "@/lib/scene-digest.server";
import { searchRoblox, fetchDocPage } from "@/lib/roblox-research.server";
import { productionSystemsStudioActions, detectLuaTemplates } from "@/lib/lua-templates";
import { classifyIntent, renderIntentBlock } from "@/lib/intent-classifier.server";
import { rerankMemories } from "@/lib/semantic-memory";

function jsonError(message: string, status: number, code?: string) {
  return new Response(JSON.stringify({ error: message, code }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function streamPlainAssistantText(text: string, id = "plain-text-1") {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "start" })}\n\n`));
      controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "start-step" })}\n\n`));
      controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "text-start", id })}\n\n`));
      controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "text-delta", id, delta: text })}\n\n`));
      controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "text-end", id })}\n\n`));
      controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "finish-step" })}\n\n`));
      controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "finish" })}\n\n`));
      controller.enqueue(encoder.encode(`data: [DONE]\n\n`));
      controller.close();
    },
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "x-vercel-ai-ui-message-stream": "v1",
    },
  });
}

function streamAssistantImage(text: string, imageUrl: string, id = "image-text-1") {
  const encoder = new TextEncoder();
  const mediaType = imageUrl.match(/^data:([^;]+);/)?.[1] ?? "image/png";
  const stream = new ReadableStream({
    async start(controller) {
      controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "start" })}\n\n`));
      controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "start-step" })}\n\n`));
      controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "text-start", id })}\n\n`));
      controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "text-delta", id, delta: text })}\n\n`));
      controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "text-end", id })}\n\n`));
      controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "file", mediaType, url: imageUrl })}\n\n`));
      controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "finish-step" })}\n\n`));
      controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "finish" })}\n\n`));
      controller.enqueue(encoder.encode(`data: [DONE]\n\n`));
      controller.close();
    },
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "x-vercel-ai-ui-message-stream": "v1",
    },
  });
}

function luaBooleanTable(values: Record<string, boolean>) {
  const rows = Object.entries(values).map(([key, value]) => {
    const safeKey = key.replace(/[^a-zA-Z0-9_]/g, "_");
    return `  ${safeKey} = ${value ? "true" : "false"}`;
  });
  return `{\n${rows.join(",\n")}\n}`;
}

async function compileMissingStudioActions(params: {
  userText: string;
  assistantText: string;
  languageName: string;
  assetMode: "toolbox_only" | "both" | "procedural";
}) {
  const fb = getFallbackModel();
  const { text } = await generateText({
    model: fb.model,
    system:
      "You are the BloxSmith Studio action compiler. Convert Roblox build plans into executable BloxSmith actions only. " +
      "Return exactly one fenced ```bloxsmith-actions block containing valid JSON. Do not include prose outside the block.",
    prompt: `The previous assistant response was in Build Mode but did not include executable Studio actions, so Roblox Studio received nothing.

Convert the request and response below into a concise, safe, executable BloxSmith action list.

Rules:
- Output exactly one fenced block: \`\`\`bloxsmith-actions followed by a JSON array, then \`\`\`.
- Exact scope is mandatory: convert ONLY what the user literally asked for. Do not add main menus, loading screens, splash/title screens, HUDs, shops, inventories, settings panels, tutorials, music, camera effects, leaderstats, DataStores, managers, folders, organize/autofix/scan, or polish unless the user explicitly requested that exact item. Minimal required wiring is NOT extra scope: if a named button/keybind/gameplay feature needs a RemoteEvent, LocalScript, and server Script to function, create those dependencies and connect both sides.
- For narrow requests like a speed boost, a button, or a script, emit only the minimum working script/UI element — typically 1 action, at most 3.
- Supported kinds: insert_asset, run_lua, script, localscript, modulescript, screengui, remoteevent, remotefunction, part, terrain, set_properties, rename, move, delete, setting, organize_project, autofix_project, scan_project.
- Prefer insert_asset only when an asset id is explicitly present in the plan. Include payload.asset_id and payload.fallback_ids when known.
- If Asset mode is procedural, do not emit insert_asset. Use run_lua/terrain/parts to generate original visible content in Studio.
- Use run_lua for placement, safe cleanup, scripting, UI wiring, lighting, spawns, collision fixes, batch deletes, and validation helpers.
- Any script, localscript, modulescript, or run_lua action MUST include payload.source with complete runnable Luau. A script action without source is invalid and must not be emitted.
- Do not emit delete actions unless the user explicitly asked to delete or clear something.
- If the user asks to erase/clear/wipe/delete everything except Baseplate, output exactly one run_lua action that deletes Workspace children except Baseplate, clears Terrain, clears StarterGui/StarterPack/StarterPlayer scripts/ReplicatedStorage/ServerScriptService/ServerStorage/Lighting/SoundService/Teams, then scan_project. Do not answer with manual instructions.
- Never produce empty folders, placeholders, TODOs, comments pretending work is done, or unsupported action kinds.
- End with autofix_project and scan_project only for broad/full-system builds. Do not add them for single script/button/stat-tweak requests.
- Language for player-facing UI strings: ${params.languageName}.
- Asset mode: ${params.assetMode}.

User request:
${params.userText.slice(0, 6000)}

Assistant response that needs executable actions:
${params.assistantText.slice(0, 12000)}`,
    ...(fb.extraBody ? { providerOptions: { nvidia: fb.extraBody as Record<string, never> } as never } : {}),
    ...(fb.modelSettings?.temperature !== undefined ? { temperature: fb.modelSettings.temperature } : { temperature: 0 }),
    ...(fb.modelSettings?.topP !== undefined ? { topP: fb.modelSettings.topP } : {}),
    maxOutputTokens: 2200,
  });

  return parseActions(text).actions;
}

function userExplicitlyRequestedToolbox(userText: string) {
  return /\b(toolbox|creator\s*store|marketplace|free\s+public\s+asset|public\s+asset|insert\s+asset|roblox\s+asset|asset\s*id|model\s*id|use\s+toolbox|from\s+toolbox)\b/i.test(userText);
}

function neutralizePrematureBuildSuccess(text: string) {
  return text
    .replace(/🎉\s*Done!?/gi, "📤 Executing in Studio")
    .replace(/\bSuccessfully\s+(?:added|created|built|inserted|generated)\b/gi, "Sent")
    .replace(/\b(?:Live|Ready)\s+(?:inside|in)\s+(?:your\s+)?Roblox\s+Studio\b/gi, "Executing in Roblox Studio")
    .replace(/\b(?:executed|completed)\s+(?:in|inside)\s+(?:Roblox\s+)?Studio\b/gi, "executing in Studio");
}

function stripImageFilePartsFromMessages(messages: UIMessage[]): UIMessage[] {
  return messages.map((m) => {
    const parts = (m.parts ?? []) as Array<Record<string, unknown>>;
    if (!parts.length) return m;
    const stripped = parts.map((p) =>
      p?.type === "file" && typeof (p as any).mediaType === "string" && ((p as any).mediaType as string).startsWith("image/")
        ? { type: "text", text: "[image attached — analyzed separately when image vision is available]" }
        : p,
    );
    return { ...m, parts: stripped } as typeof m;
  });
}

const FAST_CHAT_SYSTEM_PROMPT = `You are BloxSmith, a friendly senior Roblox developer helping users plan, improve, and troubleshoot Roblox games. Keep replies short, direct, and useful. Do not expose internal tools, JSON, model/provider names, credits, IDs, or debug details. In chat mode, do not emit executable action blocks unless the user explicitly asks to build/apply now. If a request requires changing Roblox Studio, tell them to switch to Build Mode and resend.`;

const FAST_BUILD_SYSTEM_PROMPT = `You are BloxSmith, an expert Roblox Studio game-building agent. Build real, playable Roblox results through structured Studio actions. Keep visible prose concise and human. Never expose internal tool names, raw payloads, debug details, model/provider names, or JSON except the hidden executable action block. Use modern Luau, server-authoritative gameplay, safe free Toolbox assets when Toolbox mode is active, clean organization, mobile-safe UI, no placeholders, no fake buttons, no empty folders, no invented asset IDs, and no deprecated APIs.

EXACT-SCOPE LAW (applies ONLY to narrow single-item asks): Create ONLY the files/instances/systems the user explicitly names. Do not add main menus, loading screens, splash/title screens, HUDs, shops, inventories, settings panels, tutorials, music, camera effects, ModuleScripts, leaderstats, DataStores, managers, folders, or extra polish unless the current user message asks for that exact thing. Minimal wiring dependencies are mandatory, not optional: if the named feature is a button, keybind, tool, or player ability, create the LocalScript, RemoteEvent/RemoteFunction when needed, and server Script required for it to actually work.

FULL-SOLUTION OVERRIDE (applies when the user asks for a GAME, GAME TYPE, MECHANIC, SYSTEM, or FEATURE PACKAGE — e.g. "zombie survival game", "racing system", "medieval castle", "pet system", "NPC shop", "tycoon", "simulator", "obby", "battle royale", "tower defense", "roleplay town", "combat system", "inventory system", "quest system", "sword fighting", "gun system", "car system", "farming system", "fishing system", "trading system"): EXACT-SCOPE LAW is LIFTED. You MUST build the complete production-ready solution — world/map + all gameplay scripts + required RemoteEvents/Modules + UI needed to play (menus, HUDs, shop panels, health bars) + save/load when the genre implies persistence + spawn/team/round wiring + polish + camera focus + scan_project + autofix_project. Every dependency the feature needs to work end-to-end MUST be created in the same actions block. Never refuse, never downscope, never ask for clarification — pick sensible defaults and build. Break large requests into many connected actions in one batch rather than shipping partial.

ORGANIZATION LAW (non-negotiable for ALL game systems and multi-part builds): Do NOT scatter parts, models, scripts, or UI loose in Workspace/ServerScriptService/ReplicatedStorage. Every system MUST be grouped into a single top-level Model or Folder named after the system (e.g. "ObbyCourse", "TycoonSystem", "CombatSystem", "ShopSystem", "RacingSystem"). Inside that container, subgroup by role: Map/, Parts/, Spawns/, Checkpoints/, Props/, NPCs/, Vehicles/, Effects/. Server scripts go in ServerScriptService under a folder named after the system; client scripts in StarterPlayerScripts under the same-named folder; shared modules + remotes in ReplicatedStorage under the same-named folder. When inserting Toolbox assets or generating parts via run_lua, ALWAYS set .Parent to the correct system subfolder — never leave anything at Workspace root. If the system needs a map, weld/model the map into a single Model with a PrimaryPart so it can be moved as one unit. End the actions block with an organize_project action so any stragglers get gathered.

SCRIPT SOURCE CONTRACT (non-negotiable): Every script, localscript, modulescript, and run_lua action MUST contain payload.source with complete runnable Luau written by you. Never emit an empty script, a placeholder script, a comment-only script, or a script action that only names where code should go.

COMPLETENESS CONTRACT (non-negotiable):
- Enumerate every distinct feature/thing the user asked for in this turn. For EACH one, emit at least one concrete action (run_lua, insert_asset, part, script, screengui, remoteevent, set_properties, etc.) that actually creates or modifies it in Studio. Do not silently skip items.
- If a request has multiple features ("invisible walls AND X AND Y"), each must appear in the bloxsmith-actions block. Prefer one run_lua per feature over prose descriptions.
- For "invisible walls everywhere on the existing map": emit a run_lua that scans Workspace bounds (Terrain + baseplate + existing parts) and creates thin anchored, CanCollide=true, Transparency=1 parts around the perimeter, tall enough to block flight (default height 200), parented to a folder named "InvisibleWalls". Do not require Toolbox assets for this.
- If something genuinely cannot be built (missing asset id, ambiguous, out of Studio's control), say so briefly in the visible prose AND still complete every other requested feature. Never drop a feature without stating why.

PROFESSIONAL STUDIO QUALITY CHARTER (applies to EVERY generated system — inventory, combat, simulator, tycoon, RPG, UI, vehicle, NPC, obby, shop, quest, anything):
- Production-ready and immediately playable. No manual fixes required. No placeholders, no TODOs, no stub functions, no empty ModuleScripts, no dead RemoteEvents.
- Canonical folder tree (create only the branches this system actually uses; never create empty folders):
    ReplicatedStorage/BloxSmith/{Modules,Config,Shared,Assets,Animations,Sounds,RemoteEvents}
    ServerScriptService/BloxSmith/{Systems,Services,Managers,Controllers}
    StarterPlayer/StarterPlayerScripts/BloxSmith
    StarterGui/BloxSmith_UI
    ServerStorage/BloxSmith/Assets
  Place RemoteEvents/RemoteFunctions under ReplicatedStorage/BloxSmith/RemoteEvents, shared modules under ReplicatedStorage/BloxSmith/Modules, and per-system server logic under ServerScriptService/BloxSmith/Systems/<SystemName>. Client logic goes under StarterPlayerScripts/BloxSmith/<SystemName>. Never scatter loose parts, scripts, or GUIs at the root of any service.
- Every system MUST ship a dedicated Config ModuleScript at ReplicatedStorage/BloxSmith/Config/<SystemName>Config exposing tunables (colors, speeds, damage, prices, rewards, timers, sound ids, animation ids, limits) so behavior can be customized WITHOUT editing the main scripts. Main scripts must require() and use that config — no magic numbers scattered inline.
- Code quality: clean, readable, modular, small functions, cached service lookups (game:GetService once at top), no deprecated APIs (no wait(), no LoadLibrary, no Instance.new("X", parent) with a parent arg — set .Parent last, no BindableEvent for cross-boundary work), no unused variables, no duplicate code, no infinite loops without task.wait, no memory leaks (disconnect connections on player leave / instance destroy), pcall around DataStore + HttpService + Toolbox-driven code.
- Multiplayer + security: server-authoritative gameplay. Clients request via RemoteEvent/RemoteFunction; server validates cooldowns, ownership, ranges, and inputs before applying state. Never trust client-supplied damage, positions, currency, or inventory counts. Rate-limit RemoteEvent handlers.
- Performance: cache instances, use CollectionService tags for large groups, use RunService.Heartbeat over while-true+wait, batch part creation, weld/model map into a single Model with a PrimaryPart, StreamingEnabled on when the map is large, minimize per-frame allocations, keep RemoteEvent traffic small (send diffs, not full state).
- UI standard (every ScreenGui BloxSmith ships): rounded UICorner, subtle UIStroke, tasteful UIGradient, soft drop shadows via ImageLabel or a low-transparency underlay, TweenService-driven hover/press effects, dark theme by default with a clean accent palette, TextScaled/TextWrapped for responsive text, UIListLayout/UIGridLayout with consistent padding, mobile TouchButton fallbacks, ContextActionService for gamepad/keyboard navigation, ResetOnSpawn = false where appropriate, ZIndexBehavior = Sibling.
- Visual polish: soft shadows, rounded corners, gradients where they help, consistent spacing (multiples of 4 or 8), harmonious color palette per system (do NOT reuse the same purple/blue on every build — vary by genre and by seed), smooth transitions on show/hide.
- Self-validation before finishing: emit an autofix_project action then a scan_project action so any missing references, empty folders, broken parent paths, or invalid names get repaired automatically. Never leave a build with validation errors.
- Documentation: every system ModuleScript starts with a short header comment (system name, one-line description, config path, remote list). Names use PascalCase for Instances/Modules and camelCase for locals. No cryptic names like "a", "x1", "temp".

SELF-CHECK BEFORE EMITTING ACTIONS (silent, do not narrate — just apply):
1. PLAN: internally list the systems/instances you will create and the exact folder path for each. Use the canonical folder tree above.
2. WIRING CHECK: for every RemoteEvent/RemoteFunction referenced in any script, confirm an action in this same block creates it at the exact path the script uses.
3. DEPENDENCY ORDER: parents/folders/modules/remotes appear in the actions block BEFORE any script that requires or references them.
4. SCOPE CHECK: every feature the user asked for maps to at least one action. No requested feature is silently dropped.
5. CONFIG CHECK: no magic numbers inline — tunables live in the per-system Config ModuleScript.
6. FINALE CHECK: the last two actions are autofix_project then scan_project.
If any check fails, fix the actions block before returning. Never narrate the checklist to the user.

FEW-SHOT PATTERN (mental template — do not copy verbatim, adapt to the user's ask):
User: "make a coin pickup system"
Correct shape:
- Create ReplicatedStorage/BloxSmith/Config/CoinSystemConfig (ModuleScript with pickup value, sound id, respawn seconds).
- Create ReplicatedStorage/BloxSmith/RemoteEvents/CoinCollected (RemoteEvent).
- Create ServerScriptService/BloxSmith/Systems/CoinSystem/CoinServer (Script that spawns coins, validates touches server-side, updates leaderstats, respawns via config).
- Create StarterPlayer/StarterPlayerScripts/BloxSmith/CoinSystem/CoinClient (LocalScript for pickup VFX/sound from config).
- Create Workspace/CoinSystem folder with a few sample coin parts as children (all anchored, tagged via CollectionService).
- End with autofix_project then scan_project.
This is the pattern for EVERY system: Config → Remotes → Server → Client → World container → autofix → scan.

For Build Mode, end with exactly one fenced \`\`\`bloxsmith-actions block containing the executable action JSON the app will strip from the visible chat. Include scan/autofix actions for meaningful builds and never claim Studio execution is complete until plugin verification confirms it.`;


// Strip tool-call parts that never got a matching tool-result (and vice-versa).
// Some NVIDIA models return "Tool result is missing for tool call ..." when the
// prior turn was aborted / errored between the tool-call and the tool-result.
function sanitizeToolPairing(messages: UIMessage[]): UIMessage[] {
  const resultIds = new Set<string>();
  for (const m of messages) {
    for (const p of (m.parts ?? []) as any[]) {
      const t = p?.type;
      if (typeof t === "string" && (t.startsWith("tool-") || t === "tool-result") && p?.toolCallId && (p?.output !== undefined || p?.result !== undefined || p?.state === "output-available" || p?.state === "result")) {
        resultIds.add(p.toolCallId);
      }
    }
  }
  return messages.map((m) => {
    const parts = ((m.parts ?? []) as any[]).filter((p) => {
      const t = p?.type;
      if (typeof t !== "string") return true;
      // Drop tool invocations that have no matching result.
      if ((t.startsWith("tool-") || t === "tool-call" || t === "tool-invocation") && p?.toolCallId) {
        const hasOwnResult = p?.output !== undefined || p?.result !== undefined || p?.state === "output-available" || p?.state === "result";
        if (!hasOwnResult && !resultIds.has(p.toolCallId)) return false;
      }
      return true;
    });
    return { ...m, parts } as UIMessage;
  }).filter((m) => (m.parts ?? []).length > 0);
}

function trimMessagesForModel(messages: UIMessage[], mode: "chat" | "build"): UIMessage[] {
  const cleaned = sanitizeToolPairing(messages);
  const maxMessages = mode === "chat" ? 12 : 10;
  const start = Math.max(0, cleaned.length - maxMessages);
  return cleaned.slice(start).map((m, i, recent) => {
    const isLatestUser = i === recent.length - 1 && m.role === "user";
    const textLimit = isLatestUser ? 12000 : m.role === "assistant" ? 1600 : 2400;

    const parts = (m.parts ?? []).map((p: any) => {
      if (p?.type !== "text" || typeof p.text !== "string" || p.text.length <= textLimit) return p;
      return { ...p, text: `[trimmed previous context]\n${p.text.slice(-textLimit)}` };
    });
    return { ...m, parts } as UIMessage;
  });
}

function capOutputTokens(modelSettings: { maxOutputTokens?: number } | undefined, mode: "chat" | "build", buildQuality?: "basic" | "better" | "premium" | "full_game") {
  // FAST PATH: cap output tokens aggressively so responses finish quickly.
  // Lowered further to reduce end-to-end generation latency.
  const requested = modelSettings?.maxOutputTokens ?? (mode === "chat" ? 500 : 1600);
  const cap = mode === "chat"
    ? 700
    : buildQuality === "full_game"
      ? 3000
      : buildQuality === "premium"
        ? 2400
        : buildQuality === "basic"
          ? 650
          : 1800;
  return Math.min(requested, cap);
}

function isInstantFastBuildTemplateRequest(userText: string) {
  const text = userText.toLowerCase().trim();
  if (!text) return false;
  if (isBroadPlayableGameRequest(text) || isExplicitFullSystemRequest(text)) return true;
  // IMPORTANT: Do NOT match specific structure nouns here (castle, house, tower,
  // spaceship, shop, dungeon, etc.). Those need real Toolbox search + AI planning
  // so the result actually looks like what the user asked for. The deterministic
  // template only fires for truly generic environment/scene words.
  return /\b(map|world|environment|scene|terrain|forest|woods|desert|beach|snow|tundra|island)\b/i.test(text);
}



function wantsGeneratedImage(userText: string) {
  const t = userText.trim();
  if (!t) return false;
  if (/^generate\s+an?\s+image\s*:/i.test(t)) return true;
  if (/\b(?:generate|create|make|draw|design)\b.{0,80}\b(?:image|picture|concept\s+art|promo\s+art|ui\s+mockup|menu\s+mockup|loading\s+screen\s+mockup)\b/i.test(t)) return true;
  if (/\b(?:generate|create|make|draw|design)\b.{0,80}\b(?:thumbnail|icon|logo|badge|banner)\b.{0,40}\b(?:image|picture|graphic|art|asset|for|of)\b/i.test(t)) {
    return !/\b(?:system|script|leaderstats?|datastore|data\s*store|hud|startergui|screen\s*gui|roblox\s+studio|studio|in[-\s]?game)\b/i.test(t);
  }
  return false;
}

function imageKindFromPrompt(userText: string): "logo" | "thumbnail" | "icon" | "badge" | "shop_icon" | "item_icon" | "character_concept" | "map_concept" | "promo" | "banner" | "other" {
  const t = userText.toLowerCase();
  if (/logo/.test(t)) return "logo";
  if (/thumbnail/.test(t)) return "thumbnail";
  if (/badge/.test(t)) return "badge";
  if (/shop/.test(t) && /icon/.test(t)) return "shop_icon";
  if (/(item|weapon|tool)/.test(t) && /icon/.test(t)) return "item_icon";
  if (/icon/.test(t)) return "icon";
  if (/(character|avatar|npc)/.test(t) && /(concept|art|image|picture|draw|design)/.test(t)) return "character_concept";
  if (/(map|world|environment|level)/.test(t) && /(concept|art|image|picture|draw|design)/.test(t)) return "map_concept";
  if (/banner/.test(t)) return "banner";
  if (/promo|poster|ad/.test(t)) return "promo";
  return "other";
}

function recoveryStudioActions(userText: string) {
  const safePrompt = userText.trim().slice(0, 240) || "BloxSmith auto-execute recovery build";
  const source = `
local Workspace = game:GetService("Workspace")
local Lighting = game:GetService("Lighting")
local Players = game:GetService("Players")

local root = Workspace:FindFirstChild("BloxSmith_AutoBuild")
if root then root:Destroy() end
root = Instance.new("Folder")
root.Name = "BloxSmith_AutoBuild"
root.Parent = Workspace

local function part(name, size, position, color, material)
  local p = Instance.new("Part")
  p.Name = name
  p.Anchored = true
  p.Size = size
  p.Position = position
  p.Color = color
  p.Material = material or Enum.Material.SmoothPlastic
  p.TopSurface = Enum.SurfaceType.Smooth
  p.BottomSurface = Enum.SurfaceType.Smooth
  p.Parent = root
  return p
end

part("Safe_Play_Area", Vector3.new(220, 2, 220), Vector3.new(0, -1, 0), Color3.fromRGB(72, 145, 82), Enum.Material.Grass)
part("Main_Road_X", Vector3.new(220, 0.25, 18), Vector3.new(0, 0.15, 0), Color3.fromRGB(38, 41, 46), Enum.Material.Asphalt)
part("Main_Road_Z", Vector3.new(18, 0.25, 220), Vector3.new(0, 0.2, 0), Color3.fromRGB(38, 41, 46), Enum.Material.Asphalt)

for x = -72, 72, 48 do
  for z = -72, 72, 48 do
    if math.abs(x) > 12 and math.abs(z) > 12 then
      local height = 18 + ((math.abs(x) + math.abs(z)) % 28)
      part("Safe_Building_" .. x .. "_" .. z, Vector3.new(26, height, 26), Vector3.new(x, height / 2, z), Color3.fromRGB(88, 121, 156), Enum.Material.Concrete)
      part("Roof_" .. x .. "_" .. z, Vector3.new(28, 1.5, 28), Vector3.new(x, height + 0.8, z), Color3.fromRGB(35, 43, 55), Enum.Material.Metal)
    end
  end
end

for i, pos in ipairs({ Vector3.new(-28, 2, -28), Vector3.new(28, 2, -28), Vector3.new(-28, 2, 28), Vector3.new(28, 2, 28) }) do
  local spawn = Instance.new("SpawnLocation")
  spawn.Name = "BloxSmith_Spawn_" .. i
  spawn.Anchored = true
  spawn.Size = Vector3.new(8, 1, 8)
  spawn.Position = pos
  spawn.Color = Color3.fromRGB(72, 255, 176)
  spawn.Neutral = true
  spawn.Parent = root
end

local sign = part("BloxSmith_Execution_Confirmed", Vector3.new(44, 18, 1), Vector3.new(0, 12, -54), Color3.fromRGB(23, 26, 38), Enum.Material.Metal)
local gui = Instance.new("SurfaceGui")
gui.Face = Enum.NormalId.Front
gui.SizingMode = Enum.SurfaceGuiSizingMode.PixelsPerStud
gui.PixelsPerStud = 24
gui.Parent = sign
local label = Instance.new("TextLabel")
label.BackgroundTransparency = 1
label.Size = UDim2.fromScale(1, 1)
label.Font = Enum.Font.GothamBold
label.TextScaled = true
label.TextWrapped = true
label.TextColor3 = Color3.fromRGB(245, 248, 255)
label.Text = "BloxSmith executed this build in Studio. Request: " .. ${JSON.stringify(safePrompt)}
label.Parent = gui

Lighting.ClockTime = 14
Lighting.Brightness = 2.2
Workspace.StreamingEnabled = true

for _, player in ipairs(Players:GetPlayers()) do
  if player.Character and player.Character:FindFirstChild("HumanoidRootPart") then
    player.Character.HumanoidRootPart.CFrame = CFrame.new(0, 8, 0)
  end
end
`;

  return [
    {
      kind: "run_lua",
      parent_path: "Workspace",
      name: "BloxSmith_AutoExecute_Recovery",
      payload: { source },
    },
    {
      kind: "organize_project",
      parent_path: "Workspace",
      name: "BloxSmith_Organize_After_Recovery",
      payload: { reason: "ensure_auto_executed_build_is_grouped" },
    },
    {
      kind: "autofix_project",
      parent_path: "Workspace",
      name: "BloxSmith_Autofix_After_Recovery",
      payload: { reason: "fix_common_studio_issues_after_auto_execute_recovery" },
    },
    {
      kind: "scan_project",
      parent_path: "Workspace",
      name: "BloxSmith_Scan_After_Recovery",
      payload: { reason: "verify_auto_execute_recovery_completed" },
    },
  ];
}

function isDestructiveEditRequest(userText: string) {
  const text = userText.toLowerCase();
  return /\b(erase|clear|wipe|delete|remove|destroy)\b/.test(text) &&
    /\b(everything|all|workspace|project|map|objects?|instances?|children)\b/.test(text);
}

function isClearProjectKeepBaseplateRequest(userText: string) {
  const text = userText.toLowerCase();
  return isDestructiveEditRequest(userText) && /\b(?:base\s*plate|baseplate)\b/.test(text) && /\b(?:keep|except|only|preserve|leave)\b/.test(text);
}

function clearProjectKeepBaseplateStudioActions(userText: string) {
  const safePrompt = userText.trim().slice(0, 240) || "clear project and keep only Baseplate";
  const source = `
local Workspace = game:GetService("Workspace")
local Lighting = game:GetService("Lighting")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local ReplicatedFirst = game:GetService("ReplicatedFirst")
local ServerScriptService = game:GetService("ServerScriptService")
local ServerStorage = game:GetService("ServerStorage")
local StarterGui = game:GetService("StarterGui")
local StarterPack = game:GetService("StarterPack")
local StarterPlayer = game:GetService("StarterPlayer")
local SoundService = game:GetService("SoundService")
local Teams = game:GetService("Teams")
local ChangeHistoryService = game:GetService("ChangeHistoryService")

local request = ${JSON.stringify(safePrompt)}
local destroyed = 0
local clearedTerrain = false

local recording = nil
pcall(function()
  recording = ChangeHistoryService:TryBeginRecording("BloxSmith Clear Project Keep Baseplate")
end)

local function destroyChild(child)
  if child then
    local ok = pcall(function()
      child:Destroy()
    end)
    if ok then destroyed += 1 end
  end
end

for _, child in ipairs(Workspace:GetChildren()) do
  if child:IsA("Terrain") then
    pcall(function()
      child:Clear()
      clearedTerrain = true
    end)
  elseif string.lower(child.Name) ~= "baseplate" then
    destroyChild(child)
  end
end

local baseplate = Workspace:FindFirstChild("Baseplate")
if not baseplate then
  for _, child in ipairs(Workspace:GetChildren()) do
    if string.lower(child.Name) == "baseplate" then
      baseplate = child
      child.Name = "Baseplate"
      break
    end
  end
end
if not baseplate then
  baseplate = Instance.new("Part")
  baseplate.Name = "Baseplate"
  baseplate.Size = Vector3.new(2048, 1, 2048)
  baseplate.Position = Vector3.new(0, 0, 0)
  baseplate.Material = Enum.Material.Plastic
  baseplate.Color = Color3.fromRGB(99, 95, 98)
  baseplate.TopSurface = Enum.SurfaceType.Studs
  baseplate.BottomSurface = Enum.SurfaceType.Inlet
  baseplate.Parent = Workspace
end
if baseplate and baseplate:IsA("BasePart") then
  baseplate.Anchored = true
  baseplate.Locked = false
  baseplate.Position = Vector3.new(0, 0, 0)
  if baseplate.Size.Magnitude < 10 then
    baseplate.Size = Vector3.new(2048, 1, 2048)
  end
end

local servicesToClear = {
  Lighting,
  ReplicatedStorage,
  ReplicatedFirst,
  ServerScriptService,
  ServerStorage,
  StarterGui,
  StarterPack,
  SoundService,
  Teams,
}

for _, service in ipairs(servicesToClear) do
  for _, child in ipairs(service:GetChildren()) do
    destroyChild(child)
  end
end

for _, folderName in ipairs({ "StarterPlayerScripts", "StarterCharacterScripts" }) do
  local folder = StarterPlayer:FindFirstChild(folderName)
  if folder then
    for _, child in ipairs(folder:GetChildren()) do
      destroyChild(child)
    end
  end
end

pcall(function()
  Lighting.ClockTime = 14
  Lighting.Brightness = 2
  Lighting.Ambient = Color3.fromRGB(128, 128, 128)
  Lighting.OutdoorAmbient = Color3.fromRGB(128, 128, 128)
  Lighting.FogEnd = 100000
end)

Workspace:SetAttribute("BloxSmithLastClearRequest", request)
Workspace:SetAttribute("BloxSmithKeptOnlyBaseplate", true)
Workspace:SetAttribute("BloxSmithDestroyedCount", destroyed)
Workspace:SetAttribute("BloxSmithTerrainCleared", clearedTerrain)

pcall(function()
  if recording then
    ChangeHistoryService:FinishRecording(recording, Enum.FinishRecordingOperation.Commit)
  end
end)

print(string.format("[BloxSmith] Cleared project content, kept Baseplate, destroyed %d instance(s).", destroyed))
`;

  return [
    {
      kind: "run_lua",
      parent_path: "Workspace",
      name: "BloxSmith_Clear_Project_Keep_Baseplate",
      payload: { source, destructive: true, keep: ["Workspace.Baseplate"] },
    },
    {
      kind: "scan_project",
      parent_path: "Workspace",
      name: "BloxSmith_Scan_After_Clear_Baseplate",
      payload: { reason: "verify_project_was_cleared_and_baseplate_remains" },
    },
  ];
}

function isGrassRequest(userText: string) {
  return /\b(grass|grassy|lawn|turf|field|ground\s+cover|realistic\s+ground)\b/i.test(userText);
}

function isSurfaceMaterialRequest(userText: string) {
  return /\b(fill|cover|paint|make|turn|change|apply|set|replace|add|create|build)\b/i.test(userText) &&
    /\b(ground|floor|baseplate|terrain|land|surface|map|area)\b/i.test(userText) &&
    /\b(gravel|pebble|pebbles|stone|rock|rocks|sand|mud|dirt|asphalt|road|concrete|pavement|snow|ice|lava|grass)\b/i.test(userText);
}

function visibleSurfaceMaterialStudioActions(userText: string) {
  const safePrompt = userText.trim().slice(0, 220) || "apply visible ground material";
  const text = userText.toLowerCase();
  const material = /\b(snow|snowy)\b/.test(text) ? "Snow" :
    /\b(ice|glacier|frozen)\b/.test(text) ? "Ice" :
    /\b(lava|magma)\b/.test(text) ? "CrackedLava" :
    /\b(sand|beach|desert)\b/.test(text) ? "Sand" :
    /\b(mud|swamp)\b/.test(text) ? "Mud" :
    /\b(asphalt|road)\b/.test(text) ? "Asphalt" :
    /\b(concrete|pavement|sidewalk)\b/.test(text) ? "Concrete" :
    /\b(gravel|pebble|pebbles|stone|rock|rocks)\b/.test(text) ? "Pebble" :
    "Grass";
  const color = material === "Snow" ? [242, 248, 255] :
    material === "Ice" ? [156, 216, 242] :
    material === "CrackedLava" ? [255, 88, 34] :
    material === "Sand" ? [230, 207, 150] :
    material === "Mud" ? [94, 72, 48] :
    material === "Asphalt" ? [42, 43, 47] :
    material === "Concrete" ? [126, 128, 126] :
    material === "Pebble" ? [108, 111, 106] :
    [72, 150, 70];
  const label = material === "Pebble" ? "gravel" : material.toLowerCase();
  const source = `
local Workspace = game:GetService("Workspace")
local Lighting = game:GetService("Lighting")
local Terrain = Workspace.Terrain

local request = ${JSON.stringify(safePrompt)}
local materialName = ${JSON.stringify(material)}
local material = Enum.Material[materialName] or Enum.Material.Ground
local color = Color3.fromRGB(${color[0]}, ${color[1]}, ${color[2]})

local root = Workspace:FindFirstChild("BloxSmith_Surface_Material")
if root then root:Destroy() end
root = Instance.new("Folder")
root.Name = "BloxSmith_Surface_Material"
root.Parent = Workspace

local changed = 0
for _, inst in ipairs(Workspace:GetDescendants()) do
  if inst:IsA("BasePart") then
    local n = inst.Name:lower()
    local largeFlat = inst.Size.X >= 30 and inst.Size.Z >= 30 and inst.Size.Y <= 12
    if n:find("baseplate") or n:find("ground") or n:find("floor") or largeFlat then
      inst.Material = material
      inst.Color = color
      inst.TopSurface = Enum.SurfaceType.Smooth
      inst.BottomSurface = Enum.SurfaceType.Smooth
      changed += 1
    end
  end
end

pcall(function()
  Terrain:SetMaterialColor(material, color)
  Terrain:FillBlock(CFrame.new(0, -2, 0), Vector3.new(320, 4, 320), material)
end)

local surface = Instance.new("Part")
surface.Name = "Visible_" .. materialName .. "_Ground"
surface.Anchored = true
surface.CanCollide = true
surface.Size = Vector3.new(320, 0.75, 320)
surface.Position = Vector3.new(0, 0.4, 0)
surface.Material = material
surface.Color = color
surface.TopSurface = Enum.SurfaceType.Smooth
surface.BottomSurface = Enum.SurfaceType.Smooth
surface.Parent = root

for i, data in ipairs({{-96,-72,12},{-42,86,8},{54,-58,10},{98,66,7},{8,34,5},{-74,22,6}}) do
  local rock = Instance.new("Part")
  rock.Name = "Material_Detail_" .. i
  rock.Anchored = true
  rock.CanCollide = true
  rock.Shape = Enum.PartType.Ball
  rock.Size = Vector3.new(data[3] * 1.6, data[3] * 0.55, data[3] * 1.25)
  rock.CFrame = CFrame.new(data[1], 0.8 + data[3] * 0.25, data[2]) * CFrame.Angles(0, math.rad(i * 27), 0)
  rock.Material = material
  rock.Color = color:Lerp(Color3.fromRGB(64, 64, 64), 0.18)
  rock.Parent = root
end

local marker = Instance.new("Part")
marker.Name = "BloxSmith_Material_Built_Marker"
marker.Anchored = true
marker.CanCollide = false
marker.Size = Vector3.new(26, 9, 1)
marker.CFrame = CFrame.new(0, 7, -112)
marker.Material = Enum.Material.Metal
marker.Color = Color3.fromRGB(28, 34, 46)
marker.Parent = root
local gui = Instance.new("SurfaceGui")
gui.Face = Enum.NormalId.Front
gui.SizingMode = Enum.SurfaceGuiSizingMode.PixelsPerStud
gui.PixelsPerStud = 24
gui.Parent = marker
local label = Instance.new("TextLabel")
label.BackgroundTransparency = 1
label.Size = UDim2.fromScale(1, 1)
label.Font = Enum.Font.GothamBold
label.TextScaled = true
label.TextWrapped = true
label.TextColor3 = Color3.fromRGB(245, 248, 255)
label.Text = "BloxSmith applied ${label} ground"
label.Parent = gui

Lighting.ClockTime = math.max(Lighting.ClockTime, 12)
Lighting.Brightness = math.max(Lighting.Brightness, 2.2)
root:SetAttribute("BloxSmithRequest", request)
root:SetAttribute("SurfaceMaterial", materialName)
root:SetAttribute("GroundPartsChanged", changed)

return {
  instance = root,
  path = root:GetFullName(),
  created = { root, surface, marker },
  visible = true,
  summary = "Applied visible " .. materialName .. " material to ground/baseplate and created a large visible surface"
}
`;

  return [
    {
      kind: "run_lua",
      parent_path: "Workspace",
      name: "BloxSmith_Apply_Visible_Surface_Material",
      payload: { source, request: safePrompt, visible_output_required: true },
    },
    {
      kind: "scan_project",
      parent_path: "Workspace",
      name: "BloxSmith_Scan_Surface_Material",
      payload: { reason: "verify_visible_surface_material_was_applied" },
    },
  ];
}

function isSnowTerrainRequest(userText: string) {
  return /\b(snow|snowy|winter|arctic|tundra|ice|glacier)\b/i.test(userText) &&
    /\b(terrain|ground|map|world|environment|area|biome|landscape|floor|baseplate|scene|make|add|build|create)\b/i.test(userText);
}

function isSimpleSingleThingRequest(userText: string) {
  const text = userText.toLowerCase().trim();
  if (!text) return false;
  if (/\b(full|complete|entire|game|map|world|city|town|tycoon|simulator|rpg|obby|multiple|several|bunch|many|pack)\b/.test(text)) return false;
  if (/\b(and|with|plus|including|also)\b|,/.test(text)) return false;
  const nouns = text
    .replace(/\b(add|make|create|build|insert|place|spawn|a|an|the|one|single|real|safe|free|toolbox|roblox|please|me)\b/g, " ")
    .split(/\s+/)
    .filter(Boolean);
  return nouns.length > 0 && nouns.length <= 3;
}

function isExplicitFullSystemRequest(userText: string) {
  return /\b(full\s*(game|system|ui|gui|experience)|complete\s*(game|system|ui|gui|experience)|entire\s*(game|system|ui|gui|experience)|all[-\s]*in[-\s]*one|game\s*framework|core\s*systems|production\s*systems|round[-\s]*based\s*game|tycoon|simulator|rpg|obby|parkour|tower\s*defen[cs]e|battle\s*royale|zombie\s*(survival|game)?|survival\s*game|horror\s*game|pet\s*(simulator|game|system)|role\s*play|roleplay|city\s*rp|racing\s*(game|system)?|race\s*(course|track|system)|combat\s*system|fighting\s*(game|system)?|gun\s*system|sword\s*(fighting|system)|quest\s*system|inventory\s*system|shop\s*system|round\s*system|minigame|farming\s*(game|system)?|fishing\s*(game|system)?|trading\s*system)\b/i.test(userText);
}

function isBroadPlayableGameRequest(userText: string) {
  const text = userText.toLowerCase().trim();
  if (!text || isNarrowFeatureRequest(text)) return false;
  return /\b(game|experience|course|level|map|world|mode|mechanic|system|framework|obby|parkour|tycoon|simulator|rpg|dungeon|quest|combat|fighting|weapon|gun|sword|shooter|arena|battle|zombie|survival|horror|tower\s*defen[cs]e|role\s*play|roleplay|city\s*rp|racing|race\s*track|pet\s*(simulator|game|system)|inventory|shop|trading|farming|fishing|minigame|round[-\s]*based|police\s*chase|cooking|restaurant|puzzle|escape)\b/i.test(text) &&
    /\b(add|make|create|build|generate|give|setup|set\s*up|need|want|course|game|system|mechanic|mode|map|world|experience)\b/i.test(text);
}

function isHumanoidVfxRequest(userText: string) {
  const text = userText.toLowerCase().trim();
  if (!text) return false;
  const hasVfx = /\b(vfx|visual\s*effects?|particles?|particle\s*effects?|aura|glow(?:ing)?|sparkles?|trail|beam|explosion|fire|flames?|flaming|burn(?:ing)?|ignite|engulf(?:ed)?|on\s*fire|lightning|electric(?:al)?|zap|smoke|magic|arcane|ice|frost|snow|poison|toxic|holy|divine|dark|shadow|energy|ki)\b/i.test(text);
  if (!hasVfx) return false;
  return /\b(character|humanoid|player|avatar|me|my\s+body|body|hands?|arms?|feet|legs?|head|torso|humanoidrootpart|weapon|sword|tool|npc|enemy|boss)\b/i.test(text) ||
    /\b(turn\s+(?:my\s+)?character\s+into|turn\s+(?:me|my\s+avatar|my\s+player)\s+into|engulf|surround|cover|wrap|attach|follow|full[-\s]*body|entire\s+body|aura|flaming|burning|on\s*fire)\b/i.test(text);
}

function isNarrowFeatureRequest(userText: string) {
  const text = userText.toLowerCase().trim();
  if (!text || isExplicitFullSystemRequest(text)) return false;
  if (/\b(map|world|city|town|lobby|level|multiple|several|bunch|pack)\b/.test(text)) return false;
  if (/\b(main\s*menu|loading\s*screen|load\s*screen|splash|title\s*screen|hud|shop\s*system|inventory\s*system|settings\s*menu)\b/.test(text)) return false;
  if (isHumanoidVfxRequest(text)) return true;
  if (/\b(button|script|local\s*script|server\s*script|module\s*script|remote\s*event|remoteevent|speed\s*boost|sprint|dash|double\s*jump|high\s*jump|super\s*jump|jump\s*boost|fly|flying|flight|tool|door|checkpoint|save\s*point|timer|kill\s*brick|teleport)\b/.test(text)) return true;
  return isSimpleSingleThingRequest(text);
}

function needsGameplayRemoteWiring(userText: string) {
  return isHumanoidVfxRequest(userText) || /\b(button|keybind|key\s*bind|space\s*bar|keyboard|hotkey|speed\s*boost|sprint|dash|double\s*jump|high\s*jump|super\s*jump|jump\s*boost|fly|flying|flight|ability|power|tool|door|checkpoint|save\s*point|timer|kill\s*brick|teleport|multiplayer|replicated|server[-\s]*authoritative)\b/i.test(userText);
}

function shouldUseGenericRobloxSystemGuard(userText: string, buildQuality?: "basic" | "better" | "premium" | "full_game") {
  if (isNarrowFeatureRequest(userText)) return false;
  if (isExplicitFullSystemRequest(userText) || isBroadPlayableGameRequest(userText)) return true;
  if (!isRobloxSystemRequest(userText)) return false;
  return buildQuality === "full_game";
}

function actionLooksLikeUnrequestedUiShell(action: any, userText: string) {
  const text = userText.toLowerCase();
  const requestedLoading = /\b(loading\s*screen|load\s*screen|loading\s*ui)\b/.test(text);
  const requestedMenu = /\b(main\s*menu|title\s*screen|splash\s*screen|play\s*button|start\s*button)\b/.test(text);
  const requestedHud = /\b(hud|heads[-\s]*up|health\s*bar|cash\s*display|coin\s*display|timer\s*display)\b/.test(text);
  const requestedShop = /\b(shop\s*(ui|gui|screen|system|menu|panel)|store\s*(ui|gui|screen|system|menu|panel))\b/.test(text);
  const requestedInventory = /\binventory\s*(ui|gui|screen|system|menu|panel)?\b/.test(text);
  const requestedSettings = /\bsettings\s*(ui|gui|screen|menu|panel)?\b/.test(text);
  const name = String(action?.name ?? "");
  const source = String(action?.payload?.source ?? "");
  const haystack = `${name}\n${source}`;

  if (/BloxSmith_(Build_UI_And_Systems|Intent_Visibility_Guard|Build_Single_UI_Or_Script|Install_Production_Systems)/i.test(name)) return true;
  if (!requestedLoading && /\b(LoadingScreen|Loading World|Loading City|Entering the Dark|Preparing your Roblox experience|ProgressBack|ProgressFill)\b/i.test(haystack)) return true;
  if (!requestedMenu && /\b(MainMenu|MAIN MENU|PlayButton|StartButton|ShopButton|InventoryButton|SettingsButton|BloxSmith_Game_UI|BloxSmith_Visible_UI)\b/i.test(haystack)) return true;
  if (!requestedHud && /\b(Name\s*=\s*["']HUD["']|TopStats|Health:\s*100|Coins:\s*0|Level:\s*1|leaderstats)\b/i.test(haystack)) return true;
  if (!requestedShop && /\b(RequestShop|ShopButton|Add products, boosts, gamepasses, and upgrades here)\b/i.test(haystack)) return true;
  if (!requestedInventory && /\b(RequestInventory|InventoryButton|Player items and rewards can appear here)\b/i.test(haystack)) return true;
  if (!requestedSettings && /\b(SaveSettings|SettingsButton|Volume, graphics, and gameplay options are ready to wire)\b/i.test(haystack)) return true;
  return false;
}

function isScriptLikeAction(action: any) {
  return ["script", "localscript", "modulescript", "run_lua"].includes(String(action?.kind ?? ""));
}

function hasRealLuauSource(action: any) {
  if (!isScriptLikeAction(action)) return true;
  const source = String(action?.payload?.source ?? action?.source ?? "").trim();
  if (source.length < 40) return false;
  const withoutComments = source
    .replace(/--\[\[[\s\S]*?\]\]/g, "")
    .replace(/--[^\n]*/g, "")
    .trim();
  if (withoutComments.length < 25) return false;
  if (/TODO|placeholder|add your code here|simple server script is running/i.test(source)) return false;
  if (/\bPlayers\s*:\s*GetPlayerFromInput\s*\(/i.test(source)) return false;
  if (/\bUserInputService\b/i.test(source) && /\bPlayers\.PlayerAdded\b/i.test(source)) return false;
  return true;
}

function finalScriptIssues(action: any): LuauIssue[] {
  if (!isScriptLikeAction(action)) return [];
  const source = stripCodeFences(String(action?.payload?.source ?? action?.source ?? ""));
  const issues = validateLuau(source).filter((i) => i.severity === "error");
  if (!hasRealLuauSource({ ...action, payload: { ...(action?.payload ?? {}), source } })) {
    issues.unshift({ severity: "error", message: "Script source is empty, comment-only, placeholder, or not executable enough for Studio insertion." });
  }
  return issues;
}

function scriptIssueLabel(action: any, issues: LuauIssue[]) {
  const name = String(action?.name || "unnamed script").slice(0, 80);
  const kind = String(action?.kind || "script");
  const first = issues[0]?.message || "invalid Luau";
  return `${kind} ${name}: ${first}`;
}

function detectVfxElement(userText: string) {
  const text = userText.toLowerCase();
  if (/\b(lightning|electric|zap)\b/.test(text)) return "Lightning";
  if (/\b(smoke|fog)\b/.test(text)) return "Smoke";
  if (/\b(magic|arcane)\b/.test(text)) return "Magic";
  if (/\b(ice|frost|snow)\b/.test(text)) return "Ice";
  if (/\b(poison|toxic)\b/.test(text)) return "Poison";
  if (/\b(holy|divine)\b/.test(text)) return "Holy";
  if (/\b(dark|shadow)\b/.test(text)) return "Dark";
  if (/\b(sparkle|sparkles)\b/.test(text)) return "Sparkle";
  if (/\b(glow|energy|ki)\b/.test(text)) return "Energy";
  return "Fire";
}

function detectVfxTargetMode(userText: string) {
  const text = userText.toLowerCase();
  if (/\b(weapon|sword|tool|blade)\b/.test(text)) return "weapon";
  if (/\b(npc|enemy|boss)\b/.test(text)) return "npc";
  if (/\b(hand|hands|fist|fists)\b/.test(text)) return "hands";
  if (/\b(foot|feet)\b/.test(text)) return "feet";
  if (/\b(head|face|halo)\b/.test(text)) return "head";
  if (/\baura\b/.test(text) && !/\b(turn|engulf|entire|full|body|character|avatar|player|me|on\s*fire|flames?)\b/.test(text)) return "aura";
  return "full";
}

function humanoidVfxFallbackStudioActions(userText: string, languageName: string) {
  if (!isHumanoidVfxRequest(userText)) return [];
  const safePrompt = userText.trim().slice(0, 220) || "humanoid VFX";
  const element = detectVfxElement(userText);
  const targetMode = detectVfxTargetMode(userText);
  const appliesToNpcs = targetMode === "npc";
  const source = `
local Players = game:GetService("Players")
local Workspace = game:GetService("Workspace")

local ELEMENT = ${JSON.stringify(element)}
local TARGET_MODE = ${JSON.stringify(targetMode)}
local APPLY_NPCS = ${appliesToNpcs ? "true" : "false"}
local PREFIX = "BloxSmith_" .. ELEMENT .. "VFX_"

local PRESETS = {
  Fire = {
    texture = "rbxassetid://243660364",
    rate = 55,
    lifetime = NumberRange.new(0.55, 1.1),
    speed = NumberRange.new(3, 7),
    spread = Vector2.new(35, 35),
    accel = Vector3.new(0, 9, 0),
    size = {0.6, 2.6, 0.2},
    color = ColorSequence.new({
      ColorSequenceKeypoint.new(0, Color3.fromRGB(255, 235, 130)),
      ColorSequenceKeypoint.new(0.5, Color3.fromRGB(255, 120, 25)),
      ColorSequenceKeypoint.new(1, Color3.fromRGB(120, 20, 0)),
    }),
    light = Color3.fromRGB(255, 140, 55),
    sound = "rbxassetid://5786758392",
  },
  Lightning = {
    texture = "rbxasset://textures/particles/sparkles_main.dds",
    rate = 14,
    lifetime = NumberRange.new(0.15, 0.35),
    speed = NumberRange.new(6, 12),
    spread = Vector2.new(180, 180),
    accel = Vector3.zero,
    size = {0.12, 0.72, 0},
    color = ColorSequence.new({ColorSequenceKeypoint.new(0, Color3.fromRGB(120, 220, 255)), ColorSequenceKeypoint.new(0.5, Color3.fromRGB(255, 255, 255)), ColorSequenceKeypoint.new(1, Color3.fromRGB(60, 120, 255))}),
    light = Color3.fromRGB(120, 180, 255),
    sound = "",
  },
  Smoke = {
    texture = "rbxassetid://244514357",
    rate = 12,
    lifetime = NumberRange.new(1.2, 2.2),
    speed = NumberRange.new(0.5, 2),
    spread = Vector2.new(35, 35),
    accel = Vector3.new(0, 2, 0),
    size = {0.7, 2.2, 0.25},
    color = ColorSequence.new(Color3.fromRGB(95, 95, 95), Color3.fromRGB(35, 35, 35)),
    light = Color3.fromRGB(95, 95, 95),
    sound = "",
  },
  Magic = {
    texture = "rbxassetid://241876828",
    rate = 14,
    lifetime = NumberRange.new(0.8, 1.6),
    speed = NumberRange.new(1, 3),
    spread = Vector2.new(38, 38),
    accel = Vector3.new(0, 3, 0),
    size = {0, 1.25, 0},
    color = ColorSequence.new({ColorSequenceKeypoint.new(0, Color3.fromRGB(180, 120, 255)), ColorSequenceKeypoint.new(0.5, Color3.fromRGB(255, 120, 220)), ColorSequenceKeypoint.new(1, Color3.fromRGB(255, 255, 255))}),
    light = Color3.fromRGB(200, 120, 255),
    sound = "",
  },
  Ice = {
    texture = "rbxassetid://241876828",
    rate = 12,
    lifetime = NumberRange.new(1, 2),
    speed = NumberRange.new(0.5, 2),
    spread = Vector2.new(25, 25),
    accel = Vector3.new(0, -1, 0),
    size = {0, 1.05, 0},
    color = ColorSequence.new({ColorSequenceKeypoint.new(0, Color3.fromRGB(200, 240, 255)), ColorSequenceKeypoint.new(0.5, Color3.fromRGB(255, 255, 255)), ColorSequenceKeypoint.new(1, Color3.fromRGB(180, 220, 255))}),
    light = Color3.fromRGB(180, 220, 255),
    sound = "",
  },
}

PRESETS.Poison = PRESETS.Magic
PRESETS.Holy = PRESETS.Magic
PRESETS.Dark = PRESETS.Smoke
PRESETS.Sparkle = PRESETS.Magic
PRESETS.Energy = PRESETS.Magic

local preset = PRESETS[ELEMENT] or PRESETS.Fire

local function startsWith(value, prefix)
  return string.sub(value, 1, #prefix) == prefix
end

local function cleanup(part)
  for _, child in ipairs(part:GetChildren()) do
    if startsWith(child.Name, PREFIX) then
      child:Destroy()
    end
  end
end

local function firstPart(character, names)
  for _, name in ipairs(names) do
    local part = character:FindFirstChild(name)
    if part and part:IsA("BasePart") then
      return part
    end
  end
  return nil
end

local function addUnique(list, part)
  if not part then return end
  for _, existing in ipairs(list) do
    if existing == part then return end
  end
  table.insert(list, part)
end

local function targetParts(character)
  local parts = {}
  if TARGET_MODE == "hands" then
    addUnique(parts, firstPart(character, {"LeftHand", "LeftLowerArm", "LeftUpperArm", "Left Arm"}))
    addUnique(parts, firstPart(character, {"RightHand", "RightLowerArm", "RightUpperArm", "Right Arm"}))
  elseif TARGET_MODE == "feet" then
    addUnique(parts, firstPart(character, {"LeftFoot", "LeftLowerLeg", "LeftUpperLeg", "Left Leg"}))
    addUnique(parts, firstPart(character, {"RightFoot", "RightLowerLeg", "RightUpperLeg", "Right Leg"}))
  elseif TARGET_MODE == "head" then
    addUnique(parts, firstPart(character, {"Head"}))
  elseif TARGET_MODE == "weapon" then
    local tool = character:FindFirstChildOfClass("Tool")
    if tool then
      for _, descendant in ipairs(tool:GetDescendants()) do
        if descendant:IsA("BasePart") then
          addUnique(parts, descendant)
        end
      end
    end
  elseif TARGET_MODE == "aura" then
    addUnique(parts, firstPart(character, {"HumanoidRootPart", "UpperTorso", "Torso"}))
  else
    addUnique(parts, firstPart(character, {"HumanoidRootPart"}))
    addUnique(parts, firstPart(character, {"UpperTorso", "Torso"}))
    addUnique(parts, firstPart(character, {"Head"}))
    addUnique(parts, firstPart(character, {"LeftUpperArm", "Left Arm"}))
    addUnique(parts, firstPart(character, {"RightUpperArm", "Right Arm"}))
    addUnique(parts, firstPart(character, {"LeftHand", "LeftLowerArm"}))
    addUnique(parts, firstPart(character, {"RightHand", "RightLowerArm"}))
    addUnique(parts, firstPart(character, {"LeftUpperLeg", "Left Leg"}))
    addUnique(parts, firstPart(character, {"RightUpperLeg", "Right Leg"}))
    addUnique(parts, firstPart(character, {"LeftFoot", "LeftLowerLeg"}))
    addUnique(parts, firstPart(character, {"RightFoot", "RightLowerLeg"}))
  end
  if #parts == 0 then
    addUnique(parts, firstPart(character, {"HumanoidRootPart", "Torso", "UpperTorso", "Head"}))
  end
  return parts
end

local function attachEffect(part, partCount, lightHost)
  cleanup(part)
  local scale = math.clamp(part.Size.Magnitude / 4, 0.65, 2.4)
  local rateScale = partCount > 4 and 0.72 or 1

  local attachment = Instance.new("Attachment")
  attachment.Name = PREFIX .. "Attachment"
  attachment.Parent = part

  local emitter = Instance.new("ParticleEmitter")
  emitter.Name = PREFIX .. "Particles"
  emitter.Texture = preset.texture
  emitter.Rate = math.max(4, math.floor(preset.rate * rateScale))
  emitter.Lifetime = preset.lifetime
  emitter.Speed = preset.speed
  emitter.SpreadAngle = preset.spread
  emitter.Size = NumberSequence.new({
    NumberSequenceKeypoint.new(0, preset.size[1] * scale),
    NumberSequenceKeypoint.new(0.5, preset.size[2] * scale),
    NumberSequenceKeypoint.new(1, preset.size[3] * scale),
  })
  emitter.Transparency = NumberSequence.new({
    NumberSequenceKeypoint.new(0, 1),
    NumberSequenceKeypoint.new(0.12, 0.18),
    NumberSequenceKeypoint.new(1, 1),
  })
  emitter.Color = preset.color
  emitter.LightEmission = ELEMENT == "Smoke" and 0.15 or 0.9
  emitter.LightInfluence = 0
  emitter.Rotation = NumberRange.new(-180, 180)
  emitter.RotSpeed = NumberRange.new(-90, 90)
  emitter.Acceleration = preset.accel
  emitter.EmissionDirection = Enum.NormalId.Top
  emitter.Enabled = true
  emitter.Parent = attachment

  if lightHost then
    local light = Instance.new("PointLight")
    light.Name = PREFIX .. "Light"
    light.Color = preset.light
    light.Brightness = ELEMENT == "Smoke" and 1 or 2.5
    light.Range = TARGET_MODE == "aura" and 14 or 10
    light.Shadows = false
    light.Parent = attachment
  end
end

local function applyToCharacter(character)
  local humanoid = character:FindFirstChildOfClass("Humanoid") or character:WaitForChild("Humanoid", 8)
  if not humanoid then return end
  local parts = targetParts(character)
  for index, part in ipairs(parts) do
    attachEffect(part, #parts, index == 1)
  end
  local root = firstPart(character, {"HumanoidRootPart", "UpperTorso", "Torso"})
  if root and preset.sound ~= "" then
    local oldSound = root:FindFirstChild(PREFIX .. "Sound")
    if oldSound then oldSound:Destroy() end
    local sound = Instance.new("Sound")
    sound.Name = PREFIX .. "Sound"
    sound.SoundId = preset.sound
    sound.Volume = 0.32
    sound.Looped = true
    sound.Parent = root
    sound:Play()
  end
end

local function hookPlayer(player)
  if player.Character then
    task.defer(applyToCharacter, player.Character)
  end
  player.CharacterAdded:Connect(function(character)
    task.defer(applyToCharacter, character)
  end)
end

if not APPLY_NPCS then
  Players.PlayerAdded:Connect(hookPlayer)
  for _, player in ipairs(Players:GetPlayers()) do
    hookPlayer(player)
  end
end

if APPLY_NPCS then
  local function maybeNpc(model)
    if not model:IsA("Model") or Players:GetPlayerFromCharacter(model) then return end
    if model:FindFirstChildOfClass("Humanoid") then
      applyToCharacter(model)
    end
  end
  for _, descendant in ipairs(Workspace:GetDescendants()) do
    if descendant:IsA("Model") then maybeNpc(descendant) end
  end
  Workspace.DescendantAdded:Connect(function(descendant)
    if descendant:IsA("Model") then task.defer(maybeNpc, descendant) end
  end)
end
`;
  return [{
    kind: "script",
    parent_path: "ServerScriptService",
    name: `BloxSmith_${element}_HumanoidVFX_Server`,
    payload: { source, request: safePrompt, language: languageName, vfx: true, element, target_mode: targetMode },
  }];
}

function narrowFeatureFallbackStudioActions(userText: string, languageName: string) {
  if (!isNarrowFeatureRequest(userText)) return [];
  const text = userText.toLowerCase();
  const safePrompt = userText.trim().slice(0, 220) || "single Roblox feature";

  if (isHumanoidVfxRequest(userText)) {
    return humanoidVfxFallbackStudioActions(userText, languageName);
  }

  if (/\b(speed\s*boost|speed\s*button|sprint|run\s*faster)\b/i.test(text)) {
    const source = `
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local ServerScriptService = game:GetService("ServerScriptService")
local StarterGui = game:GetService("StarterGui")

local remotes = ReplicatedStorage:FindFirstChild("BloxSmith_Remotes")
if not remotes then
  remotes = Instance.new("Folder")
  remotes.Name = "BloxSmith_Remotes"
  remotes.Parent = ReplicatedStorage
end

local speedBoostRemote = remotes:FindFirstChild("RequestSpeedBoost")
if not speedBoostRemote then
  speedBoostRemote = Instance.new("RemoteEvent")
  speedBoostRemote.Name = "RequestSpeedBoost"
  speedBoostRemote.Parent = remotes
end

local oldServer = ServerScriptService:FindFirstChild("BloxSmith_SpeedBoostServer")
if oldServer then oldServer:Destroy() end

local serverScript = Instance.new("Script")
serverScript.Name = "BloxSmith_SpeedBoostServer"
serverScript.Source = [==[
local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local remotes = ReplicatedStorage:WaitForChild("BloxSmith_Remotes")
local requestSpeedBoost = remotes:WaitForChild("RequestSpeedBoost")

local BOOST_SPEED = 32
local BOOST_TIME = 3
local COOLDOWN = 5
local lastUse = {}
local originalSpeeds = {}

local function getHumanoid(player)
  local character = player.Character
  if not character then return nil end
  return character:FindFirstChildOfClass("Humanoid")
end

local function resetPlayer(player)
  lastUse[player] = nil
  originalSpeeds[player] = nil
end

Players.PlayerRemoving:Connect(resetPlayer)

requestSpeedBoost.OnServerEvent:Connect(function(player)
  local now = os.clock()
  if lastUse[player] and now - lastUse[player] < COOLDOWN then return end

  local humanoid = getHumanoid(player)
  if not humanoid or humanoid.Health <= 0 then return end

  lastUse[player] = now
  local original = originalSpeeds[player] or humanoid.WalkSpeed
  originalSpeeds[player] = original
  humanoid.WalkSpeed = math.max(original, BOOST_SPEED)
  player:SetAttribute("SpeedBoostActive", true)

  task.delay(BOOST_TIME, function()
    local currentHumanoid = getHumanoid(player)
    if currentHumanoid and currentHumanoid.Parent then
      currentHumanoid.WalkSpeed = originalSpeeds[player] or 16
    end
    originalSpeeds[player] = nil
    player:SetAttribute("SpeedBoostActive", false)
  end)
end)
]==]
serverScript.Parent = ServerScriptService

local old = StarterGui:FindFirstChild("BloxSmith_SpeedBoostButton")
if old then old:Destroy() end

local gui = Instance.new("ScreenGui")
gui.Name = "BloxSmith_SpeedBoostButton"
gui.ResetOnSpawn = false
gui.IgnoreGuiInset = true
gui.DisplayOrder = 50
gui.Parent = StarterGui

local button = Instance.new("TextButton")
button.Name = "SpeedBoostButton"
button.AnchorPoint = Vector2.new(1, 1)
button.Position = UDim2.new(1, -24, 1, -96)
button.Size = UDim2.fromOffset(170, 56)
button.BackgroundColor3 = Color3.fromRGB(42, 145, 255)
button.BorderSizePixel = 0
button.Font = Enum.Font.GothamBold
button.Text = "Speed Boost"
button.TextColor3 = Color3.fromRGB(255, 255, 255)
button.TextScaled = true
button.AutoButtonColor = true
button.Parent = gui

local corner = Instance.new("UICorner")
corner.CornerRadius = UDim.new(0, 10)
corner.Parent = button

local stroke = Instance.new("UIStroke")
stroke.Color = Color3.fromRGB(220, 240, 255)
stroke.Transparency = 0.25
stroke.Thickness = 1
stroke.Parent = button

local scriptObj = Instance.new("LocalScript")
scriptObj.Name = "SpeedBoostClient"
scriptObj.Source = [==[
local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local UserInputService = game:GetService("UserInputService")

local player = Players.LocalPlayer
local button = script.Parent
local requestSpeedBoost = ReplicatedStorage:WaitForChild("BloxSmith_Remotes"):WaitForChild("RequestSpeedBoost")

local BOOST_TIME = 3
local COOLDOWN = 5
local ready = true

local function setButton(text, active)
  button.Text = text
  button.Active = active
  button.AutoButtonColor = active
  button.BackgroundTransparency = active and 0 or 0.35
end

local function requestBoost()
  if not ready then return end
  ready = false
  setButton("Boosting...", false)
  requestSpeedBoost:FireServer()

  task.delay(BOOST_TIME, function()
    for remaining = COOLDOWN, 1, -1 do
      setButton("Cooldown " .. remaining, false)
      task.wait(1)
    end
    setButton("Speed Boost", true)
    ready = true
  end)
end

button.Activated:Connect(requestBoost)

UserInputService.InputBegan:Connect(function(input, gameProcessed)
  if gameProcessed then return end
  if input.KeyCode == Enum.KeyCode.F then
    requestBoost()
  end
end)
]==]
scriptObj.Parent = button

gui:SetAttribute("BloxSmithRequest", ${JSON.stringify(safePrompt)})
gui:SetAttribute("Language", ${JSON.stringify(languageName)})
`;
    return [{
      kind: "run_lua",
      parent_path: "StarterGui",
      name: "BloxSmith_Create_SpeedBoost_Button",
      payload: { source },
    }];
  }

  if (/\b(high\s*jump|super\s*jump|jump\s*boost|jump\s*button|space\s*bar.*jump|jump.*space\s*bar|jump\s*(script|keybind|key\s*bind|button)|(?:script|keybind|key\s*bind|button).*jump)\b/i.test(text)) {
    const wantsButton = /\b(button|ui|gui|screen|mobile)\b/i.test(text);
    const buttonBuild = wantsButton ? `
local oldGui = StarterGui:FindFirstChild("BloxSmith_HighJumpButton")
if oldGui then oldGui:Destroy() end
local starterScriptsForCleanup = StarterPlayer:FindFirstChild("StarterPlayerScripts")
if starterScriptsForCleanup then
  local oldStandalone = starterScriptsForCleanup:FindFirstChild("BloxSmith_HighJumpClient")
  if oldStandalone then oldStandalone:Destroy() end
end

local gui = Instance.new("ScreenGui")
gui.Name = "BloxSmith_HighJumpButton"
gui.ResetOnSpawn = false
gui.IgnoreGuiInset = true
gui.DisplayOrder = 60
gui.Parent = StarterGui

local button = Instance.new("TextButton")
button.Name = "HighJumpButton"
button.AnchorPoint = Vector2.new(1, 1)
button.Position = UDim2.new(1, -24, 1, -164)
button.Size = UDim2.fromOffset(176, 58)
button.BackgroundColor3 = Color3.fromRGB(16, 185, 129)
button.BorderSizePixel = 0
button.Font = Enum.Font.GothamBold
button.Text = "High Jump"
button.TextColor3 = Color3.fromRGB(248, 255, 252)
button.TextScaled = true
button.AutoButtonColor = false
button.Parent = gui

local sizeLimit = Instance.new("UISizeConstraint")
sizeLimit.MinSize = Vector2.new(140, 48)
sizeLimit.MaxSize = Vector2.new(220, 72)
sizeLimit.Parent = button

local corner = Instance.new("UICorner")
corner.CornerRadius = UDim.new(0, 14)
corner.Parent = button

local stroke = Instance.new("UIStroke")
stroke.Color = Color3.fromRGB(187, 247, 208)
stroke.Transparency = 0.28
stroke.Thickness = 1.5
stroke.Parent = button

local gradient = Instance.new("UIGradient")
gradient.Color = ColorSequence.new({
  ColorSequenceKeypoint.new(0, Color3.fromRGB(52, 211, 153)),
  ColorSequenceKeypoint.new(1, Color3.fromRGB(5, 150, 105)),
})
gradient.Rotation = 90
gradient.Parent = button

local scale = Instance.new("UIScale")
scale.Scale = 1
scale.Parent = button

local client = makeClientScript("HighJumpClient", true)
client.Parent = button
` : `
local scripts = StarterPlayer:FindFirstChild("StarterPlayerScripts")
if not scripts then
  error("StarterPlayerScripts container is missing; Roblox should create it under StarterPlayer")
end
local oldGui = StarterGui:FindFirstChild("BloxSmith_HighJumpButton")
if oldGui then oldGui:Destroy() end
local oldClient = scripts:FindFirstChild("BloxSmith_HighJumpClient")
if oldClient then oldClient:Destroy() end
local client = makeClientScript("BloxSmith_HighJumpClient", false)
client.Parent = scripts
`;
    const source = `
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local ServerScriptService = game:GetService("ServerScriptService")
local StarterGui = game:GetService("StarterGui")
local StarterPlayer = game:GetService("StarterPlayer")

local remotes = ReplicatedStorage:FindFirstChild("BloxSmith_Remotes")
if not remotes then
  remotes = Instance.new("Folder")
  remotes.Name = "BloxSmith_Remotes"
  remotes.Parent = ReplicatedStorage
end

local request = remotes:FindFirstChild("RequestHighJump")
if not request then
  request = Instance.new("RemoteEvent")
  request.Name = "RequestHighJump"
  request.Parent = remotes
end

local accepted = remotes:FindFirstChild("HighJumpAccepted")
if not accepted then
  accepted = Instance.new("RemoteEvent")
  accepted.Name = "HighJumpAccepted"
  accepted.Parent = remotes
end

local oldServer = ServerScriptService:FindFirstChild("BloxSmith_HighJumpServer")
if oldServer then oldServer:Destroy() end

local server = Instance.new("Script")
server.Name = "BloxSmith_HighJumpServer"
server.Source = [==[
local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local remotes = ReplicatedStorage:WaitForChild("BloxSmith_Remotes")
local request = remotes:WaitForChild("RequestHighJump")
local accepted = remotes:WaitForChild("HighJumpAccepted")

local BOOST_JUMP_POWER = 115
local BOOST_JUMP_HEIGHT = 18
local BOOST_TIME = 0.65
local COOLDOWN = 2.25

local lastUse = {}
local originals = {}

local function getHumanoid(player)
  local character = player.Character
  if not character then return nil end
  return character:FindFirstChildOfClass("Humanoid")
end

local function rememberOriginal(player, humanoid)
  if originals[player] then return originals[player] end
  local entry = {
    useJumpPower = humanoid.UseJumpPower,
    jumpPower = humanoid.JumpPower,
    jumpHeight = humanoid.JumpHeight,
  }
  originals[player] = entry
  return entry
end

local function restore(player)
  local entry = originals[player]
  local humanoid = getHumanoid(player)
  if entry and humanoid and humanoid.Parent then
    humanoid.UseJumpPower = entry.useJumpPower
    humanoid.JumpPower = entry.jumpPower
    humanoid.JumpHeight = entry.jumpHeight
  end
  originals[player] = nil
  if player.Parent then player:SetAttribute("HighJumpActive", false) end
end

Players.PlayerRemoving:Connect(function(player)
  lastUse[player] = nil
  originals[player] = nil
end)

Players.PlayerAdded:Connect(function(player)
  player.CharacterAdded:Connect(function()
    originals[player] = nil
    player:SetAttribute("HighJumpActive", false)
  end)
end)

request.OnServerEvent:Connect(function(player)
  local now = os.clock()
  if lastUse[player] and now - lastUse[player] < COOLDOWN then return end

  local humanoid = getHumanoid(player)
  if not humanoid or humanoid.Health <= 0 then return end

  lastUse[player] = now
  rememberOriginal(player, humanoid)

  humanoid.UseJumpPower = true
  humanoid.JumpPower = math.max(humanoid.JumpPower, BOOST_JUMP_POWER)
  humanoid.JumpHeight = math.max(humanoid.JumpHeight, BOOST_JUMP_HEIGHT)
  player:SetAttribute("HighJumpActive", true)
  accepted:FireClient(player)

  task.delay(BOOST_TIME, function()
    restore(player)
  end)
end)
]==]
server.Parent = ServerScriptService

local function makeClientScript(name, parentIsButton)
  local scriptObj = Instance.new("LocalScript")
  scriptObj.Name = name
  scriptObj.Source = [==[
local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local ContextActionService = game:GetService("ContextActionService")
local TweenService = game:GetService("TweenService")

local player = Players.LocalPlayer
local remotes = ReplicatedStorage:WaitForChild("BloxSmith_Remotes")
local request = remotes:WaitForChild("RequestHighJump")
local accepted = remotes:WaitForChild("HighJumpAccepted")

local ACTION_NAME = "BloxSmithHighJump"
local COOLDOWN = 2.25
local ready = true
local button = script.Parent:IsA("TextButton") and script.Parent or nil
local scale = button and button:FindFirstChildOfClass("UIScale") or nil
local stroke = button and button:FindFirstChildOfClass("UIStroke") or nil

local function getHumanoid()
  local character = player.Character or player.CharacterAdded:Wait()
  return character:FindFirstChildOfClass("Humanoid") or character:WaitForChild("Humanoid", 5)
end

local function tweenButton(scaleValue, strokeTransparency)
  if scale then
    TweenService:Create(scale, TweenInfo.new(0.12, Enum.EasingStyle.Quad, Enum.EasingDirection.Out), { Scale = scaleValue }):Play()
  end
  if stroke then
    TweenService:Create(stroke, TweenInfo.new(0.12, Enum.EasingStyle.Quad, Enum.EasingDirection.Out), { Transparency = strokeTransparency }):Play()
  end
end

local function setButtonText(text, active)
  if not button then return end
  button.Text = text
  button.Active = active
  button.BackgroundTransparency = active and 0 or 0.18
end

local function startCooldown()
  task.spawn(function()
    for remaining = math.ceil(COOLDOWN), 1, -1 do
      setButtonText("Jump " .. remaining, false)
      task.wait(1)
    end
    ready = true
    setButtonText("High Jump", true)
  end)
end

local function requestHighJump()
  if not ready then return end
  ready = false
  setButtonText("Jumping...", false)
  request:FireServer()
  startCooldown()
end

accepted.OnClientEvent:Connect(function()
  local humanoid = getHumanoid()
  if humanoid and humanoid.Health > 0 then
    humanoid:ChangeState(Enum.HumanoidStateType.Jumping)
  end
end)

if button then
  button.Activated:Connect(requestHighJump)
  button.MouseEnter:Connect(function() if ready then tweenButton(1.05, 0.1) end end)
  button.MouseLeave:Connect(function() tweenButton(1, 0.28) end)
  button.MouseButton1Down:Connect(function() if ready then tweenButton(0.95, 0.08) end end)
  button.MouseButton1Up:Connect(function() if ready then tweenButton(1.05, 0.1) end end)
end

local function onAction(_, inputState)
  if inputState == Enum.UserInputState.Begin then
    requestHighJump()
  end
  return Enum.ContextActionResult.Sink
end

ContextActionService:UnbindAction(ACTION_NAME)
ContextActionService:BindActionAtPriority(ACTION_NAME, onAction, button == nil, Enum.ContextActionPriority.High.Value, Enum.KeyCode.Space, Enum.KeyCode.ButtonA)
ContextActionService:SetTitle(ACTION_NAME, "High Jump")

player.CharacterAdded:Connect(function()
  ready = true
  setButtonText("High Jump", true)
end)
]==]
  return scriptObj
end

${buttonBuild}
`;
    return [{
      kind: "run_lua",
      parent_path: wantsButton ? "StarterGui" : "StarterPlayer.StarterPlayerScripts",
      name: wantsButton ? "BloxSmith_Create_HighJump_Button" : "BloxSmith_Create_HighJump_Script",
      payload: { source, request: safePrompt, language: languageName },
    }];
  }

  if (/\b(double\s*jump|doublejump)\b/i.test(text)) {
    return [{
      kind: "localscript",
      parent_path: "StarterPlayer.StarterPlayerScripts",
      name: "BloxSmith_DoubleJumpClient",
      payload: {
        source: `local Players = game:GetService("Players")
local UserInputService = game:GetService("UserInputService")
local player = Players.LocalPlayer

local extraJumps = 1
local jumpsUsed = 0
local humanoid: Humanoid? = nil

local function bindCharacter(character: Model)
  humanoid = character:WaitForChild("Humanoid", 5) :: Humanoid?
  jumpsUsed = 0
  if humanoid then
    humanoid.StateChanged:Connect(function(_, newState)
      if newState == Enum.HumanoidStateType.Landed or newState == Enum.HumanoidStateType.Running then
        jumpsUsed = 0
      end
    end)
  end
end

if player.Character then bindCharacter(player.Character) end
player.CharacterAdded:Connect(bindCharacter)

UserInputService.JumpRequest:Connect(function()
  if not humanoid or humanoid.FloorMaterial ~= Enum.Material.Air then return end
  if jumpsUsed >= extraJumps then return end
  jumpsUsed += 1
  humanoid:ChangeState(Enum.HumanoidStateType.Jumping)
end)`,
      },
    }];
  }

  if (/\b(dash|dashing|air\s*dash|forward\s*dash)\b/i.test(text)) {
    const source = `
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local ServerScriptService = game:GetService("ServerScriptService")
local StarterPlayer = game:GetService("StarterPlayer")

local remotes = ReplicatedStorage:FindFirstChild("BloxSmith_Remotes")
if not remotes then
  remotes = Instance.new("Folder")
  remotes.Name = "BloxSmith_Remotes"
  remotes.Parent = ReplicatedStorage
end
local request = remotes:FindFirstChild("RequestDash") or Instance.new("RemoteEvent")
request.Name = "RequestDash"
request.Parent = remotes

local oldServer = ServerScriptService:FindFirstChild("BloxSmith_DashServer")
if oldServer then oldServer:Destroy() end
local server = Instance.new("Script")
server.Name = "BloxSmith_DashServer"
server.Source = [==[
local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local request = ReplicatedStorage:WaitForChild("BloxSmith_Remotes"):WaitForChild("RequestDash")

local DASH_POWER = 90
local COOLDOWN = 1.25
local last = {}

request.OnServerEvent:Connect(function(player, direction)
  if typeof(direction) ~= "Vector3" then return end
  local now = os.clock()
  if last[player] and now - last[player] < COOLDOWN then return end
  local char = player.Character; if not char then return end
  local hrp = char:FindFirstChild("HumanoidRootPart")
  local hum = char:FindFirstChildOfClass("Humanoid")
  if not hrp or not hum or hum.Health <= 0 then return end
  last[player] = now

  local dir = Vector3.new(direction.X, 0, direction.Z)
  if dir.Magnitude < 0.1 then dir = hrp.CFrame.LookVector end
  dir = dir.Unit

  local bv = Instance.new("BodyVelocity")
  bv.MaxForce = Vector3.new(1, 0, 1) * math.huge
  bv.Velocity = dir * DASH_POWER
  bv.Parent = hrp
  game:GetService("Debris"):AddItem(bv, 0.22)
end)

Players.PlayerRemoving:Connect(function(p) last[p] = nil end)
]==]
server.Parent = ServerScriptService

local scripts = StarterPlayer:FindFirstChild("StarterPlayerScripts")
if scripts then
  local old = scripts:FindFirstChild("BloxSmith_DashClient")
  if old then old:Destroy() end
  local client = Instance.new("LocalScript")
  client.Name = "BloxSmith_DashClient"
  client.Source = [==[
local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local ContextActionService = game:GetService("ContextActionService")
local UserInputService = game:GetService("UserInputService")

local player = Players.LocalPlayer
local request = ReplicatedStorage:WaitForChild("BloxSmith_Remotes"):WaitForChild("RequestDash")
local ACTION = "BloxSmithDash"
local COOLDOWN = 1.25
local ready = true

local function moveDir()
  local char = player.Character; if not char then return Vector3.zero end
  local hum = char:FindFirstChildOfClass("Humanoid"); if not hum then return Vector3.zero end
  local v = hum.MoveDirection
  if v.Magnitude > 0.1 then return v end
  local hrp = char:FindFirstChild("HumanoidRootPart")
  return hrp and hrp.CFrame.LookVector or Vector3.new(0,0,-1)
end

local function fire()
  if not ready then return end
  ready = false
  request:FireServer(moveDir())
  task.delay(COOLDOWN, function() ready = true end)
end

ContextActionService:UnbindAction(ACTION)
ContextActionService:BindActionAtPriority(ACTION, function(_, state)
  if state == Enum.UserInputState.Begin then fire() end
  return Enum.ContextActionResult.Pass
end, true, Enum.ContextActionPriority.High.Value, Enum.KeyCode.Q, Enum.KeyCode.ButtonL1)
ContextActionService:SetTitle(ACTION, "Dash")

player.CharacterAdded:Connect(function() ready = true end)
]==]
  client.Parent = scripts
end
`;
    return [{
      kind: "run_lua",
      parent_path: "ServerScriptService",
      name: "BloxSmith_Create_Dash_System",
      payload: { source, request: safePrompt, language: languageName },
    }];
  }

  if (/\b(fly|flying|flight|toggle\s*fly)\b/i.test(text) && !/\bfly\s*trap\b/i.test(text)) {
    const source = `
local StarterPlayer = game:GetService("StarterPlayer")
local scripts = StarterPlayer:FindFirstChild("StarterPlayerScripts")
if not scripts then error("StarterPlayerScripts missing") end
local old = scripts:FindFirstChild("BloxSmith_FlyToggle")
if old then old:Destroy() end
local client = Instance.new("LocalScript")
client.Name = "BloxSmith_FlyToggle"
client.Source = [==[
-- BloxSmith Fly Toggle (modern constraints — LinearVelocity + AlignOrientation, camera-relative)
local Players = game:GetService("Players")
local ContextActionService = game:GetService("ContextActionService")
local UserInputService = game:GetService("UserInputService")
local RunService = game:GetService("RunService")

local player = Players.LocalPlayer
local SPEED = 70
local ACTION = "BloxSmithFly"
local flying = false
local lv, ao, att
local heartbeat

local function cleanupOn(char)
  if not char then return end
  local hrp = char:FindFirstChild("HumanoidRootPart")
  if not hrp then return end
  for _, child in ipairs(hrp:GetChildren()) do
    if child.Name == "BloxSmith_FlyAttachment"
       or child.Name == "BloxSmith_FlyLV"
       or child.Name == "BloxSmith_FlyAO" then
      child:Destroy()
    end
  end
end

local function stop()
  flying = false
  if heartbeat then heartbeat:Disconnect(); heartbeat = nil end
  if lv then lv:Destroy(); lv = nil end
  if ao then ao:Destroy(); ao = nil end
  if att then att:Destroy(); att = nil end
  local char = player.Character
  local hum = char and char:FindFirstChildOfClass("Humanoid")
  if hum then
    hum.PlatformStand = false
    pcall(function() hum:ChangeState(Enum.HumanoidStateType.GettingUp) end)
  end
end

local function start()
  local char = player.Character or player.CharacterAdded:Wait()
  local hrp = char:WaitForChild("HumanoidRootPart", 5)
  local hum = char:FindFirstChildOfClass("Humanoid")
  if not hrp or not hum then return end
  cleanupOn(char)
  flying = true
  hum.PlatformStand = true

  att = Instance.new("Attachment")
  att.Name = "BloxSmith_FlyAttachment"
  att.Parent = hrp

  lv = Instance.new("LinearVelocity")
  lv.Name = "BloxSmith_FlyLV"
  lv.Attachment0 = att
  lv.RelativeTo = Enum.ActuatorRelativeTo.World
  lv.MaxForce = math.huge
  lv.VectorVelocity = Vector3.zero
  lv.Parent = hrp

  ao = Instance.new("AlignOrientation")
  ao.Name = "BloxSmith_FlyAO"
  ao.Attachment0 = att
  ao.Mode = Enum.OrientationAlignmentMode.OneAttachment
  ao.RigidityEnabled = true
  ao.CFrame = hrp.CFrame
  ao.Parent = hrp

  local camera = workspace.CurrentCamera
  heartbeat = RunService.RenderStepped:Connect(function()
    if not flying or not hrp.Parent then stop(); return end
    local move = hum.MoveDirection
    local look = camera.CFrame.LookVector
    local right = camera.CFrame.RightVector
    -- Project move (which is already camera-relative on the ground) onto camera basis
    -- so W = camera-forward including pitch, giving proper fly-up-when-looking-up behavior.
    local forward = Vector3.new(look.X, look.Y, look.Z)
    local rightV = Vector3.new(right.X, right.Y, right.Z)
    local up = 0
    if UserInputService:IsKeyDown(Enum.KeyCode.Space) then up = up + 1 end
    if UserInputService:IsKeyDown(Enum.KeyCode.LeftControl) or UserInputService:IsKeyDown(Enum.KeyCode.LeftShift) then up = up - 1 end
    local dir = (rightV * move.X) + (forward * -move.Z) + Vector3.new(0, up, 0)
    if dir.Magnitude > 0.05 then
      lv.VectorVelocity = dir.Unit * SPEED
    else
      lv.VectorVelocity = Vector3.zero
    end
    ao.CFrame = camera.CFrame
  end)
end

ContextActionService:UnbindAction(ACTION)
ContextActionService:BindActionAtPriority(ACTION, function(_, state)
  if state == Enum.UserInputState.Begin then
    if flying then stop() else start() end
  end
  return Enum.ContextActionResult.Pass
end, true, Enum.ContextActionPriority.High.Value, Enum.KeyCode.F, Enum.KeyCode.ButtonY)
ContextActionService:SetTitle(ACTION, "Toggle Fly (F)")

player.CharacterAdded:Connect(function() stop() end)
]==]
client.Parent = scripts
`;
    return [{
      kind: "run_lua",
      parent_path: "StarterPlayer.StarterPlayerScripts",
      name: "BloxSmith_Create_Fly_Toggle",
      payload: { source, request: safePrompt, language: languageName },
    }];
  }

  if (/\b(checkpoint|checkpoints|spawn\s*point.*save|save\s*point)\b/i.test(text)) {
    const source = `
local Workspace = game:GetService("Workspace")
local ServerScriptService = game:GetService("ServerScriptService")

local folder = Workspace:FindFirstChild("Checkpoints")
if not folder then
  folder = Instance.new("Folder"); folder.Name = "Checkpoints"; folder.Parent = Workspace
end

-- Seed 3 sample checkpoints in a line if none exist yet.
if #folder:GetChildren() == 0 then
  for i = 1, 3 do
    local p = Instance.new("Part")
    p.Name = "Checkpoint" .. i
    p.Size = Vector3.new(8, 1, 8)
    p.Position = Vector3.new(i * 30, 1, -20)
    p.Anchored = true
    p.CanCollide = true
    p.Material = Enum.Material.Neon
    p.Color = Color3.fromRGB(120, 220, 255)
    p:SetAttribute("Stage", i)
    p.Parent = folder
  end
end

local old = ServerScriptService:FindFirstChild("BloxSmith_CheckpointServer")
if old then old:Destroy() end
local server = Instance.new("Script")
server.Name = "BloxSmith_CheckpointServer"
server.Source = [==[
local Players = game:GetService("Players")
local Workspace = game:GetService("Workspace")
local folder = Workspace:WaitForChild("Checkpoints")
local saved = {}

local function respawnAt(player, cframe)
  local char = player.Character
  local hrp = char and char:FindFirstChild("HumanoidRootPart")
  if hrp then hrp.CFrame = cframe + Vector3.new(0, 4, 0) end
end

Players.PlayerAdded:Connect(function(player)
  local leaderstats = Instance.new("Folder"); leaderstats.Name = "leaderstats"; leaderstats.Parent = player
  local stage = Instance.new("IntValue"); stage.Name = "Stage"; stage.Value = 0; stage.Parent = leaderstats

  player.CharacterAdded:Connect(function()
    task.wait(0.25)
    local cframe = saved[player.UserId]
    if cframe then respawnAt(player, cframe) end
  end)
end)

Players.PlayerRemoving:Connect(function(p) saved[p.UserId] = nil end)

for _, part in ipairs(folder:GetChildren()) do
  if part:IsA("BasePart") then
    part.Touched:Connect(function(hit)
      local char = hit:FindFirstAncestorOfClass("Model")
      local player = char and Players:GetPlayerFromCharacter(char)
      if not player then return end
      local stageNum = tonumber(part:GetAttribute("Stage")) or 0
      local stats = player:FindFirstChild("leaderstats")
      local stat = stats and stats:FindFirstChild("Stage")
      if stat and stageNum > stat.Value then
        stat.Value = stageNum
        saved[player.UserId] = part.CFrame
      end
    end)
  end
end
]==]
server.Parent = ServerScriptService
`;
    return [{
      kind: "run_lua",
      parent_path: "Workspace",
      name: "BloxSmith_Create_Checkpoint_System",
      payload: { source, request: safePrompt, language: languageName },
    }];
  }


  if (/\b(kill\s*brick|damage\s*brick|lava\s*brick)\b/i.test(text)) {
    const source = `
local Workspace = game:GetService("Workspace")

local brick = Workspace:FindFirstChild("BloxSmith_KillBrick")
if not brick then
  brick = Instance.new("Part")
  brick.Name = "BloxSmith_KillBrick"
  brick.Size = Vector3.new(12, 1, 12)
  brick.Position = Vector3.new(0, 1, -18)
  brick.Anchored = true
  brick.CanCollide = true
  brick.Material = Enum.Material.Neon
  brick.Color = Color3.fromRGB(255, 70, 40)
  brick.Parent = Workspace
end

local oldScript = brick:FindFirstChild("KillOnTouch")
if oldScript then oldScript:Destroy() end

local scriptObj = Instance.new("Script")
scriptObj.Name = "KillOnTouch"
scriptObj.Source = [==[
local brick = script.Parent
local debounce = {}

brick.Touched:Connect(function(hit)
  local character = hit:FindFirstAncestorOfClass("Model")
  local humanoid = character and character:FindFirstChildOfClass("Humanoid")
  if not humanoid or debounce[humanoid] then return end
  debounce[humanoid] = true
  humanoid.Health = 0
  task.delay(1, function() debounce[humanoid] = nil end)
end)
]==]
scriptObj.Parent = brick
`;
    return [{ kind: "run_lua", parent_path: "Workspace", name: "BloxSmith_Create_KillBrick", payload: { source } }];
  }

  if (/\b(button)\b/i.test(text)) {
    const source = `
local StarterGui = game:GetService("StarterGui")

local old = StarterGui:FindFirstChild("BloxSmith_SingleButton")
if old then old:Destroy() end

local gui = Instance.new("ScreenGui")
gui.Name = "BloxSmith_SingleButton"
gui.ResetOnSpawn = false
gui.Parent = StarterGui

local button = Instance.new("TextButton")
button.Name = "RequestedButton"
button.AnchorPoint = Vector2.new(0.5, 1)
button.Position = UDim2.new(0.5, 0, 1, -80)
button.Size = UDim2.fromOffset(190, 54)
button.BackgroundColor3 = Color3.fromRGB(42, 145, 255)
button.BorderSizePixel = 0
button.Font = Enum.Font.GothamBold
button.Text = "Button"
button.TextColor3 = Color3.fromRGB(255, 255, 255)
button.TextScaled = true
button.Parent = gui

local corner = Instance.new("UICorner")
corner.CornerRadius = UDim.new(0, 10)
corner.Parent = button

local scriptObj = Instance.new("LocalScript")
scriptObj.Name = "ButtonClient"
scriptObj.Source = [==[
local button = script.Parent

button.Activated:Connect(function()
  button.Text = "Clicked"
  task.delay(0.8, function()
    if button.Parent then button.Text = "Button" end
  end)
end)
]==]
scriptObj.Parent = button
`;
    return [{ kind: "run_lua", parent_path: "StarterGui", name: "BloxSmith_Create_Single_Button", payload: { source } }];
  }

  if (/\b(script|server\s*script|local\s*script)\b/i.test(text)) {
    const wantsLocal = /\b(local\s*script|localscript|client\s*script)\b/i.test(text);
    const scriptSource = wantsLocal
      ? `local Players = game:GetService("Players")
local player = Players.LocalPlayer

local function onCharacterAdded(character)
  local humanoid = character:WaitForChild("Humanoid", 5)
  if humanoid then
    print("[BloxSmith] Client script connected for " .. player.Name)
  end
end

if player.Character then
  onCharacterAdded(player.Character)
end
player.CharacterAdded:Connect(onCharacterAdded)`
      : `local Players = game:GetService("Players")

local function onPlayerAdded(player)
  player:SetAttribute("BloxSmithScriptActive", true)
  print("[BloxSmith] Server script connected for " .. player.Name)
end

Players.PlayerAdded:Connect(onPlayerAdded)
for _, player in ipairs(Players:GetPlayers()) do
  onPlayerAdded(player)
end`;
    return [{
      kind: wantsLocal ? "localscript" : "script",
      parent_path: wantsLocal ? "StarterPlayer.StarterPlayerScripts" : "ServerScriptService",
      name: wantsLocal ? "BloxSmith_ClientScript" : "BloxSmith_ServerScript",
      payload: { source: scriptSource, request: safePrompt, language: languageName },
    }];
  }

  return [];
}

const TOOLBOX_ASSET_FINDER_CATEGORIES = [
  { label: "pistol", role: "weapon", folder: "Weapons", test: /\b(pistol|handgun)\b/i, keyword: "pistol weapon model" },
  { label: "rifle", role: "weapon", folder: "Weapons", test: /\b(rifle|gun|blaster|laser\s*gun)\b/i, keyword: "rifle gun weapon model" },
  { label: "sword", role: "weapon", folder: "Weapons", test: /\b(sword|katana|blade)\b/i, keyword: "sword weapon model" },
  { label: "bow", role: "weapon", folder: "Weapons", test: /\b(bow|crossbow)\b/i, keyword: "bow weapon model" },
  { label: "sports car", role: "vehicle", folder: "Vehicles", test: /\b(sports?\s*car|super\s*car|race\s*car)\b/i, keyword: "sports car vehicle model" },
  { label: "police car", role: "vehicle", folder: "Vehicles", test: /\bpolice\s*car\b/i, keyword: "police car vehicle model" },
  { label: "car", role: "vehicle", folder: "Vehicles", test: /\b(car|vehicle)\b/i, keyword: "car vehicle model" },
  { label: "truck", role: "vehicle", folder: "Vehicles", test: /\btruck\b/i, keyword: "truck vehicle model" },
  { label: "plane", role: "vehicle", folder: "Vehicles", test: /\b(plane|airplane|jet)\b/i, keyword: "plane vehicle model" },
  { label: "boat", role: "vehicle", folder: "Vehicles", test: /\bboat\b/i, keyword: "boat vehicle model" },
  { label: "zombie", role: "character", folder: "Characters", test: /\bzombie\b/i, keyword: "zombie npc model" },
  { label: "monster", role: "character", folder: "Characters", test: /\b(monster|creature|enemy)\b/i, keyword: "monster npc model" },
  { label: "shopkeeper", role: "character", folder: "Characters", test: /\b(shopkeeper|vendor|merchant)\b/i, keyword: "shopkeeper npc model" },
  { label: "pet", role: "character", folder: "Characters", test: /\b(pet|dog|cat)\b/i, keyword: "pet model" },
  { label: "police station", role: "building", folder: "Buildings", test: /\bpolice\s*station\b/i, keyword: "police station building model" },
  { label: "hospital", role: "building", folder: "Buildings", test: /\bhospital\b/i, keyword: "hospital building model" },
  { label: "modern house", role: "building", folder: "Buildings", test: /\b(modern|contemporary)\s*house\b/i, keyword: "modern house building model" },
  { label: "house", role: "building", folder: "Buildings", test: /\bhouse\b/i, keyword: "house building model" },
  { label: "shop", role: "building", folder: "Buildings", test: /\b(shop|store|storefront)\b/i, keyword: "shop storefront building model" },
  { label: "castle", role: "building", folder: "Buildings", test: /\bcastle\b/i, keyword: "castle building model" },
  { label: "pine tree", role: "nature", folder: "Nature", test: /\bpine\s*tree(s)?\b/i, keyword: "pine tree nature model" },
  { label: "oak tree", role: "nature", folder: "Nature", test: /\boak\s*tree(s)?\b/i, keyword: "oak tree nature model" },
  { label: "palm tree", role: "nature", folder: "Nature", test: /\bpalm\s*tree(s)?\b/i, keyword: "palm tree nature model" },
  { label: "tree", role: "nature", folder: "Nature", test: /\b(tree|trees)\b/i, keyword: "tree nature model" },
  { label: "rock", role: "nature", folder: "Nature", test: /\b(rock|rocks|boulder)\b/i, keyword: "rock nature model" },
  { label: "grass", role: "nature", folder: "Nature", test: /\b(grass|flower|flowers|bush|bushes)\b/i, keyword: "grass flower bush nature model" },
  { label: "mountain", role: "nature", folder: "Nature", test: /\b(mountain|mountains|cliff)\b/i, keyword: "mountain cliff nature model" },
  { label: "road", role: "environment", folder: "Roads", test: /\b(road|street|highway|asphalt)\b/i, keyword: "road street asphalt model" },
  { label: "sidewalk", role: "environment", folder: "Roads", test: /\b(sidewalk|pavement|curb)\b/i, keyword: "sidewalk pavement curb model" },
  { label: "street light", role: "prop", folder: "Props", test: /\b(street\s*light|lamp\s*post|lamppost|streetlamp)\b/i, keyword: "street light lamp post model" },
  { label: "traffic light", role: "prop", folder: "Props", test: /\btraffic\s*light\b/i, keyword: "traffic light model" },
  { label: "fence", role: "prop", folder: "Props", test: /\b(fence|fencing)\b/i, keyword: "fence model" },
  { label: "bench", role: "prop", folder: "Props", test: /\bbench\b/i, keyword: "bench park model" },
  { label: "crate", role: "prop", folder: "Props", test: /\b(crate|barrel|box)\b/i, keyword: "crate barrel prop model" },
  { label: "sign", role: "prop", folder: "Props", test: /\b(sign|street\s*sign)\b/i, keyword: "sign prop model" },
  { label: "furniture", role: "prop", folder: "Props", test: /\b(furniture|chair|table|bed|sofa|lamp)\b/i, keyword: "furniture prop model" },
  { label: "checkpoint", role: "gameplay", folder: "Gameplay", test: /\bcheckpoint\b/i, keyword: "checkpoint obby model" },
  { label: "coin", role: "gameplay", folder: "Gameplay", test: /\b(coin|coins|gem|collectible)\b/i, keyword: "coin collectible model" },
  { label: "door", role: "gameplay", folder: "Gameplay", test: /\bdoor\b/i, keyword: "door model" },
  { label: "button", role: "gameplay", folder: "Gameplay", test: /\bbutton|portal\b/i, keyword: "button portal model" },
  { label: "fire", role: "effect", folder: "Effects", test: /\b(fire|flame|smoke|explosion|magic|particle|effect)\b/i, keyword: "fire smoke particle effect model" },
];

function isSinglePhysicalAssetRequest(userText: string) {
  if (isHumanoidVfxRequest(userText)) return false;
  if (!detectSingleAssetIntent(userText)) return false;
  if (isToolboxMapRequest(userText)) return false;
  return true;
}

function singlePhysicalAssetLabel(userText: string, fallback = "asset") {
  const match = TOOLBOX_ASSET_FINDER_CATEGORIES.find((category) => category.test.test(userText));
  const label = (match?.label || cleanedAssetPrompt(userText) || fallback || "asset")
    .replace(/\b(model|asset|roblox|toolbox|safe|free)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  return label || "asset";
}

function cleanSingleAssetActionName(label: string) {
  const base = label
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word[0]?.toUpperCase() + word.slice(1).toLowerCase())
    .join("_")
    .replace(/[^A-Za-z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return `${base || "Asset"}_01`;
}

function cleanedAssetPrompt(userText: string) {
  return userText
    .replace(/\b(add|make|create|build|insert|place|spawn|give me|put|a|an|the|one|single|real|safe|free|toolbox|roblox|please|me|into|in|my|game)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
}

function toolboxAssetFinderRequests(userText: string): Array<ToolboxSetRequest & { role?: string; folder?: string }> {
  if (isHumanoidVfxRequest(userText)) return [];
  if (!isSinglePhysicalAssetRequest(userText) && (isToolboxMapRequest(userText) || isRobloxSystemRequest(userText))) return [];
  const matches: Array<ToolboxSetRequest & { role?: string; folder?: string }> = [];
  for (const category of TOOLBOX_ASSET_FINDER_CATEGORIES) {
    if (category.test.test(userText) && !matches.some((m) => m.label === category.label)) {
      matches.push({
        label: category.label,
        keyword: category.keyword,
        category: "Model",
        required: true,
        limit: 10,
        role: category.role,
        folder: category.folder,
      });
    }
  }
  if (matches.length === 0 && isSimpleSingleThingRequest(userText)) {
    const query = cleanedAssetPrompt(userText);
    if (query) {
      matches.push({
        label: query,
        keyword: `${query} model`,
        category: "Model",
        required: true,
        limit: 12,
        role: "asset",
        folder: "Requested",
      });
    }
  }
  return (isSinglePhysicalAssetRequest(userText) || isSimpleSingleThingRequest(userText) ? matches.slice(0, 1) : matches).slice(0, 6);
}

async function toolboxAssetFinderStudioActions(userText: string) {
  const requests = toolboxAssetFinderRequests(userText);
  if (requests.length === 0) return [];
  try {
    if (isSinglePhysicalAssetRequest(userText)) {
      const request = requests[0];
      const label = singlePhysicalAssetLabel(userText, request?.label);
      const query = request?.keyword || `${label} model`;
      const out = await searchRobloxToolbox(query, "Model", 8, { singleAssetOnly: true });
      const picked = out.results[0];
      if (!picked) return [];
      return [{
        kind: "insert_asset",
        parent_path: "Workspace",
        name: cleanSingleAssetActionName(label),
        payload: {
          ...(picked.insertPayload ?? {}),
          asset_id: picked.id,
          fallback_ids: (picked.fallbackIds ?? []).slice(0, 6),
          asset_name: picked.name,
          creator_name: picked.creatorName,
          thumbnail: picked.thumbnail,
          source_query: picked.sourceQuery ?? query,
          toolbox_only: true,
          free_only: true,
          no_scripts: true,
          strip_scripts: true,
          allow_scripts: false,
          disable_procedural_fallback: true,
          single_asset_only: true,
          extract_single: true,
          exact_quantity: 1,
          max_children: 25,
          max_scripts: 0,
          reject_pack_names: true,
          stop_after_insert: true,
          ground_snap: true,
          anchor: true,
          requested_asset_type: label,
          clean_name: cleanSingleAssetActionName(label),
          tags: ["bloxsmith", "single-asset", "real-toolbox-asset", label],
          preview: {
            id: picked.id,
            name: picked.name,
            creatorName: picked.creatorName,
            thumbnail: picked.thumbnail,
            safety: picked.safety,
            relevance: picked.relevance,
            hasScripts: picked.hasScripts,
            scriptCount: picked.scriptCount ?? 0,
            singleAssetOnly: true,
          },
        },
      }];
    }

    const set = await searchRobloxToolboxSet(requests, 10);
    const actions: any[] = [];
    const usedIds = new Set<number>();
    const slots = [
      { position: [0, 4, -24], yaw: 0 },
      { position: [-22, 4, -10], yaw: 18 },
      { position: [22, 4, -10], yaw: -18 },
      { position: [-32, 4, 18], yaw: 35 },
      { position: [32, 4, 18], yaw: -35 },
      { position: [0, 4, 34], yaw: 180 },
    ];

    for (const request of set.requests) {
      const original = requests.find((r) => r.label === request.label);
      const picked = request.results.find((r) => !usedIds.has(r.id));
      if (!picked) continue;
      usedIds.add(picked.id);
      const slot = slots[actions.length % slots.length];
      actions.push({
        kind: "insert_asset",
        parent_path: "Workspace",
        name: `Toolbox_${request.label.replace(/[^a-z0-9]+/gi, "_").replace(/^_+|_+$/g, "") || "Asset"}`,
        payload: {
          asset_id: picked.id,
          fallback_ids: picked.fallbackIds ?? [],
          free_only: true,
          no_scripts: true,
          allow_scripts: false,
          folder_name: "BloxSmith_ToolboxAssetFinder",
          position: slot.position,
          yaw: slot.yaw,
          scale: 1,
          placement_role: original?.role ?? "asset",
          district: original?.folder ?? "Requested",
          toolbox_only: true,
          disable_procedural_fallback: true,
          tags: ["bloxsmith", "toolbox-asset-finder", "real-toolbox-asset", request.label, original?.role ?? "asset"],
          asset_name: picked.name,
          creator_name: picked.creatorName,
          thumbnail: picked.thumbnail,
          source_query: picked.sourceQuery ?? request.keyword,
          quality_tier: picked.qualityTier ?? "usable",
          safety_score: picked.safety,
          relevance_score: picked.relevance,
          has_scripts: picked.hasScripts,
          script_count: picked.scriptCount ?? 0,
          preview: {
            id: picked.id,
            name: picked.name,
            creatorName: picked.creatorName,
            thumbnail: picked.thumbnail,
            safety: picked.safety,
            relevance: picked.relevance,
            hasScripts: picked.hasScripts,
            scriptCount: picked.scriptCount ?? 0,
          },
        },
      });
    }

    if (actions.length === 0) return [];
    actions.push({
      kind: "run_lua",
      parent_path: "Workspace",
      name: "BloxSmith_Arrange_Toolbox_Asset_Finder",
      payload: {
        source: `
local Workspace = game:GetService("Workspace")
local folder = Workspace:FindFirstChild("BloxSmith_ToolboxAssetFinder")
if folder then
  local buckets = {"Weapons", "Vehicles", "Characters", "Buildings", "Nature", "Maps", "Props", "Gameplay", "Effects", "Requested"}
  for _, name in ipairs(buckets) do
    if not folder:FindFirstChild(name) then
      local child = Instance.new("Folder")
      child.Name = name
      child.Parent = folder
    end
  end
  local function snap(inst)
    if inst:IsA("Model") then
      local ok, cf, size = pcall(function() return inst:GetBoundingBox() end)
      if ok and size then
        local _, yaw = inst:GetPivot():ToOrientation()
        inst:PivotTo(CFrame.new(cf.Position.X, math.max(0, size.Y / 2), cf.Position.Z) * CFrame.Angles(0, yaw, 0))
      end
    elseif inst:IsA("BasePart") then
      inst.CFrame = CFrame.new(inst.Position.X, math.max(0, inst.Size.Y / 2), inst.Position.Z) * inst.CFrame.Rotation
    end
  end
  for _, asset in ipairs(folder:GetChildren()) do
    if not asset:IsA("Folder") then
      snap(asset)
      for _, inst in ipairs(asset:GetDescendants()) do
        if inst:IsA("BasePart") then
          inst.Anchored = true
          inst.CanCollide = true
        elseif inst:IsA("Script") or inst:IsA("LocalScript") or inst:IsA("ModuleScript") then
          inst.Disabled = true
        end
      end
      local district = tostring(asset:GetAttribute("BloxSmithDistrict") or "Requested")
      local bucket = folder:FindFirstChild(district) or folder:FindFirstChild("Requested")
      if bucket then asset.Parent = bucket end
    end
  end
  for _, bucket in ipairs(folder:GetChildren()) do
    if bucket:IsA("Folder") and #bucket:GetChildren() == 0 then bucket:Destroy() end
  end
  Workspace:SetAttribute("BloxSmithToolboxAssetFinder", true)
  Workspace:SetAttribute("BloxSmithProceduralFallbackDisabled", true)
end
`,
      },
    });
    actions.push({
      kind: "scan_project",
      parent_path: "Workspace",
      name: "BloxSmith_Scan_Toolbox_Asset_Finder",
      payload: { reason: "verify_real_toolbox_asset_inserted_and_scripts_disabled" },
    });
    return actions;
  } catch (err) {
    console.warn("[chat] toolbox asset finder failed", err);
    return [];
  }
}

function visibleGrassStudioActions(userText: string) {
  const safePrompt = userText.trim().slice(0, 220) || "add realistic grass";
  const source = `
local Workspace = game:GetService("Workspace")
local Terrain = Workspace.Terrain
local Lighting = game:GetService("Lighting")

local function safeSet(inst, prop, value)
  pcall(function()
    inst[prop] = value
  end)
end

pcall(function()
  Terrain:SetMaterialColor(Enum.Material.Grass, Color3.fromRGB(70, 150, 66))
end)
safeSet(Terrain, "Decoration", true)

local changedLargeGround = 0
for _, inst in ipairs(Workspace:GetDescendants()) do
  if inst:IsA("BasePart") then
    local n = inst.Name:lower()
    local flatLarge = inst.Size.X >= 40 and inst.Size.Z >= 40 and inst.Size.Y <= 8
    if n:find("baseplate") or n:find("ground") or n:find("floor") or flatLarge then
      inst.Material = Enum.Material.Grass
      inst.Color = Color3.fromRGB(75, 155, 70)
      safeSet(inst, "TopSurface", Enum.SurfaceType.Smooth)
      changedLargeGround += 1
    end
  end
end

local surface = Workspace:FindFirstChild("BloxSmith_Visible_Grass_Surface")
if not surface then
  surface = Instance.new("Part")
  surface.Name = "BloxSmith_Visible_Grass_Surface"
  surface.Anchored = true
  surface.CanCollide = true
  surface.TopSurface = Enum.SurfaceType.Smooth
  surface.BottomSurface = Enum.SurfaceType.Smooth
  surface.Parent = Workspace
end
surface.Size = Vector3.new(260, 0.5, 260)
surface.Position = Vector3.new(0, 0.25, 0)
surface.Material = Enum.Material.Grass
surface.Color = Color3.fromRGB(68, 158, 72)

pcall(function()
  Terrain:FillBlock(CFrame.new(0, -2, 0), Vector3.new(260, 4, 260), Enum.Material.Grass)
end)

local marker = Workspace:FindFirstChild("BloxSmith_Grass_Confirmation")
if not marker then
  marker = Instance.new("Part")
  marker.Name = "BloxSmith_Grass_Confirmation"
  marker.Anchored = true
  marker.CanCollide = false
  marker.Transparency = 1
  marker.Size = Vector3.new(2, 2, 2)
  marker.Position = Vector3.new(0, 6, 0)
  marker.Parent = Workspace
end
marker:SetAttribute("BloxSmithRequest", ${JSON.stringify(safePrompt)})
marker:SetAttribute("LargeGroundPartsChanged", changedLargeGround)
marker:SetAttribute("GrassSurfaceCreated", true)

Lighting.ClockTime = math.max(Lighting.ClockTime, 12)
Lighting.Brightness = math.max(Lighting.Brightness, 2)
`;

  return [
    {
      kind: "run_lua",
      parent_path: "Workspace",
      name: "BloxSmith_Apply_Visible_Grass",
      payload: { source },
    },
  ];
}

function visibleSnowTerrainStudioActions(userText: string) {
  const safePrompt = userText.trim().slice(0, 220) || "add snow terrain";
  const source = `
local Workspace = game:GetService("Workspace")
local Lighting = game:GetService("Lighting")
local Terrain = Workspace.Terrain

local request = ${JSON.stringify(safePrompt)}

local root = Workspace:FindFirstChild("BloxSmith_Snow_Terrain")
if root then root:Destroy() end
root = Instance.new("Folder")
root.Name = "BloxSmith_Snow_Terrain"
root.Parent = Workspace

local created = {}
local function remember(inst)
  table.insert(created, inst)
  return inst
end

local function part(parent, name, size, cf, color, material, shape)
  local p = Instance.new("Part")
  p.Name = name
  p.Anchored = true
  p.CanCollide = true
  p.Size = size
  p.CFrame = cf
  p.Color = color
  p.Material = material or Enum.Material.Snow
  p.TopSurface = Enum.SurfaceType.Smooth
  p.BottomSurface = Enum.SurfaceType.Smooth
  if shape then p.Shape = shape end
  p.Parent = parent
  return remember(p)
end

local function model(parent, name)
  local m = Instance.new("Model")
  m.Name = name
  m.Parent = parent
  remember(m)
  return m
end

pcall(function()
  Terrain:SetMaterialColor(Enum.Material.Snow, Color3.fromRGB(238, 244, 252))
  Terrain:SetMaterialColor(Enum.Material.Ice, Color3.fromRGB(178, 220, 242))
  Terrain:SetMaterialColor(Enum.Material.Rock, Color3.fromRGB(150, 158, 164))
  Terrain:FillBlock(CFrame.new(0, -3, 0), Vector3.new(280, 6, 280), Enum.Material.Snow)
end)

local ground = part(root, "Visible_Snow_Ground", Vector3.new(280, 1.2, 280), CFrame.new(0, 0.6, 0), Color3.fromRGB(242, 248, 255), Enum.Material.Snow)

local hills = Instance.new("Folder")
hills.Name = "Snow_Hills"
hills.Parent = root
for i, data in ipairs({{-85,-68,34},{-48,72,24},{82,58,30},{96,-44,22},{8,98,18}}) do
  pcall(function() Terrain:FillBall(Vector3.new(data[1], data[3] / 2 - 2, data[2]), data[3], Enum.Material.Snow) end)
  part(hills, "Snow_Hill_" .. i, Vector3.new(data[3] * 1.55, data[3] * 0.48, data[3] * 1.55), CFrame.new(data[1], data[3] * 0.28, data[2]), Color3.fromRGB(228, 238, 248), Enum.Material.Snow, Enum.PartType.Ball)
end

local trees = Instance.new("Folder")
trees.Name = "Snow_Pines"
trees.Parent = root
for i, pos in ipairs({{-74,-28},{-34,46},{28,-58},{62,32},{-92,78},{88,-82},{8,70}}) do
  local m = model(trees, "Snow_Pine_" .. i)
  local trunk = part(m, "Trunk", Vector3.new(1.7, 10, 1.7), CFrame.new(pos[1], 5.5, pos[2]), Color3.fromRGB(84, 55, 34), Enum.Material.Wood)
  for k, dy in ipairs({0, 3.1, 6.1}) do
    local radius = 9 - k * 1.7
    part(m, "Snowy_Branches_" .. k, Vector3.new(radius, 4.2, radius), CFrame.new(pos[1], 9 + dy, pos[2]), Color3.fromRGB(214, 228, 236), Enum.Material.Snow, Enum.PartType.Ball)
  end
  m.PrimaryPart = trunk
end

local ice = Instance.new("Folder")
ice.Name = "Ice_Features"
ice.Parent = root
part(ice, "Frozen_Pond", Vector3.new(58, 0.35, 38), CFrame.new(42, 0.95, -24) * CFrame.Angles(0, math.rad(-12), 0), Color3.fromRGB(156, 216, 242), Enum.Material.Ice)
for i, pos in ipairs({{72,-64,16},{-58,18,12},{18,-92,10}}) do
  part(ice, "Ice_Rock_" .. i, Vector3.new(pos[3], pos[3] * 0.75, pos[3]), CFrame.new(pos[1], pos[3] * 0.38, pos[2]) * CFrame.Angles(0, math.rad(i * 23), 0), Color3.fromRGB(184, 224, 244), Enum.Material.Ice, Enum.PartType.Ball)
end

local spawn = Instance.new("SpawnLocation")
spawn.Name = "Snow_Terrain_Spawn"
spawn.Anchored = true
spawn.Neutral = true
spawn.Size = Vector3.new(8, 1, 8)
spawn.Position = Vector3.new(0, 2.2, -72)
spawn.Color = Color3.fromRGB(110, 215, 255)
spawn.Material = Enum.Material.Ice
spawn.Parent = root
remember(spawn)

local marker = part(root, "BloxSmith_Snow_Built_Marker", Vector3.new(18, 10, 1), CFrame.new(0, 7, -88), Color3.fromRGB(32, 45, 62), Enum.Material.Metal)
local gui = Instance.new("SurfaceGui")
gui.Face = Enum.NormalId.Front
gui.SizingMode = Enum.SurfaceGuiSizingMode.PixelsPerStud
gui.PixelsPerStud = 24
gui.Parent = marker
local label = Instance.new("TextLabel")
label.BackgroundTransparency = 1
label.Size = UDim2.fromScale(1, 1)
label.Font = Enum.Font.GothamBold
label.TextScaled = true
label.TextWrapped = true
label.TextColor3 = Color3.fromRGB(244, 250, 255)
label.Text = "Snow terrain built"
label.Parent = gui

pcall(function()
  Lighting.ClockTime = 9.5
  Lighting.Brightness = 2.2
  Lighting.OutdoorAmbient = Color3.fromRGB(178, 194, 216)
  Lighting.FogColor = Color3.fromRGB(218, 230, 244)
  Lighting.FogEnd = 360
end)

root:SetAttribute("BloxSmithRequest", request)
root:SetAttribute("VisibleSnowTerrain", true)
root:SetAttribute("CreatedCount", #created)

return {
  instance = root,
  path = root:GetFullName(),
  created = created,
  visible = true,
  summary = "Created visible snow terrain with ground, hills, pines, ice, spawn, and marker"
}
`;

  return [
    {
      kind: "run_lua",
      parent_path: "Workspace",
      name: "BloxSmith_Create_Visible_Snow_Terrain",
      payload: { source, request: safePrompt, visible_output_required: true },
    },
    {
      kind: "scan_project",
      parent_path: "Workspace",
      name: "BloxSmith_Scan_After_Snow_Terrain",
      payload: { reason: "verify_visible_snow_terrain_was_created" },
    },
  ];
}

function proceduralEnvironmentStudioActions(userText: string, languageName: string) {
  const safePrompt = userText.trim().slice(0, 260) || "procedural Roblox environment asset";
  const text = userText.toLowerCase();
  const wants = {
    tree: /\b(tree|trees|forest|woods|foliage|palm|pine|oak)\b/i.test(text),
    bush: /\b(bush|bushes|shrub|shrubs|hedge|hedges)\b/i.test(text),
    rock: /\b(rock|rocks|boulder|boulders|stone|stones)\b/i.test(text),
    grass: /\b(grass|grassland|field|flowers?|meadow|plants?)\b/i.test(text),
    mountain: /\b(mountain|mountains|hill|hills|cliff|cliffs|valley)\b/i.test(text),
    water: /\b(river|rivers|lake|lakes|pond|waterfall|stream|water|ocean)\b/i.test(text),
    road: /\b(road|roads|path|paths|trail|street|sidewalk)\b/i.test(text),
    house: /\b(house|houses|home|cabin|hut)\b/i.test(text),
    building: /\b(building|buildings|shop|store|tower|skyscraper|base)\b/i.test(text),
    fence: /\b(fence|fences|gate|wall)\b/i.test(text),
    light: /\b(street\s*light|streetlight|lamp|lantern|light\s*post|torch)\b/i.test(text),
    bridge: /\b(bridge|bridges|dock|pier)\b/i.test(text),
    prop: /\b(prop|props|crate|barrel|sign|bench|decoration|decorations?)\b/i.test(text),
    furniture: /\b(furniture|chair|table|bed|sofa|couch|desk|bookshelf|shelf)\b/i.test(text),
    vehicle: /\b(vehicle|vehicles|car|truck|cart|boat|bike|motorcycle|plane)\b/i.test(text),
    npc: /\b(npc|npcs|villager|character|person|enemy|zombie|monster)\b/i.test(text),
    spawn: /\b(spawn|spawnlocation|start|checkpoint)\b/i.test(text),
    snow: /\b(snow|snowy|arctic|tundra|ice|iceberg|glacier|winter)\b/i.test(text),
    desert: /\b(desert|dune|dunes|sand\s*dune|cactus|cacti|oasis|sahara)\b/i.test(text),
    beach: /\b(beach|shore|coast|coastline|tropical|palm\s*beach)\b/i.test(text),
    volcano: /\b(volcano|volcanic|lava|magma|crater)\b/i.test(text),
    castle: /\b(castle|fortress|keep|citadel|palace|throne)\b/i.test(text),
    dungeon: /\b(dungeon|catacomb|catacombs|crypt|caverns?)\b/i.test(text),
    space: /\b(space|spaceship|space\s*station|nebula|galaxy|orbital|sci[-\s]?fi\s*base)\b/i.test(text),
    broadEnvironment: /\b(map|environment|world|scene|landscape|terrain|area|park|village|city|town|forest|island|nature)\b/i.test(text),
  };
  const anySpecific = Object.values(wants).some(Boolean);
  if (!anySpecific) {
    wants.prop = true;
  }
  if (wants.broadEnvironment) {
    wants.grass = wants.grass || wants.tree || wants.bush || wants.rock || wants.mountain || wants.water || wants.road;
    wants.spawn = true;
  }


  const source = `
local Workspace = game:GetService("Workspace")
local Lighting = game:GetService("Lighting")
local ServerScriptService = game:GetService("ServerScriptService")
local Terrain = Workspace.Terrain

local request = ${JSON.stringify(safePrompt)}
local languageName = ${JSON.stringify(languageName)}
local wants = ${luaBooleanTable(wants)}

local root = Workspace:FindFirstChild("BloxSmith_Procedural_Generation")
if root then root:Destroy() end
root = Instance.new("Folder")
root.Name = "BloxSmith_Procedural_Generation"
root.Parent = Workspace

local created = 0
local function folder(name)
  local f = root:FindFirstChild(name)
  if not f then
    f = Instance.new("Folder")
    f.Name = name
    f.Parent = root
  end
  return f
end

local function part(parent, name, size, cf, color, material, shape)
  local p = Instance.new("Part")
  p.Name = name
  p.Anchored = true
  p.CanCollide = true
  p.Size = size
  p.CFrame = cf
  p.Color = color
  p.Material = material or Enum.Material.SmoothPlastic
  p.TopSurface = Enum.SurfaceType.Smooth
  p.BottomSurface = Enum.SurfaceType.Smooth
  if shape then p.Shape = shape end
  p.Parent = parent
  created += 1
  return p
end

local function model(parent, name)
  local m = Instance.new("Model")
  m.Name = name
  m.Parent = parent
  created += 1
  return m
end

local function makeTree(parent, name, x, z, height, canopy)
  local m = model(parent, name)
  local trunk = part(m, "Trunk", Vector3.new(2.2, height, 2.2), CFrame.new(x, height / 2, z), Color3.fromRGB(103, 70, 42), Enum.Material.Wood)
  local crown1 = part(m, "Canopy_Lower", Vector3.new(canopy, canopy * 0.72, canopy), CFrame.new(x, height + canopy * 0.28, z), Color3.fromRGB(44, 128, 58), Enum.Material.Grass, Enum.PartType.Ball)
  local crown2 = part(m, "Canopy_Upper", Vector3.new(canopy * 0.72, canopy * 0.58, canopy * 0.72), CFrame.new(x, height + canopy * 0.78, z), Color3.fromRGB(56, 156, 70), Enum.Material.Grass, Enum.PartType.Ball)
  m.PrimaryPart = trunk
  return m
end

local function makeBush(parent, name, x, z, scale)
  local m = model(parent, name)
  part(m, "Bush_Core", Vector3.new(7 * scale, 3.2 * scale, 5.5 * scale), CFrame.new(x, 1.7 * scale, z), Color3.fromRGB(43, 128, 54), Enum.Material.Grass, Enum.PartType.Ball)
  part(m, "Bush_Side_A", Vector3.new(4 * scale, 2.7 * scale, 4 * scale), CFrame.new(x - 2.3 * scale, 1.4 * scale, z + 1.5 * scale), Color3.fromRGB(54, 148, 63), Enum.Material.Grass, Enum.PartType.Ball)
  part(m, "Bush_Side_B", Vector3.new(4 * scale, 2.7 * scale, 4 * scale), CFrame.new(x + 2.4 * scale, 1.4 * scale, z - 1.1 * scale), Color3.fromRGB(39, 112, 50), Enum.Material.Grass, Enum.PartType.Ball)
  return m
end

local function makeRock(parent, name, x, z, scale)
  local m = model(parent, name)
  part(m, "Boulder_Core", Vector3.new(7 * scale, 4 * scale, 5.5 * scale), CFrame.new(x, 2 * scale, z) * CFrame.Angles(0, math.rad(17), 0), Color3.fromRGB(102, 107, 104), Enum.Material.Rock, Enum.PartType.Ball)
  part(m, "Boulder_Chip", Vector3.new(3.6 * scale, 2.4 * scale, 3.2 * scale), CFrame.new(x + 3 * scale, 1.2 * scale, z - 1.8 * scale), Color3.fromRGB(126, 130, 126), Enum.Material.Slate, Enum.PartType.Ball)
  return m
end

local function makeHouse(parent, name, x, z)
  local m = model(parent, name)
  part(m, "Floor", Vector3.new(24, 1, 20), CFrame.new(x, 0.5, z), Color3.fromRGB(126, 92, 65), Enum.Material.WoodPlanks)
  part(m, "FrontWall", Vector3.new(24, 12, 1), CFrame.new(x, 7, z - 10), Color3.fromRGB(178, 134, 91), Enum.Material.WoodPlanks)
  part(m, "BackWall", Vector3.new(24, 12, 1), CFrame.new(x, 7, z + 10), Color3.fromRGB(178, 134, 91), Enum.Material.WoodPlanks)
  part(m, "LeftWall", Vector3.new(1, 12, 20), CFrame.new(x - 12, 7, z), Color3.fromRGB(164, 118, 79), Enum.Material.WoodPlanks)
  part(m, "RightWall", Vector3.new(1, 12, 20), CFrame.new(x + 12, 7, z), Color3.fromRGB(164, 118, 79), Enum.Material.WoodPlanks)
  part(m, "Door", Vector3.new(5, 8, 0.35), CFrame.new(x, 4.6, z - 10.6), Color3.fromRGB(92, 58, 34), Enum.Material.Wood)
  part(m, "Window_Left", Vector3.new(4, 3.2, 0.25), CFrame.new(x - 7, 8, z - 10.7), Color3.fromRGB(133, 201, 235), Enum.Material.Glass)
  part(m, "Window_Right", Vector3.new(4, 3.2, 0.25), CFrame.new(x + 7, 8, z - 10.7), Color3.fromRGB(133, 201, 235), Enum.Material.Glass)
  part(m, "Roof_A", Vector3.new(27, 2, 12), CFrame.new(x, 14, z - 4) * CFrame.Angles(math.rad(-22), 0, 0), Color3.fromRGB(93, 45, 38), Enum.Material.Slate)
  part(m, "Roof_B", Vector3.new(27, 2, 12), CFrame.new(x, 14, z + 4) * CFrame.Angles(math.rad(22), 0, 0), Color3.fromRGB(93, 45, 38), Enum.Material.Slate)
  return m
end

local function makeBuilding(parent, name, x, z, floors)
  local h = 14 + floors * 7
  local m = model(parent, name)
  part(m, "MainStructure", Vector3.new(26, h, 24), CFrame.new(x, h / 2, z), Color3.fromRGB(112, 126, 139), Enum.Material.Concrete)
  part(m, "Roof", Vector3.new(28, 1.2, 26), CFrame.new(x, h + 0.7, z), Color3.fromRGB(45, 52, 61), Enum.Material.Metal)
  for floor = 1, floors do
    local y = 7 + floor * 6
    for i, dx in ipairs({-8, 0, 8}) do
      part(m, "Window_F" .. floor .. "_" .. i, Vector3.new(4, 3, 0.25), CFrame.new(x + dx, y, z - 12.3), Color3.fromRGB(132, 202, 234), Enum.Material.Glass)
    end
  end
  return m
end

local function makeFence(parent, name, z)
  local m = model(parent, name)
  for x = -72, 72, 12 do
    part(m, "Post_" .. tostring(x), Vector3.new(1.2, 6, 1.2), CFrame.new(x, 3, z), Color3.fromRGB(118, 76, 43), Enum.Material.Wood)
  end
  for _, y in ipairs({2.4, 4.5}) do
    part(m, "Rail_" .. tostring(y), Vector3.new(156, 0.7, 0.8), CFrame.new(0, y, z), Color3.fromRGB(139, 87, 48), Enum.Material.Wood)
  end
  return m
end

local function makeStreetLight(parent, name, x, z)
  local m = model(parent, name)
  part(m, "Pole", Vector3.new(0.8, 17, 0.8), CFrame.new(x, 8.5, z), Color3.fromRGB(50, 54, 58), Enum.Material.Metal)
  part(m, "Arm", Vector3.new(7, 0.7, 0.7), CFrame.new(x + 3.1, 16.5, z), Color3.fromRGB(50, 54, 58), Enum.Material.Metal)
  local bulb = part(m, "Warm_Light", Vector3.new(2.3, 1.6, 2.3), CFrame.new(x + 6.3, 15.9, z), Color3.fromRGB(255, 220, 125), Enum.Material.Neon, Enum.PartType.Ball)
  local light = Instance.new("PointLight")
  light.Brightness = 2.5
  light.Range = 24
  light.Color = Color3.fromRGB(255, 218, 145)
  light.Parent = bulb
  return m
end

local function makeVehicle(parent, name, x, z)
  local m = model(parent, name)
  part(m, "Body", Vector3.new(15, 4, 8), CFrame.new(x, 3, z), Color3.fromRGB(192, 52, 64), Enum.Material.Metal)
  part(m, "Cabin", Vector3.new(7, 4, 7), CFrame.new(x - 1, 6.2, z), Color3.fromRGB(84, 155, 205), Enum.Material.Glass)
  for i, dz in ipairs({-4.6, 4.6}) do
    for j, dx in ipairs({-5.6, 5.6}) do
      part(m, "Wheel_" .. i .. "_" .. j, Vector3.new(2.8, 2.8, 1.4), CFrame.new(x + dx, 1.5, z + dz) * CFrame.Angles(math.rad(90), 0, 0), Color3.fromRGB(18, 18, 18), Enum.Material.Rubber, Enum.PartType.Cylinder)
    end
  end
  return m
end

local function makeNpc(parent, name, x, z)
  local m = model(parent, name)
  local rootPart = part(m, "HumanoidRootPart", Vector3.new(2, 2, 1), CFrame.new(x, 4.2, z), Color3.fromRGB(85, 120, 210), Enum.Material.SmoothPlastic)
  rootPart.Transparency = 1
  part(m, "Torso", Vector3.new(3, 4, 1.5), CFrame.new(x, 4.5, z), Color3.fromRGB(65, 128, 210), Enum.Material.SmoothPlastic)
  part(m, "Head", Vector3.new(2.4, 2.4, 2.4), CFrame.new(x, 7.8, z), Color3.fromRGB(239, 198, 145), Enum.Material.SmoothPlastic, Enum.PartType.Ball)
  part(m, "LeftArm", Vector3.new(1, 3.5, 1), CFrame.new(x - 2.3, 4.6, z), Color3.fromRGB(239, 198, 145), Enum.Material.SmoothPlastic)
  part(m, "RightArm", Vector3.new(1, 3.5, 1), CFrame.new(x + 2.3, 4.6, z), Color3.fromRGB(239, 198, 145), Enum.Material.SmoothPlastic)
  part(m, "LeftLeg", Vector3.new(1, 3.5, 1), CFrame.new(x - 0.8, 1.8, z), Color3.fromRGB(42, 54, 74), Enum.Material.SmoothPlastic)
  part(m, "RightLeg", Vector3.new(1, 3.5, 1), CFrame.new(x + 0.8, 1.8, z), Color3.fromRGB(42, 54, 74), Enum.Material.SmoothPlastic)
  local humanoid = Instance.new("Humanoid")
  humanoid.DisplayName = name
  humanoid.Parent = m
  m.PrimaryPart = rootPart
  return m
end

local function makeFurniture(parent, name, x, z)
  local m = model(parent, name)
  part(m, "TableTop", Vector3.new(10, 0.8, 6), CFrame.new(x, 4, z), Color3.fromRGB(128, 82, 46), Enum.Material.Wood)
  for i, dx in ipairs({-4, 4}) do
    for j, dz in ipairs({-2.2, 2.2}) do
      part(m, "Leg_" .. i .. "_" .. j, Vector3.new(0.8, 4, 0.8), CFrame.new(x + dx, 2, z + dz), Color3.fromRGB(91, 57, 32), Enum.Material.Wood)
    end
  end
  part(m, "ChairSeat", Vector3.new(4, 0.7, 4), CFrame.new(x, 2.5, z + 7), Color3.fromRGB(118, 75, 42), Enum.Material.Wood)
  part(m, "ChairBack", Vector3.new(4, 5, 0.7), CFrame.new(x, 5, z + 9), Color3.fromRGB(118, 75, 42), Enum.Material.Wood)
  return m
end

pcall(function()
  Terrain:SetMaterialColor(Enum.Material.Grass, Color3.fromRGB(76, 150, 72))
  Terrain:SetMaterialColor(Enum.Material.Ground, Color3.fromRGB(116, 94, 67))
  Terrain:SetMaterialColor(Enum.Material.Rock, Color3.fromRGB(100, 104, 104))
  Terrain:SetMaterialColor(Enum.Material.Water, Color3.fromRGB(48, 134, 198))
end)

local terrainFolder = folder("Terrain")
if wants.grass or wants.broadEnvironment or wants.tree or wants.bush or wants.rock or wants.house or wants.building or wants.road or wants.spawn then
  part(terrainFolder, "Procedural_Ground", Vector3.new(260, 1, 260), CFrame.new(0, 0, 0), Color3.fromRGB(76, 153, 72), Enum.Material.Grass)
  pcall(function() Terrain:FillBlock(CFrame.new(0, -3, 0), Vector3.new(260, 6, 260), Enum.Material.Grass) end)
end
if wants.mountain then
  for i, data in ipairs({{-95, -70, 34}, {-70, -105, 24}, {90, 84, 30}, {118, 55, 20}}) do
    pcall(function() Terrain:FillBall(Vector3.new(data[1], data[3] / 2 - 2, data[2]), data[3], Enum.Material.Rock) end)
    part(terrainFolder, "Hill_Cap_" .. i, Vector3.new(data[3] * 1.2, data[3] * 0.38, data[3] * 1.2), CFrame.new(data[1], data[3] * 0.45, data[2]), Color3.fromRGB(112, 120, 112), Enum.Material.Rock, Enum.PartType.Ball)
  end
end
if wants.water then
  local water = folder("Water")
  part(water, "River_Channel", Vector3.new(18, 0.4, 190), CFrame.new(-42, 0.35, 0) * CFrame.Angles(0, math.rad(-8), 0), Color3.fromRGB(43, 132, 205), Enum.Material.Glass)
  part(water, "Lake_Surface", Vector3.new(62, 0.35, 46), CFrame.new(54, 0.4, 58), Color3.fromRGB(55, 146, 218), Enum.Material.Glass)
  pcall(function()
    Terrain:FillBlock(CFrame.new(-42, -2, 0) * CFrame.Angles(0, math.rad(-8), 0), Vector3.new(18, 4, 190), Enum.Material.Water)
    Terrain:FillBlock(CFrame.new(54, -2, 58), Vector3.new(62, 4, 46), Enum.Material.Water)
  end)
end
if wants.road then
  local roads = folder("Roads_And_Paths")
  part(roads, "Main_Road", Vector3.new(210, 0.35, 18), CFrame.new(0, 0.65, -18), Color3.fromRGB(38, 40, 44), Enum.Material.Asphalt)
  part(roads, "Cross_Path", Vector3.new(16, 0.38, 150), CFrame.new(22, 0.7, 26), Color3.fromRGB(118, 96, 67), Enum.Material.Ground)
  for x = -84, 84, 28 do part(roads, "Lane_Mark_" .. tostring(x), Vector3.new(11, 0.08, 1.2), CFrame.new(x, 0.92, -18), Color3.fromRGB(245, 226, 112), Enum.Material.Neon) end
end
if wants.tree or wants.broadEnvironment then
  local f = folder("Foliage")
  for i, pos in ipairs({{-82,-42},{-74,28},{-48,82},{42,88},{82,36},{88,-48},{18,-86},{-20,-72}}) do makeTree(f, "Procedural_Tree_" .. i, pos[1], pos[2], 11 + (i % 4) * 2, 12 + (i % 3) * 2) end
end
if wants.bush or wants.grass or wants.broadEnvironment then
  local f = folder("Bushes_Grass_Flowers")
  for i, pos in ipairs({{-58,-16},{-36,44},{-10,74},{28,62},{62,12},{74,-62},{-76,70}}) do makeBush(f, "Procedural_Bush_" .. i, pos[1], pos[2], 0.85 + (i % 3) * 0.18) end
  if wants.grass then
    for i = 1, 24 do
      local x = -110 + (i * 37 % 220)
      local z = -100 + (i * 53 % 205)
      part(f, "Grass_Tuft_" .. i, Vector3.new(1.2, 3 + (i % 3), 0.22), CFrame.new(x, 1.8, z) * CFrame.Angles(0, math.rad(i * 23), math.rad(7)), Color3.fromRGB(59, 158, 64), Enum.Material.Grass)
      if i % 4 == 0 then part(f, "Flower_" .. i, Vector3.new(1.1, 1.1, 1.1), CFrame.new(x + 2, 1.1, z - 1), Color3.fromRGB(244, 97, 145), Enum.Material.Neon, Enum.PartType.Ball) end
    end
  end
end
if wants.rock or wants.broadEnvironment then
  local f = folder("Rocks")
  for i, pos in ipairs({{-92,8},{-68,66},{-6,96},{52,-76},{96,-20},{72,76}}) do makeRock(f, "Procedural_Rock_" .. i, pos[1], pos[2], 0.8 + (i % 4) * 0.18) end
end
if wants.house then
  local f = folder("Houses")
  makeHouse(f, "Procedural_House_01", -24, 20)
end
if wants.building then
  local f = folder("Buildings")
  makeBuilding(f, "Procedural_Building_01", -48, -42, 2)
  makeBuilding(f, "Procedural_Building_02", 48, -42, 3)
end
if wants.fence then makeFence(folder("Fences"), "Procedural_Fence_01", 104) end
if wants.light then
  local f = folder("Lighting_Props")
  for i, pos in ipairs({{-72,-28},{-28,-28},{28,-28},{72,-28}}) do makeStreetLight(f, "Procedural_StreetLight_" .. i, pos[1], pos[2]) end
end
if wants.bridge then
  local f = folder("Bridges")
  part(f, "Bridge_Deck", Vector3.new(44, 1.2, 13), CFrame.new(-42, 2.2, 12), Color3.fromRGB(125, 82, 47), Enum.Material.WoodPlanks)
  for x = -60, -24, 12 do part(f, "Bridge_Post_" .. tostring(x), Vector3.new(1, 5, 1), CFrame.new(x, 4.2, 6), Color3.fromRGB(88, 57, 32), Enum.Material.Wood) end
end
if wants.prop then
  local f = folder("Props_And_Decorations")
  part(f, "Crate", Vector3.new(5, 5, 5), CFrame.new(32, 2.5, -2), Color3.fromRGB(134, 91, 53), Enum.Material.Wood)
  part(f, "Barrel", Vector3.new(4, 5, 4), CFrame.new(40, 2.5, 5), Color3.fromRGB(103, 67, 42), Enum.Material.Wood, Enum.PartType.Cylinder)
  part(f, "Welcome_Sign", Vector3.new(12, 7, 0.6), CFrame.new(0, 5, -54), Color3.fromRGB(72, 48, 30), Enum.Material.Wood)
end
if wants.furniture then makeFurniture(folder("Furniture"), "Procedural_Table_And_Chair", 8, 34) end
if wants.vehicle then makeVehicle(folder("Vehicles"), "Procedural_Vehicle_01", 0, -18) end
if wants.npc then
  local f = folder("NPCs")
  makeNpc(f, "Procedural_NPC_01", 18, 14)
  local scriptObj = ServerScriptService:FindFirstChild("BloxSmith_Procedural_NPC_Behavior")
  if scriptObj then scriptObj:Destroy() end
  scriptObj = Instance.new("Script")
  scriptObj.Name = "BloxSmith_Procedural_NPC_Behavior"
  scriptObj.Source = [[
local Workspace = game:GetService("Workspace")
local root = Workspace:FindFirstChild("BloxSmith_Procedural_Generation")
if root then
  for _, humanoid in ipairs(root:GetDescendants()) do
    if humanoid:IsA("Humanoid") then humanoid.WalkSpeed = 8 end
  end
end
]]
  scriptObj.Parent = ServerScriptService
end
if wants.spawn then
  local f = folder("Spawn")
  local spawn = Instance.new("SpawnLocation")
  spawn.Name = "BloxSmith_Procedural_Spawn"
  spawn.Anchored = true
  spawn.Neutral = true
  spawn.Size = Vector3.new(8, 1, 8)
  spawn.Position = Vector3.new(0, 2, -70)
  spawn.Color = Color3.fromRGB(83, 255, 170)
  spawn.Parent = f
  created += 1
end

-- ===== Biome packs =====
if wants.snow then
  local f = folder("Snow_Biome")
  part(f, "Snow_Ground", Vector3.new(220, 1, 220), CFrame.new(0, 0.6, 0), Color3.fromRGB(238, 244, 252), Enum.Material.Snow)
  pcall(function() Terrain:FillBlock(CFrame.new(0, -3, 0), Vector3.new(220, 6, 220), Enum.Material.Snow) end)
  for i, pos in ipairs({{-58,-32},{-14,44},{40,-52},{68,26},{-72,60}}) do
    local m = model(f, "Pine_" .. i)
    part(m, "Trunk", Vector3.new(1.8, 10, 1.8), CFrame.new(pos[1], 5.5, pos[2]), Color3.fromRGB(85, 55, 30), Enum.Material.Wood)
    for k, dy in ipairs({0, 3.2, 6}) do
      local r = 8 - k * 1.6
      part(m, "Cone_" .. k, Vector3.new(r, 4, r), CFrame.new(pos[1], 9 + dy, pos[2]), Color3.fromRGB(210, 224, 232), Enum.Material.Snow, Enum.PartType.Ball)
    end
  end
  part(f, "Iceberg", Vector3.new(24, 12, 24), CFrame.new(70, 6, -70) * CFrame.Angles(0, math.rad(20), 0), Color3.fromRGB(190, 220, 240), Enum.Material.Ice)
end
if wants.desert then
  local f = folder("Desert_Biome")
  part(f, "Sand_Ground", Vector3.new(220, 1, 220), CFrame.new(0, 0.6, 0), Color3.fromRGB(232, 202, 133), Enum.Material.Sand)
  pcall(function() Terrain:FillBlock(CFrame.new(0, -3, 0), Vector3.new(220, 6, 220), Enum.Material.Sand) end)
  for i, pos in ipairs({{-40,-30,20},{20,50,26},{-70,60,30},{60,-60,22}}) do
    part(f, "Dune_" .. i, Vector3.new(pos[3] * 1.6, pos[3] * 0.55, pos[3] * 1.6), CFrame.new(pos[1], pos[3] * 0.25, pos[2]), Color3.fromRGB(218, 184, 114), Enum.Material.Sand, Enum.PartType.Ball)
  end
  for i, pos in ipairs({{10,-10},{-20,20},{35,35},{-45,-45}}) do
    local m = model(f, "Cactus_" .. i)
    part(m, "Body", Vector3.new(2, 9, 2), CFrame.new(pos[1], 5, pos[2]), Color3.fromRGB(56, 130, 66), Enum.Material.Grass)
    part(m, "Arm_L", Vector3.new(1.4, 4.2, 1.4), CFrame.new(pos[1] - 1.8, 6.5, pos[2]), Color3.fromRGB(60, 138, 70), Enum.Material.Grass)
    part(m, "Arm_R", Vector3.new(1.4, 4.2, 1.4), CFrame.new(pos[1] + 1.8, 7.5, pos[2]), Color3.fromRGB(60, 138, 70), Enum.Material.Grass)
  end
end
if wants.beach then
  local f = folder("Beach_Biome")
  part(f, "Sand", Vector3.new(220, 1, 110), CFrame.new(0, 0.6, -55), Color3.fromRGB(240, 220, 168), Enum.Material.Sand)
  pcall(function()
    Terrain:FillBlock(CFrame.new(0, -3, -55), Vector3.new(220, 6, 110), Enum.Material.Sand)
    Terrain:FillBlock(CFrame.new(0, -3, 55), Vector3.new(220, 6, 110), Enum.Material.Water)
  end)
  part(f, "Ocean", Vector3.new(220, 0.4, 110), CFrame.new(0, 0.6, 55), Color3.fromRGB(52, 145, 210), Enum.Material.Glass)
  for i, pos in ipairs({{-60,-20},{-20,-40},{30,-25},{60,-45}}) do
    local m = model(f, "PalmTree_" .. i)
    part(m, "Trunk", Vector3.new(1.6, 14, 1.6), CFrame.new(pos[1], 7, pos[2]) * CFrame.Angles(math.rad(8), 0, math.rad(-4)), Color3.fromRGB(114, 82, 46), Enum.Material.Wood)
    for k, ang in ipairs({0, 72, 144, 216, 288}) do
      part(m, "Frond_" .. k, Vector3.new(11, 0.6, 2.4), CFrame.new(pos[1], 14.4, pos[2]) * CFrame.Angles(0, math.rad(ang), math.rad(-18)) * CFrame.new(5, 0, 0), Color3.fromRGB(58, 148, 70), Enum.Material.Grass)
    end
  end
end
if wants.volcano then
  local f = folder("Volcano_Biome")
  for i, r in ipairs({48, 36, 24}) do
    part(f, "Cone_" .. i, Vector3.new(r * 2, 14 - i * 2, r * 2), CFrame.new(0, 7 + (i - 1) * 10, 0), Color3.fromRGB(52, 42, 40), Enum.Material.Basalt, Enum.PartType.Ball)
  end
  part(f, "Lava_Pool", Vector3.new(18, 0.6, 18), CFrame.new(0, 34, 0), Color3.fromRGB(255, 90, 30), Enum.Material.Neon, Enum.PartType.Cylinder)
  part(f, "Lava_River", Vector3.new(80, 0.4, 6), CFrame.new(0, 1, 40) * CFrame.Angles(0, math.rad(10), 0), Color3.fromRGB(240, 78, 22), Enum.Material.Neon)
  pcall(function() Terrain:FillBall(Vector3.new(0, 0, 0), 55, Enum.Material.Rock) end)
end
if wants.castle then
  local f = folder("Castle")
  local m = model(f, "Procedural_Castle")
  part(m, "Keep", Vector3.new(36, 22, 30), CFrame.new(0, 11, 0), Color3.fromRGB(150, 148, 140), Enum.Material.Slate)
  for i, pos in ipairs({{-20,-16},{20,-16},{-20,16},{20,16}}) do
    part(m, "Tower_" .. i, Vector3.new(10, 34, 10), CFrame.new(pos[1], 17, pos[2]), Color3.fromRGB(138, 136, 128), Enum.Material.Slate, Enum.PartType.Cylinder)
    part(m, "TowerRoof_" .. i, Vector3.new(11, 6, 11), CFrame.new(pos[1], 37, pos[2]), Color3.fromRGB(102, 44, 38), Enum.Material.Slate, Enum.PartType.Ball)
  end
  part(m, "Gate", Vector3.new(9, 12, 1), CFrame.new(0, 6, -15.5), Color3.fromRGB(80, 50, 30), Enum.Material.Wood)
  part(m, "Wall_Front", Vector3.new(60, 8, 1), CFrame.new(0, 4, -30), Color3.fromRGB(150, 148, 140), Enum.Material.Slate)
  part(m, "Wall_Back", Vector3.new(60, 8, 1), CFrame.new(0, 4, 30), Color3.fromRGB(150, 148, 140), Enum.Material.Slate)
  part(m, "Wall_Left", Vector3.new(1, 8, 60), CFrame.new(-30, 4, 0), Color3.fromRGB(150, 148, 140), Enum.Material.Slate)
  part(m, "Wall_Right", Vector3.new(1, 8, 60), CFrame.new(30, 4, 0), Color3.fromRGB(150, 148, 140), Enum.Material.Slate)
end
if wants.dungeon then
  local f = folder("Dungeon")
  for i = 0, 5 do
    local z = i * 24
    part(f, "Floor_" .. i, Vector3.new(20, 1, 24), CFrame.new(0, 0.6, z), Color3.fromRGB(66, 60, 56), Enum.Material.Cobblestone)
    part(f, "WallL_" .. i, Vector3.new(1, 12, 24), CFrame.new(-10, 6.6, z), Color3.fromRGB(78, 72, 68), Enum.Material.Cobblestone)
    part(f, "WallR_" .. i, Vector3.new(1, 12, 24), CFrame.new(10, 6.6, z), Color3.fromRGB(78, 72, 68), Enum.Material.Cobblestone)
    part(f, "Ceil_" .. i, Vector3.new(20, 1, 24), CFrame.new(0, 12.6, z), Color3.fromRGB(52, 48, 44), Enum.Material.Cobblestone)
    local torch = part(f, "Torch_" .. i, Vector3.new(0.6, 2, 0.6), CFrame.new(-9.4, 8, z), Color3.fromRGB(255, 168, 60), Enum.Material.Neon)
    local light = Instance.new("PointLight"); light.Brightness = 2.4; light.Range = 18; light.Color = Color3.fromRGB(255, 168, 60); light.Parent = torch
  end
  part(f, "Treasure_Chest", Vector3.new(4, 3, 3), CFrame.new(0, 2, 5 * 24), Color3.fromRGB(196, 148, 62), Enum.Material.Wood)
end
if wants.space then
  local f = folder("Space_Base")
  part(f, "Platform", Vector3.new(70, 1, 70), CFrame.new(0, 20, 0), Color3.fromRGB(44, 50, 66), Enum.Material.Metal)
  part(f, "PlatformGlow", Vector3.new(70, 0.2, 70), CFrame.new(0, 20.55, 0), Color3.fromRGB(88, 220, 255), Enum.Material.Neon)
  for i, pos in ipairs({{-30,-30},{30,-30},{-30,30},{30,30}}) do
    part(f, "Pillar_" .. i, Vector3.new(3, 30, 3), CFrame.new(pos[1], 15, pos[2]), Color3.fromRGB(72, 92, 128), Enum.Material.Metal)
  end
  local dome = part(f, "Dome", Vector3.new(46, 24, 46), CFrame.new(0, 30, 0), Color3.fromRGB(120, 180, 240), Enum.Material.ForceField, Enum.PartType.Ball)
  dome.Transparency = 0.5
  Lighting.ClockTime = 0
  Lighting.OutdoorAmbient = Color3.fromRGB(15, 20, 32)
end

if not wants.space then
  Lighting.ClockTime = 14
  Lighting.Brightness = math.max(Lighting.Brightness, 2.2)
  Lighting.Ambient = Color3.fromRGB(92, 104, 116)
  Lighting.OutdoorAmbient = Color3.fromRGB(130, 145, 155)
end
local atmosphere = Lighting:FindFirstChildOfClass("Atmosphere") or Instance.new("Atmosphere")
atmosphere.Name = "BloxSmith_Procedural_Atmosphere"
atmosphere.Density = wants.space and 0.05 or 0.26
atmosphere.Offset = 0.18
atmosphere.Color = wants.space and Color3.fromRGB(20, 24, 40) or Color3.fromRGB(205, 226, 255)
atmosphere.Decay = Color3.fromRGB(113, 132, 150)
atmosphere.Parent = Lighting

root:SetAttribute("BloxSmithProcedural", true)
root:SetAttribute("BloxSmithRequest", request)
root:SetAttribute("BloxSmithLanguage", languageName)
root:SetAttribute("BloxSmithCreatedCount", created)
if created <= 0 then error("Procedural generation created zero Studio instances") end
Workspace:SetAttribute("BloxSmithLastProceduralBuild", os.time())
`;

  return [
    {
      kind: "run_lua",
      parent_path: "Workspace",
      name: "BloxSmith_Generate_Procedural_Assets",
      payload: { source, verification: { min_created: 1, root_path: "Workspace.BloxSmith_Procedural_Generation" } },
    },
    {
      kind: "organize_project",
      parent_path: "Workspace",
      name: "BloxSmith_Organize_Procedural_Assets",
      payload: { reason: "organize_generated_procedural_assets" },
    },
    {
      kind: "scan_project",
      parent_path: "Workspace",
      name: "BloxSmith_Scan_Procedural_Assets",
      payload: { reason: "verify_procedural_assets_created_in_studio" },
    },
  ];
}

function intentVisibilityStudioActions(userText: string) {
  const text = userText.toLowerCase();
  const wants = {
    road: /\b(road|street|path|sidewalk|city|town)\b/.test(text),
    water: /\b(water|lake|river|ocean|pond|pool|stream)\b/.test(text),
    building: /\b(house|building|city|town|shop|store|base|lobby|room)\b/.test(text),
    tree: /\b(tree|forest|woods|bush|nature|park)\b/.test(text),
    spawn: /\b(spawn|checkpoint|start\s+point|respawn)\b/.test(text),
    lighting: /\b(light|lighting|day|night|sun|sky|atmosphere|fog|cloud|sunset)\b/.test(text),
    ui: /\b(ui|gui|menu|hud|button|screen|shop|inventory|health|cash|coins|loading)\b/.test(text),
    npc: /\b(npc|enemy|zombie|monster|character|bot|villager)\b/.test(text),
    obby: /\b(obby|platform|jump|parkour|checkpoint)\b/.test(text),
    vehicle: /\b(car|vehicle|truck|bike|boat|plane)\b/.test(text),
    genericBuild: /\b(add|make|create|build|put|insert|generate|place)\b/.test(text),
  };

  if (!Object.values(wants).some(Boolean)) return [];

  const source = `
local Workspace = game:GetService("Workspace")
local Lighting = game:GetService("Lighting")
local StarterGui = game:GetService("StarterGui")
local ServerScriptService = game:GetService("ServerScriptService")
local wants = ${luaBooleanTable(wants)}

local root = Workspace:FindFirstChild("BloxSmith_Visible_Result_Guard")
if not root then
  root = Instance.new("Folder")
  root.Name = "BloxSmith_Visible_Result_Guard"
  root.Parent = Workspace
end

local function part(name, size, cf, color, material, parent)
  local p = Instance.new("Part")
  p.Name = name
  p.Anchored = true
  p.CanCollide = true
  p.Size = size
  p.CFrame = cf
  p.Color = color
  p.Material = material or Enum.Material.SmoothPlastic
  p.TopSurface = Enum.SurfaceType.Smooth
  p.BottomSurface = Enum.SurfaceType.Smooth
  p.Parent = parent or root
  return p
end

local function ensureFolder(name)
  local f = root:FindFirstChild(name)
  if not f then
    f = Instance.new("Folder")
    f.Name = name
    f.Parent = root
  end
  return f
end

if wants.road then
  local roads = ensureFolder("Roads_Visible")
  part("Main_Road_X", Vector3.new(180, 0.35, 18), CFrame.new(0, 0.45, 0), Color3.fromRGB(38, 40, 45), Enum.Material.Asphalt, roads)
  part("Main_Road_Z", Vector3.new(18, 0.4, 180), CFrame.new(0, 0.55, 0), Color3.fromRGB(38, 40, 45), Enum.Material.Asphalt, roads)
  for _, x in ipairs({-36, 0, 36}) do
    part("Lane_Mark_" .. tostring(x), Vector3.new(2, 0.08, 9), CFrame.new(x, 0.85, 0), Color3.fromRGB(245, 225, 95), Enum.Material.Neon, roads)
  end
end

if wants.water then
  local water = ensureFolder("Water_Visible")
  part("Visible_Water_Surface", Vector3.new(90, 0.3, 54), CFrame.new(62, 0.35, 62), Color3.fromRGB(45, 137, 210), Enum.Material.Glass, water)
  pcall(function()
    Workspace.Terrain:FillBlock(CFrame.new(62, -3, 62), Vector3.new(90, 6, 54), Enum.Material.Water)
  end)
end

if wants.building then
  local buildings = ensureFolder("Buildings_Visible")
  for i, data in ipairs({
    {-55, -45, 22, Color3.fromRGB(90, 120, 150)},
    {-55, 45, 30, Color3.fromRGB(120, 105, 95)},
    {55, -45, 26, Color3.fromRGB(86, 105, 125)},
    {55, 45, 18, Color3.fromRGB(130, 120, 95)}
  }) do
    part("Visible_Building_" .. i, Vector3.new(24, data[3], 24), CFrame.new(data[1], data[3] / 2 + 0.6, data[2]), data[4], Enum.Material.Concrete, buildings)
    part("Visible_Roof_" .. i, Vector3.new(26, 1.2, 26), CFrame.new(data[1], data[3] + 1.4, data[2]), Color3.fromRGB(35, 40, 48), Enum.Material.Metal, buildings)
  end
end

if wants.tree then
  local trees = ensureFolder("Trees_Visible")
  for i, pos in ipairs({Vector3.new(-80, 0, -20), Vector3.new(-78, 0, 24), Vector3.new(80, 0, -24), Vector3.new(82, 0, 26), Vector3.new(0, 0, 82)}) do
    part("Tree_Trunk_" .. i, Vector3.new(3, 14, 3), CFrame.new(pos.X, 7, pos.Z), Color3.fromRGB(101, 71, 45), Enum.Material.Wood, trees)
    part("Tree_Canopy_" .. i, Vector3.new(16, 14, 16), CFrame.new(pos.X, 19, pos.Z), Color3.fromRGB(49, 135, 62), Enum.Material.Grass, trees)
  end
end

if wants.spawn then
  local spawns = ensureFolder("Spawns_Visible")
  for i, pos in ipairs({Vector3.new(-10, 1, -10), Vector3.new(10, 1, -10), Vector3.new(0, 1, 12)}) do
    local spawn = Instance.new("SpawnLocation")
    spawn.Name = "Visible_Spawn_" .. i
    spawn.Anchored = true
    spawn.Neutral = true
    spawn.Size = Vector3.new(8, 1, 8)
    spawn.Position = pos
    spawn.Color = Color3.fromRGB(80, 255, 170)
    spawn.Parent = spawns
  end
end

if wants.obby then
  local obby = ensureFolder("Obby_Visible")
  for i = 1, 7 do
    part("Visible_Obby_Platform_" .. i, Vector3.new(12, 1.4, 12), CFrame.new(-48 + i * 14, 4 + i * 2, -78), Color3.fromHSV(i / 7, 0.65, 1), Enum.Material.Neon, obby)
  end
end

if wants.vehicle then
  local vehicles = ensureFolder("Vehicles_Visible")
  local body = part("Visible_Vehicle_Body", Vector3.new(16, 4, 9), CFrame.new(0, 3, 44), Color3.fromRGB(210, 55, 65), Enum.Material.Metal, vehicles)
  part("Visible_Vehicle_Cabin", Vector3.new(7, 4, 7), CFrame.new(-1, 7, 44), Color3.fromRGB(70, 130, 190), Enum.Material.Glass, vehicles)
  for i, pos in ipairs({Vector3.new(-6, 1.6, 39), Vector3.new(6, 1.6, 39), Vector3.new(-6, 1.6, 49), Vector3.new(6, 1.6, 49)}) do
    local wheel = part("Visible_Wheel_" .. i, Vector3.new(3, 3, 1.5), CFrame.new(pos), Color3.fromRGB(18, 18, 18), Enum.Material.Rubber, vehicles)
    wheel.Shape = Enum.PartType.Cylinder
  end
  body:SetAttribute("BloxSmithVisibleVehicle", true)
end

if wants.npc then
  local npcs = ensureFolder("NPCs_Visible")
  local model = Instance.new("Model")
  model.Name = "Visible_BloxSmith_NPC"
  model.Parent = npcs
  local torso = part("Torso", Vector3.new(3, 4, 1.5), CFrame.new(34, 5, 0), Color3.fromRGB(75, 130, 225), Enum.Material.SmoothPlastic, model)
  local head = part("Head", Vector3.new(2.4, 2.4, 2.4), CFrame.new(34, 8.3, 0), Color3.fromRGB(245, 205, 150), Enum.Material.SmoothPlastic, model)
  local humanoid = Instance.new("Humanoid")
  humanoid.DisplayName = "BloxSmith NPC"
  humanoid.Parent = model
  model.PrimaryPart = torso
  head.Shape = Enum.PartType.Ball
end

if wants.ui then
  local gui = StarterGui:FindFirstChild("BloxSmith_Visible_UI")
  if not gui then
    gui = Instance.new("ScreenGui")
    gui.Name = "BloxSmith_Visible_UI"
    gui.ResetOnSpawn = false
    gui.Parent = StarterGui
  end
  local frame = gui:FindFirstChild("MainPanel")
  if not frame then
    frame = Instance.new("Frame")
    frame.Name = "MainPanel"
    frame.Size = UDim2.fromOffset(360, 180)
    frame.Position = UDim2.new(0.5, -180, 0.12, 0)
    frame.BackgroundColor3 = Color3.fromRGB(20, 24, 36)
    frame.Parent = gui
    local corner = Instance.new("UICorner")
    corner.CornerRadius = UDim.new(0, 10)
    corner.Parent = frame
    local title = Instance.new("TextLabel")
    title.Name = "Title"
    title.BackgroundTransparency = 1
    title.Size = UDim2.new(1, -24, 0, 50)
    title.Position = UDim2.fromOffset(12, 12)
    title.Font = Enum.Font.GothamBold
    title.TextScaled = true
    title.TextColor3 = Color3.fromRGB(255, 255, 255)
    title.Text = "BloxSmith UI"
    title.Parent = frame
    local button = Instance.new("TextButton")
    button.Name = "PrimaryButton"
    button.Size = UDim2.new(1, -48, 0, 48)
    button.Position = UDim2.fromOffset(24, 104)
    button.Font = Enum.Font.GothamBold
    button.TextScaled = true
    button.TextColor3 = Color3.fromRGB(255, 255, 255)
    button.BackgroundColor3 = Color3.fromRGB(88, 78, 255)
    button.Text = "Start"
    button.Parent = frame
    local bc = Instance.new("UICorner")
    bc.CornerRadius = UDim.new(0, 8)
    bc.Parent = button
  end
end

if wants.lighting then
  Lighting.ClockTime = wants.genericBuild and 14 or Lighting.ClockTime
  Lighting.Brightness = math.max(Lighting.Brightness, 2.2)
  Lighting.Ambient = Color3.fromRGB(95, 105, 120)
  Lighting.OutdoorAmbient = Color3.fromRGB(130, 145, 165)
  local atmosphere = Lighting:FindFirstChildOfClass("Atmosphere") or Instance.new("Atmosphere")
  atmosphere.Name = "BloxSmith_Atmosphere"
  atmosphere.Density = 0.28
  atmosphere.Offset = 0.2
  atmosphere.Color = Color3.fromRGB(205, 225, 255)
  atmosphere.Decay = Color3.fromRGB(110, 130, 160)
  atmosphere.Parent = Lighting
end

if wants.genericBuild then
  local receipt = root:FindFirstChild("BloxSmith_Result_Receipt")
  if not receipt then
    receipt = part("BloxSmith_Result_Receipt", Vector3.new(34, 12, 1), CFrame.new(0, 9, -34), Color3.fromRGB(28, 32, 46), Enum.Material.Metal, root)
    local sg = Instance.new("SurfaceGui")
    sg.Face = Enum.NormalId.Front
    sg.SizingMode = Enum.SurfaceGuiSizingMode.PixelsPerStud
    sg.PixelsPerStud = 24
    sg.Parent = receipt
    local label = Instance.new("TextLabel")
    label.BackgroundTransparency = 1
    label.Size = UDim2.fromScale(1, 1)
    label.Font = Enum.Font.GothamBold
    label.TextScaled = true
    label.TextWrapped = true
    label.TextColor3 = Color3.fromRGB(245, 248, 255)
    label.Text = "BloxSmith build applied visibly in Studio"
    label.Parent = sg
  end
end

root:SetAttribute("LastBloxSmithVisibilityGuard", os.time())
`;

  return [
    {
      kind: "run_lua",
      parent_path: "Workspace",
      name: "BloxSmith_Intent_Visibility_Guard",
      payload: { source },
    },
  ];
}

function isToolboxMapRequest(userText: string) {
  if (detectSingleAssetIntent(userText)) return false;
  return /\b(map|world|city|town|village|lobby|hub|spawn|obby|parkour|race\s*track|racing|forest|island|beach|roleplay|rp|tycoon|horror|dungeon|rpg|street|road|neighborhood|theme\s*park|arena)\b/i.test(userText);
}

const CITY_VARIANTS = [
  {
    name: "modern downtown",
    terms: [
      ["road grid", "modular city road kit", true, 8],
      ["downtown buildings", "modern city building pack", true, 8],
      ["street props", "street light traffic sign sidewalk", false, 6],
      ["city vehicles", "city car vehicle pack", false, 6],
      ["park decor", "city park trees benches", false, 5],
    ],
  },
  {
    name: "roleplay neighborhood",
    terms: [
      ["neighborhood roads", "suburban road neighborhood", true, 8],
      ["houses", "suburban house pack", true, 8],
      ["shops", "roleplay shop storefront", false, 6],
      ["vehicles", "roleplay car vehicle", false, 6],
      ["decor", "street signs mailbox tree", false, 5],
    ],
  },
  {
    name: "small town",
    terms: [
      ["town roads", "small town road kit", true, 8],
      ["town buildings", "small town building pack", true, 8],
      ["shops", "town shop storefront", false, 6],
      ["town props", "lamp post bench sign", false, 6],
      ["town park", "park tree bench fountain", false, 5],
    ],
  },
  {
    name: "coastal city",
    terms: [
      ["coastal roads", "coastal city road", true, 8],
      ["coastal buildings", "coastal city building", true, 8],
      ["beach props", "beach palm tree boardwalk", false, 6],
      ["cars", "city car vehicle", false, 6],
      ["waterfront decor", "pier dock city", false, 5],
    ],
  },
  {
    name: "industrial district",
    terms: [
      ["industrial roads", "industrial road kit", true, 8],
      ["industrial buildings", "warehouse factory building", true, 8],
      ["props", "industrial crate barrel pallet", false, 6],
      ["vehicles", "truck vehicle industrial", false, 6],
      ["lights", "street light industrial", false, 5],
    ],
  },
];

function pickMapVariant(userText: string) {
  const seed = Array.from(userText).reduce((acc, ch) => ((acc * 31) + ch.charCodeAt(0)) >>> 0, Date.now() & 0xffff);
  return CITY_VARIANTS[seed % CITY_VARIANTS.length];
}

function toolboxMapRequests(userText: string): ToolboxSetRequest[] {
  const text = userText.toLowerCase();
  const requests: ToolboxSetRequest[] = [];
  const add = (label: string, keyword: string, required = false, limit = 5) => {
    if (!requests.some((r) => r.label === label || r.keyword === keyword)) {
      requests.push({ label, keyword, category: "Model", required, limit });
    }
  };

  if (isSimpleSingleThingRequest(userText)) {
    add("requested asset", userText.slice(0, 80), true, 8);
    return requests;
  }

  if (/\b(city|town|roleplay|rp|neighborhood|street|road|downtown|metropolis)\b/.test(text)) {
    const variant = pickMapVariant(userText);
    const isBig = /\b(full|whole|entire|complete|big|huge|massive|large|dense|packed|realistic)\b/.test(text);
    add(`${variant.name} map kit`, `${variant.name} city map kit`, true, isBig ? 12 : 8);
    for (const [label, keyword, required, limit] of variant.terms) {
      add(String(label), String(keyword), Boolean(required), Number(limit));
    }
    if (isBig) {
      // Extra search categories so a "full city" gets skyscrapers, apartments,
      // stores, cafes, gas stations, parks — not five identical buildings.
      add("skyscrapers", "skyscraper tall building city", true, 8);
      add("apartments", "apartment building city", true, 8);
      add("houses", "modern house residential", true, 8);
      add("shops", "storefront shop city downtown", true, 8);
      add("restaurants", "restaurant cafe diner city", false, 6);
      add("gas station", "gas station city", false, 5);
      add("street lights", "street light lamp post pack", false, 6);
      add("traffic signs", "traffic light stop sign city pack", false, 6);
      add("benches", "bench trash can urban prop", false, 6);
      add("trees", "city tree pack", false, 6);
      add("cars", "city car pack vehicle", false, 6);
    }
  } else {
    add("complete map kit", `${userText.slice(0, 80)} map kit`, true, 6);
  }


  if (/\b(lobby|hub|spawn)\b/.test(text)) {
    add("lobby map", "lobby map kit", true, 6);
    add("spawn area", "spawn hub", true, 5);
    add("decor props", "lobby decor", false, 5);
  }

  if (/\b(obby|parkour|platform|checkpoint)\b/.test(text)) {
    add("obby kit", "obby kit", true, 6);
    add("checkpoint kit", "obby checkpoint", false, 5);
    add("parkour map", "parkour map", true, 6);
  }

  if (/\b(forest|woods|jungle|nature|park)\b/.test(text)) {
    add("forest kit", "forest map kit", true, 6);
    add("tree pack", "tree pack", true, 6);
    add("rocks and bushes", "rock bush nature pack", false, 5);
  }

  if (/\b(island|beach|survival|ocean)\b/.test(text)) {
    add("island map", "island map kit", true, 6);
    add("beach props", "beach palm tree pack", false, 5);
    add("camp props", "survival camp kit", false, 5);
  }

  if (/\b(race|racing|track|car|vehicle)\b/.test(text)) {
    add("race track", "race track map", true, 6);
    add("vehicle", "vehicle car", false, 5);
    add("road props", "road barrier checkpoint", false, 5);
  }

  if (/\b(horror|haunted|escape)\b/.test(text)) {
    add("horror map", "horror map kit", true, 6);
    add("haunted building", "haunted house", true, 5);
    add("horror props", "horror props", false, 5);
  }

  if (/\b(dungeon|rpg|fantasy|medieval|castle|village)\b/.test(text)) {
    add("rpg map", "rpg map kit", true, 6);
    add("dungeon kit", "dungeon kit", true, 6);
    add("medieval props", "medieval village props", false, 5);
  }

  if (/\b(tycoon)\b/.test(text)) {
    add("tycoon kit", "tycoon kit", true, 6);
    add("conveyor kit", "conveyor dropper tycoon", true, 5);
    add("tycoon buildings", "tycoon building", false, 5);
  }

  if (/\b(arena|battle|fighting|shooter)\b/.test(text)) {
    add("arena map", "battle arena map", true, 6);
    add("cover props", "arena cover props", false, 5);
  }

  const isBigCity = /\b(city|town|downtown|metropolis)\b/.test(text) && /\b(full|whole|entire|complete|big|huge|massive|large|dense|packed|realistic)\b/.test(text);
  return requests.slice(0, isBigCity ? 24 : 12);

}

async function toolboxMapStudioActions(userText: string) {
  if (!isToolboxMapRequest(userText)) return [];
  try {
    const text = userText.toLowerCase();
    // Density scales the number of picks per request AND the grid size, so
    // "build me a full city" / "huge town" / "big map" produces a real city,
    // not 5 lonely buildings.
    const isBig = /\b(full|whole|entire|complete|big|huge|massive|large|dense|packed|realistic|proper|real)\b/.test(text);
    const isCity = /\b(city|town|neighborhood|downtown|metropolis|street|road|roleplay|rp)\b/.test(text);
    const picksPerRequest = isCity ? (isBig ? 5 : 3) : (isBig ? 3 : 2);
    const perRequestCap = Math.max(picksPerRequest + 2, 6);
    const set = await searchRobloxToolboxSet(toolboxMapRequests(userText), perRequestCap, { qualityFloor: "strict" });
    const usedIds = new Set<number>();
    const actions = [];

    // Auto-generated grid of placement slots. Big city → 8×5 = 40 slots at
    // 130 stud spacing; regular map → 5×4 = 20 slots at 120 stud spacing.
    const cols = isBig && isCity ? 8 : isCity ? 6 : 5;
    const rows = isBig && isCity ? 5 : isCity ? 4 : 3;
    const spacing = isBig ? 140 : 120;
    const placementSlots: Array<{ position: number[]; yaw: number; role: string; district: string }> = [];
    const centerCol = (cols - 1) / 2;
    const centerRow = (rows - 1) / 2;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const x = Math.round((c - centerCol) * spacing);
        const z = Math.round((r - centerRow) * spacing);
        // Alternate cardinal yaws so buildings don't all face the same way.
        const yaw = ((c + r) % 4) * 90;
        // Middle row = the main road; outer ring = decor.
        const onRoad = r === Math.floor(centerRow);
        const onEdge = r === 0 || r === rows - 1 || c === 0 || c === cols - 1;
        const role = onRoad && c !== Math.floor(centerCol) ? "road"
          : onEdge ? "decor"
          : "building";
        const district = z < -spacing ? "NorthBlock"
          : z > spacing ? "SouthBlock"
          : x < -spacing ? "WestBlock"
          : x > spacing ? "EastBlock"
          : "Core";
        placementSlots.push({ position: [x, 4, z], yaw, role, district });
      }
    }
    let slot = 0;

    const roleFor = (label: string) => {
      const s = label.toLowerCase();
      if (/road|street|track/.test(s)) return "road";
      if (/vehicle|car|truck/.test(s)) return "vehicle";
      if (/prop|light|sign|decor|bench|tree|park|beach|camp/.test(s)) return "decor";
      if (/shop|store|mall/.test(s)) return "shop";
      if (/house|building|tower|warehouse|factory|town|city|village|map/.test(s)) return "building";
      return "map_core";
    };

    const nextSlotFor = (role: string) => {
      const preferred = placementSlots.find((s, i) => i >= slot && (s.role === role || (role === "building" && ["shop", "map_core"].includes(s.role))));
      if (preferred) {
        slot = placementSlots.indexOf(preferred) + 1;
        return preferred;
      }
      const fallback = placementSlots[slot % placementSlots.length];
      slot += 1;
      return fallback;
    };

    // Walk each search request and take multiple picks — this is what turns
    // "one building" into "a whole downtown".
    for (const request of set.requests) {
      const picks = request.results.filter((r) => !usedIds.has(r.id)).slice(0, picksPerRequest);
      let variantIdx = 0;
      for (const picked of picks) {
        usedIds.add(picked.id);
        const role = roleFor(request.label);
        const placement = nextSlotFor(role);
        variantIdx += 1;
        actions.push({
          kind: "insert_asset",
          parent_path: "Workspace",
          name: `Toolbox_${request.label.replace(/[^a-z0-9]+/gi, "_").replace(/^_+|_+$/g, "") || "MapAsset"}_${variantIdx}`,
          payload: {
            asset_id: picked.id,
            fallback_ids: (picked.fallbackIds ?? []).slice(0, 6),
            free_only: true,
            no_scripts: true,
            allow_scripts: false,
            folder_name: "BloxSmith_ToolboxAssets",
            position: placement.position,
            yaw: placement.yaw,
            scale: 1,
            placement_role: role,
            district: placement.district,
            toolbox_only: true,
            disable_procedural_fallback: true,
            // Treat every map component as a full Toolbox package: keep the whole
            // hierarchy authored by the creator, no nested-model extraction.
            preserve_hierarchy: true,
            is_map: true,
            insert_full_package: true,
            tags: ["bloxsmith", "toolbox-map", "real-toolbox-asset", request.label, role, placement.district],
            asset_name: picked.name,
            creator_name: picked.creatorName,
            thumbnail: picked.thumbnail,
            source_query: picked.sourceQuery ?? request.keyword,
            quality_tier: picked.qualityTier ?? "usable",
            safety_score: picked.safety,
            relevance_score: picked.relevance,
            has_scripts: picked.hasScripts,
            script_count: picked.scriptCount ?? 0,
            preview: {
              id: picked.id,
              name: picked.name,
              creatorName: picked.creatorName,
              thumbnail: picked.thumbnail,
              safety: picked.safety,
              relevance: picked.relevance,
              hasScripts: picked.hasScripts,
              scriptCount: picked.scriptCount ?? 0,
            },
          },
        });
      }
    }


    if (actions.length > 0) {
      actions.unshift({
        kind: "run_lua",
        parent_path: "Workspace",
        name: "BloxSmith_Remove_Procedural_Map_Fallbacks",
        payload: {
          source: `
local Workspace = game:GetService("Workspace")
local protected = {
  Baseplate = true,
  Terrain = true,
  Camera = true,
  BloxSmith_ToolboxAssets = true,
  BloxSmith_Imported_Models = true,
}
local badName = {
  "procedural", "placeholder", "fake", "blockhouse", "block_house",
  "generatedcity", "generated_city", "cityblock", "city_block",
  "randomblock", "random_block", "visibility_guard", "visible_ground",
}
local function shouldRemove(inst)
  if protected[inst.Name] then return false end
  local lower = inst.Name:lower():gsub("%s+", "_")
  for _, token in ipairs(badName) do
    if lower:find(token, 1, true) then return true end
  end
  if inst:IsA("Folder") and (#inst:GetChildren() == 0) and lower:find("bloxsmith") then
    return true
  end
  return false
end
for _, inst in ipairs(Workspace:GetChildren()) do
  if shouldRemove(inst) then
    inst:Destroy()
  end
end
`,
        },
      });
      actions.push({
        kind: "run_lua",
        parent_path: "Workspace",
        name: "BloxSmith_Arrange_Real_Toolbox_Map",
        payload: {
          source: `
local Workspace = game:GetService("Workspace")
local folder = Workspace:FindFirstChild("BloxSmith_ToolboxAssets") or Workspace:FindFirstChild("BloxSmith_Toolbox_Map_Assets")
if not folder then return end

------------------------------------------------------------
-- 1. COLLECT + CLASSIFY every top-level model in the folder
------------------------------------------------------------
local function classify(inst)
  local role = tostring(inst:GetAttribute("BloxSmithPlacementRole") or inst:GetAttribute("PlacementRole") or ""):lower()
  local n = inst.Name:lower()
  if role:find("road") or n:find("road") or n:find("street") or n:find("sidewalk") then return "road" end
  if role:find("vehicle") or n:find("car") or n:find("truck") or n:find("vehicle") then return "vehicle" end
  if role:find("decor") or n:find("light") or n:find("lamp") or n:find("sign") or n:find("bench")
     or n:find("tree") or n:find("bush") or n:find("prop") or n:find("trash") then return "decor" end
  return "building"
end

local buildings, roads, vehicles, decor = {}, {}, {}, {}
for _, inst in ipairs(folder:GetChildren()) do
  if inst:IsA("Model") or inst:IsA("BasePart") then
    local c = classify(inst)
    if c == "road" then table.insert(roads, inst)
    elseif c == "vehicle" then table.insert(vehicles, inst)
    elseif c == "decor" then table.insert(decor, inst)
    else table.insert(buildings, inst) end
  end
end

------------------------------------------------------------
-- 2. ANCHOR EVERYTHING and disable any smuggled scripts
------------------------------------------------------------
for _, inst in ipairs(folder:GetDescendants()) do
  if inst:IsA("BasePart") then
    inst.Anchored = true
    inst.CanCollide = true
  elseif inst:IsA("Script") or inst:IsA("LocalScript") or inst:IsA("ModuleScript") then
    inst.Disabled = true
  end
end

------------------------------------------------------------
-- 3. GROUND RAYCAST helper (returns Y of terrain/baseplate)
------------------------------------------------------------
local rayParams = RaycastParams.new()
rayParams.FilterType = Enum.RaycastFilterType.Exclude
rayParams.IgnoreWater = false
rayParams.FilterDescendantsInstances = {folder}
local function groundY(x, z)
  local hit = Workspace:Raycast(Vector3.new(x, 5000, z), Vector3.new(0, -10000, 0), rayParams)
  if hit then return hit.Position.Y end
  return 0
end

local function bbox(model)
  if model:IsA("Model") then
    local ok, cf, size = pcall(function() return model:GetBoundingBox() end)
    if ok and cf then return cf, size end
  elseif model:IsA("BasePart") then
    return model.CFrame, model.Size
  end
  return CFrame.new(), Vector3.new(1,1,1)
end

------------------------------------------------------------
-- 4. GRID LAYOUT — city blocks with roads between them
-- Each cell is CELL_SIZE studs wide. Every ROAD_EVERY cells
-- becomes a road strip. Buildings are pivoted into cell centers
-- with a small margin so nothing overlaps and everything sits
-- on the ground via raycast.
------------------------------------------------------------
local CELL_SIZE = 90
local ROAD_EVERY = 3  -- every 3rd row/col is a road
local BUILDING_COUNT = #buildings
if BUILDING_COUNT == 0 then return end

-- Choose a roughly-square grid big enough for all buildings, skipping
-- cells that fall on road strips.
local function isRoadCell(c, r)
  return (c % ROAD_EVERY == 0) or (r % ROAD_EVERY == 0)
end
local gridSize = 1
while true do
  local usable = 0
  for r = 0, gridSize - 1 do
    for c = 0, gridSize - 1 do
      if not isRoadCell(c, r) then usable = usable + 1 end
    end
  end
  if usable >= BUILDING_COUNT then break end
  gridSize = gridSize + 1
  if gridSize > 20 then break end
end
local centerOffset = (gridSize - 1) / 2

-- Fisher-Yates on buildings so districts don't stack identical assets
math.randomseed(tick())
for i = #buildings, 2, -1 do
  local j = math.random(i)
  buildings[i], buildings[j] = buildings[j], buildings[i]
end

-- Place buildings into non-road cells
local bIdx = 1
for r = 0, gridSize - 1 do
  for c = 0, gridSize - 1 do
    if not isRoadCell(c, r) and bIdx <= BUILDING_COUNT then
      local model = buildings[bIdx]
      bIdx = bIdx + 1
      local cx = (c - centerOffset) * CELL_SIZE
      local cz = (r - centerOffset) * CELL_SIZE
      local _, size = bbox(model)
      -- Scale down if the asset is larger than the cell so it fits inside its block
      local maxHoriz = math.max(size.X, size.Z)
      local scale = 1
      if maxHoriz > (CELL_SIZE - 8) and maxHoriz > 0 then
        scale = (CELL_SIZE - 8) / maxHoriz
        if model:IsA("Model") and model.ScaleTo then
          pcall(function() model:ScaleTo(scale) end)
        end
      end
      local _, newSize = bbox(model)
      local gy = groundY(cx, cz)
      -- Face the nearest road
      local yaw = 0
      if r % ROAD_EVERY == 1 then yaw = 0
      elseif r % ROAD_EVERY == (ROAD_EVERY - 1) % ROAD_EVERY then yaw = math.pi end
      if model:IsA("Model") then
        model:PivotTo(CFrame.new(cx, gy + newSize.Y / 2, cz) * CFrame.Angles(0, yaw, 0))
      elseif model:IsA("BasePart") then
        model.CFrame = CFrame.new(cx, gy + newSize.Y / 2, cz) * CFrame.Angles(0, yaw, 0)
      end
    end
  end
end

------------------------------------------------------------
-- 5. ROAD STRIPS — lay down anchored asphalt parts along every
-- road cell so blocks look connected instead of floating.
------------------------------------------------------------
local roadsFolder = folder:FindFirstChild("Roads") or Instance.new("Folder")
roadsFolder.Name = "Roads"
roadsFolder.Parent = folder

local function placeRoadPart(cx, cz)
  local gy = groundY(cx, cz)
  local part = Instance.new("Part")
  part.Anchored = true
  part.CanCollide = true
  part.Material = Enum.Material.Asphalt
  part.Color = Color3.fromRGB(40, 40, 45)
  part.Size = Vector3.new(CELL_SIZE, 1, CELL_SIZE)
  part.CFrame = CFrame.new(cx, gy + 0.5, cz)
  part.TopSurface = Enum.SurfaceType.Smooth
  part.BottomSurface = Enum.SurfaceType.Smooth
  part.Parent = roadsFolder
end

for r = 0, gridSize - 1 do
  for c = 0, gridSize - 1 do
    if isRoadCell(c, r) then
      placeRoadPart((c - centerOffset) * CELL_SIZE, (r - centerOffset) * CELL_SIZE)
    end
  end
end

-- Delete any raw road models the AI queued (they'd overlap our asphalt)
for _, r in ipairs(roads) do pcall(function() r:Destroy() end) end

------------------------------------------------------------
-- 6. DECOR + VEHICLES scattered on road edges (grounded, anchored)
------------------------------------------------------------
local propsFolder = folder:FindFirstChild("Props") or Instance.new("Folder")
propsFolder.Name = "Props"
propsFolder.Parent = folder
local function scatterOnRoadEdge(items)
  local i = 0
  for r = 0, gridSize - 1 do
    for c = 0, gridSize - 1 do
      if isRoadCell(c, r) and i < #items then
        i = i + 1
        local item = items[i]
        local jitterX = (math.random() - 0.5) * (CELL_SIZE * 0.7)
        local jitterZ = (math.random() - 0.5) * (CELL_SIZE * 0.7)
        local cx = (c - centerOffset) * CELL_SIZE + jitterX
        local cz = (r - centerOffset) * CELL_SIZE + jitterZ
        local _, size = bbox(item)
        local gy = groundY(cx, cz)
        if item:IsA("Model") then
          item:PivotTo(CFrame.new(cx, gy + size.Y / 2, cz) * CFrame.Angles(0, math.random() * math.pi * 2, 0))
        elseif item:IsA("BasePart") then
          item.CFrame = CFrame.new(cx, gy + size.Y / 2, cz)
        end
        item.Parent = propsFolder
      end
    end
  end
end
scatterOnRoadEdge(decor)
scatterOnRoadEdge(vehicles)

------------------------------------------------------------
-- 7. SPAWN + workspace flags
------------------------------------------------------------
local spawn = Workspace:FindFirstChildOfClass("SpawnLocation")
if not spawn then
  spawn = Instance.new("SpawnLocation")
  spawn.Name = "BloxSmith_CitySpawn"
  spawn.Size = Vector3.new(8, 1, 8)
  spawn.Anchored = true
  spawn.Neutral = true
  spawn.Parent = Workspace
end
local spawnGy = groundY(0, -(centerOffset + 1) * CELL_SIZE)
spawn.CFrame = CFrame.new(0, spawnGy + 2, -(centerOffset + 1) * CELL_SIZE)

Workspace:SetAttribute("BloxSmithToolboxOnlyMap", true)
Workspace:SetAttribute("BloxSmithProceduralFallbackDisabled", true)
Workspace.StreamingEnabled = true
`,
        },
      });
      actions.push({
        kind: "scan_project",
        parent_path: "Workspace",
        name: "BloxSmith_Scan_Real_Toolbox_Map",
        payload: { reason: "verify_real_toolbox_assets_no_procedural_fallback" },
      });
    }

    return actions;
  } catch (err) {
    console.warn("[chat] toolbox map seed failed", err);
    return [];
  }
}

function isRobloxSystemRequest(userText: string) {
  return isHumanoidVfxRequest(userText) || isBroadPlayableGameRequest(userText) || /\b(script|scripting|code|game|experience|mechanic|system|gui|ui|screen|loading|load\s*screen|main\s*menu|menu|hud|button|shop|inventory|settings|gamepass|quest|health|cash|coins|leaderstats|remote|event|datastore|save|checkpoint|timer|round|notification|mobile\s*controls?|speed\s*boost|sprint|dash|double\s*jump|high\s*jump|super\s*jump|jump\s*boost|space\s*bar|keybind|key\s*bind|ability|power|aura|vfx|visual\s*effects?|particles?|fire|flames?|flaming|burning|on\s*fire|lightning|electric|smoke|magic|ice|frost|glow(?:ing)?|sparkles?|trail|obby|parkour|tycoon|simulator|rpg|dungeon|combat|fighting|weapon|gun|sword|shooter|arena|battle|zombie|survival|horror|tower\s*defen[cs]e|role\s*play|roleplay|racing|pet\s*(simulator|game|system)|trading|farming|fishing|minigame)\b/i.test(userText);
}

function robloxSystemStudioActions(userText: string, languageName: string) {
  if (!isRobloxSystemRequest(userText)) return [];
  const requested = {
    loading: /\b(loading|load\s*screen)\b/i.test(userText),
    menu: /\b(main\s*menu|menu|play\s*button|start\s*button)\b/i.test(userText),
    hud: /\b(hud|health|cash|coins|xp|level|timer|round|objective)\b/i.test(userText),
    shop: /\b(shop|store|gamepass|purchase)\b/i.test(userText),
    inventory: /\b(inventory|items|backpack)\b/i.test(userText),
    settings: /\b(settings|options|volume|music)\b/i.test(userText),
    save: /\b(save|datastore|data\s*store|leaderstats|cash|coins|xp|level)\b/i.test(userText),
  };
  const safePrompt = userText.trim().slice(0, 260) || "Roblox UI and scripted systems";
  const source = `
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local StarterGui = game:GetService("StarterGui")
local ServerScriptService = game:GetService("ServerScriptService")

local requested = ${luaBooleanTable(requested)}

local remotes = ReplicatedStorage:FindFirstChild("BloxSmith_Remotes")
if not remotes then
  remotes = Instance.new("Folder")
  remotes.Name = "BloxSmith_Remotes"
  remotes.Parent = ReplicatedStorage
end

local function remote(name)
  local r = remotes:FindFirstChild(name)
  if not r then
    r = Instance.new("RemoteEvent")
    r.Name = name
    r.Parent = remotes
  end
  return r
end

remote("MenuAction")
remote("RequestShop")
remote("RequestInventory")
remote("SaveSettings")
remote("NotifyPlayer")

local gui = StarterGui:FindFirstChild("BloxSmith_Game_UI")
if gui then gui:Destroy() end
gui = Instance.new("ScreenGui")
gui.Name = "BloxSmith_Game_UI"
gui.ResetOnSpawn = false
gui.IgnoreGuiInset = true
gui.ZIndexBehavior = Enum.ZIndexBehavior.Sibling
gui.Parent = StarterGui

local function make(className, props, parent)
  local inst = Instance.new(className)
  for key, value in pairs(props or {}) do
    inst[key] = value
  end
  inst.Parent = parent
  return inst
end

local function corner(parent, radius)
  return make("UICorner", { CornerRadius = UDim.new(0, radius or 10) }, parent)
end

local function stroke(parent, color, thickness)
  return make("UIStroke", { Color = color or Color3.fromRGB(82, 93, 135), Thickness = thickness or 1, Transparency = 0.25 }, parent)
end

local function gradient(parent, a, b)
  return make("UIGradient", { Color = ColorSequence.new(a, b), Rotation = 28 }, parent)
end

local loadingPrompt = ${JSON.stringify(safePrompt)}
local loadingVariant = (#loadingPrompt % 4) + 1
local loadingTitleText = loadingPrompt:lower():find("city") and "Loading City" or loadingPrompt:lower():find("race") and "Loading Race" or loadingPrompt:lower():find("horror") and "Entering the Dark" or loadingPrompt:lower():find("quest") and "Loading Quest" or "Loading World"
local loadingTipText = loadingPrompt:lower():find("toolbox") and "Verifying safe free assets..." or loadingPrompt:lower():find("menu") and "Preparing animated menus..." or "Preparing your Roblox experience..."

local loading = make("Frame", {
  Name = "LoadingScreen",
  BackgroundColor3 = loadingVariant == 2 and Color3.fromRGB(12, 7, 24) or loadingVariant == 3 and Color3.fromRGB(4, 17, 24) or Color3.fromRGB(7, 10, 22),
  BorderSizePixel = 0,
  Size = UDim2.fromScale(1, 1),
  Visible = true,
  ZIndex = 50,
}, gui)
gradient(loading, loadingVariant == 3 and Color3.fromRGB(9, 46, 60) or Color3.fromRGB(10, 14, 34), loadingVariant == 2 and Color3.fromRGB(74, 34, 82) or Color3.fromRGB(38, 32, 92))

local accentShape = make("Frame", {
  Name = "AnimatedAccent",
  AnchorPoint = Vector2.new(0.5, 0.5),
  BackgroundColor3 = loadingVariant == 3 and Color3.fromRGB(40, 220, 190) or Color3.fromRGB(96, 110, 255),
  BackgroundTransparency = 0.28,
  Position = loadingVariant == 1 and UDim2.fromScale(0.5, 0.28) or loadingVariant == 2 and UDim2.fromScale(0.22, 0.52) or loadingVariant == 3 and UDim2.fromScale(0.75, 0.34) or UDim2.fromScale(0.5, 0.5),
  Rotation = loadingVariant == 2 and -18 or loadingVariant == 3 and 14 or 0,
  Size = loadingVariant == 4 and UDim2.fromScale(0.22, 0.22) or UDim2.fromScale(0.16, 0.16),
  ZIndex = 50,
}, loading)
corner(accentShape, loadingVariant == 2 and 24 or 999)
gradient(accentShape, Color3.fromRGB(80, 255, 220), Color3.fromRGB(120, 85, 255))

local loadingTitle = make("TextLabel", {
  Name = "Title",
  BackgroundTransparency = 1,
  Position = loadingVariant == 2 and UDim2.fromScale(0.42, 0.32) or loadingVariant == 3 and UDim2.fromScale(0.1, 0.27) or UDim2.fromScale(0.12, 0.34),
  Size = loadingVariant == 2 and UDim2.fromScale(0.48, 0.11) or loadingVariant == 3 and UDim2.fromScale(0.55, 0.12) or UDim2.fromScale(0.76, 0.12),
  Font = Enum.Font.GothamBlack,
  Text = loadingTitleText,
  TextColor3 = Color3.fromRGB(255, 255, 255),
  TextScaled = true,
  TextWrapped = true,
  TextXAlignment = loadingVariant == 3 and Enum.TextXAlignment.Left or Enum.TextXAlignment.Center,
  ZIndex = 51,
}, loading)

local loadingSub = make("TextLabel", {
  Name = "Subtitle",
  BackgroundTransparency = 1,
  Position = loadingVariant == 2 and UDim2.fromScale(0.42, 0.45) or loadingVariant == 3 and UDim2.fromScale(0.1, 0.42) or UDim2.fromScale(0.18, 0.47),
  Size = loadingVariant == 2 and UDim2.fromScale(0.42, 0.055) or loadingVariant == 3 and UDim2.fromScale(0.48, 0.055) or UDim2.fromScale(0.64, 0.055),
  Font = Enum.Font.GothamMedium,
  Text = loadingTipText,
  TextColor3 = Color3.fromRGB(190, 200, 230),
  TextScaled = true,
  TextWrapped = true,
  TextXAlignment = loadingVariant == 3 and Enum.TextXAlignment.Left or Enum.TextXAlignment.Center,
  ZIndex = 51,
}, loading)

local barBack = make("Frame", {
  Name = "ProgressBack",
  BackgroundColor3 = Color3.fromRGB(28, 32, 50),
  Position = loadingVariant == 2 and UDim2.fromScale(0.42, 0.58) or loadingVariant == 3 and UDim2.fromScale(0.1, 0.55) or UDim2.fromScale(0.28, 0.58),
  Size = loadingVariant == 2 and UDim2.fromScale(0.42, 0.026) or loadingVariant == 3 and UDim2.fromScale(0.55, 0.03) or UDim2.fromScale(0.44, 0.022),
  ZIndex = 51,
}, loading)
corner(barBack, 999)
local barFill = make("Frame", {
  Name = "ProgressFill",
  BackgroundColor3 = Color3.fromRGB(90, 100, 255),
  Size = UDim2.fromScale(0, 1),
  ZIndex = 52,
}, barBack)
corner(barFill, 999)
gradient(barFill, Color3.fromRGB(80, 255, 180), Color3.fromRGB(100, 95, 255))

-- Menu variety: pick palette / layout / title / buttons per turn so the main menu
-- doesn't look identical every build. Seed mixes prompt content + time.
local menuSeed = 0
for i = 1, #loadingPrompt do menuSeed = (menuSeed * 31 + loadingPrompt:byte(i)) % 1048576 end
menuSeed = (menuSeed + math.floor(tick() * 1000)) % 1048576
local menuVariant = (menuSeed % 5) + 1
local menuPalettes = {
  { bg = Color3.fromRGB(13, 17, 31), gA = Color3.fromRGB(18, 22, 42), gB = Color3.fromRGB(36, 28, 80), accent = Color3.fromRGB(86, 96, 255), edge = Color3.fromRGB(128, 255, 210) },
  { bg = Color3.fromRGB(28, 10, 18), gA = Color3.fromRGB(52, 14, 28), gB = Color3.fromRGB(120, 34, 46), accent = Color3.fromRGB(255, 96, 96), edge = Color3.fromRGB(255, 200, 120) },
  { bg = Color3.fromRGB(8, 24, 20), gA = Color3.fromRGB(10, 40, 32), gB = Color3.fromRGB(20, 90, 60), accent = Color3.fromRGB(70, 220, 140), edge = Color3.fromRGB(255, 240, 130) },
  { bg = Color3.fromRGB(24, 18, 6), gA = Color3.fromRGB(48, 32, 8), gB = Color3.fromRGB(120, 78, 20), accent = Color3.fromRGB(255, 190, 60), edge = Color3.fromRGB(255, 240, 200) },
  { bg = Color3.fromRGB(10, 12, 22), gA = Color3.fromRGB(14, 20, 46), gB = Color3.fromRGB(22, 96, 128), accent = Color3.fromRGB(80, 200, 255), edge = Color3.fromRGB(200, 240, 255) },
}
local pal = menuPalettes[menuVariant]

local lower = loadingPrompt:lower()
local menuTitleText = lower:find("obby") and "OBBY CHALLENGE"
  or lower:find("tycoon") and "TYCOON"
  or lower:find("race") and "SPEEDWAY"
  or lower:find("horror") and "NIGHTFALL"
  or lower:find("zombie") and "OUTBREAK"
  or lower:find("sword") and "BLADES"
  or lower:find("city") and "CITY LIFE"
  or lower:find("simulator") and "SIMULATOR"
  or lower:find("shop") and "MARKET"
  or lower:find("quest") and "QUESTLINE"
  or ({ "READY", "BEGIN", "START GAME", "LAUNCH", "PLAY" })[menuVariant]

local menuLayouts = {
  { size = Vector2.new(460, 430), pos = UDim2.fromScale(0.5, 0.5), align = "center" },
  { size = Vector2.new(380, 500), pos = UDim2.fromScale(0.25, 0.5), align = "left" },
  { size = Vector2.new(560, 360), pos = UDim2.fromScale(0.5, 0.55), align = "center" },
  { size = Vector2.new(420, 460), pos = UDim2.fromScale(0.75, 0.5), align = "right" },
  { size = Vector2.new(500, 420), pos = UDim2.fromScale(0.5, 0.48), align = "center" },
}
local layout = menuLayouts[menuVariant]

local menu = make("Frame", {
  Name = "MainMenu",
  AnchorPoint = Vector2.new(0.5, 0.5),
  BackgroundColor3 = pal.bg,
  Position = layout.pos,
  Size = UDim2.fromOffset(layout.size.X, layout.size.Y),
  Visible = false,
}, gui)
corner(menu, menuVariant == 3 and 6 or menuVariant == 4 and 20 or 14)
stroke(menu, pal.edge, 1)
gradient(menu, pal.gA, pal.gB)

make("TextLabel", {
  Name = "GameTitle",
  BackgroundTransparency = 1,
  Position = UDim2.fromOffset(28, 24),
  Size = UDim2.new(1, -56, 0, 78),
  Font = menuVariant == 2 and Enum.Font.Bangers or menuVariant == 3 and Enum.Font.Michroma or menuVariant == 4 and Enum.Font.FredokaOne or Enum.Font.GothamBlack,
  Text = menuTitleText,
  TextColor3 = pal.edge,
  TextScaled = true,
  TextWrapped = true,
  TextXAlignment = layout.align == "left" and Enum.TextXAlignment.Left or layout.align == "right" and Enum.TextXAlignment.Right or Enum.TextXAlignment.Center,
}, menu)

make("TextLabel", {
  Name = "RequestNote",
  BackgroundTransparency = 1,
  Position = UDim2.fromOffset(40, 108),
  Size = UDim2.new(1, -80, 0, 36),
  Font = Enum.Font.Gotham,
  Text = ${JSON.stringify(safePrompt)},
  TextColor3 = Color3.fromRGB(185, 195, 225),
  TextScaled = true,
  TextWrapped = true,
}, menu)

-- Button set varies by prompt genre so we don't always ship Play/Shop/Inventory/Settings.
local buttonNames
if lower:find("obby") or lower:find("parkour") then buttonNames = { "Play", "Stages", "Skins", "Settings" }
elseif lower:find("tycoon") or lower:find("simulator") then buttonNames = { "Play", "Upgrades", "Rebirth", "Settings" }
elseif lower:find("race") or lower:find("car") then buttonNames = { "Race", "Garage", "Tracks", "Settings" }
elseif lower:find("horror") then buttonNames = { "Enter", "Lore", "Options", "Quit" }
elseif lower:find("zombie") or lower:find("survival") then buttonNames = { "Deploy", "Loadout", "Perks", "Settings" }
elseif lower:find("sword") or lower:find("combat") or lower:find("fight") then buttonNames = { "Fight", "Weapons", "Ranks", "Settings" }
elseif lower:find("rpg") or lower:find("quest") then buttonNames = { "Adventure", "Quests", "Party", "Settings" }
elseif lower:find("shop") or lower:find("trade") then buttonNames = { "Enter", "Market", "Trades", "Settings" }
else
  local sets = {
    { "Play", "Shop", "Inventory", "Settings" },
    { "Start", "Store", "Codes", "Settings" },
    { "Begin", "Rewards", "Friends", "Options" },
    { "Launch", "Progress", "Cosmetics", "Settings" },
    { "Play", "Missions", "Leaderboard", "Options" },
  }
  buttonNames = sets[menuVariant]
end

local buttonStartY = 156
local buttonHeight = 46
local buttonGap = 12
for i, label in ipairs(buttonNames) do
  local btn = make("TextButton", {
    Name = label:gsub("%s+", "") .. "Button",
    BackgroundColor3 = i == 1 and pal.accent or Color3.fromRGB(32, 38, 62),
    Position = UDim2.fromOffset(54, buttonStartY + (i - 1) * (buttonHeight + buttonGap)),
    Size = UDim2.new(1, -108, 0, buttonHeight),
    Font = Enum.Font.GothamBold,
    Text = label,
    TextColor3 = Color3.fromRGB(255, 255, 255),
    TextScaled = true,
    AutoButtonColor = true,
  }, menu)
  corner(btn, menuVariant == 3 and 4 or 10)
  stroke(btn, i == 1 and pal.edge or Color3.fromRGB(80, 88, 132), 1)
end

local hud = make("Frame", {
  Name = "HUD",
  BackgroundTransparency = 1,
  Size = UDim2.fromScale(1, 1),
  Visible = false,
}, gui)

local hudPanel = make("Frame", {
  Name = "TopStats",
  BackgroundColor3 = Color3.fromRGB(13, 17, 31),
  Position = UDim2.fromOffset(18, 18),
  Size = UDim2.fromOffset(420, 58),
}, hud)
corner(hudPanel, 10)
stroke(hudPanel, Color3.fromRGB(85, 94, 145), 1)

local stats = { "Health: 100", "Coins: 0", "Level: 1" }
for i, value in ipairs(stats) do
  make("TextLabel", {
    Name = "Stat" .. i,
    BackgroundTransparency = 1,
    Position = UDim2.fromOffset(14 + (i - 1) * 132, 9),
    Size = UDim2.fromOffset(126, 40),
    Font = Enum.Font.GothamBold,
    Text = value,
    TextColor3 = Color3.fromRGB(245, 248, 255),
    TextScaled = true,
    TextWrapped = true,
  }, hudPanel)
end

local modal = make("Frame", {
  Name = "Modal",
  AnchorPoint = Vector2.new(0.5, 0.5),
  BackgroundColor3 = Color3.fromRGB(16, 20, 35),
  Position = UDim2.fromScale(0.5, 0.55),
  Size = UDim2.fromOffset(420, 260),
  Visible = false,
}, gui)
corner(modal, 12)
stroke(modal, Color3.fromRGB(105, 112, 165), 1)
make("TextLabel", {
  Name = "ModalTitle",
  BackgroundTransparency = 1,
  Position = UDim2.fromOffset(24, 22),
  Size = UDim2.new(1, -48, 0, 48),
  Font = Enum.Font.GothamBlack,
  Text = "Panel",
  TextColor3 = Color3.fromRGB(255, 255, 255),
  TextScaled = true,
}, modal)
make("TextLabel", {
  Name = "ModalBody",
  BackgroundTransparency = 1,
  Position = UDim2.fromOffset(28, 86),
  Size = UDim2.new(1, -56, 0, 90),
  Font = Enum.Font.Gotham,
  Text = "This panel is wired and ready for your game logic.",
  TextColor3 = Color3.fromRGB(190, 200, 230),
  TextScaled = true,
  TextWrapped = true,
}, modal)
local close = make("TextButton", {
  Name = "CloseButton",
  BackgroundColor3 = Color3.fromRGB(86, 96, 255),
  Position = UDim2.fromOffset(110, 194),
  Size = UDim2.new(1, -220, 0, 42),
  Font = Enum.Font.GothamBold,
  Text = "Close",
  TextColor3 = Color3.fromRGB(255, 255, 255),
  TextScaled = true,
}, modal)
corner(close, 8)

local localScript = make("LocalScript", { Name = "BloxSmith_UI_Controller" }, gui)
localScript.Source = [==[
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local TweenService = game:GetService("TweenService")
local Players = game:GetService("Players")

local player = Players.LocalPlayer
local gui = script.Parent
local remotes = ReplicatedStorage:WaitForChild("BloxSmith_Remotes", 10)
local menuAction = remotes and remotes:WaitForChild("MenuAction", 10)

local loading = gui:WaitForChild("LoadingScreen")
local menu = gui:WaitForChild("MainMenu")
local hud = gui:WaitForChild("HUD")
local modal = gui:WaitForChild("Modal")
local bar = loading.ProgressBack.ProgressFill

local function tween(inst, props, time)
  local t = TweenService:Create(inst, TweenInfo.new(time or 0.25, Enum.EasingStyle.Quad, Enum.EasingDirection.Out), props)
  t:Play()
  return t
end

local function showModal(title, body)
  modal.ModalTitle.Text = title
  modal.ModalBody.Text = body
  modal.Visible = true
end

for i = 1, 100 do
  bar.Size = UDim2.fromScale(i / 100, 1)
  task.wait(0.012)
end
tween(loading, { BackgroundTransparency = 1 }, 0.35)
task.wait(0.35)
loading.Visible = false
menu.Visible = true

-- Wire every TextButton under the menu dynamically so varied menu layouts still work.
for _, child in ipairs(menu:GetChildren()) do
  if child:IsA("TextButton") then
    local label = child.Text
    local nameKey = child.Name:gsub("Button$", "")
    child.MouseButton1Click:Connect(function()
      local lower = label:lower()
      if lower:find("play") or lower:find("start") or lower:find("begin") or lower:find("launch") or lower:find("enter") or lower:find("deploy") or lower:find("fight") or lower:find("race") or lower:find("adventure") then
        menu.Visible = false
        hud.Visible = true
        if menuAction then menuAction:FireServer(nameKey) end
      elseif lower:find("quit") or lower:find("exit") then
        menu.Visible = false
      else
        showModal(label, "This panel is wired and ready for your game logic.")
        if menuAction then menuAction:FireServer(nameKey) end
      end
    end)
  end
end

modal.CloseButton.MouseButton1Click:Connect(function()
  modal.Visible = false
end)

local function syncStats()
  local stats = player:FindFirstChild("leaderstats")
  if not stats then return end
  local coins = stats:FindFirstChild("Coins")
  local level = stats:FindFirstChild("Level")
  if coins then hud.TopStats.Stat2.Text = "Coins: " .. tostring(coins.Value) end
  if level then hud.TopStats.Stat3.Text = "Level: " .. tostring(level.Value) end
end

player.ChildAdded:Connect(syncStats)
task.spawn(function()
  while gui.Parent do
    syncStats()
    task.wait(1)
  end
end)
]==]

local serverScript = ServerScriptService:FindFirstChild("BloxSmith_Game_Systems")
if serverScript then serverScript:Destroy() end
serverScript = Instance.new("Script")
serverScript.Name = "BloxSmith_Game_Systems"
serverScript.Parent = ServerScriptService
serverScript.Source = [==[
local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local remotes = ReplicatedStorage:FindFirstChild("BloxSmith_Remotes") or Instance.new("Folder")
remotes.Name = "BloxSmith_Remotes"
remotes.Parent = ReplicatedStorage

local function remote(name)
  local r = remotes:FindFirstChild(name)
  if not r then
    r = Instance.new("RemoteEvent")
    r.Name = name
    r.Parent = remotes
  end
  return r
end

local menuAction = remote("MenuAction")
remote("RequestShop")
remote("RequestInventory")
remote("SaveSettings")
remote("NotifyPlayer")

local function setupPlayer(player)
  local leaderstats = player:FindFirstChild("leaderstats") or Instance.new("Folder")
  leaderstats.Name = "leaderstats"
  leaderstats.Parent = player

  local coins = leaderstats:FindFirstChild("Coins") or Instance.new("IntValue")
  coins.Name = "Coins"
  coins.Value = coins.Value
  coins.Parent = leaderstats

  local level = leaderstats:FindFirstChild("Level") or Instance.new("IntValue")
  level.Name = "Level"
  if level.Value <= 0 then level.Value = 1 end
  level.Parent = leaderstats
end

Players.PlayerAdded:Connect(setupPlayer)
for _, player in ipairs(Players:GetPlayers()) do
  setupPlayer(player)
end

menuAction.OnServerEvent:Connect(function(player, action)
  if typeof(action) ~= "string" then return end
  print("[BloxSmith]", player.Name, "clicked", action)
  local stats = player:FindFirstChild("leaderstats")
  local coins = stats and stats:FindFirstChild("Coins")
  if action == "Play" and coins then
    coins.Value += 10
  end
end)
]==]

gui:SetAttribute("BloxSmithSystemRequest", ${JSON.stringify(safePrompt)})
gui:SetAttribute("Language", ${JSON.stringify(languageName)})
`;

  return [
    {
      kind: "run_lua",
      parent_path: "Workspace",
      name: "BloxSmith_Build_UI_And_Systems",
      payload: { source },
    },
    {
      kind: "scan_project",
      parent_path: "Workspace",
      name: "BloxSmith_Scan_UI_And_Systems",
      payload: { reason: "verify_ui_scripts_remotes_and_server_systems" },
    },
  ];
}

function broadPlayableGameStudioActions(userText: string, languageName: string) {
  if (!isBroadPlayableGameRequest(userText)) return [];
  const safePrompt = userText.trim().slice(0, 260) || "Roblox playable game system";
  const text = userText.toLowerCase();
  const genre = /\b(obby|parkour)\b/.test(text) ? "obby" :
    /\b(tycoon)\b/.test(text) ? "tycoon" :
    /\b(racing|race\s*track|race\s*course)\b/.test(text) ? "racing" :
    /\b(zombie|survival|horror)\b/.test(text) ? "survival" :
    /\b(combat|fighting|weapon|gun|sword|shooter|arena|battle)\b/.test(text) ? "combat" :
    /\b(pet\s*(simulator|game|system)|simulator)\b/.test(text) ? "simulator" :
    "adventure";
  const source = `
local Workspace = game:GetService("Workspace")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local ServerScriptService = game:GetService("ServerScriptService")
local StarterGui = game:GetService("StarterGui")
local Lighting = game:GetService("Lighting")

local request = ${JSON.stringify(safePrompt)}
local languageName = ${JSON.stringify(languageName)}
local genre = ${JSON.stringify(genre)}

local root = Workspace:FindFirstChild("BloxSmith_Playable_Game")
if root then root:Destroy() end
root = Instance.new("Folder")
root.Name = "BloxSmith_Playable_Game"
root.Parent = Workspace

local function folder(parent, name)
  local f = parent:FindFirstChild(name)
  if not f then
    f = Instance.new("Folder")
    f.Name = name
    f.Parent = parent
  end
  return f
end

local function part(parent, name, size, cf, color, material)
  local p = Instance.new("Part")
  p.Name = name
  p.Anchored = true
  p.CanCollide = true
  p.Size = size
  p.CFrame = cf
  p.Color = color
  p.Material = material or Enum.Material.SmoothPlastic
  p.TopSurface = Enum.SurfaceType.Smooth
  p.BottomSurface = Enum.SurfaceType.Smooth
  p.Parent = parent
  return p
end

local map = folder(root, "Map")
local systems = folder(root, "Gameplay_Objects")
local spawns = folder(root, "Spawns")

local base = part(map, "Main_Play_Area", Vector3.new(260, 1, 260), CFrame.new(0, 0, 0), Color3.fromRGB(72, 142, 78), Enum.Material.Grass)
base:SetAttribute("BloxSmithRole", "play_area")

local spawn = Instance.new("SpawnLocation")
spawn.Name = "Start_Spawn"
spawn.Anchored = true
spawn.Neutral = true
spawn.Size = Vector3.new(10, 1, 10)
spawn.Position = Vector3.new(0, 2, -104)
spawn.Color = Color3.fromRGB(78, 255, 170)
spawn.Material = Enum.Material.Neon
spawn.Parent = spawns

if genre == "obby" then
  local obby = folder(systems, "Obby_Course")
  part(obby, "Start_Platform", Vector3.new(20, 2, 20), CFrame.new(0, 3, -92), Color3.fromRGB(64, 205, 120), Enum.Material.Neon)
  for i = 1, 14 do
    local x = ((i % 2 == 0) and 14 or -14) + math.sin(i) * 8
    local y = 5 + i * 2.2
    local z = -82 + i * 14
    local platform = part(obby, "Stage_" .. i .. "_Platform", Vector3.new(13, 1.4, 13), CFrame.new(x, y, z), Color3.fromHSV(i / 14, 0.7, 1), Enum.Material.Neon)
    platform:SetAttribute("Stage", i)
    if i % 3 == 0 then
      local checkpoint = part(obby, "Checkpoint_" .. i, Vector3.new(9, 0.8, 9), CFrame.new(x, y + 1.2, z), Color3.fromRGB(255, 225, 76), Enum.Material.Neon)
      checkpoint:SetAttribute("BloxSmithCheckpoint", true)
      checkpoint:SetAttribute("Stage", i)
    end
    if i % 4 == 2 then
      local kill = part(obby, "Kill_Brick_" .. i, Vector3.new(15, 1, 4), CFrame.new(x, y + 1.2, z + 5.5), Color3.fromRGB(255, 72, 72), Enum.Material.Neon)
      kill:SetAttribute("BloxSmithKillBrick", true)
    end
  end
  local finish = part(obby, "Finish_Reward_Pad", Vector3.new(24, 2, 24), CFrame.new(0, 40, 122), Color3.fromRGB(255, 210, 70), Enum.Material.Neon)
  finish:SetAttribute("BloxSmithFinish", true)
  finish:SetAttribute("Stage", 15)
elseif genre == "tycoon" then
  local tycoon = folder(systems, "Tycoon_Core")
  part(tycoon, "Collector", Vector3.new(18, 2, 18), CFrame.new(0, 2, -20), Color3.fromRGB(66, 220, 135), Enum.Material.Neon):SetAttribute("BloxSmithCollector", true)
  for i = 1, 5 do
    local dropper = part(tycoon, "Dropper_" .. i, Vector3.new(10, 10, 10), CFrame.new(-48 + i * 18, 6, 18), Color3.fromRGB(82, 92, 125), Enum.Material.Metal)
    dropper:SetAttribute("BloxSmithDropper", true)
    part(tycoon, "Upgrade_Pad_" .. i, Vector3.new(12, 1, 12), CFrame.new(-48 + i * 18, 1.4, 48), Color3.fromRGB(255, 185, 70), Enum.Material.Neon):SetAttribute("BloxSmithUpgradePad", true)
  end
elseif genre == "racing" then
  local race = folder(systems, "Race_Course")
  for i = 1, 8 do
    local angle = (math.pi * 2) * (i / 8)
    local x, z = math.cos(angle) * 78, math.sin(angle) * 78
    part(race, "Track_Section_" .. i, Vector3.new(42, 1, 18), CFrame.new(x, 1.2, z) * CFrame.Angles(0, -angle, 0), Color3.fromRGB(42, 45, 50), Enum.Material.Asphalt)
    local cp = part(race, "Checkpoint_" .. i, Vector3.new(4, 18, 30), CFrame.new(x, 10, z) * CFrame.Angles(0, -angle, 0), Color3.fromRGB(80, 210, 255), Enum.Material.Neon)
    cp.Transparency = 0.35
    cp.CanCollide = false
    cp:SetAttribute("BloxSmithCheckpoint", true)
    cp:SetAttribute("Stage", i)
  end
else
  local goals = folder(systems, "Objectives")
  for i, data in ipairs({{-58, -28, "Collect_Zone"}, {58, -24, "Reward_Zone"}, {0, 58, "Final_Objective"}}) do
    local zone = part(goals, data[3], Vector3.new(22, 1.2, 22), CFrame.new(data[1], 1.6, data[2]), i == 3 and Color3.fromRGB(255, 210, 78) or Color3.fromRGB(82, 145, 255), Enum.Material.Neon)
    zone:SetAttribute(i == 3 and "BloxSmithFinish" or "BloxSmithCheckpoint", true)
    zone:SetAttribute("Stage", i)
  end
  if genre == "combat" or genre == "survival" then
    local hazards = folder(systems, "Hazards")
    for i, pos in ipairs({Vector3.new(-42, 2, 32), Vector3.new(42, 2, 32), Vector3.new(0, 2, 86)}) do
      local h = part(hazards, "Hazard_" .. i, Vector3.new(16, 2, 16), CFrame.new(pos), Color3.fromRGB(255, 74, 74), Enum.Material.Neon)
      h:SetAttribute("BloxSmithKillBrick", true)
    end
  end
end

local sign = part(map, "Objective_Sign", Vector3.new(58, 18, 1), CFrame.new(0, 13, -124), Color3.fromRGB(24, 29, 42), Enum.Material.Metal)
local signGui = Instance.new("SurfaceGui")
signGui.Face = Enum.NormalId.Front
signGui.SizingMode = Enum.SurfaceGuiSizingMode.PixelsPerStud
signGui.PixelsPerStud = 24
signGui.Parent = sign
local signText = Instance.new("TextLabel")
signText.BackgroundTransparency = 1
signText.Size = UDim2.fromScale(1, 1)
signText.Font = Enum.Font.GothamBold
signText.TextScaled = true
signText.TextWrapped = true
signText.TextColor3 = Color3.fromRGB(245, 248, 255)
signText.Text = "BloxSmith playable " .. genre .. " build\\n" .. request
signText.Parent = signGui

local remotes = ReplicatedStorage:FindFirstChild("BloxSmith_Remotes") or Instance.new("Folder")
remotes.Name = "BloxSmith_Remotes"
remotes.Parent = ReplicatedStorage
local notify = remotes:FindFirstChild("BloxSmith_Notify") or Instance.new("RemoteEvent")
notify.Name = "BloxSmith_Notify"
notify.Parent = remotes

local gui = StarterGui:FindFirstChild("BloxSmith_Playable_Game_UI")
if gui then gui:Destroy() end
gui = Instance.new("ScreenGui")
gui.Name = "BloxSmith_Playable_Game_UI"
gui.ResetOnSpawn = false
gui.IgnoreGuiInset = true
gui.ZIndexBehavior = Enum.ZIndexBehavior.Sibling
gui.Parent = StarterGui

local hud = Instance.new("Frame")
hud.Name = "HUD"
hud.BackgroundColor3 = Color3.fromRGB(14, 18, 31)
hud.BackgroundTransparency = 0.05
hud.Position = UDim2.fromOffset(18, 18)
hud.Size = UDim2.fromOffset(430, 84)
hud.Parent = gui
Instance.new("UICorner", hud).CornerRadius = UDim.new(0, 12)
local stroke = Instance.new("UIStroke")
stroke.Color = Color3.fromRGB(82, 96, 148)
stroke.Thickness = 1
stroke.Transparency = 0.2
stroke.Parent = hud

local title = Instance.new("TextLabel")
title.Name = "Title"
title.BackgroundTransparency = 1
title.Position = UDim2.fromOffset(14, 8)
title.Size = UDim2.new(1, -28, 0, 26)
title.Font = Enum.Font.GothamBold
title.TextScaled = true
title.TextXAlignment = Enum.TextXAlignment.Left
title.TextColor3 = Color3.fromRGB(255, 255, 255)
title.Text = string.upper(genre) .. " SYSTEM"
title.Parent = hud

local statsLabel = Instance.new("TextLabel")
statsLabel.Name = "Stats"
statsLabel.BackgroundTransparency = 1
statsLabel.Position = UDim2.fromOffset(14, 42)
statsLabel.Size = UDim2.new(1, -28, 0, 30)
statsLabel.Font = Enum.Font.GothamSemibold
statsLabel.TextScaled = true
statsLabel.TextXAlignment = Enum.TextXAlignment.Left
statsLabel.TextColor3 = Color3.fromRGB(190, 205, 235)
statsLabel.Text = "Stage: 1   Coins: 0   Wins: 0"
statsLabel.Parent = hud

local toast = Instance.new("TextLabel")
toast.Name = "Toast"
toast.BackgroundColor3 = Color3.fromRGB(76, 92, 255)
toast.Position = UDim2.new(0.5, -180, 0, 118)
toast.Size = UDim2.fromOffset(360, 44)
toast.Font = Enum.Font.GothamBold
toast.TextScaled = true
toast.TextColor3 = Color3.fromRGB(255, 255, 255)
toast.Visible = false
toast.Parent = gui
Instance.new("UICorner", toast).CornerRadius = UDim.new(0, 10)

local localScript = Instance.new("LocalScript")
localScript.Name = "BloxSmith_Playable_UI_Controller"
localScript.Source = [==[
local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local TweenService = game:GetService("TweenService")
local player = Players.LocalPlayer
local gui = script.Parent
local statsLabel = gui.HUD.Stats
local toast = gui.Toast

local function sync()
  local ls = player:FindFirstChild("leaderstats")
  if not ls then return end
  local stage = ls:FindFirstChild("Stage")
  local coins = ls:FindFirstChild("Coins")
  local wins = ls:FindFirstChild("Wins")
  statsLabel.Text = string.format("Stage: %d   Coins: %d   Wins: %d", stage and stage.Value or 1, coins and coins.Value or 0, wins and wins.Value or 0)
end

local function bindStats(ls)
  for _, child in ipairs(ls:GetChildren()) do
    if child:IsA("ValueBase") then child.Changed:Connect(sync) end
  end
  ls.ChildAdded:Connect(function(child)
    if child:IsA("ValueBase") then child.Changed:Connect(sync) end
    sync()
  end)
  sync()
end

local existing = player:FindFirstChild("leaderstats")
if existing then bindStats(existing) end
player.ChildAdded:Connect(function(child)
  if child.Name == "leaderstats" then bindStats(child) end
end)

local remotes = ReplicatedStorage:WaitForChild("BloxSmith_Remotes", 10)
local notify = remotes and remotes:WaitForChild("BloxSmith_Notify", 10)
if notify then
  notify.OnClientEvent:Connect(function(message)
    toast.Text = tostring(message)
    toast.Visible = true
    toast.TextTransparency = 0
    toast.BackgroundTransparency = 0
    TweenService:Create(toast, TweenInfo.new(0.18), { Position = UDim2.new(0.5, -180, 0, 112) }):Play()
    task.delay(2.2, function()
      TweenService:Create(toast, TweenInfo.new(0.35), { TextTransparency = 1, BackgroundTransparency = 1 }):Play()
      task.wait(0.38)
      toast.Visible = false
      toast.Position = UDim2.new(0.5, -180, 0, 118)
    end)
  end)
end

task.spawn(function()
  while gui.Parent do
    sync()
    task.wait(1)
  end
end)
]==]
localScript.Parent = gui

local manager = ServerScriptService:FindFirstChild("BloxSmith_Playable_Game_Manager")
if manager then manager:Destroy() end
manager = Instance.new("Script")
manager.Name = "BloxSmith_Playable_Game_Manager"
manager.Source = [==[
local Players = game:GetService("Players")
local DataStoreService = game:GetService("DataStoreService")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local Workspace = game:GetService("Workspace")
local RunService = game:GetService("RunService")

local root = Workspace:WaitForChild("BloxSmith_Playable_Game", 15)
local remotes = ReplicatedStorage:FindFirstChild("BloxSmith_Remotes") or Instance.new("Folder")
remotes.Name = "BloxSmith_Remotes"
remotes.Parent = ReplicatedStorage
local notify = remotes:FindFirstChild("BloxSmith_Notify") or Instance.new("RemoteEvent")
notify.Name = "BloxSmith_Notify"
notify.Parent = remotes

local store
pcall(function() store = DataStoreService:GetDataStore("BloxSmith_Playable_Game_v1") end)
local cache = {}
local debounce = {}

local function ensureStats(player)
  local ls = player:FindFirstChild("leaderstats") or Instance.new("Folder")
  ls.Name = "leaderstats"
  ls.Parent = player
  local function int(name, default)
    local v = ls:FindFirstChild(name) or Instance.new("IntValue")
    v.Name = name
    if v.Value == 0 and default and default > 0 then v.Value = default end
    v.Parent = ls
    return v
  end
  return int("Stage", 1), int("Coins", 0), int("Wins", 0)
end

local function key(player) return "u_" .. player.UserId end
local function load(player)
  local stage, coins, wins = ensureStats(player)
  local data = { stage = 1, coins = 0, wins = 0 }
  if store then
    local ok, saved = pcall(function() return store:GetAsync(key(player)) end)
    if ok and type(saved) == "table" then data = saved end
  end
  stage.Value = math.max(1, tonumber(data.stage) or 1)
  coins.Value = math.max(0, tonumber(data.coins) or 0)
  wins.Value = math.max(0, tonumber(data.wins) or 0)
  cache[player] = data
end

local function save(player)
  if not store then return end
  local stage, coins, wins = ensureStats(player)
  local data = { stage = stage.Value, coins = coins.Value, wins = wins.Value }
  pcall(function()
    store:UpdateAsync(key(player), function() return data end)
  end)
end

local function award(player, stageAmount, coinAmount, winAmount, message)
  local stage, coins, wins = ensureStats(player)
  if stageAmount and stageAmount > stage.Value then stage.Value = stageAmount end
  if coinAmount and coinAmount > 0 then coins.Value += coinAmount end
  if winAmount and winAmount > 0 then wins.Value += winAmount end
  if message then notify:FireClient(player, message) end
end

local function onTouched(part, hit)
  local character = hit and hit.Parent
  local humanoid = character and character:FindFirstChildOfClass("Humanoid")
  if not humanoid then return end
  local player = Players:GetPlayerFromCharacter(character)
  if not player then return end
  local now = os.clock()
  local token = player.UserId .. ":" .. part:GetDebugId()
  if debounce[token] and now - debounce[token] < 0.8 then return end
  debounce[token] = now

  if part:GetAttribute("BloxSmithKillBrick") then
    humanoid.Health = 0
    return
  end
  if part:GetAttribute("BloxSmithFinish") then
    award(player, tonumber(part:GetAttribute("Stage")) or 1, 100, 1, "Finished! +100 coins")
    save(player)
    return
  end
  if part:GetAttribute("BloxSmithCheckpoint") then
    local nextStage = tonumber(part:GetAttribute("Stage")) or 1
    award(player, nextStage, 10, 0, "Checkpoint " .. tostring(nextStage) .. " reached")
  end
end

local function wirePart(part)
  if part:IsA("BasePart") and (part:GetAttribute("BloxSmithCheckpoint") or part:GetAttribute("BloxSmithFinish") or part:GetAttribute("BloxSmithKillBrick")) then
    part.Touched:Connect(function(hit) onTouched(part, hit) end)
  end
end

if root then
  for _, inst in ipairs(root:GetDescendants()) do wirePart(inst) end
  root.DescendantAdded:Connect(wirePart)
end

Players.PlayerAdded:Connect(function(player)
  load(player)
  player.CharacterAdded:Connect(function(character)
    local stage = player:FindFirstChild("leaderstats") and player.leaderstats:FindFirstChild("Stage")
    local rootPart = character:WaitForChild("HumanoidRootPart", 8)
    if rootPart and stage and root then
      local best
      for _, inst in ipairs(root:GetDescendants()) do
        if inst:IsA("BasePart") and inst:GetAttribute("BloxSmithCheckpoint") and tonumber(inst:GetAttribute("Stage")) == stage.Value then
          best = inst
          break
        end
      end
      if best then rootPart.CFrame = best.CFrame + Vector3.new(0, 5, 0) end
    end
  end)
end)
for _, player in ipairs(Players:GetPlayers()) do task.spawn(load, player) end
Players.PlayerRemoving:Connect(function(player) save(player); cache[player] = nil end)
game:BindToClose(function()
  if RunService:IsStudio() then return end
  for _, player in ipairs(Players:GetPlayers()) do task.spawn(save, player) end
  task.wait(2)
end)
]==]
manager.Parent = ServerScriptService

pcall(function()
  Lighting.ClockTime = genre == "survival" and 0 or 14
  Lighting.Brightness = genre == "survival" and 1.1 or 2.4
  Lighting.Ambient = genre == "survival" and Color3.fromRGB(30, 32, 44) or Color3.fromRGB(100, 115, 135)
  Lighting.OutdoorAmbient = genre == "survival" and Color3.fromRGB(20, 22, 35) or Color3.fromRGB(135, 150, 170)
  local atmosphere = Lighting:FindFirstChildOfClass("Atmosphere") or Instance.new("Atmosphere")
  atmosphere.Name = "BloxSmith_Playable_Atmosphere"
  atmosphere.Density = genre == "survival" and 0.52 or 0.24
  atmosphere.Haze = genre == "survival" and 2.1 or 0.7
  atmosphere.Color = genre == "survival" and Color3.fromRGB(95, 100, 125) or Color3.fromRGB(206, 228, 255)
  atmosphere.Parent = Lighting
end)

root:SetAttribute("BloxSmithPrompt", request)
root:SetAttribute("BloxSmithGenre", genre)
root:SetAttribute("BloxSmithPlayable", true)
root:SetAttribute("BloxSmithLanguage", languageName)
print("[BloxSmith] Built playable " .. genre .. " game framework for: " .. request)
`;

  return [
    {
      kind: "run_lua",
      parent_path: "Workspace",
      name: "BloxSmith_Build_Playable_Game_Framework",
      payload: { source, request: safePrompt, genre, visible_output_required: true },
    },
    {
      kind: "organize_project",
      parent_path: "Workspace",
      name: "BloxSmith_Organize_Playable_Game",
      payload: { reason: "organize_playable_game_framework" },
    },
    {
      kind: "autofix_project",
      parent_path: "Workspace",
      name: "BloxSmith_Autofix_Playable_Game",
      payload: { reason: "fix_common_issues_in_playable_game_framework" },
    },
    {
      kind: "scan_project",
      parent_path: "Workspace",
      name: "BloxSmith_Scan_Playable_Game",
      payload: { reason: "verify_playable_game_framework_scripts_ui_and_map" },
    },
  ];
}

function simpleRobloxSystemStudioActions(userText: string, languageName: string) {
  if (!isRobloxSystemRequest(userText) || !isSimpleSingleThingRequest(userText)) return [];
  const text = userText.toLowerCase();
  const safePrompt = userText.trim().slice(0, 180) || "BloxSmith simple system";
  const kind =
    /\b(loading|load\s*screen)\b/.test(text) ? "loading" :
    /\b(main\s*menu|menu|play\s*button|start\s*button)\b/.test(text) ? "menu" :
    /\b(hud|health|cash|coins|xp|level|timer)\b/.test(text) ? "hud" :
    /\b(script|server\s*script)\b/.test(text) ? "script" :
    "ui";
  const source = `
local StarterGui = game:GetService("StarterGui")
local ServerScriptService = game:GetService("ServerScriptService")
local kind = ${JSON.stringify(kind)}

local function make(className, props, parent)
  local inst = Instance.new(className)
  for key, value in pairs(props or {}) do inst[key] = value end
  inst.Parent = parent
  return inst
end

if kind == "script" then
  local scriptObj = ServerScriptService:FindFirstChild("BloxSmith_Simple_ServerScript")
  if scriptObj then scriptObj:Destroy() end
  scriptObj = Instance.new("Script")
  scriptObj.Name = "BloxSmith_Simple_ServerScript"
  scriptObj.Source = [[
print("[BloxSmith] Simple server script is running.")
]]
  scriptObj.Parent = ServerScriptService
  return
end

local gui = StarterGui:FindFirstChild("BloxSmith_Single_UI")
if gui then gui:Destroy() end
gui = Instance.new("ScreenGui")
gui.Name = "BloxSmith_Single_UI"
gui.ResetOnSpawn = false
gui.IgnoreGuiInset = true
gui.Parent = StarterGui

local frame = make("Frame", {
  Name = kind == "loading" and "LoadingScreen" or kind == "menu" and "MainMenu" or kind == "hud" and "HUD" or "Panel",
  AnchorPoint = Vector2.new(0.5, 0.5),
  BackgroundColor3 = Color3.fromRGB(16, 20, 36),
  Position = kind == "hud" and UDim2.fromOffset(190, 48) or UDim2.fromScale(0.5, 0.5),
  Size = kind == "hud" and UDim2.fromOffset(340, 64) or UDim2.fromOffset(440, 240),
}, gui)
make("UICorner", { CornerRadius = UDim.new(0, 12) }, frame)
make("UIStroke", { Color = Color3.fromRGB(94, 108, 170), Thickness = 1 }, frame)

local title = kind == "loading" and "Loading..." or kind == "menu" and "Main Menu" or kind == "hud" and "Health 100   Coins 0" or "BloxSmith UI"
make("TextLabel", {
  Name = "Title",
  BackgroundTransparency = 1,
  Position = UDim2.fromOffset(24, 24),
  Size = UDim2.new(1, -48, kind == "hud" and 1 or 0, kind == "hud" and -48 or 72),
  Font = Enum.Font.GothamBlack,
  Text = title,
  TextColor3 = Color3.fromRGB(255, 255, 255),
  TextScaled = true,
  TextWrapped = true,
}, frame)

if kind == "menu" then
  local button = make("TextButton", {
    Name = "PlayButton",
    BackgroundColor3 = Color3.fromRGB(86, 96, 255),
    Position = UDim2.new(0.5, -120, 1, -82),
    Size = UDim2.fromOffset(240, 48),
    Font = Enum.Font.GothamBold,
    Text = "Play",
    TextColor3 = Color3.fromRGB(255, 255, 255),
    TextScaled = true,
  }, frame)
  make("UICorner", { CornerRadius = UDim.new(0, 10) }, button)
end

if kind == "loading" then
  local bar = make("Frame", {
    Name = "ProgressBar",
    BackgroundColor3 = Color3.fromRGB(86, 96, 255),
    Position = UDim2.new(0.18, 0, 0.72, 0),
    Size = UDim2.new(0.64, 0, 0, 12),
  }, frame)
  make("UICorner", { CornerRadius = UDim.new(0, 999) }, bar)
end

gui:SetAttribute("BloxSmithRequest", ${JSON.stringify(safePrompt)})
gui:SetAttribute("Language", ${JSON.stringify(languageName)})
`;
  return [
    {
      kind: "run_lua",
      parent_path: "Workspace",
      name: "BloxSmith_Build_Single_UI_Or_Script",
      payload: { source },
    },
    {
      kind: "scan_project",
      parent_path: "Workspace",
      name: "BloxSmith_Scan_Single_UI_Or_Script",
      payload: { reason: "verify_single_ui_or_script_request" },
    },
  ];
}

export const Route = createFileRoute("/api/chat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const auth = request.headers.get("authorization") ?? "";
          const token = auth.replace(/^Bearer\s+/i, "");
          if (!token) return jsonError("Please sign in again before sending a message.", 401, "no_auth");

          let body: { messages?: UIMessage[]; projectId?: string; modelId?: string; autoExecute?: boolean; executionMode?: "safe" | "fast" | "owner"; buildQuality?: "basic" | "better" | "premium" | "full_game"; mode?: "chat" | "build"; language?: string; languageName?: string; proceduralGeneration?: boolean };
          try {
            body = (await request.json()) as typeof body;
          } catch {
            return jsonError("Invalid JSON in request body.", 400, "bad_json");
          }
          const mode: "chat" | "build" = body.mode === "chat" ? "chat" : "build";
          let executionMode: "safe" | "fast" | "owner" =
            body.executionMode === "safe" || body.executionMode === "owner" ? body.executionMode : "fast";
          const buildQuality: "basic" | "better" | "premium" | "full_game" =
            body.buildQuality === "basic" || body.buildQuality === "better" || body.buildQuality === "full_game"
              ? body.buildQuality
              : "premium";
          const proceduralGenerationOverride: boolean | undefined =
            typeof body.proceduralGeneration === "boolean" ? body.proceduralGeneration : undefined;
          const languageName = (body.languageName || "English").toString().slice(0, 60);
          const languageCode = (body.language || "en").toString().slice(0, 8);
          const { messages, projectId } = body;
          if (!Array.isArray(messages) || messages.length === 0) {
            return jsonError("No messages were sent — type something and try again.", 400, "missing_messages");
          }
          if (mode === "build" && (!projectId || typeof projectId !== "string")) {
            return jsonError("Open or create a project before using Build mode.", 400, "missing_project");
          }

          const lastUser = [...messages].reverse().find((m) => m.role === "user");
          const userText = lastUser?.parts.map((p) => (p.type === "text" ? p.text : "")).join("") ?? "";
          const imageGenerationRequested = mode === "chat" && wantsGeneratedImage(userText);

          const requestedId = body.modelId || DEFAULT_MODEL_ID;
          const requestedCandidate = findModel(requestedId);
          const activeModelId = isSelectable(requestedCandidate) ? requestedId : DEFAULT_MODEL_ID;
          const supabase = createClient(
            process.env.SUPABASE_URL!,
            process.env.SUPABASE_PUBLISHABLE_KEY!,
            { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false } },
          );

          const { data: userData } = await supabase.auth.getUser();
          if (!userData.user) return jsonError("Your session expired. Please sign in again.", 401, "expired");
          const userId = userData.user.id;

          // Rate limit AI prompt endpoint per user.
          try {
            const { enforce, RateLimitError } = await import("@/lib/rate-limit.server");
            await enforce(userId, "ai_prompt");
          } catch (e) {
            if (e && (e as any).name === "RateLimitError") {
              return jsonError((e as Error).message, 429, "rate_limited");
            }
            // Rate-limit table failure should never block a paying user; log and continue.
            console.warn("[chat] rate limit check failed", e);
          }



          if (executionMode === "owner") {
            try {
              const adminClient = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
                auth: { persistSession: false },
              });
              const { data: roles } = await adminClient
                .from("user_roles")
                .select("role")
                .eq("user_id", userId)
                .in("role", ["owner", "admin"]);
              const isOwner = (roles ?? []).some((r: any) => r.role === "owner" || r.role === "admin");
              if (!isOwner) executionMode = "fast";
            } catch {
              executionMode = "fast";
            }
          }

          // ── LIGHTWEIGHT CHAT MODE (no project) ──
          // Chat mode without an open project: plan/brainstorm only, no builds,
          // no project DB writes, no chat_messages persistence.
          if (mode === "chat" && !projectId) {
            if (imageGenerationRequested) {
              const kind = imageKindFromPrompt(userText);
              const prompt = userText.replace(/^\s*(?:generate|create|make|draw|design)\s+(?:me\s+)?(?:an?\s+)?(?:image|picture)\s+(?:of\s+)?/i, "").trim() || userText;
              const url = await generateGeneralImage({ prompt, kind, size: kind === "thumbnail" || kind === "banner" || kind === "promo" ? "1536x1024" : "1024x1024" });
              return streamAssistantImage("Made it — here’s your image.", url, "direct-image-lite");
            }
            if (userText && isClearProjectKeepBaseplateRequest(userText)) {
              return streamPlainAssistantText(
                "I can clear everything and keep only the Baseplate in Build Mode. Open/select a project, switch the composer to Build, and resend that exact request — I’ll queue the Studio cleanup action instead of giving manual steps.",
                "clear-needs-project",
              );
            }
            let modelChoiceLite;
            try {
              modelChoiceLite = getProviderModel(activeModelId);
            } catch (e) {
              return jsonError(e instanceof Error ? e.message : "Model unavailable", 500, "provider_init_failed");
            }
            const convertedLite = await convertToModelMessages(trimMessagesForModel(stripImageFilePartsFromMessages(messages), "chat"));
            const systemLite =
              FAST_CHAT_SYSTEM_PROMPT +
              `\n\nMODE: CHAT (no project open) — help the user plan, brainstorm, and refine ideas for their Roblox game. Do NOT emit build actions, file outputs, or plugin_actions. Keep replies conversational. Reply in ${languageName} (${languageCode}). If the user asks to delete, erase, clear, or modify their Roblox project, NEVER say BloxSmith only has Toolbox/search capability. Say BloxSmith can do that in Build Mode through the Studio plugin, and ask them to switch to Build Mode / open a project if needed. For requests like "erase everything but keep the Baseplate", answer with only that Build Mode instruction; do not provide manual deletion steps unless the user asks for manual steps.`;
            const liteResult = streamText({
              model: modelChoiceLite.model,
              system: systemLite,
              messages: convertedLite,
              ...(modelChoiceLite.extraBody ? { providerOptions: { nvidia: modelChoiceLite.extraBody as Record<string, never> } as never } : {}),
              ...(modelChoiceLite.modelSettings?.temperature !== undefined ? { temperature: modelChoiceLite.modelSettings.temperature } : {}),
              ...(modelChoiceLite.modelSettings?.topP !== undefined ? { topP: modelChoiceLite.modelSettings.topP } : {}),
              maxOutputTokens: capOutputTokens(modelChoiceLite.modelSettings, "chat"),
              stopWhen: stepCountIs(6),
              onError: ({ error }) => console.error("[chat/lite] upstream error", error),
            });
            try {
              return liteResult.toUIMessageStreamResponse({
                onError: (err) => {
                  console.error("[chat/lite] stream error", err);
                  if (err instanceof Error) {
                    if (/402|credit/i.test(err.message)) return "The selected AI model is unavailable right now. Try again in a moment.";
                    if (/429|rate/i.test(err.message)) return "AI is rate-limited right now. Wait a few seconds and try again.";
                    return `AI request failed: ${err.message}`;
                  }
                  return "AI request failed.";
                },
              });
            } catch (streamErr) {
              console.warn("[chat/lite] streaming failed, retrying without stream", streamErr);
              const fallback = await generateText({
                model: modelChoiceLite.model,
                system: systemLite,
                messages: convertedLite,
                ...(modelChoiceLite.extraBody ? { providerOptions: { nvidia: modelChoiceLite.extraBody as Record<string, never> } as never } : {}),
                ...(modelChoiceLite.modelSettings?.temperature !== undefined ? { temperature: modelChoiceLite.modelSettings.temperature } : {}),
                ...(modelChoiceLite.modelSettings?.topP !== undefined ? { topP: modelChoiceLite.modelSettings.topP } : {}),
                maxOutputTokens: capOutputTokens(modelChoiceLite.modelSettings, "chat"),
              });
              return streamPlainAssistantText(fallback.text || "Done.", "lite-fallback-text");
            }
          }


          const { data: project, error: projErr } = await supabase
            .from("projects")
            .select("id, user_id, name, description, game_type, build_count")
            .eq("id", projectId)
            .maybeSingle();
          if (projErr || !project) return jsonError("Project not found or you don't have access to it.", 404, "project_not_found");

          // Per-user asset preference (stored in profiles.settings.asset_mode).
          // Default to hybrid so BloxSmith always creates a visible result: use
          // safe Toolbox assets when available, then deterministic procedural
          // geometry/terrain when Toolbox has no usable match.
          let assetMode: "toolbox_only" | "both" | "procedural" = "both";
          let proceduralFallbackAllowed = true;
          try {
            const { data: prof } = await supabase
              .from("profiles")
              .select("settings")
              .eq("id", userId)
              .maybeSingle();
            const s = (prof?.settings && typeof prof.settings === "object" ? prof.settings : {}) as Record<string, unknown>;
            const m = s.asset_mode;
            if (m === "toolbox_only") assetMode = "toolbox_only";
            else if (m === "procedural") assetMode = "procedural";
            else assetMode = "both";
            proceduralFallbackAllowed = assetMode !== "toolbox_only" && s.disable_procedural_fallback !== true;
          } catch { /* ignore */ }

          // Per-request Procedural Generation toggle (from the composer) overrides
          // the stored profile default. ON  → allow procedural expansion/fallback.
          // OFF → strictly toolbox-only, one request = one result, no extras.
          if (proceduralGenerationOverride === true) {
            assetMode = "procedural";
            proceduralFallbackAllowed = true;
          } else if (proceduralGenerationOverride === false) {
            assetMode = "both";
            proceduralFallbackAllowed = true;
          }


          console.info("[chat] prompt received", {
            mode,
            projectId,
            userId,
            model: activeModelId,
            buildQuality,
            executionMode,
            promptLength: userText.length,
          });
          const imageParts = messages
            .flatMap((m) => (m.parts ?? []) as Array<Record<string, unknown>>)
            .filter((p): p is { type: "file"; mediaType: string; url: string } =>
              p?.type === "file" && typeof p.mediaType === "string" && (p.mediaType as string).startsWith("image/") && typeof p.url === "string",
            );
          const userImageUrl = imageParts.at(-1)?.url?.slice(0, 2_000_000) ?? null;
          if (userText) {
            await supabase.from("chat_messages").insert({
              project_id: projectId,
              user_id: userId,
              role: "user",
              content: userText,
              status: "done",
              image_url: userImageUrl,
            });
          }

          // ── INSTANT NVIDIA IMAGE FAST-PATH ────────────────────────────────
          // Image requests should not depend on the chat model deciding to call
          // a tool. Generate immediately through NVIDIA and stream the preview.
          if (mode === "chat" && projectId && userText && imageGenerationRequested) {
            const kind = imageKindFromPrompt(userText);
            const prompt = userText.replace(/^\s*(?:generate|create|make|draw|design)\s+(?:me\s+)?(?:an?\s+)?(?:image|picture)\s+(?:of\s+)?/i, "").trim() || userText;
            const url = await generateGeneralImage({ prompt, kind, size: kind === "thumbnail" || kind === "banner" || kind === "promo" ? "1536x1024" : "1024x1024" });
            const replyText = "Made it — here’s your image.";
            await supabase.from("chat_messages").insert({
              project_id: projectId,
              user_id: userId,
              role: "assistant",
              content: replyText,
              status: "done",
              model: "nvidia/flux.1-schnell",
              image_url: url,
            });
            return streamAssistantImage(replyText, url, "direct-image-project");
          }

          // ── INSTANT DESTRUCTIVE EDIT FAST-PATH ─────────────────────────
          // Clear / wipe requests must not depend on the LLM choosing the right
          // action block. If the user explicitly says to keep only Baseplate,
          // queue a deterministic Studio cleanup command immediately.
          if (projectId && userText && isClearProjectKeepBaseplateRequest(userText)) {
            const actions = clearProjectKeepBaseplateStudioActions(userText).map(normalizePluginAction).map((action: any) => ({
              ...action,
              payload: {
                ...(action.payload ?? {}),
                _bloxsmith: {
                  execution_mode: executionMode,
                  structured: true,
                  safe_mode_preview: executionMode === "safe",
                  owner_mode: executionMode === "owner",
                  no_empty_folders: true,
                  no_fake_assets: true,
                  retry_failed_insertions: true,
                  scan_inserted_scripts: true,
                },
              },
            }));
            const replyText = "Clearing the project and keeping only the Baseplate — executing in Studio now.";
            const { data: msgRow } = await supabase
              .from("chat_messages")
              .insert({
                project_id: projectId,
                user_id: userId,
                role: "assistant",
                content: replyText,
                status: "sending",
                model: activeModelId,
                actions,
              })
              .select("id")
              .single();
            await supabase.from("plugin_actions").insert(
              actions.map((action, i) => ({
                project_id: projectId,
                user_id: userId,
                message_id: msgRow?.id ?? null,
                kind: action.kind,
                parent_path: action.parent_path,
                name: action.name,
                payload: action.payload,
                position: i,
              })),
            );
            await supabase.from("build_history").insert({
              project_id: projectId,
              user_id: userId,
              prompt: userText,
              model: activeModelId,
              files_count: actions.length,
              plugin_status: "Queued",
              applied: false,
            });
            console.info("[chat/fastpath] queued clear project keep baseplate", { projectId, userId, actionCount: actions.length });
            return streamPlainAssistantText(replyText, "clear-text-1");
          }

          // ── INSTANT VISIBLE SNOW TERRAIN FAST-PATH ──────────────────────
          // Snow/terrain requests must always make visible geometry immediately,
          // even when Toolbox-only mode would otherwise search for a vague model.
          if (mode === "build" && projectId && userText && isSnowTerrainRequest(userText) && !imageGenerationRequested) {
            const actions = visibleSnowTerrainStudioActions(userText)
              .map(normalizePluginAction)
              .filter((action) => finalScriptIssues(action).length === 0)
              .map((action: any) => ({
                ...action,
                payload: {
                  ...(action.payload ?? {}),
                  _bloxsmith: {
                    execution_mode: "fast",
                    structured: true,
                    exact_scope: true,
                    visible_output_required: true,
                    terrain_fast_path: true,
                    no_empty_folders: true,
                    no_fake_assets: true,
                  },
                },
              }));
            if (actions.length > 0) {
              const replyText = "Sent visible snow terrain to Studio — it should build now and focus the camera on it.";
              const { data: msgRow } = await supabase
                .from("chat_messages")
                .insert({
                  project_id: projectId,
                  user_id: userId,
                  role: "assistant",
                  content: replyText,
                  status: "sending",
                  model: "deterministic-snow-terrain-fastpath",
                  actions,
                })
                .select("id")
                .single();
              await supabase.from("plugin_actions").insert(
                actions.map((action, i) => ({
                  project_id: projectId,
                  user_id: userId,
                  message_id: msgRow?.id ?? null,
                  kind: action.kind,
                  parent_path: action.parent_path,
                  name: action.name,
                  payload: action.payload,
                  position: i,
                })),
              );
              await supabase.from("build_history").insert({
                project_id: projectId,
                user_id: userId,
                prompt: userText,
                model: "deterministic-snow-terrain-fastpath",
                files_count: actions.length,
                plugin_status: "Queued",
                applied: false,
              });
              await supabase
                .from("projects")
                .update({ updated_at: new Date().toISOString() })
                .eq("id", projectId);
              console.info("[chat/fastpath] queued visible snow terrain instantly", { projectId, userId, actionCount: actions.length });
              return streamPlainAssistantText(replyText, "snow-terrain-fastpath-text");
            }
          }

          // ── INSTANT VISIBLE SURFACE MATERIAL FAST-PATH ──────────────────
          // Requests like "fill the ground with gravel" must visibly change the
          // current Studio place even if Toolbox search has no exact material kit.
          if (mode === "build" && projectId && userText && isSurfaceMaterialRequest(userText) && !imageGenerationRequested) {
            const actions = visibleSurfaceMaterialStudioActions(userText)
              .map(normalizePluginAction)
              .filter((action) => finalScriptIssues(action).length === 0)
              .map((action: any) => ({
                ...action,
                payload: {
                  ...(action.payload ?? {}),
                  _bloxsmith: {
                    execution_mode: "fast",
                    structured: true,
                    exact_scope: true,
                    visible_output_required: true,
                    surface_material_fast_path: true,
                    no_empty_folders: true,
                    no_fake_assets: true,
                  },
                },
              }));
            if (actions.length > 0) {
              const replyText = "Sent a visible ground-material build to Studio — it will apply the surface and focus the camera on it.";
              const { data: msgRow } = await supabase
                .from("chat_messages")
                .insert({
                  project_id: projectId,
                  user_id: userId,
                  role: "assistant",
                  content: replyText,
                  status: "sending",
                  model: "deterministic-surface-material-fastpath",
                  actions,
                })
                .select("id")
                .single();
              await supabase.from("plugin_actions").insert(
                actions.map((action, i) => ({
                  project_id: projectId,
                  user_id: userId,
                  message_id: msgRow?.id ?? null,
                  kind: action.kind,
                  parent_path: action.parent_path,
                  name: action.name,
                  payload: action.payload,
                  position: i,
                })),
              );
              await supabase.from("build_history").insert({
                project_id: projectId,
                user_id: userId,
                prompt: userText,
                model: "deterministic-surface-material-fastpath",
                files_count: actions.length,
                plugin_status: "Queued",
                applied: false,
              });
              await supabase
                .from("projects")
                .update({ updated_at: new Date().toISOString() })
                .eq("id", projectId);
              console.info("[chat/fastpath] queued visible surface material instantly", { projectId, userId, actionCount: actions.length });
              return streamPlainAssistantText(replyText, "surface-material-fastpath-text");
            }
          }

          // ── INSTANT NARROW FEATURE FAST-PATH ───────────────────────────
          // One small thing (a button, jump/speed/dash script, checkpoint,
          // door, kill brick, teleport, etc.) should not wait for a full model
          // planning pass. Deterministic templates queue immediately and let
          // the Studio plugin execute on its next poll.
          if (
            mode === "build" &&
            projectId &&
            userText &&
            isNarrowFeatureRequest(userText) &&
            !isSinglePhysicalAssetRequest(userText) &&
            !imageGenerationRequested
          ) {
            const generated = narrowFeatureFallbackStudioActions(userText, languageName)
              .map(normalizePluginAction)
              .filter((action) => finalScriptIssues(action).length === 0)
              .map((action: any) => ({
                ...action,
                payload: {
                  ...(action.payload ?? {}),
                  _bloxsmith: {
                    execution_mode: "fast",
                    structured: true,
                    exact_scope: true,
                    narrow_feature_fast_path: true,
                    no_empty_folders: true,
                    no_fake_assets: true,
                  },
                },
              }));
            if (generated.length > 0) {
              const firstKind = String(generated[0]?.kind ?? "action").replace(/_/g, " ");
              const replyText = generated.length === 1
                ? `Sent 1 ${firstKind} command to Studio — it should execute now.`
                : `Sent ${generated.length} Studio commands — they should execute now.`;
              const { data: msgRow } = await supabase
                .from("chat_messages")
                .insert({
                  project_id: projectId,
                  user_id: userId,
                  role: "assistant",
                  content: replyText,
                  status: "sending",
                  model: "deterministic-fastpath",
                  actions: generated,
                })
                .select("id")
                .single();
              await supabase.from("plugin_actions").insert(
                generated.map((action, i) => ({
                  project_id: projectId,
                  user_id: userId,
                  message_id: msgRow?.id ?? null,
                  kind: action.kind,
                  parent_path: action.parent_path,
                  name: action.name,
                  payload: action.payload,
                  position: i,
                })),
              );
              await supabase.from("build_history").insert({
                project_id: projectId,
                user_id: userId,
                prompt: userText,
                model: "deterministic-fastpath",
                files_count: generated.length,
                plugin_status: "Queued",
                applied: false,
              });
              await supabase
                .from("projects")
                .update({ updated_at: new Date().toISOString() })
                .eq("id", projectId);
              console.info("[chat/fastpath] queued narrow feature instantly", { projectId, userId, actionCount: generated.length });
              return streamPlainAssistantText(replyText, "narrow-fastpath-text");
            }
          }

          // ── INSTANT FAST BUILD TEMPLATE PATH ───────────────────────────
          // Fast Build means no planner/tool loop for common Studio asks. Queue a
          // deterministic, real Studio build immediately; Deep/Premium still use AI.
          if (
            mode === "build" &&
            buildQuality === "basic" &&
            projectId &&
            userText &&
            !imageGenerationRequested &&
            !userExplicitlyRequestedToolbox(userText) &&
            assetMode !== "toolbox_only" &&
            isInstantFastBuildTemplateRequest(userText)
          ) {
            const generated = (
              isBroadPlayableGameRequest(userText)
                ? broadPlayableGameStudioActions(userText, languageName)
                : proceduralEnvironmentStudioActions(userText, languageName)
            )
              .map(normalizePluginAction)
              .filter((action) => finalScriptIssues(action).length === 0)
              .map((action: any) => ({
                ...action,
                payload: {
                  ...(action.payload ?? {}),
                  _bloxsmith: {
                    execution_mode: "fast",
                    structured: true,
                    instant_fast_build: true,
                    no_empty_folders: true,
                    no_fake_assets: true,
                    retry_failed_insertions: true,
                    scan_inserted_scripts: true,
                  },
                },
              }));
            if (generated.length > 0) {
              const replyText = `Fast Build queued ${generated.length} Studio command${generated.length === 1 ? "" : "s"} instantly — executing now.`;
              const { data: msgRow } = await supabase
                .from("chat_messages")
                .insert({
                  project_id: projectId,
                  user_id: userId,
                  role: "assistant",
                  content: replyText,
                  status: "sending",
                  model: "deterministic-instant-fast-build",
                  actions: generated,
                })
                .select("id")
                .single();
              await supabase.from("plugin_actions").insert(
                generated.map((action, i) => ({
                  project_id: projectId,
                  user_id: userId,
                  message_id: msgRow?.id ?? null,
                  kind: action.kind,
                  parent_path: action.parent_path,
                  name: action.name,
                  payload: action.payload,
                  position: i,
                })),
              );
              await supabase.from("build_history").insert({
                project_id: projectId,
                user_id: userId,
                prompt: userText,
                model: "deterministic-instant-fast-build",
                files_count: generated.length,
                plugin_status: "Queued",
                applied: false,
              });
              await supabase
                .from("projects")
                .update({ updated_at: new Date().toISOString() })
                .eq("id", projectId);
              console.info("[chat/fastpath] queued instant Fast Build template", { projectId, userId, actionCount: generated.length });
              return streamPlainAssistantText(replyText, "instant-fast-build-text");
            }
          }

          // ── INSTANT TOOLBOX FAST-PATH ──
          // "add a house / insert a car / spawn a zombie / give me a tree from
          // toolbox" — skip the full AI turn entirely. Live-search Roblox
          // Toolbox for the requested thing, queue an insert_asset in the
          // plugin queue, persist the assistant message, and stream a short
          // confirmation. Cuts a ~5-15s AI+planning round trip down to <1s.
          if (
            mode === "build" &&
            projectId &&
            userText &&
            isSinglePhysicalAssetRequest(userText) &&
            assetMode !== "procedural"
          ) {
            try {
              const label = singlePhysicalAssetLabel(userText, "asset");
              const finderMatch = TOOLBOX_ASSET_FINDER_CATEGORIES.find((c) => c.test.test(userText));
              const query = finderMatch?.keyword || label;
              // Parse quantity: "add 5 trees", "insert 10 street lights", "give me three houses".
              const wordNums: Record<string, number> = { two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, twelve: 12, fifteen: 15, twenty: 20 };
              let quantity = 1;
              const numMatch = userText.match(/\b(\d{1,3})\s+(?=[a-z])/i);
              if (numMatch) {
                const n = parseInt(numMatch[1], 10);
                if (Number.isFinite(n) && n >= 2) quantity = Math.min(n, 25);
              } else {
                const wm = userText.toLowerCase().match(/\b(two|three|four|five|six|seven|eight|nine|ten|twelve|fifteen|twenty)\b/);
                if (wm && wordNums[wm[1]]) quantity = wordNums[wm[1]];
              }
                const found = await searchRobloxToolbox(query, "Model", quantity === 1 ? 4 : Math.max(8, quantity + 3), { singleAssetOnly: true });
              const top = found.results[0];
              if (top) {
                const folder = finderMatch?.folder ? `BloxSmith_${finderMatch.folder}` : "BloxSmith_Assets";
                const baseName = cleanSingleAssetActionName(label).replace(/_\d+$/, "");
                const buildAction = (idx: number) => ({
                  kind: "insert_asset" as const,
                  parent_path: `Workspace/${folder}`,
                  name: quantity > 1 ? `${baseName}_${String(idx + 1).padStart(2, "0")}` : cleanSingleAssetActionName(label),
                  payload: {
                    asset_id: top.id,
                    fallback_ids: (top.fallbackIds ?? found.results.slice(1, 8).map((r) => r.id)).slice(0, 6),
                    asset_name: top.name,
                    creator_name: top.creatorName,
                    source_query: query,
                    toolbox_only: true,
                    free_only: true,
                    no_scripts: true,
                    strip_scripts: true,
                    disable_procedural_fallback: true,
                    single_asset_only: true,
                    extract_single: true,
                    exact_quantity: 1,
                    max_children: 25,
                    max_scripts: 0,
                    reject_pack_names: true,
                    stop_after_insert: true,
                    ground_snap: true,
                    _bloxsmith: {
                      source: "chat_fastpath",
                      execution_mode: "fast",
                      single_asset_mode: true,
                      copy_index: idx,
                      copy_total: quantity,
                      grid_spacing: 12,
                    },
                  } as Record<string, unknown>,
                });
                const insertAction = buildAction(0);
                // searchRobloxToolbox already filters to insertable public
                // assets. Do not run a second validation pass here; that extra
                // network round-trip was why "one thing" felt slow before it
                // even reached Studio.
                const candidates: Array<Record<string, unknown>> = [insertAction as unknown as Record<string, unknown>];
                if (candidates.length === 0) {
                  console.info("[chat/fastpath] no authorized asset, falling back to AI turn", { query });
                  throw new Error("fastpath_no_authorized_asset");
                }
                const finalFirst = candidates[0] as ReturnType<typeof buildAction>;
                const finalAssetId = Number((finalFirst.payload as { asset_id?: number }).asset_id);
                const allInserts = quantity > 1
                  ? Array.from({ length: quantity }, (_, i) => {
                      if (i === 0) return finalFirst;
                      const next = buildAction(i);
                      // Reuse the sanitized primary id/fallbacks for every copy.
                      next.payload.asset_id = finalFirst.payload.asset_id;
                      next.payload.fallback_ids = finalFirst.payload.fallback_ids;
                      return next;
                    })
                  : [finalFirst];
                const replyText = quantity > 1
                  ? `Adding ${quantity} ${label}${label.endsWith("s") ? "" : "s"} to your workspace from the Toolbox — executing in Studio now.`
                  : `Adding a ${label} to your workspace from the Toolbox — executing in Studio now.`;
                const { data: msgRow } = await supabase
                  .from("chat_messages")
                  .insert({
                    project_id: projectId,
                    user_id: userId,
                    role: "assistant",
                    content: replyText,
                    status: "sending",
                    model: activeModelId,
                    actions: allInserts,
                  })
                  .select("id")
                  .single();
                await supabase.from("plugin_actions").insert(
                  allInserts.map((action, i) => ({
                    project_id: projectId,
                    user_id: userId,
                    message_id: msgRow?.id ?? null,
                    kind: action.kind,
                    parent_path: action.parent_path,
                    name: action.name,
                    payload: action.payload,
                    position: i,
                  })),
                );
                await supabase.from("build_history").insert({
                  project_id: projectId,
                  user_id: userId,
                  prompt: userText,
                  model: activeModelId,
                  files_count: allInserts.length,
                  plugin_status: "Queued",
                  applied: false,
                });
                console.info("[chat/fastpath] queued toolbox insert", {
                  projectId, userId, query, assetId: finalAssetId, quantity: allInserts.length,
                });
                const encoder = new TextEncoder();
                const words = replyText.split(" ");
                const stream = new ReadableStream({
                  async start(controller) {
                    controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "start" })}\n\n`));
                    controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "start-step" })}\n\n`));
                    const textId = "fp-text-1";
                    controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "text-start", id: textId })}\n\n`));
                    for (const w of words) {
                      controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "text-delta", id: textId, delta: `${w} ` })}\n\n`));
                    }
                    controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "text-end", id: textId })}\n\n`));
                    controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "finish-step" })}\n\n`));
                    controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "finish" })}\n\n`));
                    controller.enqueue(encoder.encode(`data: [DONE]\n\n`));
                    controller.close();
                  },
                });
                return new Response(stream, {
                  headers: {
                    "Content-Type": "text/event-stream",
                    "Cache-Control": "no-cache, no-transform",
                    "x-vercel-ai-ui-message-stream": "v1",
                  },
                });
              }
            } catch (e) {
              console.error("[chat/fastpath] toolbox fast-path failed, falling back to full AI turn", e);
            }
          }

          let modelChoice;
          try {
            modelChoice = getProviderModel(activeModelId);
          } catch (e) {
            return jsonError(e instanceof Error ? e.message : "Model unavailable", 500, "provider_init_failed");
          }

          // ── MEMORY + STUDIO CONTEXT (parallel with vision + UI concept) ──
          // Pull project metadata, recent builds, latest game scan, recent errors,
          // and existing queued actions so the AI knows what already exists and
          // doesn't rebuild or duplicate things across turns.
          // Vision + UI concept generation used to run sequentially AFTER the DB
          // fetch, blocking TTFB by up to 30s. Now they run concurrently and are
          // bounded by hard timeouts so slow upstreams can't stall the stream.
          const withTimeout = <T,>(p: Promise<T>, ms: number, label: string): Promise<T | null> =>
            Promise.race<T | null>([
              p.catch((e) => { console.warn(`[chat] ${label} failed`, e); return null; }),
              new Promise<null>((resolve) => setTimeout(() => { console.warn(`[chat] ${label} timed out after ${ms}ms`); resolve(null); }, ms)),
            ]);

          const uiConceptRequested = mode === "build" && imageGenerationRequested && /(\bgenerate ui\b|\bimage to roblox ui\b|\bimage-to-roblox ui\b|loading screen|main menu|play button|settings menu|shop ui|inventory ui|gamepass ui|quest ui|\bhud\b|health bar|xp bar|currency display|mobile controls)/i.test(userText);

          let contextBlock = "";
          let generatedUiConceptUrl: string | null = null;
          try {
            const [
              ctxResult,
              visionResult,
              uiConceptResult,
              intent,
            ] = await Promise.all([
              Promise.all([
                supabase.from("plugin_sessions").select("last_scan, last_scan_at, online").eq("user_id", userId).maybeSingle(),
                supabase.from("studio_errors").select("level, source, message, created_at").eq("user_id", userId).order("created_at", { ascending: false }).limit(buildQuality === "basic" ? 3 : 8),
                supabase.from("build_history").select("prompt, files_count, created_at").eq("project_id", projectId).order("created_at", { ascending: false }).limit(buildQuality === "basic" ? 2 : 5),
                supabase.from("plugin_actions").select("kind, name, parent_path, status").eq("project_id", projectId).order("created_at", { ascending: false }).limit(buildQuality === "basic" ? 8 : 20),
                // Pull a wider set so the semantic reranker can pick the most
                // relevant memories for THIS turn, not just the most important
                // overall. Reranker trims back down to top 10.
                supabase.from("project_memory").select("key, value, kind, importance").eq("project_id", projectId).order("importance", { ascending: false }).order("updated_at", { ascending: false }).limit(60),
              ]),
              imageParts.length > 0 && buildQuality !== "basic"
                ? withTimeout(describeImageWithNvidiaPaliGemma(imageParts), 2500, "NVIDIA PaliGemma vision")
                : Promise.resolve(null),
              uiConceptRequested && buildQuality !== "basic"
                ? withTimeout(generateUiConceptImage({ prompt: userText, style: "Premium Roblox UI" }), 8000, "UI concept image")
                : Promise.resolve(null),
              // Fast intent classifier — runs in parallel with the DB reads so
              // it costs zero extra latency. Fails open on error/timeout.
              userText ? withTimeout(classifyIntent(userText), 1600, "intent classifier").catch(() => null) : Promise.resolve(null),
            ]);
            const [{ data: session }, { data: recentErrors }, { data: recentBuilds }, { data: existingActions }, { data: memoriesRaw }] = ctxResult;
            const memories = rerankMemories(memoriesRaw ?? [], userText, buildQuality === "basic" ? 8 : 20);

            const parts: string[] = [];
            const intentBlock = renderIntentBlock(intent);
            if (intentBlock) parts.push(intentBlock);
            parts.push(
              `PROJECT MEMORY:\n- Name: ${project.name ?? "(unnamed)"}\n- Type: ${project.game_type ?? "(unspecified)"}\n- Description: ${project.description ?? "(none)"}\n- Total builds so far: ${project.build_count ?? 0}`,
            );
            if (memories && memories.length > 0) {
              // Split "operational" memory (last build + failures + keybinds) from
              // "lore/design" memory. Operational memory is imperative and gets
              // surfaced in full at the top so the model actually acts on it.
              const critical = memories.filter((m) => m.key === "last_build_failures");
              const opMems = memories.filter((m) => m.key === "last_build");
              const lore = memories.filter((m) => m.key !== "last_build" && m.key !== "last_build_failures");

              if (critical.length > 0) {
                const failText = String(critical[0].value).slice(0, 1400);
                parts.push(
                  `⚠️ PREVIOUS BUILD HAD FAILURES — YOU MUST ADDRESS THESE FIRST.\nBefore doing anything else this turn:\n1. Read the failure list below.\n2. In your first sentence, briefly acknowledge what failed (one line, plain English).\n3. Emit corrected actions that fix the failures — new run_lua / script / set_properties actions that patch the exact instance/path that failed. Do not silently rebuild the same broken thing.\n4. If the user's current request is unrelated, still fix the failures alongside the new work.\n\nFailures from last build:\n${failText}`,
                );
              }
              if (opMems.length > 0) {
                const opText = String(opMems[0].value).slice(0, 1200);
                parts.push(
                  `LAST BUILD STATE — the plugin has already applied these instances into the live Studio place. Modify them via set_properties / rename / move / delete or by editing script source. DO NOT recreate anything already listed. Keybinds already registered in this project are LOCKED — pick a different key for any new ability unless the user explicitly reuses one.\n\n${opText}`,
                );
              }
              if (lore.length > 0) {
                const memLines = lore
                  .map((m) => `• [${m.kind}] ${m.key}: ${String(m.value).slice(0, 220)}`)
                  .join("\n");
                parts.push(
                  `PROJECT LORE & DESIGN DECISIONS (persistent — never contradict these, build ON TOP of them):\n${memLines}`,
                );
              }
            }

            if (recentBuilds && recentBuilds.length > 0) {
              parts.push(
                `RECENT USER REQUESTS in this project (newest first) — do NOT redo these unless asked, build ON TOP of them:\n${recentBuilds.map((b) => `• ${new Date(b.created_at).toISOString().slice(0, 10)} (${b.files_count} actions): ${String(b.prompt).slice(0, 140)}`).join("\n")}`,
              );
            }
            if (existingActions && existingActions.length > 0) {
              const byKind = existingActions.reduce<Record<string, string[]>>((acc, a) => {
                const k = a.kind ?? "unknown";
                (acc[k] ||= []).push(`${a.parent_path}.${a.name}`);
                return acc;
              }, {});
              const summary = Object.entries(byKind)
                .map(([k, names]) => `  ${k}: ${names.slice(0, 12).join(", ")}${names.length > 12 ? ` (+${names.length - 12} more)` : ""}`)
                .join("\n");
              parts.push(
                `ALREADY-QUEUED/BUILT INSTANCES in this project (avoid duplicating — modify via set_properties / rename / delete instead):\n${summary}`,
              );
            }
            if (session?.last_scan) {
              const digest = summarizeSceneScan(session.last_scan);
              if (!digest.isEmpty) {
                parts.push(
                  `CURRENT STUDIO SCENE DIGEST (uploaded ${session.last_scan_at ?? "recently"}) — this is the real world model. Reference existing instances by their exact path, never duplicate them, and never reference instances that aren't listed here:\n${digest.text}`,
                );
              }
            }
            if (recentErrors && recentErrors.length > 0) {
              const errLines = recentErrors
                .map((e) => `[${e.level}] ${e.source}: ${e.message}`)
                .join("\n");
              parts.push(
                `RECENT ROBLOX STUDIO OUTPUT (newest first). If any of these were caused by your previous builds, emit corrected actions to fix them in this response:\n${errLines}`,
              );

              // Error-pattern-aware guidance: scan the recent Studio errors for
              // known failure modes and inject a targeted nudge so the model
              // stops repeating the same mistake. This makes the AI smarter
              // ACROSS TURNS instead of only reacting to the current prompt.
              const errText = recentErrors.map((e) => String(e.message ?? "")).join("\n").toLowerCase();
              const nudges: string[] = [];
              if (/attempt to (call|index) a nil value/.test(errText)) {
                nudges.push(
                  "• Nil-value calls detected in recent builds. Before emitting any script this turn: for EVERY game:GetService, ReplicatedStorage child, RemoteEvent, and cross-script reference, use :WaitForChild(name, 5) on the client and :WaitForChild(name) on the server. Never assume an instance exists — always fetch defensively.",
                );
              }
              if (/infinite yield.*waitforchild|waitforchild.*(timed out|infinite yield)/.test(errText)) {
                nudges.push(
                  "• Infinite yield on WaitForChild detected. Something you referenced was never actually created. This turn: audit every WaitForChild target and confirm the parent creation script runs BEFORE the consumer. If a RemoteEvent is missing, create it in the same run_lua action that fires it, not a separate one.",
                );
              }
              if (/is not a valid member|is not a valid child/.test(errText)) {
                nudges.push(
                  "• 'Not a valid member' errors detected. You referenced a property or child that doesn't exist on that class. This turn: verify every property name against the actual Roblox API for that instance type. Use FindFirstChild before indexing children whose existence isn't guaranteed.",
                );
              }
              if (/players\.playeradded.*local|userinputservice.*server|localplayer.*script/.test(errText)) {
                nudges.push(
                  "• Client/server script placement mismatch detected. LocalPlayer, UserInputService, and RenderStepped only work in LocalScripts under StarterPlayerScripts / StarterCharacterScripts / StarterGui / a Tool. Players.PlayerAdded and DataStoreService only work in server Scripts under ServerScriptService. Never mix them in one script.",
                );
              }
              if (/humanoid.*nil|character.*nil|humanoidrootpart.*nil/.test(errText)) {
                nudges.push(
                  "• Humanoid/Character nil errors detected. Character/Humanoid can be nil between respawns. This turn: use `local character = player.Character or player.CharacterAdded:Wait()` then `local humanoid = character:FindFirstChildOfClass(\"Humanoid\") or character:WaitForChild(\"Humanoid\", 5)`. Re-hook on CharacterAdded so respawn doesn't break the feature.",
                );
              }
              if (/attempt to call.*wait|task\.wait.*expected|deprecated/.test(errText)) {
                nudges.push(
                  "• Deprecated API errors detected. Use task.wait / task.spawn / task.delay / :Connect (capital C) only. Never emit bare wait(), spawn(), delay(), or :connect().",
                );
              }
              if (/httpservice|http requests are not enabled/.test(errText)) {
                nudges.push(
                  "• HttpService errors detected. Wrap HttpService calls in pcall and tell the user in one sentence to enable HTTP requests in Game Settings — don't ship code that crashes when HTTP is off.",
                );
              }
              if (/datastore.*(throttl|fail|forbidden)|cannot store|save.*fail/.test(errText)) {
                nudges.push(
                  "• DataStore errors detected. Wrap every :GetAsync / :SetAsync / :UpdateAsync in pcall with exponential retry (task.wait(2^i * 0.1)). Never save inside a tight loop — batch writes and always save on PlayerRemoving + BindToClose.",
                );
              }

              if (nudges.length > 0) {
                parts.push(
                  `🧠 ERROR-PATTERN-AWARE GUIDANCE (based on the errors above — the model has been failing these specific ways):\n${nudges.join("\n")}`,
                );
              }
            }

            if (buildQuality !== "basic") {
              parts.push(
                `MEMORY WRITE PROTOCOL (be PROACTIVE — this is how the AI remembers everything about the project across sessions).\n\nAppend ONE fenced block at the END of your reply whenever the user mentions ANY of the following for the first time OR changes a previous answer:\n• Game genre / sub-genre (e.g. "medieval RPG", "tower-defense tycoon")\n• Core gameplay mechanics ("combat is melee only", "players earn XP by mining")\n• Art / visual style ("stylized low-poly", "dark horror", "cartoon pastel")\n• Named characters / NPCs / bosses (name + role)\n• Currency name and how it's earned\n• World/lore rules ("night is always dangerous", "PvP disabled in town")\n• Folder / organization conventions ("all NPCs live under ServerStorage.NPCs")\n• Systems already decided ("uses ProfileService for saving", "mobile-first UI")\n• Design decisions the user explicitly makes ("no gambling mechanics", "keep it kid-friendly")\n• Progress milestones the user calls out ("shop system is done")\n\nFormat (JSON array, up to 10 items per turn):\n\`\`\`bloxsmith-memory\n[\n  { "key": "genre", "value": "medieval fantasy RPG", "kind": "lore", "importance": 9 },\n  { "key": "art_style", "value": "stylized low-poly, warm palette", "kind": "style", "importance": 8 },\n  { "key": "hero_name", "value": "Kael the wandering swordsman", "kind": "character", "importance": 8 },\n  { "key": "currency", "value": "Gold — earned from quests & monster drops", "kind": "system", "importance": 7 },\n  { "key": "npc_folder", "value": "ServerStorage/NPCs", "kind": "decision", "importance": 6 }\n]\n\`\`\`\nRules:\n• Allowed kinds: lore, rule, decision, character, system, style\n• Keys: short snake_case, ≤ 80 chars, stable (reuse same key to overwrite an updated fact)\n• Values: ≤ 280 chars, self-contained (no "see above")\n• importance 1–10 (8+ for genre / hero / core mechanics)\n• Skip the block entirely if the user said nothing memorable this turn — don't invent facts\n• Never contradict existing PROJECT LORE above; if the user overrides one, re-emit the SAME key with the new value.`,
              );
            }

            contextBlock = "\n\n---\nLIVE CONTEXT (auto-injected memory + Studio state):\n\n" + parts.join("\n\n---\n");

            if (visionResult) {
              contextBlock += `\n\n---\nNVIDIA PALIGEMMA VISION ANALYSIS:\n${visionResult}\nUse this as visual reference context only. Build with safe free Toolbox assets and clean Roblox systems; do not invent unsafe assets.`;
            }
            if (uiConceptResult) {
              generatedUiConceptUrl = uiConceptResult;
              contextBlock += `\n\n---\nAI IMAGE-TO-ROBLOX UI GENERATOR:\nA premium UI concept image has been generated and saved to this chat. Use it as the visual concept, then rebuild it as REAL Roblox UI: ScreenGui, Frames, Buttons, TextLabels, ImageLabels, UICorner, UIStroke, UIGradient, UIPadding, layouts, constraints, UIScale, LocalScripts, animations, remotes, and scan_project/autofix_project checks. Do not leave it as a flat image.`;
            }
          } catch (e) {
            console.warn("[chat] failed to load studio context", e);
          }

          // Strip inline image file parts before sending to the LLM. We already run
          // NVIDIA PaliGemma vision on the newest user image and inject a text summary
          // into contextBlock, so keeping raw base64 image data-URLs (up to 2MB each)
          // across every turn would balloon the prompt into the hundreds of thousands
          // of tokens and trigger `Provider returned error` (upstream 400: context too
          // large). Replace each image part with a short text marker so conversation
          // continuity is preserved without re-sending the pixels.
          const messagesForModel = trimMessagesForModel(stripImageFilePartsFromMessages(messages), mode);
          const convertedMessages = await convertToModelMessages(messagesForModel);


          const withExecutionMetadata = (action: any) => ({
            ...action,
            payload: {
              ...(action.payload ?? {}),
              _bloxsmith: {
                execution_mode: executionMode,
                structured: true,
                safe_mode_preview: executionMode === "safe",
                owner_mode: executionMode === "owner",
                no_empty_folders: true,
                no_fake_assets: true,
                retry_failed_insertions: true,
                scan_inserted_scripts: true,
              },
            },
          });

          const persistFinish = (usedModelId: string, fallbackNotice: string | null) =>
            async ({ text }: { text: string }): Promise<string> => {
              const finalText = fallbackNotice ? `${fallbackNotice}\n\n${text}` : text;
              try {
                const explicitToolboxRequest = userExplicitlyRequestedToolbox(userText);
                const proceduralModeActive = assetMode === "procedural" && !explicitToolboxRequest && !isRobloxSystemRequest(userText);
                const parsed = parseActions(finalText);
                // In chat mode, hard-strip any actions block the model accidentally emitted
                // so it never gets shown to the user or queued for Studio.
                let cleanContent = neutralizePrematureBuildSuccess(parsed.cleanContent);
                let actions = mode === "chat" ? [] : parsed.actions.map(normalizePluginAction);

                if (mode === "build" && proceduralModeActive) {
                  actions = actions.filter((a) => a.kind !== "insert_asset");
                }

                if (mode === "build" && actions.length === 0) {
                  // Fast Build must not run a second AI request after the main
                  // generation. If the selected model forgot the action block,
                  // jump straight to deterministic Studio recovery/templates so
                  // the plugin gets work immediately.
                  if (buildQuality !== "basic") {
                  try {
                    const compiled = await compileMissingStudioActions({
                      userText,
                      assistantText: finalText,
                      languageName,
                      assetMode,
                    });
                    actions = compiled.map(normalizePluginAction);
                    if (proceduralModeActive) {
                      actions = actions.filter((a) => a.kind !== "insert_asset");
                    }
                    if (actions.length > 0) {
                      cleanContent = `${cleanContent.trim()}\n\n_Auto-compiled executable Roblox Studio actions because the selected model returned a plan without an action block._`;
                    }
                  } catch (compileErr) {
                    console.warn("[chat] action compiler failed; using recovery Studio actions", compileErr);
                  }
                  }


                  if (actions.length === 0 && proceduralFallbackAllowed) {
                    actions = (isRobloxSystemRequest(userText)
                      ? recoveryStudioActions(userText)
                      : proceduralEnvironmentStudioActions(userText, languageName)
                    ).map(normalizePluginAction);
                    cleanContent = isRobloxSystemRequest(userText)
                      ? `${cleanContent.trim()}\n\n_Auto-execute recovery sent a safe starter build because the selected model did not produce valid Studio actions._`
                      : `${cleanContent.trim()}\n\n_Visible fallback sent: no safe Toolbox result was available, so BloxSmith is building original Studio geometry/terrain for this request instead of skipping it._`;
                  } else if (actions.length === 0) {
                    cleanContent = `${cleanContent.trim()}\n\n_No safe structured Studio action was produced. Procedural fallback is disabled, so BloxSmith did not create placeholder blocks._`;
                  }
                }

                if (mode === "build" && proceduralModeActive) {
                  const proceduralActions = proceduralEnvironmentStudioActions(userText, languageName).map(normalizePluginAction);
                  const existingProcedural = actions.some((a) => a.name === "BloxSmith_Generate_Procedural_Assets");
                  actions = [
                    ...actions.filter((a) => a.kind !== "insert_asset" && ![
                      "BloxSmith_Generate_Procedural_Assets",
                      "BloxSmith_Organize_Procedural_Assets",
                      "BloxSmith_Scan_Procedural_Assets",
                    ].includes(a.name)),
                    ...(existingProcedural ? [] : proceduralActions),
                  ];
                  if (!/Procedural Generation (queued|sent)/i.test(cleanContent)) {
                    cleanContent = `${cleanContent.trim()}\n\n_Procedural Generation sent: original terrain, foliage, buildings/props/NPCs/roads/water requested in your prompt will be created directly in Studio. Toolbox is bypassed unless you explicitly ask for it._`;
                  }
                }

                if (mode === "build" && proceduralFallbackAllowed && isGrassRequest(userText)) {
                  actions = [
                    ...visibleGrassStudioActions(userText).map(normalizePluginAction),
                    ...actions.filter((a) => a.name !== "BloxSmith_Apply_Visible_Grass"),
                  ];
                  if (!/visible grass/i.test(cleanContent)) {
                    cleanContent = `${cleanContent.trim()}\n\n_Visible grass enforcement sent: large flat ground parts are recolored to Grass material, a grass surface is created, and Terrain grass decoration is enabled._`;
                  }
                }

                if (mode === "build" && !proceduralModeActive && toolboxAssetFinderRequests(userText).length > 0) {
                  const finderActions = (await toolboxAssetFinderStudioActions(userText)).map(normalizePluginAction);
                  if (finderActions.length > 0) {
                    actions = [
                      ...finderActions,
                      ...actions.filter((a) => {
                        if (["part", "model", "terrain"].includes(a.kind)) return false;
                        if (a.kind === "insert_asset") return false;
                        if ([
                          "BloxSmith_Intent_Visibility_Guard",
                          "BloxSmith_AutoExecute_Recovery",
                          "BloxSmith_Apply_Visible_Grass",
                          "BloxSmith_Arrange_Toolbox_Asset_Finder",
                          "BloxSmith_Scan_Toolbox_Asset_Finder",
                        ].includes(a.name)) return false;
                        return true;
                      }),
                    ];
                    if (!/Toolbox Asset Finder/i.test(cleanContent)) {
                      cleanContent = `${cleanContent.trim()}\n\n_Toolbox Asset Finder sent: BloxSmith searched safe free public Creator Store assets, will insert the best real matching asset(s), disable imported scripts, ground-snap/organize them, and report the asset name and ID._`;
                    }
                  } else if (assetMode === "toolbox_only") {
                    actions = actions.filter((a) => !["part", "model", "terrain", "insert_asset", "run_lua"].includes(a.kind));
                    cleanContent = `${cleanContent.trim()}\n\n_No safe free Toolbox asset was found for this request. Toolbox-only mode is enabled, so BloxSmith did not create fake placeholder blocks._`;
                  }
                }

                if (mode === "build" && !proceduralModeActive && isToolboxMapRequest(userText)) {
                  const toolboxActions = (await toolboxMapStudioActions(userText)).map(normalizePluginAction);
                  if (toolboxActions.length > 0) {
                    const allowedToolboxMapAction = (a: any) => {
                      if (["part", "model", "terrain"].includes(a.kind)) return false;
                      if (a.kind === "run_lua") {
                        return /^BloxSmith_(Remove_Procedural_Map_Fallbacks|Arrange_Real_Toolbox_Map)$/i.test(String(a.name || ""));
                      }
                      if (a.kind === "insert_asset") {
                        return String(a.payload?.folder_name || "").includes("BloxSmith_ToolboxAssets");
                      }
                      return !["insert_asset"].includes(a.kind);
                    };
                    actions = [
                      ...toolboxActions,
                      ...actions.filter((a) => {
                        const folderName = String(a.payload?.folder_name ?? "");
                        return !folderName.includes("BloxSmith_Toolbox_Map_Assets") &&
                          !folderName.includes("BloxSmith_ToolboxAssets") &&
                          allowedToolboxMapAction(a);
                      }),
                    ];
                    if (!/toolbox map assets/i.test(cleanContent)) {
                      cleanContent = `${cleanContent.trim()}\n\n_Toolbox-only map build sent: BloxSmith searched safe free Creator Store assets, disabled procedural fallback, inserted real matching assets, and will organize/ground-snap them into districts._`;
                    }
                  } else if (assetMode === "toolbox_only") {
                    actions = actions.filter((a) => !["part", "model", "terrain", "insert_asset", "run_lua"].includes(a.kind));
                    cleanContent = `${cleanContent.trim()}\n\n_No safe free Toolbox map assets were found for this request. Toolbox-only mode is enabled, so BloxSmith did not create procedural placeholder geometry._`;
                  }
                }

                if (mode === "build" && isBroadPlayableGameRequest(userText)) {
                  const playableActions = broadPlayableGameStudioActions(userText, languageName).map(normalizePluginAction);
                  if (playableActions.length > 0) {
                    actions = [
                      ...actions.filter((a) => ![
                        "BloxSmith_AutoExecute_Recovery",
                        "BloxSmith_Build_Playable_Game_Framework",
                        "BloxSmith_Organize_Playable_Game",
                        "BloxSmith_Autofix_Playable_Game",
                        "BloxSmith_Scan_Playable_Game",
                      ].includes(a.name)),
                      ...playableActions,
                    ];
                    if (!/playable game framework/i.test(cleanContent)) {
                      cleanContent = `${cleanContent.trim()}\n\n_Playable game framework sent: BloxSmith added the map/play area, spawns, checkpoints/objectives, HUD, leaderstats, save path, server validation, rewards, polish, and scan/autofix for this prompt._`;
                    }
                  }
                }

                if (mode === "build" && shouldUseGenericRobloxSystemGuard(userText, buildQuality)) {
                  const systemActions = (
                    isNarrowFeatureRequest(userText)
                      ? simpleRobloxSystemStudioActions(userText, languageName)
                      : robloxSystemStudioActions(userText, languageName)
                  ).map(normalizePluginAction);
                  if (systemActions.length > 0) {
                    actions = [
                      ...actions.filter((a) => ![
                        "BloxSmith_Build_UI_And_Systems",
                        "BloxSmith_Scan_UI_And_Systems",
                        "BloxSmith_Build_Single_UI_Or_Script",
                        "BloxSmith_Scan_Single_UI_Or_Script",
                      ].includes(a.name)),
                      ...systemActions,
                    ];
                    if (!/UI and systems guard/i.test(cleanContent)) {
                      cleanContent = `${cleanContent.trim()}\n\n_UI and systems guard sent: BloxSmith will create real StarterGui screens, LocalScript wiring, RemoteEvents, leaderstats, and a server script in Roblox Studio._`;
                    }
                  }
                }

                if (mode === "build" && !isNarrowFeatureRequest(userText)) {
                  const templateActions = productionSystemsStudioActions(userText).map(normalizePluginAction);
                  if (templateActions.length > 0) {
                    const templateNames = detectLuaTemplates(userText).map((t) => t.name).join(", ") || "core";
                    actions = [
                      ...actions.filter((a) => ![
                        "BloxSmith_Install_Production_Systems",
                        "BloxSmith_Scan_Production_Systems",
                      ].includes(a.name)),
                      ...templateActions,
                    ];
                    if (!/Production Lua templates/i.test(cleanContent)) {
                      cleanContent = `${cleanContent.trim()}\n\n_Production Lua templates sent (${templateNames}): full ModuleScripts installed under ServerScriptService.BloxSmith_Systems with a bootstrap Script — session-locked DataStore, atomic Economy + leaderstats, stack Inventory + RemoteEvent, server-authoritative Combat with cooldown/range validation, Quests with rewards, Pets with follow controller. Dependencies auto-included._`;
                    }
                  }
                }

                if (mode === "build" && proceduralFallbackAllowed && !proceduralModeActive && !isSimpleSingleThingRequest(userText) && buildQuality === "full_game") {
                  const guardActions = intentVisibilityStudioActions(userText).map(normalizePluginAction);
                  if (guardActions.length > 0) {
                    actions = [
                      ...actions.filter((a) => a.name !== "BloxSmith_Intent_Visibility_Guard"),
                      ...guardActions,
                    ];
                    if (!/visibility guard/i.test(cleanContent)) {
                      cleanContent = `${cleanContent.trim()}\n\n_Visibility guard sent: BloxSmith will verify the request leaves an obvious Studio result for common build intents._`;
                    }
                  }
                } else if (mode === "build" && !proceduralFallbackAllowed && !/procedural fallback disabled/i.test(cleanContent)) {
                  cleanContent = `${cleanContent.trim()}\n\n_Procedural fallback disabled: BloxSmith will not create fake block assets when Toolbox-only mode is active._`;
                }

                if (mode === "build" && !proceduralModeActive && isSinglePhysicalAssetRequest(userText)) {
                  const label = singlePhysicalAssetLabel(userText);
                  const cleanName = cleanSingleAssetActionName(label);
                  const trustedSingleActions = (await toolboxAssetFinderStudioActions(userText)).map(normalizePluginAction);
                  const firstInsert = trustedSingleActions.find((a) => a.kind === "insert_asset");
                  actions = firstInsert
                    ? [{
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
                          extract_single: true,
                          exact_quantity: 1,
                          max_children: 25,
                          max_scripts: 0,
                          reject_pack_names: true,
                          stop_after_insert: true,
                          ground_snap: true,
                          anchor: true,
                          requested_asset_type: label,
                          clean_name: cleanName,
                        },
                      }]
                    : [];
                  cleanContent = actions.length > 0
                    ? `${cleanContent.trim()}\n\n_Single asset scope: sending exactly one safe free Toolbox ${label} model only — no packs, scripts, props, decorations, terrain, UI, scans, or extra actions._`
                    : `${cleanContent.trim()}\n\n_No clean free authorized single ${label} model was found, so BloxSmith did not insert a pack or placeholder._`;
                } else if (mode === "build" && isNarrowFeatureRequest(userText)) {
                  const requestedRemote = /\b(remote\s*event|remoteevent|remote\s*function|remotefunction|server\s*event|server[-\s]*authoritative|multiplayer|replicated)\b/i.test(userText) || needsGameplayRemoteWiring(userText);
                  const requestedModule = /\b(module\s*script|modulescript|module)\b/i.test(userText);
                  const requestedScan = /\b(scan|autofix|organize|verify|test)\b/i.test(userText);
                  const requestedData = /\b(leaderstats?|data\s*store|datastore|save\s*data|currency|coins?|cash)\b/i.test(userText);
                  let keptInsertAsset = false;
                  actions = actions.filter((a) => {
                    const source = String(a.payload?.source ?? "");
                    if ([
                      "BloxSmith_Intent_Visibility_Guard",
                      "BloxSmith_AutoExecute_Recovery",
                      "BloxSmith_Build_UI_And_Systems",
                      "BloxSmith_Scan_UI_And_Systems",
                      "BloxSmith_Build_Single_UI_Or_Script",
                      "BloxSmith_Scan_Single_UI_Or_Script",
                      "BloxSmith_Install_Production_Systems",
                      "BloxSmith_Scan_Production_Systems",
                    ].includes(a.name)) return false;
                    if (actionLooksLikeUnrequestedUiShell(a, userText)) return false;
                    if (!requestedScan && ["organize_project", "autofix_project", "scan_project"].includes(a.kind)) return false;
                    if (!requestedRemote && ["remoteevent", "remotefunction", "bindableevent"].includes(a.kind)) return false;
                    if (!requestedModule && a.kind === "modulescript") return false;
                    if (!requestedRemote && /Instance\.new\("Remote(Event|Function)"\)/i.test(source)) return false;
                    if (!requestedModule && /Instance\.new\("ModuleScript"\)/i.test(source)) return false;
                    if (!requestedData && /\b(leaderstats|DataStoreService|GetDataStore|OrderedDataStore|MemoryStoreService)\b/i.test(source)) return false;
                    if (a.kind === "insert_asset") {
                      if (keptInsertAsset) return false;
                      keptInsertAsset = true;
                    }
                    return true;
                  });
                  const hasWorkingNarrowAction = actions.some((a: any) => {
                    if (["script", "localscript", "modulescript", "run_lua"].includes(a.kind)) return hasRealLuauSource(a);
                    if (["screengui", "gui", "frame", "textlabel", "textbutton", "imagelabel", "tool", "part", "model", "terrain", "insert_asset", "remoteevent", "remotefunction", "bindableevent", "sound", "leaderstats", "set_properties", "rename", "move", "delete"].includes(a.kind)) return true;
                    return false;
                  });
                  const shouldUseDeterministicAbilityTemplate = /\b(high\s*jump|super\s*jump|jump\s*boost|jump\s*button|space\s*bar.*jump|jump.*space\s*bar|jump\s*(script|keybind|key\s*bind|button)|(?:script|keybind|key\s*bind|button).*jump)\b/i.test(userText);
                  if (!hasWorkingNarrowAction || shouldUseDeterministicAbilityTemplate) {
                    const fallback = narrowFeatureFallbackStudioActions(userText, languageName).map(normalizePluginAction);
                    if (fallback.length > 0) {
                      actions = fallback;
                      cleanContent = `${cleanContent.trim()}\n\n_Narrow feature fallback sent: BloxSmith wrote the missing Luau directly instead of sending an empty/no-op script._`;
                    }
                  }
                  if (!/single item scope/i.test(cleanContent)) {
                    cleanContent = `${cleanContent.trim()}\n\n_Single item scope: BloxSmith will only create the requested item, not a bundle of extra objects._`;
                  }
                }

                // ── Strict Toolbox-Only enforcement ───────────────────────────────
                // When Procedural Generation is OFF, users expect Toolbox assets — never
                // procedural blocks/terrain. Strip any procedural-shaped actions and, if
                // no insert_asset remains, force a Toolbox search on the cleaned prompt.
                if (mode === "build" && !proceduralFallbackAllowed && !proceduralModeActive && !isRobloxSystemRequest(userText) && !isDestructiveEditRequest(userText)) {
                  const isProceduralRunLua = (a: any) => {
                    if (a.kind !== "run_lua") return false;
                    const name = String(a.name || "");
                    // Whitelist known non-visual system installers.
                    if (/^BloxSmith_(Install_Production_Systems|Build_UI_And_Systems|Build_Single_UI_Or_Script|AutoExecute_Recovery|Scan_)/i.test(name)) return false;
                    const src = String(a.payload?.source ?? "");
                    // Anything that spawns Parts/Terrain/Models is procedural — strip it.
                    return /Instance\.new\("(Part|MeshPart|WedgePart|Model|SpawnLocation)"\)|Terrain:(Fill|Set)/i.test(src);
                  };
                  const before = actions.length;
                  actions = actions.filter((a) => {
                    if (["part", "model", "terrain"].includes(a.kind)) return false;
                    if (isProceduralRunLua(a)) return false;
                    return true;
                  });
                  const stripped = before - actions.length;

                  const hasInsert = actions.some((a) => a.kind === "insert_asset");
                  if (!hasInsert) {
                    try {
                      const rescue = (await toolboxAssetFinderStudioActions(userText)).map(normalizePluginAction);
                      if (rescue.length > 0) {
                        actions = [...rescue, ...actions];
                      }
                    } catch (e) {
                      console.warn("[chat] toolbox-only rescue search failed", e);
                    }
                  }

                  if (stripped > 0 && !/procedural output stripped/i.test(cleanContent)) {
                    cleanContent = `${cleanContent.trim()}\n\n_Procedural output stripped (${stripped} action${stripped === 1 ? "" : "s"}): Procedural Generation is OFF, so BloxSmith removed placeholder parts/terrain and routed the request to safe free public Roblox Toolbox models instead._`;
                  }
                  if (!hasInsert && !actions.some((a) => a.kind === "insert_asset") && !/no safe toolbox model/i.test(cleanContent)) {
                    cleanContent = `${cleanContent.trim()}\n\n_No safe free Toolbox model was found for this request. Procedural Generation is OFF, so BloxSmith did not fall back to placeholder blocks — flip the 🌍 toggle ON to allow procedural creation, or rephrase._`;
                  }
                }



                // Persist any bloxsmith-memory block the AI emitted, then strip it
                // from the visible message so the user never sees the raw JSON.
                try {
                  const memMatch = cleanContent.match(/```bloxsmith-memory\s*([\s\S]*?)```/i);
                  if (memMatch) {
                    cleanContent = cleanContent.replace(memMatch[0], "").trim();
                    const parsedMem = JSON.parse(memMatch[1].trim());
                    const items = Array.isArray(parsedMem) ? parsedMem : [parsedMem];
                    const rows = items
                      .filter((m: any) => m && typeof m.key === "string" && typeof m.value === "string")
                      .slice(0, 10)
                      .map((m: any) => ({
                        project_id: projectId,
                        user_id: userId,
                        key: String(m.key).slice(0, 80),
                        value: String(m.value).slice(0, 2000),
                        kind: ["lore", "rule", "decision", "character", "system", "style"].includes(m.kind) ? m.kind : "lore",
                        importance: Math.max(1, Math.min(10, Number(m.importance) || 5)),
                        updated_at: new Date().toISOString(),
                      }));
                    if (rows.length > 0) {
                      await supabase
                        .from("project_memory")
                        .upsert(rows, { onConflict: "project_id,key" });
                    }
                  }
                } catch (memErr) {
                  console.warn("[chat] memory parse failed", memErr);
                }

                // ── Final no-creation rescue ──────────────────────────────────
                // If build mode ended up with only cleanup/no-op actions (organize,
                // scan, rename) after all the mode filters, force a Toolbox rescue so
                // the user actually sees the thing they asked for. This prevents the
                // "Build verified · done 3/3" pill from lying when every real create
                // step got stripped upstream.
                if (mode === "build" && !isNarrowFeatureRequest(userText)) {
                  const CREATE_KINDS = new Set([
                    "insert_asset","part","model","terrain",
                    "screengui","gui","frame","textlabel","textbutton","imagelabel","tool",
                    "script","localscript","modulescript",
                    "remoteevent","remotefunction","bindableevent",
                    "sound","team","leaderstats",
                  ]);
                  const CREATING_RUN_LUA = /Instance\.new\("(Part|MeshPart|WedgePart|Model|SpawnLocation|Folder|Sound)"\)|InsertService|:LoadAsset|Terrain:(Fill|Set)|BloxSmith_Generate_Procedural_Assets/i;
                  const DESTRUCTIVE_RUN_LUA = /:Destroy\(|:ClearAllChildren\(|Terrain:Clear\(|BloxSmith_Clear_Project_Keep_Baseplate/i;
                  const hasCreation = actions.some((a: any) => {
                    if (CREATE_KINDS.has(a.kind) || ["delete", "set_properties", "rename", "move"].includes(a.kind)) return true;
                    if (a.kind === "run_lua") {
                      const src = String(a.payload?.source ?? "");
                      if (CREATING_RUN_LUA.test(src)) return true;
                      if (DESTRUCTIVE_RUN_LUA.test(src)) return true;
                      if (/^BloxSmith_Generate_Procedural_Assets$/i.test(String(a.name || ""))) return true;
                    }
                    return false;
                  });
                  if (!hasCreation) {
                    try {
                      const rescue = (await toolboxAssetFinderStudioActions(userText)).map(normalizePluginAction);
                      if (rescue.length > 0) {
                        actions = [...rescue, ...actions];
                        cleanContent = `${cleanContent.trim()}\n\n_Rescue: the plan only contained cleanup actions and would not have created anything visible, so BloxSmith sent a safe free Toolbox asset for your request instead._`;
                        console.warn("[chat] no-creation rescue triggered", { projectId, userId, model: usedModelId });
                      } else if (proceduralFallbackAllowed) {
                        const proc = proceduralEnvironmentStudioActions(userText, languageName).map(normalizePluginAction);
                        if (proc.length > 0) {
                          actions = [...proc, ...actions];
                          cleanContent = `${cleanContent.trim()}\n\n_Rescue: no Toolbox match found, so BloxSmith sent a procedural build so your request is not silently skipped._`;
                        }
                      }
                    } catch (rescueErr) {
                      console.warn("[chat] no-creation rescue failed", rescueErr);
                    }
                  }
                }

                // Self-critique repair pass. When the local Luau validator
                // reports ERROR-severity issues that the deterministic autofix
                // in plugin-actions.ts could not resolve, send that one script
                // to NVIDIA meta/llama-3.3-70b-instruct with the error list and
                // swap in the repaired source. Runs in parallel across flagged
                // actions with a hard cap so cost stays bounded on bad turns.
                const REPAIR_CAP = 4;
                const repairable = (actions as any[]).filter((a) =>
                  a?.payload?._needs_retry &&
                  typeof a?.payload?.source === "string" &&
                  ["script", "localscript", "modulescript", "run_lua"].includes(String(a?.kind))
                ).slice(0, REPAIR_CAP);

                if (repairable.length > 0) {
                  try {
                    const { repairLuauWithNvidia } = await import("@/lib/nvidia-critique.server");
                    const repairs = await Promise.allSettled(repairable.map((a: any) =>
                      repairLuauWithNvidia({
                        source: String(a.payload.source),
                        issues: a.payload._luau_issues || [],
                        actionName: a?.name,
                        actionKind: a?.kind,
                        parentPath: a?.parent_path,
                        userRequest: userText,
                      })
                    ));
                    let repairedCount = 0;
                    repairs.forEach((r, i) => {
                      if (r.status === "fulfilled" && r.value) {
                        // Re-run autofix + validator on the repaired source by
                        // reassigning through normalizePluginAction so the
                        // xpcall wrapper and deprecated-API pass stay intact.
                        repairable[i].payload.source = r.value;
                        const renorm = normalizePluginAction({
                          kind: repairable[i].kind,
                          name: repairable[i].name,
                          parent_path: repairable[i].parent_path,
                          payload: { ...repairable[i].payload, _needs_retry: undefined, _luau_issues: undefined, source: r.value },
                        });
                        repairable[i].payload = renorm.payload;
                        repairedCount += 1;
                      }
                    });
                    if (repairedCount > 0) {
                      console.info("[chat] nvidia self-critique repaired", { repaired: repairedCount, of: repairable.length });
                    }
                  } catch (repairErr) {
                    console.warn("[chat] nvidia self-critique failed", repairErr);
                  }
                }

                // Final script gate: Studio must never receive an empty or
                // invalid script source. Try one NVIDIA generation retry for
                // every remaining script error (including totally empty source),
                // then block only the still-invalid scripts with a visible note.
                let blockedScriptMessages: string[] = [];
                let invalidScripts = (actions as any[])
                  .map((action) => ({ action, issues: finalScriptIssues(action) }))
                  .filter((x) => x.issues.length > 0);

                if (invalidScripts.length > 0) {
                  try {
                    const { generateLuauReplacementWithNvidia } = await import("@/lib/nvidia-critique.server");
                    const regenTargets = invalidScripts.slice(0, REPAIR_CAP);
                    const regenerations = await Promise.allSettled(regenTargets.map(({ action, issues }) =>
                      generateLuauReplacementWithNvidia({
                        issues,
                        actionName: action?.name,
                        actionKind: action?.kind,
                        parentPath: action?.parent_path,
                        userRequest: userText,
                      })
                    ));
                    let regeneratedCount = 0;
                    regenerations.forEach((r, i) => {
                      if (r.status === "fulfilled" && r.value) {
                        const target = regenTargets[i].action;
                        const renorm = normalizePluginAction({
                          kind: target.kind,
                          name: target.name,
                          parent_path: target.parent_path,
                          payload: { ...(target.payload ?? {}), _needs_retry: undefined, _luau_issues: undefined, source: r.value },
                        });
                        target.payload = renorm.payload;
                        regeneratedCount += 1;
                      }
                    });
                    if (regeneratedCount > 0) {
                      console.info("[chat] nvidia regenerated invalid/empty scripts", { regenerated: regeneratedCount, of: regenTargets.length });
                    }
                  } catch (regenErr) {
                    console.warn("[chat] nvidia script regeneration failed", regenErr);
                  }

                  invalidScripts = (actions as any[])
                    .map((action) => ({ action, issues: finalScriptIssues(action) }))
                    .filter((x) => x.issues.length > 0);

                  // Second autofix pass — targeted regeneration with the
                  // exact validator messages from the FIRST retry attached,
                  // so NVIDIA gets a clearer signal than the initial generic
                  // "empty or invalid" nudge. Runs only for scripts still
                  // failing after pass #1, and stays bounded by REPAIR_CAP.
                  if (invalidScripts.length > 0) {
                    try {
                      const { generateLuauReplacementWithNvidia } = await import("@/lib/nvidia-critique.server");
                      const retry2Targets = invalidScripts.slice(0, REPAIR_CAP);
                      const retry2 = await Promise.allSettled(retry2Targets.map(({ action, issues }) =>
                        generateLuauReplacementWithNvidia({
                          issues,
                          actionName: action?.name,
                          actionKind: action?.kind,
                          parentPath: action?.parent_path,
                          userRequest: `${userText}\n\n(Second regeneration pass — the previous attempt still failed validation with the errors listed above. Return complete, executable Luau that satisfies every error.)`,
                        })
                      ));
                      let repaired2 = 0;
                      retry2.forEach((r, i) => {
                        if (r.status === "fulfilled" && r.value) {
                          const target = retry2Targets[i].action;
                          const renorm = normalizePluginAction({
                            kind: target.kind,
                            name: target.name,
                            parent_path: target.parent_path,
                            payload: { ...(target.payload ?? {}), _needs_retry: undefined, _luau_issues: undefined, source: r.value },
                          });
                          target.payload = renorm.payload;
                          repaired2 += 1;
                        }
                      });
                      if (repaired2 > 0) {
                        console.info("[chat] nvidia second-pass regeneration succeeded", { repaired: repaired2, of: retry2Targets.length });
                        invalidScripts = (actions as any[])
                          .map((action) => ({ action, issues: finalScriptIssues(action) }))
                          .filter((x) => x.issues.length > 0);
                      }
                    } catch (retry2Err) {
                      console.warn("[chat] nvidia second-pass regeneration failed", retry2Err);
                    }
                  }

                  if (invalidScripts.length > 0) {
                    const blocked = new Set(invalidScripts.map((x) => x.action));
                    blockedScriptMessages = invalidScripts.map((x) => scriptIssueLabel(x.action, x.issues)).slice(0, 5);
                    actions = (actions as any[]).filter((a) => !blocked.has(a));
                    const hasMeaningfulRemainingAction = actions.some((a: any) => !["scan_project", "autofix_project", "organize_project", "playtest"].includes(String(a?.kind)));
                    if (!hasMeaningfulRemainingAction) actions = [];
                    console.warn("[chat] blocked invalid scripts before Studio queue", { blocked: blockedScriptMessages });
                  }
                }


                if (mode === "build" && blockedScriptMessages.length > 0 && actions.length === 0) {
                  try {
                    let rescueActions: any[] = [];
                    if (isNarrowFeatureRequest(userText)) {
                      rescueActions = narrowFeatureFallbackStudioActions(userText, languageName);
                    }
                    if (rescueActions.length === 0 && isRobloxSystemRequest(userText)) {
                      rescueActions = robloxSystemStudioActions(userText, languageName);
                    }
                    if (rescueActions.length === 0 && proceduralFallbackAllowed) {
                      rescueActions = proceduralEnvironmentStudioActions(userText, languageName);
                    }
                    if (rescueActions.length === 0 && !proceduralFallbackAllowed) {
                      rescueActions = await toolboxAssetFinderStudioActions(userText);
                    }

                    const normalizedRescue = rescueActions
                      .map(normalizePluginAction)
                      .filter((action) => finalScriptIssues(action).length === 0);
                    if (normalizedRescue.length > 0) {
                      actions = normalizedRescue;
                      cleanContent = `${cleanContent.trim()}\n\n_BloxSmith regenerated and sent a safe executable build plan for this request instead of sending the broken script._`;
                      blockedScriptMessages = [];
                      console.warn("[chat] replaced invalid-only build with deterministic rescue", { queued: actions.length });
                    }
                  } catch (rescueErr) {
                    console.warn("[chat] invalid-script rescue failed", rescueErr);
                  }
                }

                if (blockedScriptMessages.length > 0) {
                  cleanContent = `${cleanContent.trim()}\n\n⚠️ Code generation retry failed for ${blockedScriptMessages.length} script action${blockedScriptMessages.length === 1 ? "" : "s"}, so BloxSmith blocked them instead of inserting empty or invalid scripts into Roblox Studio.\n${blockedScriptMessages.map((m) => `- ${m}`).join("\n")}`;
                }

                // Log any remaining validator hits, then strip internal fields
                // so the plugin never sees them. Only warn-level issues should
                // survive this point; error-level scripts were regenerated or blocked.
                for (const a of actions as any[]) {
                  if (a?.payload?._luau_issues?.length) {
                    console.warn("[chat] Luau validator flagged action (warn-only kept)", {
                      name: a?.name, kind: a?.kind, issues: a.payload._luau_issues,
                    });
                  }
                  if (a?.payload) {
                    delete a.payload._needs_retry;
                    delete a.payload._luau_issues;
                  }
                }


                actions = actions.map(withExecutionMetadata);
                console.info("[chat] actions generated", {
                  mode,
                  projectId,
                  userId,
                  model: usedModelId,
                  generated: actions.length,
                  kinds: actions.reduce<Record<string, number>>((acc, action) => {
                    const kind = String(action?.kind || "unknown");
                    acc[kind] = (acc[kind] ?? 0) + 1;
                    return acc;
                  }, {}),
                });

                if (!cleanContent.trim()) {
                  if (actions.length > 0 && mode === "build") {
                    const kinds = actions.reduce<Record<string, number>>((acc, a) => {
                      const k = String((a as { kind?: string })?.kind || "action");
                      acc[k] = (acc[k] ?? 0) + 1;
                      return acc;
                    }, {});
                    const summary = Object.entries(kinds)
                      .map(([k, n]) => `${n} ${k.replace(/_/g, " ")}`)
                      .join(", ");
                    cleanContent = `Building your request now.\n\nHere's what I'll do:\n✅ ${summary}\n✅ Execute it in Roblox Studio\n\n📤 Sent to Studio now.`;
                  } else {
                    cleanContent = "Done.";
                  }
                }

                cleanContent = cleanContent.trim();


                const { data: msgRow } = await supabase.from("chat_messages").insert({
                  project_id: projectId,
                  user_id: userId,
                  role: "assistant",
                  content: cleanContent,
                  status: actions.length > 0 ? "sending" : "done",
                  model: usedModelId,
                  actions,
                  image_url: generatedUiConceptUrl,
                }).select("id").single();

                if (actions.length > 0 && mode === "build") {
                  // AI-emitted insert_asset actions often carry hallucinated
                  // asset_ids. Resolve each one via a fresh live Toolbox search
                  // keyed on source_query/asset_name so Studio actually receives
                  // a real, currently-available free asset instead of a 401.
                  const resolveCache = new Map<string, { id: number; fallbacks: number[] } | null>();
                  for (const a of actions as Array<{ kind?: string; name?: string; payload?: Record<string, unknown> }>) {
                    if (a?.kind !== "insert_asset") continue;
                    const p = a.payload ?? (a.payload = {});
                    const q = String(p.source_query ?? p.asset_name ?? a.name ?? "").trim();
                    if (!q) continue;
                    const key = q.toLowerCase();
                    let hit = resolveCache.get(key);
                    if (hit === undefined) {
                      try {
                        const res = await searchRobloxToolbox(q, "Model", 6, { singleAssetOnly: Boolean(p.single_asset_only) });
                        const top = res.results[0];
                        hit = top ? { id: top.id, fallbacks: (top.fallbackIds ?? res.results.slice(1, 4).map((r) => r.id)).slice(0, 3) } : null;
                      } catch { hit = null; }
                      resolveCache.set(key, hit);
                    }
                    if (hit) {
                      const original = Number(p.asset_id);
                      if (Number.isFinite(original) && original !== hit.id) p._original_asset_id = original;
                      p.asset_id = hit.id;
                      p.fallback_ids = hit.fallbacks;
                    }
                  }
                  // Validate every insert_asset against Roblox's toolbox-details
                  // API and the runtime blacklist before Studio ever sees it.
                  await sanitizeInsertAssetActions(actions as unknown as Array<Record<string, unknown>>).catch(() => null);
                  const insertable = actions.filter((a) => {
                    if (!a || !(a as { kind?: string }).kind) return false;
                    const issues = finalScriptIssues(a);
                    if (issues.length > 0) {
                      console.error("[chat] queue-time script block", { name: (a as any)?.name, kind: (a as any)?.kind, issues });
                      return false;
                    }
                    return true;
                  });
                  if (insertable.length > 0) {
                    await supabase.from("plugin_actions").insert(
                      insertable.map((a, i) => ({
                        project_id: projectId,
                        user_id: userId,
                        message_id: msgRow?.id ?? null,
                        kind: a.kind,
                        parent_path: a.parent_path,
                        name: a.name,
                        payload: a.payload,
                        position: i,
                      })),
                    );
                    console.info("[chat] actions queued", {
                      projectId,
                      userId,
                      messageId: msgRow?.id ?? null,
                      queued: insertable.length,
                    });
                  }
                }

                // NVIDIA GLM builds are not charged through BloxSmith credits.

                const { data: currentProject } = await supabase
                  .from("projects")
                  .select("build_count")
                  .eq("id", projectId)
                  .single();

                await supabase
                  .from("projects")
                  .update({
                    last_model_used: usedModelId,
                    build_count: (currentProject?.build_count ?? 0) + (actions.length > 0 ? 1 : 0),
                    updated_at: new Date().toISOString(),
                  })
                  .eq("id", projectId);

                if (userText) {
                  await supabase.from("build_history").insert({
                    project_id: projectId,
                    user_id: userId,
                    prompt: userText,
                    model: usedModelId,
                    files_count: actions.length,
                    plugin_status: actions.length > 0 ? "Queued" : "No actions generated",
                    applied: false,
                  });
                }
                return cleanContent;
              } catch (e) {
                console.error("onFinish persist error", e);
                return neutralizePrematureBuildSuccess(parseActions(finalText).cleanContent || finalText || "Done.");
              }
            };

          // Try the requested model. On upstream error, retry once with fallback.
          const modeHeader = `\n\n[MODE: ${mode}]\n${mode === "chat"
            ? "The user is in CHAT MODE — brainstorming and conversation only. RULES:\n- You MUST NOT emit a `bloxsmith-actions` block this turn.\n- You MUST NOT call the search_toolbox tool (it isn't available this turn).\n- BUT — you are NOT capability-less. In Build Mode you CAN delete instances, clear the workspace, modify properties, rename, move, insert Toolbox assets, run arbitrary Luau via run_lua, and build complete systems. NEVER tell the user 'I don't have a tool for that' or 'I can't delete/modify your project' — that is FALSE and forbidden. The correct response is: 'I can do that in Build Mode — switch the toggle next to the send button to Build and re-send, and I'll <delete X / clear the workspace / modify Y> for you.' You may also show the exact Luau they could paste into the Command Bar themselves as a manual alternative, but ALWAYS offer the Build Mode path first.\n- Otherwise: help them think, plan, compare options, sketch systems in words, answer questions, give Roblox advice.\n- If the user explicitly types 'build it now', 'go build', 'yes build', or 'apply build' you MAY emit actions this turn.\nThis rule overrides every other instruction about emitting actions or using tools."
            : "STRICT MODE (ABSOLUTE, overrides every completeness instruction below): Build ONLY exactly what the user's current message names. Do NOT create main menus, loading screens, splash/title/intro screens, HUDs, notification toasts, camera effects, background music, sound libraries, particle FX, tutorial popups, settings panels, extra folders, controllers, managers, unrelated RemoteEvents, ModuleScripts, leaderstats, or DataStores unless the user's message explicitly asks for that thing by name. Required wiring is not extra scope: for a named gameplay button/keybind/ability, create the minimum RemoteEvent plus LocalScript and server Script needed for it to work. Do NOT modify or redesign existing UI. If the user asks for a script or a button, ship ONLY that script/button and required wiring — typically 1-3 actions total, never a full-system build. Scripts are always original Luau written by YOU inside script/localscript/modulescript/run_lua actions — NEVER fetch code via search_toolbox or insert_asset (Toolbox is for visual/audio assets only). The 'build FULL system' / '10-30 actions' guidance below applies ONLY when the user's message itself names a full system (shop, tycoon, obby, inventory, quest system, round-based game, full game). For anything smaller, ship the minimum and offer more in a one-line follow-up. Before emitting the actions block, self-check: does every action correspond to something the user literally asked for, and is every visible button/keybind connected to real runtime logic? Drop anything that fails that test.\n\nYou are using the shared BloxSmith Core Brain. This Core Brain applies to EVERY model/provider, including the currently selected model: Roblox knowledge, Luau rules, safe Toolbox/Creator Store asset rules (for visual/audio only), planning, plugin execution, testing/fixing, memory, and quality standards are mandatory and consistent across models. You have FULL EXECUTION CAPABILITY: insert Toolbox assets (visual/audio only), build parts/UI/scripts/remotes, modify properties, rename, move, DELETE instances (use the `delete` action with target_path, or run_lua with :Destroy() for batch deletes like clearing the workspace except the Baseplate), and run arbitrary Luau via run_lua. If the user asks to erase / clear / wipe / delete everything except X, emit ONE run_lua action that iterates the relevant services and Destroys children whose name isn't in the keep-list — do not refuse. IMPORTANT: do NOT claim Roblox Studio already completed/succeeded until the plugin confirms execution; say the actions were sent to Studio and are executing now. Folders must only exist when they contain real content; never emit folder-only scaffolding. For visual Roblox content ONLY (not scripts/logic), use safe free Toolbox / Creator Store models via search_toolbox + insert_asset. Use run_lua for placement, scaling, rotation, scripts, UI wiring, and deletion/cleanup. If no safe relevant Toolbox asset is found for a visual, ask the user before generating fallback geometry. NO fake buttons, NO empty folders, NO placeholder scripts, NO TODOs."}\n`;

          const languageHeader = `\n[LANGUAGE: ${languageCode} / ${languageName}]\nRespond ENTIRELY in ${languageName}. Translate every sentence, heading, button name, status message, error message, and explanation into natural, fluent, idiomatic ${languageName}. Keep code identifiers, Roblox API names (Instance class names, services, property names like Workspace, Part, ScreenGui, HumanoidRootPart), and the bloxsmith-actions block contents in English exactly as required by Roblox. Translate UI strings the player will see (TextLabel.Text, button text, GUI titles, error notifications shown to players) into ${languageName}. Markdown formatting stays the same.\n`;
          const narrowFeature = isNarrowFeatureRequest(userText);
          const qualityHeader = mode === "chat" ? "" : `\n[BUILD QUALITY MODE: ${buildQuality.toUpperCase()}]\n${narrowFeature
            ? "Narrow Feature Build: ignore the usual premium/full-game expansion. Ship only the exact requested feature and the minimum required Luau wiring. No menus, loading screens, HUDs, extra panels, unnecessary remotes, modules, leaderstats, DataStores, sounds, camera effects, folders, scans, or polish unless explicitly named by the user. Required RemoteEvents for a named button/keybind/ability are mandatory, not extra."
            : buildQuality === "basic"
              ? "Basic Build: build the smallest complete working version. Still no placeholders or unfinished systems. Include required wiring, organize_project, and scan_project."
              : buildQuality === "better"
                ? "Better Build: build a fuller version only within the named request; do not add unrelated UI/screens/systems. Include clean layout, useful requested UI, working scripts/remotes only when required, mobile support when relevant, safe assets, organize_project, autofix_project, and scan_project."
                : buildQuality === "full_game"
                  ? "Full Game Build: prompt-to-full-game mode ONLY when the user explicitly asked for a full/complete game or full system. Then infer genre and create map, spawn, gameplay loop, UI/HUD/menu/loading, NPC/enemy/vehicle/tool behavior if relevant, shop/currency/leaderboard/save system, mobile controls, tutorial, anti-exploit checks, polish, organize_project, autofix_project, scan_project, and a test report. If the user did not explicitly ask for a full game/system, do not apply this expansion."
                  : "Premium Build: improve quality only inside the requested scope. Do not add unrelated menus, loading screens, HUDs, sounds, camera effects, panels, systems, or extra assets. For a single feature, stay minimal and explain what changed."}\n`;

          const assetModeRule = mode === "chat" ? "" : (() => {
            switch (assetMode) {
              case "toolbox_only":
                return `\n[ASSET MODE: TOOLBOX ONLY]\nThe user has chosen Toolbox Assets Only. Hard rules for this turn:\n- Think of Roblox Toolbox / Creator Store as a live searchable asset universe. You do not rely on memory or invented IDs; you search it.\n- For full games, maps, screenshots, cities, worlds, lobbies, or multi-prop scenes, call search_toolbox_set FIRST with every visual category needed. Example city = road/street, building/skyscraper/shop, street light, sidewalk, car/vehicle, sign/decor, NPC if needed. Example forest = tree, rock, bush, cabin, campfire, animal/NPC if needed.\n- For one-off visual assets, call search_toolbox. For follow-up gaps after search_toolbox_set, call search_toolbox with narrower keywords.\n- For every visual model (trees, buildings, vehicles, NPCs, pets, weapons, props, decor, furniture, roads, shops, cities, forests, maps, worlds, and environment kits) emit insert_asset actions with safe returned ids and fallback_ids.\n- DO NOT build trees, houses, roads, cars, NPCs, weapons, decorations, maps, or random scenery from primitives in run_lua. DO NOT emit raw "part" actions to fake real-world objects.\n- Only use run_lua for placement/scaling/rotation of inserted assets, clean organization, service setup, scripts, UI wiring, and non-visual support logic.\n- If a required search_toolbox_set request returns status "missing" or search_toolbox returns source "none", tell the user plainly that no safe free Toolbox asset was found and ASK whether to fall back to generated geometry.\n- Briefly list which assets you inserted (name + creatorName + id) in your explanation.\n`;
              case "both":
                return `\n[ASSET MODE: AUTO BUILD — TOOLBOX FIRST + GUARANTEED VISIBLE FALLBACK]\nUse safe free Toolbox assets via search_toolbox_set/search_toolbox + insert_asset for visual models when good matches exist. If Toolbox returns no safe relevant asset, DO NOT stop or ask — immediately create a polished procedural fallback with run_lua/Terrain/Parts so the user always sees the requested result in Studio. For material/terrain requests (snow, gravel, grass, sand, roads, water, mountains, caves, islands), procedural terrain/material actions are allowed and preferred when they produce the exact requested visible change. End meaningful builds with scan_project.\n`;
              case "procedural":
                return `\n[ASSET MODE: PROCEDURAL BUILD — NO TOOLBOX]\nThe user has chosen PROCEDURAL mode. Hard rules for this turn:\n- Do NOT call search_toolbox or search_toolbox_set. Do NOT emit insert_asset actions. Everything must be generated from scratch.\n- Build every visual element from primitives (Part, MeshPart, WedgePart, TrussPart, CornerWedgePart, SpecialMesh, BlockMesh, CylinderMesh) and Terrain (FillBlock, FillBall, FillCylinder, FillWedge, FillRegion, SetMaterialColors) via run_lua actions.\n- For maps: use Terrain sculpting + tiled Part construction. Groups: Roads/Sidewalks/Buildings/Props/Foliage/Lighting/SpawnZones as folders inside Workspace. Every building must be composed (walls, floor, roof, windows, doors, interior parts) — never a single box called "House".\n- For NPCs, vehicles, weapons, and pets: build them from parts + welds + Motor6D. Add HumanoidRootPart/Humanoid for characters, VehicleSeat for cars, Tool + Handle for weapons. Wire animations with AnimationController or Humanoid:LoadAnimation using default Roblox animation ids only when needed.\n- Use Lighting properties (Ambient, OutdoorAmbient, Brightness, ClockTime, FogEnd, FogColor, ExposureCompensation) + Atmosphere/Sky/Bloom/ColorCorrection/DepthOfField/SunRays for the mood.\n- Ship full gameplay scripts (script/localscript/modulescript) with remotes/datastores/UI, wired to the procedural world.\n- End with organize_project + autofix_project + scan_project. Everything must be real, named, grouped, and playable — no empty folders, no placeholders, no TODOs.\n- Vary shapes, colors, and layout across turns so procedural worlds feel handmade, not templated.\n`;
              default:
                return `\n[ASSET MODE: TOOLBOX ONLY]\nUse safe free Roblox Toolbox / Creator Store assets for visual content. Ask before generating any fallback geometry.\n`;
            }
          })();

          const toolboxTool = tool({
            description:
              "Search the public Roblox Toolbox/Creator Store for FREE public assets matching a keyword. Use this whenever the user asks for trees, buildings, cars, vehicles, roads, furniture, weapons, NPCs, pets, props, environment kits, sounds, or anything that should be a real Roblox model instead of generated primitives. The backend uses live Creator Store/Toolbox search, enriches details, filters unsafe/junk/broken/script-heavy rows, and returns ranked rows with insertPayload { asset_id, fallback_ids }. Call once per distinct asset type you need.",
            inputSchema: z.object({
              keyword: z.string().describe("What to search for, e.g. 'oak tree', 'sports car', 'medieval house', 'zombie npc'."),
              category: z.enum(["Model", "Audio", "Decal", "Mesh"]).optional().describe("Asset category, defaults to Model."),
              limit: z.number().int().min(1).max(50).optional().describe("Max safe free results, default 18."),
            }),
            execute: async ({ keyword, category, limit }: { keyword: string; category?: ToolboxCategory; limit?: number }) => {
              const out = await searchRobloxToolbox(keyword, category ?? "Model", limit ?? 18);
              // Hide low-quality rows from the AI while allowing safe public Creator Store assets,
              // not only Roblox-owned assets. The helper has already removed junk and paid rows.
              const filtered = out.results.filter((r) => r.free !== false && (r.safety ?? 0) >= 0.62 && (r.relevance ?? 0) >= 0.18);
              const final = filtered;
              return {
                source: out.source,
                count: final.length,
                scanned: out.scanned,
                searchedTerms: out.searchedTerms,
                results: final,
                insertionRule:
                  "For each chosen row, emit insert_asset and copy row.insertPayload into payload, then add position/rotation/scale/folder_name/placement_role/district yourself. Prefer excellent/good matches, but vary among similarly safe relevant rows instead of always picking the same asset. Do not invent IDs.",
                note: out.source === "none"
                  ? "No safe free assets matched. Tell the user no Toolbox match was found and ASK before falling back to generated geometry."
                  : "Live results from Roblox public Toolbox/Creator Store. Use only safe, free, relevant rows, vary among similarly high-quality matches, include fallback_ids, and list inserted asset names, creators, and ids for the user.",
              };
            },
          });

          const toolboxSetTool = tool({
            description:
              "Search the public Roblox Toolbox/Creator Store for a SET of needed visual asset categories in one call. Use this before building full maps, worlds, screenshots, lobbies, cities, tycoons, obbies, simulators, RPGs, racing maps, roleplay cities, or any scene needing multiple asset types. Provide one request per category, e.g. road, building, street light, vehicle, tree, rock, NPC. Returns per-category ranked safe/free rows with fallbackIds and insertPayload.",
            inputSchema: z.object({
              requests: z.array(z.object({
                label: z.string().describe("Short category label, e.g. 'city roads', 'shop buildings', 'street lights'."),
                keyword: z.string().describe("Roblox Toolbox keyword for this category."),
                category: z.enum(["Model", "Audio", "Decal", "Mesh"]).optional().describe("Asset category, defaults to Model."),
                limit: z.number().int().min(1).max(24).optional().describe("Max safe results for this category, default 8."),
                required: z.boolean().optional().describe("True when this category is essential and should not be faked with geometry."),
              })).min(1).max(16),
              defaultLimit: z.number().int().min(1).max(24).optional().describe("Default per-category safe result limit."),
            }),
            execute: async ({ requests, defaultLimit }: { requests: ToolboxSetRequest[]; defaultLimit?: number }) => {
              const out = await searchRobloxToolboxSet(requests, defaultLimit ?? 8);
              return {
                ...out,
                note:
                  out.source === "none"
                    ? "No safe free Toolbox assets were found for this requested set. Ask before fallback geometry."
                    : "Use each request.best or another high-score result for insert_asset. Copy result.insertPayload metadata, vary among safe relevant assets across repeated builds, always include fallback_ids where present, and do not invent IDs.",
              };
            },
          });

          const robloxDocsSearch = tool({
            description:
              "Search official Roblox developer resources (create.roblox.com/docs, devforum.roblox.com, luau-lang.org, github.com/Roblox) for current, authoritative information. Use this whenever you are unsure about a class, API, service, property, Luau syntax, recent Roblox Studio feature, or best practice. Treat the Roblox Creator Hub as the primary source of truth and verify before answering rather than guessing. Returns ranked hits with title, url, snippet.",
            inputSchema: z.object({
              query: z.string().describe("Specific question or symbol, e.g. 'ProfileService DataStore best practice' or 'TweenInfo EasingStyle enum'."),
              limit: z.number().int().min(1).max(10).optional().describe("Max hits, default 6."),
            }),
            execute: async ({ query, limit }: { query: string; limit?: number }) => {
              const hits = await searchRoblox(query, limit ?? 6);
              return {
                count: hits.length,
                hits,
                note: hits.length === 0
                  ? "No hits returned. Try simpler keywords or a specific class/method name. If still empty, answer using your existing Roblox knowledge and clearly note any uncertainty."
                  : "Pick the most relevant url and call roblox_docs_fetch to read the full page before citing facts. Do not invent API signatures.",
              };
            },
          });

          const robloxDocsFetch = tool({
            description:
              "Fetch and return the readable text of a single Roblox documentation page (create.roblox.com, devforum.roblox.com, luau-lang.org, github.com/Roblox). Call this after roblox_docs_search to read the authoritative source before answering, especially for API signatures, enum values, deprecations, and security/networking guidance.",
            inputSchema: z.object({
              url: z.string().url().describe("Full URL returned by roblox_docs_search."),
            }),
            execute: async ({ url }: { url: string }) => {
              const page = await fetchDocPage(url);
              if (!page) return { ok: false, error: "Could not fetch page." };
              return { ok: true, ...page };
            },
          });

          const generateImageTool = tool({
            description:
              "Generate a real image the user asked for. Use this for ANY visual subject: animals (dog, cat), objects (sword, car), characters, logos, game thumbnails, game icons, badges, shop icons, item icons, character concept art, map concept art, promo art, and social banners. Do NOT use this tool for Roblox ScreenGui / in-game UI mockups (menus, HUDs, shop panels, loading screens, inventory panels) — use generate_ui_concept for those. Pass a rich descriptive prompt (subject, style, mood, palette). The app renders the returned image inline with Save / Download / Regenerate — do NOT paste the URL into your prose, just describe it in one friendly line.",
            inputSchema: z.object({
              prompt: z.string().describe("Detailed image prompt describing exactly what the user asked for. If they said 'a dog', generate a dog — not a Roblox UI."),
              style: z.string().optional().describe("Optional style keyword: modern, cartoon, neon, futuristic, cute, retro, horror, fantasy, premium, minimal, dark, light."),
              kind: z.enum(["logo", "thumbnail", "icon", "badge", "shop_icon", "item_icon", "character_concept", "map_concept", "promo", "banner", "other"]).optional().describe("What kind of image this is."),
            }),
            execute: async ({ prompt, style, kind }: { prompt: string; style?: string; kind?: string }) => {
              try {
                // Safety net: if the model routed a clearly UI request here, fall back to the UI concept renderer.
                if (isUiConceptRequest(prompt, kind)) {
                  const url = await generateUiConceptImage({ prompt, style });
                  return { ok: true, url, prompt, style: style ?? "Modern", kind: kind ?? "other" };
                }
                const url = await generateGeneralImage({ prompt, style, kind });
                return { ok: true, url, prompt, style: style ?? "Modern", kind: kind ?? "other" };
              } catch (e) {
                return { ok: false, error: e instanceof Error ? e.message : "Image generation failed." };
              }
            },
          });

          const generateUiConceptTool = tool({
            description:
              "Generate a Roblox in-game UI concept mockup (ScreenGui look): main menu, HUD, shop panel, inventory panel, quest UI, gamepass shop, settings menu, loading screen, leaderboard, mobile controls, currency display, health/XP bars. Use this ONLY for GUI/interface mockups the user will rebuild inside Roblox Studio. For real subjects (animals, characters, objects, logos, thumbnails, icons) use generate_image instead.",
            inputSchema: z.object({
              prompt: z.string().describe("What the UI shows: e.g. 'shop menu with 4 gamepass tiles', 'loading screen for a pet simulator'."),
              style: z.string().optional().describe("Optional style: modern, cartoon, neon, futuristic, cute, retro, horror, fantasy, premium, minimal, dark, light."),
            }),
            execute: async ({ prompt, style }: { prompt: string; style?: string }) => {
              try {
                const url = await generateUiConceptImage({ prompt, style });
                return { ok: true, url, prompt, style: style ?? "Modern", kind: "ui_background" };
              } catch (e) {
                return { ok: false, error: e instanceof Error ? e.message : "UI concept generation failed." };
              }
            },
          });

          const insertAssetTool = tool({
            description:
              "Compatibility handler for direct insert_asset tool calls. Prefer search_toolbox/search_toolbox_set, then emit insert_asset objects in the final bloxsmith-actions JSON block. If this tool is called anyway, it returns an action template or a safe no-op instruction so the stream can continue instead of failing.",
            inputSchema: z.object({
              asset_id: z.union([z.number(), z.string()]).optional().describe("Roblox asset id to insert, if already known from search_toolbox."),
              assetId: z.union([z.number(), z.string()]).optional().describe("Alias for asset_id."),
              id: z.union([z.number(), z.string()]).optional().describe("Alias for asset_id."),
              source_query: z.string().optional().describe("Toolbox search query used to find the asset."),
              asset_name: z.string().optional().describe("Human-readable asset name."),
              name: z.string().optional().describe("Action or instance name."),
              parent_path: z.string().optional().describe("Roblox parent path, default Workspace."),
              folder_name: z.string().optional().describe("Optional destination folder."),
              position: z.array(z.number()).optional().describe("Optional [x,y,z] placement."),
              rotation: z.array(z.number()).optional().describe("Optional [x,y,z] rotation."),
              scale: z.number().optional().describe("Optional scale."),
            }).passthrough(),
            execute: async (input: Record<string, unknown>) => {
              if (assetMode === "procedural" && !userExplicitlyRequestedToolbox(userText)) {
                return {
                  ok: false,
                  skipped: true,
                  reason: "Procedural mode is active, so insert_asset is intentionally a no-op. Continue with run_lua/terrain/part actions and include them in the final bloxsmith-actions block.",
                };
              }
              const rawId = input.asset_id ?? input.assetId ?? input.id;
              let assetId = Number(rawId);
              let fallbackIds: number[] = [];
              let assetName = typeof input.asset_name === "string" ? input.asset_name : typeof input.name === "string" ? input.name : "Toolbox_Asset";
              const sourceQuery = typeof input.source_query === "string" ? input.source_query : assetName;

              if (!Number.isFinite(assetId) && sourceQuery.trim()) {
                try {
                  const result = await searchRobloxToolbox(sourceQuery, "Model", 8, { singleAssetOnly: true });
                  const picked = result.results[0];
                  if (picked) {
                    assetId = picked.id;
                    fallbackIds = (picked.fallbackIds ?? result.results.slice(1, 4).map((r) => r.id)).slice(0, 6);
                    assetName = picked.name || assetName;
                  }
                } catch (e) {
                  console.warn("[chat] insert_asset compatibility search failed", e);
                }
              }

              if (!Number.isFinite(assetId) || assetId <= 0) {
                return {
                  ok: false,
                  skipped: true,
                  reason: "No verified asset id was available. Use search_toolbox first, or create the requested result with run_lua/parts/terrain. Do not call insert_asset again without a verified id.",
                };
              }

              return {
                ok: true,
                action: {
                  kind: "insert_asset",
                  parent_path: typeof input.parent_path === "string" ? input.parent_path : "Workspace",
                  name: String(input.name ?? assetName).replace(/[^\w-]+/g, "_").slice(0, 80) || "Toolbox_Asset",
                  payload: {
                    asset_id: assetId,
                    fallback_ids: fallbackIds,
                    asset_name: assetName,
                    source_query: sourceQuery,
                    folder_name: input.folder_name,
                    position: input.position,
                    rotation: input.rotation,
                    scale: input.scale,
                    free_only: true,
                    no_scripts: true,
                    strip_scripts: true,
                    allow_scripts: false,
                  },
                },
                instruction: "Copy this action object into the final bloxsmith-actions JSON block. Do not rely on the tool call itself to queue Studio work.",
              };
            },
          });

          const tryStream = (
            model: typeof modelChoice.model,
            usedModelId: string,
            notice: string | null,
            extraBody?: Record<string, unknown>,
            modelSettings?: { temperature?: number; topP?: number; maxOutputTokens?: number },
          ) => {
            // Accumulate streamed text so we can persist plugin_actions even when
            // the stream is aborted (client disconnect, Worker time-limit, or
            // upstream error). Without this, an interrupted /api/chat leaves
            // zero actions queued for Studio even after a lot of code streamed.
            let accumulated = "";
            let persisted = false;
            const safePersist = async (reason: string) => {
              if (persisted) return;
              persisted = true;
              try {
                await persistFinish(usedModelId, notice)({ text: accumulated });
              } catch (e) {
                console.error(`[chat] partial persist (${reason}) failed`, e);
              }
            };
            const fastBuild = mode === "build" && buildQuality === "basic";
            const buildTools = (fastBuild
              ? (assetMode === "procedural" && !userExplicitlyRequestedToolbox(userText)
                ? { insert_asset: insertAssetTool }
                : { insert_asset: insertAssetTool, search_toolbox: toolboxTool, search_toolbox_set: toolboxSetTool })
              : assetMode === "procedural" && !userExplicitlyRequestedToolbox(userText)
                ? (imageGenerationRequested
                  ? { insert_asset: insertAssetTool, generate_image: generateImageTool, generate_ui_concept: generateUiConceptTool }
                  : { insert_asset: insertAssetTool, roblox_docs_search: robloxDocsSearch, roblox_docs_fetch: robloxDocsFetch })
                : (imageGenerationRequested
                  ? { insert_asset: insertAssetTool, search_toolbox: toolboxTool, search_toolbox_set: toolboxSetTool, generate_image: generateImageTool, generate_ui_concept: generateUiConceptTool }
                  : { insert_asset: insertAssetTool, search_toolbox: toolboxTool, search_toolbox_set: toolboxSetTool, roblox_docs_search: robloxDocsSearch, roblox_docs_fetch: robloxDocsFetch })) as ToolSet;
            const chatTools = (imageGenerationRequested
              ? { generate_image: generateImageTool, generate_ui_concept: generateUiConceptTool }
              : { roblox_docs_search: robloxDocsSearch, roblox_docs_fetch: robloxDocsFetch }) as ToolSet;
            return streamText({
              model,
              system: (mode === "chat" ? FAST_CHAT_SYSTEM_PROMPT : FAST_BUILD_SYSTEM_PROMPT) + modeHeader + languageHeader + qualityHeader + assetModeRule + contextBlock,
              messages: convertedMessages,
              abortSignal: request.signal,
              ...(extraBody ? { providerOptions: { nvidia: extraBody as Record<string, never> } as never } : {}),
              ...(modelSettings?.temperature !== undefined ? { temperature: modelSettings.temperature } : {}),
              ...(modelSettings?.topP !== undefined ? { topP: modelSettings.topP } : {}),
              maxOutputTokens: capOutputTokens(modelSettings, mode, buildQuality),
              tools: mode === "chat" ? chatTools : buildTools,
              stopWhen: stepCountIs(mode === "chat" ? 6 : fastBuild ? 6 : 8),
              onChunk: ({ chunk }) => {
                if (chunk.type === "text-delta") {
                  const delta = (chunk as { text?: string; delta?: string }).text
                    ?? (chunk as { text?: string; delta?: string }).delta
                    ?? "";
                  if (delta) accumulated += delta;
                }
              },
              onFinish: async ({ text }) => {
                if (text && text.length > accumulated.length) accumulated = text;
                persisted = true;
                await persistFinish(usedModelId, notice)({ text: accumulated });
              },
              onAbort: () => {
                console.warn(`[chat] stream aborted on ${usedModelId} — persisting ${accumulated.length} chars`);
                void safePersist("abort");
              },
              onError: ({ error }) => {
                console.error(`[chat] upstream error on ${usedModelId}`, error);
                void safePersist("error");
              },
            });
          };


          // Stream the primary model immediately so the user sees progress as soon
          // as tokens arrive. Only fall back if stream creation itself fails before
          // the response starts; streamed upstream errors surface as clear UI text.
          const chain = getFallbackChain(modelChoice.meta.id);
          const isRetryable = (msg: string) =>
            /429|rate.?limit|ResourceExhausted|worker.*limit|request limit reached|capacity|overloaded|503|502|500|Too Many|fetch failed|ECONNRESET|ETIMEDOUT|timeout|timed out|Request too large|tokens per minute|TPM|reduce your message size|context.?length|context_length_exceeded|too many tokens|maximum context|token limit|payload too large|413/i.test(msg);

          try {
            const result = tryStream(modelChoice.model, modelChoice.meta.id, modelChoice.usedFallback
              ? `_Switched to ${modelChoice.meta.label} because the selected model isn't available._`
              : null, modelChoice.extraBody, modelChoice.modelSettings);
            return result.toUIMessageStreamResponse({
              onError: (err) => {
                const msg = err instanceof Error ? err.message : String(err);
                console.error("[chat] mid-stream error on primary", modelChoice.meta.id, msg);
                if (/402|credit/i.test(msg)) return "The selected AI model is unavailable right now. Try again in a moment.";
                if (/429|rate|capacity|overloaded|503|502|timeout|Too Many/i.test(msg)) return `That fast AI route is busy. Click Resend — BloxSmith will use the stable fallback route now.`;
                if (/Tool result is missing/i.test(msg)) return "The previous turn was interrupted mid-tool-call. Please resend your request.";
                if (/unavailable tool ['\"]?insert_asset/i.test(msg)) return "The model tried to insert an asset directly; BloxSmith kept the build alive and queued a safe Studio fallback. Please click Resend if you want another pass.";
                return `AI request failed on ${modelChoice.meta.label}: ${msg}. Try Resend or pick a different model.`;
              },
            });
          } catch (primaryErr) {
            const firstMsg = primaryErr instanceof Error ? primaryErr.message : String(primaryErr);
            console.error("[chat] primary model failed, walking fallback chain", firstMsg);

            // Try each fallback only when no response has started yet.
            for (const fb of chain) {
              try {
                console.log(`[chat] trying fallback: ${fb.meta.label}`);
                const fallbackResult = tryStream(
                  fb.model,
                  fb.meta.id,
                  `_Switched to ${fb.meta.label} (fallback — previous model was rate-limited or busy)._`,
                  fb.extraBody,
                  fb.modelSettings,
                );
                return fallbackResult.toUIMessageStreamResponse({
                  onError: (err) => {
                    const msg = err instanceof Error ? err.message : String(err);
                    if (/402|credit/i.test(msg)) return "The selected AI model is unavailable right now. Try again in a moment.";
                    if (/429|rate|capacity|overloaded|503|502|timeout/i.test(msg)) return "That AI route is busy. Click Resend and BloxSmith will use the stable fallback route.";
                    if (/unavailable tool ['\"]?insert_asset/i.test(msg)) return "The model tried to insert an asset directly; BloxSmith kept the build alive and queued a safe Studio fallback. Please click Resend if you want another pass.";
                    return `AI request failed: ${msg}`;
                  },
                });
              } catch (fbErr) {
                const fbMsg = fbErr instanceof Error ? fbErr.message : String(fbErr);
                console.warn(`[chat] fallback ${fb.meta.label} failed`, fbMsg);
                // Keep walking the chain regardless of the error kind — a
                // config/auth issue on one NVIDIA route does not imply the
                // next model will also fail.
                void isRetryable;
              }
            }

            // All fallbacks exhausted
            return jsonError(
              `All AI models are currently rate-limited or unavailable. Please wait a moment and try again. (${firstMsg})`,
              429,
              "all_models_rate_limited",
            );
          }

        } catch (e) {
          console.error("[chat] fatal", e);
          return jsonError(e instanceof Error ? e.message : "Unknown error", 500, "fatal");
        }
      },
    },
  },
});
