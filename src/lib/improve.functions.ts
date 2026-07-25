import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { generateText } from "ai";
import { z } from "zod";
import { getProviderModel } from "./ai-gateway.server";
import { FALLBACK_MODEL_ID } from "./models";

const Input = z.object({ text: z.string().min(1).max(4000) });

const IMPROVE_SYSTEM = `You are a senior prompt editor for the BloxSmith AI Roblox builder. Rewrite the user's build request into a confident, precise, studio-grade Roblox brief the builder can execute end-to-end — preserving the user's exact intent and scope but ALWAYS fixing spelling, grammar, and duplicated words.

MANDATORY CLEANUP (do this every time):
- Fix ALL misspellings, casual chat spelling, and Roblox slang typos.
- Remove duplicated words/phrases ("everything and everything" → "everything").
- Fix capitalization and punctuation. Never return the user's text nearly unchanged if it has errors.
- Expand contractions like "u" → "you", "ur" → "your", "pls/plz" → "please", "wanna" → "want to", "gonna" → "going to", "wit" → "with", "b" → "be".

INTERPRETATION (critical):
- Read the request the way an experienced Roblox developer would. Short nouns like "a city", "a tycoon", "a zombie game", "an obby", "a racing game", "a farm", "a dungeon", "a castle", "a mall", "a school", "a hospital", "an airport", "a prison", "a mansion", "an island", "a cafe", "a restaurant" already IMPLY the full expected build — infer and name what a player would recognize as that thing.
- For GAME / GENRE / SYSTEM / MAP / WORLD asks, EXPAND into an unambiguous multi-sentence brief that spells out: the world/map layout, core gameplay loop, required systems (spawns, HUD, currency, save, combat, shop, quests, rounds — only what the genre needs), visual/theme direction, Toolbox usage where appropriate, and PC + Mobile targeting.
- For NARROW single-item asks ("add a jump button", "insert a tree", "one heal script", "make a red part"), do NOT expand. Return a tight one-sentence brief and append "— only this, no extras, plus minimum required wiring."
- For SCRIPT / CODE / MECHANIC asks ("make a fly script", "double jump code", "speed boost script"), focus strictly on generating a clean, production-ready Luau script (placed in StarterPlayerScripts/ServerScriptService). Never request or mention Toolbox models for script requests.

Rewrite goals:
- Replace vague wording ("stuff", "thingy", "kinda", "some") with concrete Roblox-native vocabulary.
- Use strong developer verbs (build, spawn, wire, mount, configure, script, place, hook up, populate).
- Make subject, action, quantity, scope, and location explicit.
- Crisp professional voice — no fluff, no "amazing/awesome/epic", no emoji.

Scope discipline:
- Never invent a totally unrelated genre or mechanic.
- Never downscope a full-game/map ask into a single part.

Format:
- Plain prose. 1 sentence for narrow asks, 2-5 sentences for full-game / map / system asks.
- No bullets, no headers, no labels, no quotes, no code fences, no preamble ("Here is", "Improved:").
- Under 180 words.
- Output the polished prompt only.`;

// ── Massive typo / slang / chat-speak dictionary ─────────────────────────────
const TYPO_FIXES: Array<[RegExp, string]> = [
  // Roblox-specific
  [/\brblox\b/gi, "Roblox"],
  [/\broblx\b/gi, "Roblox"],
  [/\brolbox\b/gi, "Roblox"],
  [/\brbolox\b/gi, "Roblox"],
  [/\brolblox\b/gi, "Roblox"],
  [/\brobolx\b/gi, "Roblox"],
  [/\brobloxx\b/gi, "Roblox"],
  [/\bstudioo\b/gi, "Studio"],
  [/\btoolboxx\b/gi, "toolbox"],
  [/\btoolbxo\b/gi, "toolbox"],
  [/\bluaa\b/gi, "Lua"],
  [/\bluau\b/g, "Luau"],
  [/\bscritp\b/gi, "script"],
  [/\bscipt\b/gi, "script"],
  [/\bscirpt\b/gi, "script"],
  [/\bsript\b/gi, "script"],
  [/\bremoteevnt\b/gi, "RemoteEvent"],
  [/\bremoteevent\b/g, "RemoteEvent"],
  [/\blocalscirpt\b/gi, "LocalScript"],
  [/\bmodulescirpt\b/gi, "ModuleScript"],
  [/\bhumnaoid\b/gi, "Humanoid"],
  [/\bhumaniod\b/gi, "Humanoid"],
  [/\bworkspce\b/gi, "workspace"],
  [/\bworksapce\b/gi, "workspace"],
  [/\bstarterplayer\b/gi, "StarterPlayer"],
  [/\bdatastore\b/gi, "DataStore"],
  [/\bleaderstats\b/gi, "leaderstats"],
  [/\bgui\b/gi, "GUI"],
  [/\bhud\b/gi, "HUD"],
  [/\bnpc\b/gi, "NPC"],
  [/\bnpcs\b/gi, "NPCs"],
  [/\bai\b/gi, "AI"],
  [/\bfps\b/gi, "FPS"],
  [/\brng\b/gi, "RNG"],
  [/\bpvp\b/gi, "PvP"],
  [/\bpve\b/gi, "PvE"],
  [/\bmmo\b/gi, "MMO"],
  [/\brpg\b/gi, "RPG"],
  [/\btd\b/gi, "Tower Defense"],

  // Common English typos
  [/\beverythign\b/gi, "everything"],
  [/\banythign\b/gi, "anything"],
  [/\bsomethign\b/gi, "something"],
  [/\bnothign\b/gi, "nothing"],
  [/\bthign\b/gi, "thing"],
  [/\bthigns\b/gi, "things"],
  [/\bbiuld\b/gi, "build"],
  [/\bbulid\b/gi, "build"],
  [/\bmkae\b/gi, "make"],
  [/\bamke\b/gi, "make"],
  [/\bcreat\b/gi, "create"],
  [/\bcraete\b/gi, "create"],
  [/\bpelase\b/gi, "please"],
  [/\bplaese\b/gi, "please"],
  [/\bpelase\b/gi, "please"],
  [/\btehy\b/gi, "they"],
  [/\bteh\b/gi, "the"],
  [/\bhte\b/gi, "the"],
  [/\bwiht\b/gi, "with"],
  [/\bwtih\b/gi, "with"],
  [/\bandd\b/gi, "and"],
  [/\baswell\b/gi, "as well"],
  [/\balot\b/gi, "a lot"],
  [/\brecieve\b/gi, "receive"],
  [/\bseperate\b/gi, "separate"],
  [/\boccured\b/gi, "occurred"],
  [/\bdefinately\b/gi, "definitely"],
  [/\bwhcih\b/gi, "which"],
  [/\bfrom\b/g, "from"],
  [/\brally\b/gi, "really"],
  [/\bfriends?\b/gi, "friends"],

  // City / world spelling
  [/\bcitty\b/gi, "city"],
  [/\bciyt\b/gi, "city"],
  [/\bcyty\b/gi, "city"],
  [/\bcitys\b/gi, "cities"],
  [/\btwn\b/gi, "town"],
  [/\btonw\b/gi, "town"],
  [/\bhosptial\b/gi, "hospital"],
  [/\bhosipital\b/gi, "hospital"],
  [/\bcastel\b/gi, "castle"],
  [/\bcastl\b/gi, "castle"],
  [/\bcasle\b/gi, "castle"],
  [/\bmansi?on\b/gi, "mansion"],
  [/\bschool\b/gi, "school"],
  [/\bshcool\b/gi, "school"],
  [/\bshoool\b/gi, "school"],
  [/\brestraunt\b/gi, "restaurant"],
  [/\brestaraunt\b/gi, "restaurant"],
  [/\bresturant\b/gi, "restaurant"],
  [/\bairoport\b/gi, "airport"],
  [/\bstadion\b/gi, "stadium"],
  [/\bstaduim\b/gi, "stadium"],
  [/\bdungeon\b/gi, "dungeon"],
  [/\bdungon\b/gi, "dungeon"],
  [/\bfram\b/gi, "farm"],
  [/\bhosue\b/gi, "house"],
  [/\bhosues\b/gi, "houses"],
  [/\bbuidling\b/gi, "building"],
  [/\bbuildign\b/gi, "building"],
  [/\bbuidlings\b/gi, "buildings"],

  // Chat-speak → English (case-insensitive, then re-cased by sentence pass)
  [/\bplz\b/gi, "please"],
  [/\bpls\b/gi, "please"],
  [/\bthx\b/gi, "thanks"],
  [/\bty\b/gi, "thank you"],
  [/\bu\b/gi, "you"],
  [/\bur\b/gi, "your"],
  [/\bya\b/gi, "you"],
  [/\bwanna\b/gi, "want to"],
  [/\bgonna\b/gi, "going to"],
  [/\bgotta\b/gi, "have to"],
  [/\bkinda\b/gi, "somewhat"],
  [/\bsorta\b/gi, "somewhat"],
  [/\bdunno\b/gi, "don't know"],
  [/\bwit\b/gi, "with"],
  [/\bcuz\b/gi, "because"],
  [/\bbc\b/gi, "because"],
  [/\bidk\b/gi, "I don't know"],
  [/\bimo\b/gi, "in my opinion"],
  [/\bafaik\b/gi, "as far as I know"],
  [/\btbh\b/gi, "to be honest"],
  [/\brn\b/gi, "right now"],
  [/\btmrw\b/gi, "tomorrow"],
  [/\bbtw\b/gi, "by the way"],
  [/\bthru\b/gi, "through"],
  [/\btho\b/gi, "though"],
  [/\bltr\b/gi, "later"],
  [/\bomg\b/gi, "wow"],
  [/\blol\b/gi, ""],
  [/\blmao\b/gi, ""],
  [/\bhaha\b/gi, ""],
  [/\bxd\b/gi, ""],

  // Dedupe repeated tokens
  [/\b(and\s+everything)(\s+and\s+everything)+\b/gi, "$1"],
  [/\b(\w+)\s+\1\b/gi, "$1"],
];

// ── Normalize a raw prompt: fix casing/typos, collapse whitespace ────────────
function fixCommonTypos(input: string): string {
  let out = input;
  for (const [re, rep] of TYPO_FIXES) out = out.replace(re, rep);
  out = out.replace(/\s+([,.!?;:])/g, "$1").replace(/\s{2,}/g, " ").trim();
  return out;
}

// ── Genre synonym → canonical genre key ──────────────────────────────────────
type GenreKey =
  | "city" | "tycoon" | "obby" | "zombie" | "racing" | "simulator"
  | "dungeon" | "farm" | "castle" | "mansion" | "school" | "hospital"
  | "mall" | "restaurant" | "cafe" | "airport" | "prison" | "island"
  | "tower_defense" | "rpg" | "horror" | "fighting" | "shooter" | "roleplay"
  | "pet_sim" | "parkour" | "hangout" | "showcase" | "spaceship" | "arcade";

const GENRE_SYNONYMS: Record<GenreKey, RegExp> = {
  city: /\b(city|cities|citty|cyty|town|towns|tonw|twn|metropolis|downtown|urban|neighborhood|neighbourhood|suburb|district)\b/i,
  tycoon: /\b(tycoon|tycon|business sim|money game|dropper game)\b/i,
  obby: /\b(obby|obbies|obstacle course|parkour course|jumping puzzle|platformer)\b/i,
  zombie: /\b(zombie|zombies|zombi|undead|survival horror|zombie apocalypse)\b/i,
  racing: /\b(racing|race track|racetrack|racing game|car racing|drift game|kart(ing)?|drag race)\b/i,
  simulator: /\b(simulator|simulation|sim game|clicker|idle game|incremental)\b/i,
  dungeon: /\b(dungeon|dungeons|dungon|crypt|catacomb|labyrinth)\b/i,
  farm: /\b(farm|farms|farming|farmland|ranch|homestead)\b/i,
  castle: /\b(castle|castel|castl|medieval castle|kingdom|fortress|keep)\b/i,
  mansion: /\b(mansion|manor|estate|villa|chateau)\b/i,
  school: /\b(school|shcool|shoool|highschool|high school|university|college|academy|classroom)\b/i,
  hospital: /\b(hospital|hosptial|hosipital|clinic|medical center|er)\b/i,
  mall: /\b(mall|shopping mall|shopping center|shopping centre|plaza|arcade mall|outlet)\b/i,
  restaurant: /\b(restaurant|restraunt|resturant|diner|bistro|steakhouse|pizzeria)\b/i,
  cafe: /\b(cafe|café|coffee shop|bakery|coffeehouse)\b/i,
  airport: /\b(airport|airoport|airbase|terminal|runway)\b/i,
  prison: /\b(prison|jail|penitentiary|correctional)\b/i,
  island: /\b(island|isle|archipelago|tropical island|desert island)\b/i,
  tower_defense: /\b(tower defense|tower def|td game|defend the base|defense game)\b/i,
  rpg: /\b(rpg|role playing|role-playing|mmorpg|action rpg|jrpg)\b/i,
  horror: /\b(horror|scary game|haunted|creepy|spooky|ghost game)\b/i,
  fighting: /\b(fighting|fighter|brawler|combat game|arena fighter|pvp arena)\b/i,
  shooter: /\b(shooter|fps|tps|first person shooter|third person shooter|gun game|deathmatch)\b/i,
  roleplay: /\b(roleplay|rp game|life sim|life simulator|daycare|adopt|family game)\b/i,
  pet_sim: /\b(pet sim|pet simulator|pet game|hatching game|egg hatch|adopt me style)\b/i,
  parkour: /\b(parkour|freerun|freerunning|wall run|rooftop run)\b/i,
  hangout: /\b(hangout|chill game|social game|meetup|lobby game)\b/i,
  showcase: /\b(showcase|scenic|walk sim|walking simulator|environment showcase)\b/i,
  spaceship: /\b(spaceship|space station|space game|sci-fi ship|starship)\b/i,
  arcade: /\b(arcade|mini game|minigame|carnival|amusement park)\b/i,
};

const GENRE_EXPANSIONS: Record<GenreKey, string> = {
  city: "Build a massive playable city map with a gridded street layout, drivable roads, painted lane markings, sidewalks, streetlights and traffic props, a mix of residential and commercial buildings with enterable interiors, a central spawn plaza, a park block with benches and trees, day/night skybox and ambient city sound, mobile-friendly camera and controls, populated with safe free Roblox Toolbox assets — server-authoritative, no placeholders, no invented asset IDs.",
  tycoon: "Build a full solo tycoon plot with a claim pad, a dropper→conveyor→collector economy, upgrade buttons gated by cash, a leaderstats currency, DataStore save and load, a sellable stack, and a themed baseplate — server-authoritative, no placeholders, no invented asset IDs.",
  obby: "Build a full obby with 15+ progressively harder stages across a themed course, checkpoints between stages, a spawn lobby, a win zone with a reward, kill bricks and moving parts wired server-side, and a mobile-friendly jump button and camera — server-authoritative, no placeholders, no invented asset IDs.",
  zombie: "Build a zombie survival round with wave-based spawning, server-authoritative zombie AI that chases and damages players, a starter weapon, a health and ammo HUD, a round timer, and a themed map with cover — server-authoritative, no placeholders, no invented asset IDs.",
  racing: "Build a full racing experience with a closed drivable track, driveable vehicles, a lap counter, a timer, checkpoints, a spawn grid, a finish line, and a leaderboard HUD — server-authoritative, no placeholders, no invented asset IDs.",
  simulator: "Build a simulator loop with a clear gather action, a leaderstats currency that grows with each gather, an upgrade shop that boosts gather rate, a rebirth option for prestige, DataStore save and load, and a themed spawn area — server-authoritative, no placeholders, no invented asset IDs.",
  dungeon: "Build a full multi-room dungeon crawl with a torch-lit stone corridor layout, locked doors and keys, enemy NPCs with server-side AI, treasure chests with loot, a mini-boss chamber, a spawn hall, and a health HUD — server-authoritative, no placeholders, no invented asset IDs.",
  farm: "Build a full farm map with tilled crop plots, planting and harvesting interaction, a barn with livestock props, a farmhouse, storage silos, a currency and shop for seeds and produce, DataStore save and load, and a themed countryside skybox — server-authoritative, no placeholders, no invented asset IDs.",
  castle: "Build a full medieval castle map with stone outer walls, towers with battlements, a portcullis gatehouse, a courtyard, a great hall interior, throne room, banners, torch lighting, and a spawn plaza — server-authoritative, no placeholders, no invented asset IDs.",
  mansion: "Build a full multi-floor mansion with a grand foyer, staircases, bedrooms, kitchen, dining hall, library, ballroom, a landscaped exterior with gates and fountain, chandeliers and warm interior lighting, and a spawn at the front door — server-authoritative, no placeholders, no invented asset IDs.",
  school: "Build a full school map with classrooms containing desks and whiteboards, hallways with lockers, a gym, cafeteria, library, principal's office, main entrance with front lawn, and a spawn at the entrance — server-authoritative, no placeholders, no invented asset IDs.",
  hospital: "Build a full multi-floor hospital with a reception lobby, patient rooms with beds and monitors, an emergency room, operating rooms, a pharmacy, waiting area, elevators, and a spawn at the entrance — server-authoritative, no placeholders, no invented asset IDs.",
  mall: "Build a full multi-floor shopping mall with a central atrium, escalators, storefronts with signs and interiors, a food court with tables, restrooms, parking lot outside, and a spawn at the main entrance — server-authoritative, no placeholders, no invented asset IDs.",
  restaurant: "Build a full restaurant map with a dining room of tables and chairs, a bar counter, a working kitchen behind swinging doors, restrooms, a host stand at the entrance, warm interior lighting, and a spawn at the front door — server-authoritative, no placeholders, no invented asset IDs.",
  cafe: "Build a full cafe map with a counter with pastry display and espresso machines, small tables and chairs, cozy lighting, a chalkboard menu, restrooms, a storefront window, and a spawn at the entrance — server-authoritative, no placeholders, no invented asset IDs.",
  airport: "Build a full airport map with a terminal building containing check-in counters, seating gates, security lanes, baggage claim, control tower, taxiways and runway with parked aircraft, and a spawn at the entrance — server-authoritative, no placeholders, no invented asset IDs.",
  prison: "Build a full prison map with cell blocks and barred cells, guard towers, a fenced yard, cafeteria, warden's office, main gate, and a spawn inside a cell — server-authoritative, no placeholders, no invented asset IDs.",
  island: "Build a full tropical island map with sand beaches, palm trees, coral reef shallows, a jungle interior, a small dock, a hidden cave, ambient wave sound, day skybox, and a spawn on the beach — server-authoritative, no placeholders, no invented asset IDs.",
  tower_defense: "Build a full tower defense round with a fixed enemy path, wave-based enemy spawning with escalating difficulty, placeable towers with attack scripts, a currency earned per kill, a base with health, a round HUD, and a themed map — server-authoritative, no placeholders, no invented asset IDs.",
  rpg: "Build a full action RPG with a leveling system, XP HUD, hotbar with abilities, a themed hub town with NPCs and dialogue, quest givers, an enemy zone with mob spawns, DataStore save and load, and a mobile-friendly UI — server-authoritative, no placeholders, no invented asset IDs.",
  horror: "Build a full horror map with dim flickering lighting, fog, a haunted building interior with jump-scare triggers, ambient horror audio, a flashlight tool, and a spawn outside the building — server-authoritative, no placeholders, no invented asset IDs.",
  fighting: "Build a full fighting arena with a bounded stage, spawn corners, KO out-of-bounds detection, a round timer, health bars over players, a hit/damage combat system server-authoritative, and a mobile-friendly control scheme — server-authoritative, no placeholders, no invented asset IDs.",
  shooter: "Build a full shooter map with cover geometry, weapon pickups, ammo, a hit-scan gun system server-authoritative, a health and ammo HUD, team spawns, a scoreboard, and a mobile-friendly aim control — server-authoritative, no placeholders, no invented asset IDs.",
  roleplay: "Build a full roleplay map with a themed neighborhood or building set (houses, shops, roads), interior furniture, interactable jobs or props, a chat-friendly camera, DataStore save for owned items, and a central spawn plaza — server-authoritative, no placeholders, no invented asset IDs.",
  pet_sim: "Build a full pet simulator with an egg hatching zone, a rarity system, pets that follow the player, a leaderstats currency, an upgrade shop for stronger eggs, DataStore save and load, and a themed spawn area — server-authoritative, no placeholders, no invented asset IDs.",
  parkour: "Build a full parkour course with rooftop-to-rooftop routes, wall runs, ledges, climbable pipes, checkpoints, a timer, and a themed urban map — server-authoritative, no placeholders, no invented asset IDs.",
  hangout: "Build a full hangout map with a central lobby, seating areas, a music player, mini-games nearby, ambient lighting, chat-friendly camera, and a mobile-friendly UI — server-authoritative, no placeholders, no invented asset IDs.",
  showcase: "Build a full scenic showcase map with a walkable path through detailed themed environments, ambient audio, atmospheric lighting, PostProcessing effects, and a spawn at the entrance — server-authoritative, no placeholders, no invented asset IDs.",
  spaceship: "Build a full spaceship map with a bridge, corridors, crew quarters, engine room, cargo hold, an airlock, control panels, sci-fi lighting, and a spawn on the bridge — server-authoritative, no placeholders, no invented asset IDs.",
  arcade: "Build a full arcade map with themed mini-game booths, ticket rewards, a prize counter, neon lighting, ambient arcade audio, and a spawn at the entrance — server-authoritative, no placeholders, no invented asset IDs.",
};

function detectGenre(lower: string): GenreKey | null {
  for (const key of Object.keys(GENRE_SYNONYMS) as GenreKey[]) {
    if (GENRE_SYNONYMS[key].test(lower)) return key;
  }
  return null;
}

const NARROW_VERBS = /\b(add|insert|spawn|make|create|place|put|one|single|just|only)\b/i;
const NARROW_NOUNS = /\b(tree|house|car|sword|gun|pet|npc|road|chair|table|rock|bush|flower|door|window|sign|lamp|button|script|part|brick|block|prop|icon|texture|decal|sound|animation)\b/i;
const BIG_MARKERS = /\b(game|system|map|city|town|world|full|complete|entire|massive|huge|big|large|whole|tycoon|obby|zombie|racing|simulator|dungeon|farm|castle|mansion|school|hospital|mall|airport|prison|island|rpg|shooter|horror)\b/i;

function deterministicImprove(input: string): string {
  let cleaned = fixCommonTypos(input.trim().replace(/\s+/g, " ").replace(/^["'`]+|["'`]+$/g, ""));
  if (!cleaned) return "";
  cleaned = cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
  if (!/[.!?)]$/.test(cleaned)) cleaned += ".";
  const lower = cleaned.toLowerCase();

  const isScriptOrUIRequest = /\b(script|scripts|luau|code|localscript|modulescript|fly|fly script|double jump|sprint|dash|teleport|leaderstats|datastore|gui|ui|menu|main menu|loading screen|splash screen|button|buttons|hud|shop ui|inventory ui)\b/i.test(lower);
  const isNarrow = NARROW_VERBS.test(lower) && NARROW_NOUNS.test(lower) && !BIG_MARKERS.test(lower);
  if (!isNarrow) {
    const genre = detectGenre(lower);
    if (genre) return GENRE_EXPANSIONS[genre];
  }

  if (isScriptOrUIRequest) {
    if (!/clean|luau|script|ui|no extras/i.test(cleaned)) {
      cleaned = `${cleaned.replace(/[.!?]$/, "")} — clean working Luau code & responsive UI layout with proper animations, no extra 3D models.`;
    }
  } else if (isNarrow && !/toolbox|creator store|safe|free|public|no extras|just this/i.test(cleaned)) {
    cleaned = `${cleaned.replace(/[.!?]$/, "")} — just this requested item, no extras.`;
  }
  return cleaned;
}

export const improvePrompt = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => Input.parse(input))
  .handler(async ({ data }) => {
    const fallback = deterministicImprove(data.text);
    if (!fallback) return { ok: false as const, error: "empty" };
    const rawIn = data.text.trim();
    const rawInLower = rawIn.toLowerCase();
    const detectedGenre = detectGenre(rawInLower);
    const hasGenre = detectedGenre !== null || /\b(game|map|world|experience|place)\b/i.test(rawIn);

    function tooSimilar(a: string, b: string): boolean {
      const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9\s]/g, "").split(/\s+/).filter(Boolean);
      const aw = norm(a); const bw = norm(b);
      if (!aw.length || !bw.length) return false;
      const setA = new Set(aw);
      const overlap = bw.filter((w) => setA.has(w)).length;
      const ratio = overlap / Math.max(aw.length, bw.length);
      return ratio > 0.85 && bw.length <= aw.length + 3;
    }

    try {
      const { model } = getProviderModel(FALLBACK_MODEL_ID);
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort("Improve timed out"), 6000);
      const { text } = await generateText({
        model,
        system: IMPROVE_SYSTEM,
        prompt: data.text,
        temperature: 0.3,
        maxOutputTokens: 400,
        abortSignal: controller.signal,
      });
      clearTimeout(timeout);
      let cleaned = fixCommonTypos((text || "").trim().replace(/^["'`]+|["'`]+$/g, "").replace(/\s+\n/g, "\n"));
      cleaned = cleaned.replace(/^(improved prompt|here(?:'s| is)[^:]*|prompt)\s*[:\-–]\s*/i, "").trim();
      if (!cleaned || cleaned.length < 3) return { ok: true as const, text: fallback };
      if (cleaned.split(/\s+/).length > 220 || /\n\s*(goal|scope|systems|ui|world|polish|constraints)\s*:/i.test(cleaned)) {
        return { ok: true as const, text: fallback };
      }
      const cleanedWords = cleaned.split(/\s+/).length;
      if (hasGenre && cleanedWords < 25) return { ok: true as const, text: fallback };
      if (tooSimilar(rawIn, cleaned) && fallback.toLowerCase() !== rawInLower) {
        return { ok: true as const, text: fallback };
      }
      return { ok: true as const, text: cleaned };
    } catch {
      return { ok: true as const, text: fallback };
    }
  });

// ── ENHANCE: aggressive expander ────────────────────────────────────────────
const ENHANCE_SYSTEM = `You are a Roblox game design brief writer. Take a short or vague build request and rewrite it as a rich, developer-ready build brief the BloxSmith AI builder can plan against.

Expand ONLY along dimensions the user already implied:
- Genre / theme (if implied): name it explicitly.
- Core mechanics: 3-6 concrete gameplay verbs (collect, fight, race, build, trade, survive, craft, explore).
- Systems needed: name each (inventory, shop, combat, save/load, leaderboard, spawns, rounds) — only ones the mechanics require.
- UI needs: main menu style, HUD elements, panels — only if the mechanics need them.
- World scope: baseplate / arena / open map / obby lanes — pick sensible defaults for the genre.
- Polish targets: mobile-friendly UI, dark theme accent color, sound cues.
- Constraints: server-authoritative, no placeholders, no invented asset IDs, Toolbox assets allowed.

Rules:
- Preserve the user's exact intent. Do NOT add a totally unrelated genre or feature.
- If the user asked for a single small thing (one part, one script, one icon), DO NOT expand — return the original plus one clarifying constraint line.
- Keep the brief under 220 words. Use short labeled lines (Goal:, Genre:, Core loop:, Systems:, UI:, World:, Polish:, Constraints:).
- Output the brief only. No preamble, no markdown headers, no quotes.`;

export const enhancePrompt = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => Input.parse(input))
  .handler(async ({ data }) => {
    try {
      const { model } = getProviderModel(FALLBACK_MODEL_ID);
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort("Enhance timed out"), 4500);
      const { text } = await generateText({
        model,
        system: ENHANCE_SYSTEM,
        prompt: data.text,
        temperature: 0.4,
        maxOutputTokens: 500,
        abortSignal: controller.signal,
      });
      clearTimeout(timeout);
      const cleaned = (text || "").trim().replace(/^["'`]+|["'`]+$/g, "");
      if (!cleaned) return { ok: false as const, error: "empty" };
      return { ok: true as const, text: cleaned };
    } catch {
      const text = data.text.trim().replace(/\s+/g, " ");
      if (!text) return { ok: false as const, error: "empty" };
      const fallback = /\b(script|button|remoteevent|localscript|modulescript|part|tree|house|car|sword|gun|weapon|pet|npc)\b/i.test(text) && !/\b(game|system|full|complete)\b/i.test(text)
        ? `Goal: ${text}\nScope: Build only this requested item and the minimum required wiring.\nConstraints: No extra menus, HUDs, loading screens, unrelated systems, placeholders, or invented asset IDs.`
        : `Goal: ${text}\nCore loop: Make the requested Roblox experience playable and clear.\nSystems: Include only systems required by the request.\nUI: Add UI only when the request needs it.\nWorld: Use safe Toolbox assets for visual models when relevant, otherwise build clean Roblox geometry.\nConstraints: Server-authoritative where needed, no placeholders, no invented asset IDs, no unrelated extras.`;
      return { ok: true as const, text: fallback };
    }
  });
