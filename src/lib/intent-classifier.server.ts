// Fast pre-pass that reads the user's latest turn and returns a compact
// structured "intent" block. Prepended to the system context so the main
// model stops guessing what the user meant (biggest source of "generated
// something different" complaints). Fail-open: on any error, returns null
// and the pipeline continues as before.

const NVIDIA_URL = "https://integrate.api.nvidia.com/v1/chat/completions";
// Small, cheap, fast model — the classifier is a 200-token call.
const MODEL = "meta/llama-3.1-8b-instruct";

export type Intent = {
  category: "ability" | "system" | "map" | "ui" | "asset" | "fix" | "chat" | "other";
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
  "category": "ability" | "system" | "map" | "ui" | "asset" | "fix" | "chat" | "other",
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
- "ability" = player powers (flight, dash, aura, punch). "system" = gameplay loops (shop, quests, DataStore). "map" = world/scene/kit. "ui" = menus/HUD/screens. "asset" = insert toolbox model. "fix" = repair prior error. "chat" = pure Q&A / discussion.
- "scope: single" = one thing (one script, one asset). "feature" = one complete feature. "game" = whole experience.
- "wants_ui" is true ONLY if the user named a UI element. Default false — do not add menus by default.
- "restated" is one short sentence paraphrasing the ask.
- "confidence" 0-1. If < 0.6, put a ONE-question clarifier in "clarify", else null.
- Never invent keybinds, style refs, or targets the user did not mention.
Output JSON only.`;

export async function classifyIntent(userText: string, timeoutMs = 1400): Promise<Intent | null> {
  const key = process.env.NVIDIA_API_KEY;
  if (!key) return null;
  const text = String(userText || "").trim();
  if (!text) return null;
  if (text.length > 4000) return null;

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
  const category = (["ability","system","map","ui","asset","fix","chat","other"] as const)
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
  if (intent.clarify) {
    lines.push(`\n⚠️ LOW CONFIDENCE — before doing heavy work, ask this ONE question in your first sentence, then wait: "${intent.clarify}"`);
  }
  return lines.join("\n");
}
