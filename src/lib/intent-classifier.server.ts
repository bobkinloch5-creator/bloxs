// Fast pre-pass that reads the user's latest turn and returns a compact
// structured "intent" block. Prepended to the system context so the main
// model stops guessing what the user meant (biggest source of "generated
// something different" complaints). Fail-open: on any error, returns null
// and the pipeline continues as before.

const NVIDIA_URL = "https://integrate.api.nvidia.com/v1/chat/completions";
// Small, cheap, fast model — the classifier is a 200-token call.
const MODEL = "meta/llama-3.1-8b-instruct";

export type Intent = {
  category: "ability" | "vfx" | "system" | "map" | "ui" | "asset" | "fix" | "remove" | "chat" | "other";
  scope: "single" | "feature" | "game";
  targets: string[];       // named nouns: "castle", "sword", "shop UI"
  keybinds: string[];      // ["F", "E"] if user named any
  style_refs: string[];    // ["Adopt Me", "low-poly", "medieval"]
  wants_ui: boolean;       // user explicitly asked for menus/HUD/screens
  wants_multiplayer: boolean;
  wants_mobile: boolean;
  restated: string;        // one-line paraphrase, 3rd person
  confidence: number;      // 0-1
  clarify: string | null;  // one targeted question if confidence < 0.6
};

const SYSTEM_PROMPT = `You are BloxSmith's intent classifier for Roblox builds. Given the user's latest turn, output ONE strict JSON object describing exactly what they want. No prose, no markdown, no code fences.

Schema:
{
  "category": "ability" | "vfx" | "system" | "map" | "ui" | "asset" | "fix" | "remove" | "chat" | "other",
  "scope":    "single" | "feature" | "game",
  "targets":  string[],
  "keybinds": string[],
  "style_refs": string[],
  "wants_ui": boolean,
  "wants_multiplayer": boolean,
  "wants_mobile": boolean,
  "restated": string,
  "confidence": number,
  "clarify": string | null
}

Rules:
- "ability" = player powers with mechanics (flight, dash, punch). "vfx" = particle/visual effects (fire aura, turn my character into flames, lightning aura, smoke, magic glow, ice effect, trails, explosions, glowing particles) even when phrased casually. "system" = gameplay loops (shop, quests, DataStore). "map" = world/scene/kit. "ui" = menus/HUD/screens. "asset" = insert toolbox model. "fix" = repair prior error. "remove" = the user is asking to remove, delete, take out, get rid of, undo, revert, clear, wipe, erase, uninstall, disable, or replace something that was previously built. "chat" = pure Q&A / discussion.
- "scope: single" = one thing (one script, one asset). "feature" = one complete feature. "game" = whole experience.
- For humanoid VFX phrases such as "turn my character into flames", "engulf my character in fire", "flaming hands", "electric body", or "magic aura", classify as category "vfx", scope "feature", targets including the affected body parts/character and the element. Do NOT classify these as asset insertion.
- "wants_ui" is true ONLY if the user named a UI element. Default false — do not add menus by default.
- "restated" is one short sentence paraphrasing the ask.
- "confidence" 0-1. If < 0.6, put a ONE-question clarifier in "clarify", else null.
- Never invent keybinds, style refs, or targets the user did not mention.
Output JSON only.`;

export async function classifyIntent(userText: string, timeoutMs = 1400): Promise<Intent | null> {
  const text = String(userText || "").trim();
  if (!text) return null;
  if (text.length > 4000) return null;

  const deterministicRemove = classifyKnownRemoveIntent(text);
  if (deterministicRemove) return deterministicRemove;

  const deterministicVfx = classifyKnownVfxIntent(text);
  if (deterministicVfx) return deterministicVfx;

  const key = process.env.NVIDIA_API_KEY;
  if (!key) return null;

  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const resp = await fetch(NVIDIA_URL, {
      method: "POST",
      signal: ac.signal,
      headers: {
        Authorization: `Bearer ${key}`,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: text.slice(0, 3500) },
        ],
        temperature: 0.1,
        top_p: 0.9,
        max_tokens: 400,
        response_format: { type: "json_object" },
      }),
    });
    if (!resp.ok) return null;
    const j = await resp.json();
    const content = j?.choices?.[0]?.message?.content;
    if (!content || typeof content !== "string") return null;
    const parsed = safeParse(content);
    if (!parsed) return null;
    return normalize(parsed);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function safeParse(s: string): unknown {
  try { return JSON.parse(s); } catch { /* try to extract */ }
  const m = s.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try { return JSON.parse(m[0]); } catch { return null; }
}

function normalize(x: unknown): Intent | null {
  if (!x || typeof x !== "object") return null;
  const o = x as Record<string, unknown>;
  const category = (["ability","vfx","system","map","ui","asset","fix","remove","chat","other"] as const)
    .find(c => c === o.category) ?? "other";
  const scope = (["single","feature","game"] as const).find(s => s === o.scope) ?? "single";
  const arr = (v: unknown): string[] =>
    Array.isArray(v) ? v.filter(x => typeof x === "string").map(x => (x as string).trim()).filter(Boolean).slice(0, 10) : [];
  const bool = (v: unknown, dflt = false) => typeof v === "boolean" ? v : dflt;
  const num = (v: unknown, dflt = 0.5) => (typeof v === "number" && v >= 0 && v <= 1) ? v : dflt;
  const str = (v: unknown, dflt = "") => typeof v === "string" ? v.trim().slice(0, 240) : dflt;
  const clarify = typeof o.clarify === "string" && o.clarify.trim() ? o.clarify.trim().slice(0, 200) : null;
  return {
    category, scope,
    targets: arr(o.targets),
    keybinds: arr(o.keybinds).map(k => k.toUpperCase()).slice(0, 6),
    style_refs: arr(o.style_refs),
    wants_ui: bool(o.wants_ui),
    wants_multiplayer: bool(o.wants_multiplayer),
    wants_mobile: bool(o.wants_mobile),
    restated: str(o.restated),
    confidence: num(o.confidence),
    clarify,
  };
}

function classifyKnownVfxIntent(text: string): Intent | null {
  const lower = text.toLowerCase();
  const hasVfxWord = /\b(vfx|visual\s*effects?|particles?|particle\s*effects?|aura|glow(?:ing)?|sparkles?|trail|beam|explosion|fire|flames?|flaming|burn(?:ing)?|ignite|engulf(?:ed)?|on\s*fire|lightning|electric(?:al)?|zap|smoke|magic|arcane|ice|frost|snow|poison|toxic|holy|divine|dark|shadow|energy|ki)\b/i.test(text);
  const hasHumanoidTarget = /\b(character|humanoid|player|avatar|me|my\s+body|body|hands?|arms?|feet|legs?|head|torso|root\s*part|humanoidrootpart|weapon|sword|tool|npc|enemy|boss)\b/i.test(text);
  const hasEffectShape = /\b(turn\s+(?:my\s+)?character\s+into|turn\s+(?:me|my\s+avatar|my\s+player)\s+into|engulf|surround|cover|wrap|attach|follow|full[-\s]*body|entire\s+body|aura|effect|particles?|glow|trail|flaming|burning|on\s*fire)\b/i.test(text);

  if (!hasVfxWord || (!hasHumanoidTarget && !hasEffectShape)) return null;

  const element = detectElement(lower);
  const bodyTargets = detectBodyTargets(lower);
  const targetLabel = bodyTargets.length ? bodyTargets.join(", ") : "player character";
  const restated = bodyTargets.length
    ? `Create a complete ${element} visual effect attached to the ${targetLabel} with working Roblox particles.`
    : `Create a complete full-body ${element} visual effect attached to the player's humanoid so it follows the character in-game.`;

  return {
    category: "vfx",
    scope: "feature",
    targets: Array.from(new Set([`${element} VFX`, ...bodyTargets, bodyTargets.length ? "humanoid body parts" : "full humanoid body", "ParticleEmitter attachments"])),
    keybinds: extractKeybinds(text),
    style_refs: [],
    wants_ui: /\b(ui|gui|button|hud|screen|menu)\b/i.test(text),
    wants_multiplayer: !/\b(local\s*only|only\s+for\s+me|client\s*only)\b/i.test(text),
    wants_mobile: /\b(mobile|phone|tablet|touch)\b/i.test(text),
    restated,
    confidence: 0.95,
    clarify: null,
  };
}

function detectElement(lower: string) {
  if (/\b(lightning|electric|zap)\b/.test(lower)) return "lightning";
  if (/\b(smoke|fog)\b/.test(lower)) return "smoke";
  if (/\b(magic|arcane)\b/.test(lower)) return "magic";
  if (/\b(ice|frost|snow)\b/.test(lower)) return "ice";
  if (/\b(poison|toxic)\b/.test(lower)) return "poison";
  if (/\b(holy|divine)\b/.test(lower)) return "holy";
  if (/\b(dark|shadow)\b/.test(lower)) return "dark";
  if (/\b(sparkle|sparkles)\b/.test(lower)) return "sparkle";
  if (/\b(glow|energy|ki)\b/.test(lower)) return "energy";
  if (/\b(fire|flame|flames|flaming|burn|burning|ignite|engulf|on\s*fire)\b/.test(lower)) return "fire";
  return "particle";
}

function detectBodyTargets(lower: string) {
  const targets: string[] = [];
  if (/\b(hand|hands|fist|fists)\b/.test(lower)) targets.push("hands");
  if (/\b(foot|feet)\b/.test(lower)) targets.push("feet");
  if (/\b(head|face|halo)\b/.test(lower)) targets.push("head");
  if (/\b(arm|arms)\b/.test(lower)) targets.push("arms");
  if (/\b(leg|legs)\b/.test(lower)) targets.push("legs");
  if (/\b(torso|chest|body|character|avatar|humanoid|player|me|engulf|surround|full[-\s]*body|entire\s+body|turn\s+(?:my\s+)?character\s+into)\b/.test(lower)) targets.push("full body");
  if (/\b(weapon|sword|tool|blade)\b/.test(lower)) targets.push("weapon");
  if (/\b(npc|enemy|boss)\b/.test(lower)) targets.push("NPC humanoid");
  return targets;
}

function extractKeybinds(text: string) {
  const matches = Array.from(text.matchAll(/\b(?:key|press|bind|on)\s+([A-Z0-9])\b/gi)).map((m) => m[1].toUpperCase());
  return Array.from(new Set(matches)).slice(0, 6);
}

// Render intent as a compact prompt block prepended to LIVE CONTEXT.
export function renderIntentBlock(intent: Intent | null): string | null {
  if (!intent) return null;
  const lines: string[] = [];
  lines.push(`🎯 USER INTENT (auto-classified — treat as authoritative unless the user's own words disagree):`);
  lines.push(`• Category: ${intent.category}    Scope: ${intent.scope}    Confidence: ${(intent.confidence * 100).toFixed(0)}%`);
  if (intent.restated) lines.push(`• Restated: ${intent.restated}`);
  if (intent.targets.length) lines.push(`• Named targets: ${intent.targets.join(", ")}`);
  if (intent.keybinds.length) lines.push(`• Keybinds requested: ${intent.keybinds.join(", ")}`);
  if (intent.style_refs.length) lines.push(`• Style references: ${intent.style_refs.join(", ")}`);
  lines.push(`• wants_ui=${intent.wants_ui}  wants_multiplayer=${intent.wants_multiplayer}  wants_mobile=${intent.wants_mobile}`);
  lines.push(`\nStrict rules:`);
  lines.push(`- Build EXACTLY the named targets. Do not add unrelated systems, menus, HUDs, splash screens, or loading UIs unless wants_ui is true or the user named them.`);
  lines.push(`- Scope 'single' = one script/asset only. Scope 'feature' = one complete feature end-to-end. Scope 'game' = full experience.`);
  lines.push(`- If category is 'fix', repair the failing thing first; new features can wait.`);
  if (intent.category === "vfx") {
    lines.push(`- VFX intent is SCRIPTED ROBLOX EFFECTS, not a Toolbox asset. Create complete Luau that builds Attachment + ParticleEmitter + PointLight/Sound on the correct body parts.`);
    lines.push(`- For phrases like "turn my character into flames", "engulfed in fire", or "on fire", target the full humanoid body: HumanoidRootPart, torso, head, arms/hands, and legs/feet with R15/R6 fallbacks.`);
    lines.push(`- The effect must follow the character, survive respawn via CharacterAdded, clean stale copies, replicate from the server when other players should see it, and avoid damage unless explicitly requested.`);
  }
  if (intent.category === "remove") {
    lines.push(`- REMOVAL intent — do NOT build new features this turn. Identify the exact target from CURRENT STUDIO SCENE DIGEST and PROJECT MEMORY (especially the "last_build" entry). If ambiguous, ask ONE clarifying question or list detected candidates before touching anything.`);
    lines.push(`- Remove EVERY related piece in the same actions batch: scripts, ModuleScripts, RemoteEvents/Functions, BindableEvents, ScreenGuis, Folders, Attachments, ParticleEmitters, Lights, Sounds, Animations, CollectionService tags, StarterCharacterScripts/StarterPlayerScripts entries, and stale prefixed copies (e.g. BloxSmith_*).`);
    lines.push(`- Patch or update any surviving scripts that referenced the removed system so no dead WaitForChild / nil dereference remains, then end with scan_project + autofix_project.`);
  }
  if (intent.clarify) {
    lines.push(`\n⚠️ LOW CONFIDENCE — before doing heavy work, ask this ONE question in your first sentence, then wait: "${intent.clarify}"`);
  }
  return lines.join("\n");
}

function classifyKnownRemoveIntent(text: string): Intent | null {
  const lower = text.toLowerCase().trim();
  const removalVerb = /\b(remove|delete|take\s+(?:out|off|away)|get\s+rid\s+of|undo|revert|clear|wipe|erase|uninstall|disable|kill\s+(?:the|this|that)|scrap|drop\s+(?:the|this|that))\b/i.test(lower);
  if (!removalVerb) return null;
  // Ignore requests where "remove" is embedded inside build phrasing ("build a system that can remove items")
  if (/\b(build|create|make|add|generate|design|implement|code)\b/.test(lower) && !/^\s*(?:please\s+|can\s+you\s+|could\s+you\s+)?(?:remove|delete|take|get\s+rid|undo|revert|clear|wipe|erase|uninstall|disable|scrap)\b/.test(lower)) {
    return null;
  }

  const targets: string[] = [];
  const targetMatches = Array.from(lower.matchAll(/\b(?:remove|delete|take\s+out|take\s+off|get\s+rid\s+of|undo|revert|clear|wipe|erase|uninstall|disable|scrap|drop)\s+(?:the\s+|that\s+|this\s+|my\s+|all\s+)?([a-z0-9][a-z0-9 _\-]{1,60})/gi));
  for (const m of targetMatches) {
    const raw = m[1].trim().replace(/\s+(please|now|thanks?|thank\s+you|for\s+me)$/i, "");
    if (raw) targets.push(raw.slice(0, 60));
  }
  const restated = targets.length
    ? `Fully remove ${targets.join(", ")} and every dependency it created (scripts, RemoteEvents, UI, attachments, tags, stale copies).`
    : `Fully remove the referenced item the user pointed at, along with every dependency it created.`;

  return {
    category: "remove",
    scope: targets.length ? "feature" : "single",
    targets: Array.from(new Set(targets)).slice(0, 8),
    keybinds: [],
    style_refs: [],
    wants_ui: false,
    wants_multiplayer: false,
    wants_mobile: false,
    restated,
    confidence: targets.length ? 0.9 : 0.55,
    clarify: targets.length ? null : "Which system or object should I remove? I want to be sure I clean up the right one.",
  };
}
