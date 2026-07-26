import { useState } from "react";
import { Sparkles, Hammer, MessageSquare, Lightbulb, Dices, ChevronRight, Wand2, Shield, Zap, ClipboardList } from "lucide-react";

export interface GameConcept {
  id: string;
  title: string;
  genre: "obby" | "tycoon" | "simulator" | "rpg" | "horror" | "racing" | "fps";
  genreLabel: string;
  tagline: string;
  description: string;
  difficulty: "Beginner" | "Intermediate" | "Advanced";
  buildPrompt: string;
  brainstormPrompt: string;
  planPrompt: string;
  icon: string;
}

export const GAME_CONCEPTS: GameConcept[] = [
  {
    id: "neon-obby",
    title: "Cyberpunk Lava Obby",
    genre: "obby",
    genreLabel: "Parkour / Obby",
    tagline: "50-Stage Neon Parkour with Lava Hazards & Leaderboards",
    description: "Multi-stage obstacle course with glowing neon platforms, moving lava lasers, checkpoint DataStore, and stage select ScreenGui.",
    difficulty: "Beginner",
    icon: "🧗",
    buildPrompt: "Build a complete 15-stage Cyberpunk Lava Obby with checkpoint DataStore, glowing neon platforms, kill brick lava hazards, stage select ScreenGui, and double-jump ability script.",
    brainstormPrompt: "Act as Lead Roblox Designer. Brainstorm a full Game Design Document for a Cyberpunk Lava Obby: stage progression, monetization (skip stage, double jump), pet trails, and UI structure.",
    planPrompt: "Act as Lead Roblox Architect. Create a step-by-step Technical Build Plan & System Architecture for a Cyberpunk Lava Obby: name all required Roblox Services, Folder hierarchy, RemoteEvents, ModuleScripts, ScreenGui layout, and step-by-step build sequence.",
  },
  {
    id: "sci-fi-tycoon",
    title: "Space Station Sci-Fi Tycoon",
    genre: "tycoon",
    genreLabel: "Tycoon & Factory",
    tagline: "Automated Energy Droppers, Upgrade Buttons & Cash Saved",
    description: "Modular tycoon engine with automatic metal droppers, conveyor belts, touch-buy buttons, cash leaderstats, and auto-save DataStore.",
    difficulty: "Intermediate",
    icon: "🏭",
    buildPrompt: "Build a complete Sci-Fi Space Station Tycoon with metal droppers, conveyor belt, collector bin, touch-purchase buttons for upgrades, leaderstats cash, and DataStore auto-save.",
    brainstormPrompt: "Act as Lead Roblox Architect. Brainstorm a full modular Tycoon game design: dropper upgrades, rebirthing multiplier math, weapon armory unlocks, and UI layout.",
    planPrompt: "Act as Lead Roblox Architect. Plan the complete technical architecture for a Sci-Fi Tycoon: ServerScriptService modules, ReplicatedStorage Remotes, TouchButton collision math, and DataStore saving.",
  },
  {
    id: "pet-simulator",
    title: "Crystal Pet Hatching Simulator",
    genre: "simulator",
    genreLabel: "Simulator & Pets",
    tagline: "Click-to-Mine Crystals, Egg Hatching & Pet Equip System",
    description: "Clicking/Mining simulator featuring crystal nodes, egg hatching animation, pet inventory ScreenGui, follower pet scripts, and rebirths.",
    difficulty: "Advanced",
    icon: "🐶",
    buildPrompt: "Build a Crystal Mining Pet Simulator with interactive mining nodes, egg hatching UI, pet follower script, inventory ScreenGui, multiplier rebirthing, and leaderstats.",
    brainstormPrompt: "Act as Lead Roblox Game Designer. Brainstorm a Pet Simulator game loops: gacha odds, pet combining mechanics, zone progression, and monetization passes.",
    planPrompt: "Act as Lead Roblox Architect. Plan the full architecture for a Pet Hatching Simulator: PetInventory DataStore, Lerp follower movement, Hatching UI state machine, and Rebirth math.",
  },
  {
    id: "dungeon-rpg",
    title: "Elemental Dungeon Crawler RPG",
    genre: "rpg",
    genreLabel: "RPG & Dungeon",
    tagline: "Class Abilities, Boss Spawns, XP Leveling & Inventory",
    description: "Action RPG with Mage/Warrior class selection, melee/magic skill cooldowns, enemy NPC AI pathfinding, boss fight arena, and loot drop DataStore.",
    difficulty: "Advanced",
    icon: "⚔️",
    buildPrompt: "Build an Elemental Dungeon RPG with Mage and Warrior class abilities, enemy mob AI pathfinding, XP leveling system, boss arena trigger, and loot inventory UI.",
    brainstormPrompt: "Act as Lead Roblox RPG Designer. Brainstorm class skill trees, combat damage math, boss attack patterns, dungeon procedural rooms, and gear progression.",
    planPrompt: "Act as Lead Roblox Architect. Plan the full system architecture for an Elemental RPG: SkillCooldown module, PathfindingService enemy AI, Hitbox server validation, and Loot DataStore.",
  },
  {
    id: "backrooms-horror",
    title: "Backrooms Entity Survival Horror",
    genre: "horror",
    genreLabel: "Horror & Escape",
    tagline: "Procedural Yellow Hallways, Stalker Entity AI & Flashlight",
    description: "Atmospheric horror game with battery-draining flashlight, flickering fluorescent lights, creature pathfinding AI, proximity keys, and ambient soundscapes.",
    difficulty: "Intermediate",
    icon: "👻",
    buildPrompt: "Build a Backrooms Horror Escape game with flashlight toggle script, battery pickable items, stalker NPC entity AI, door key lock system, and eerie atmosphere lighting.",
    brainstormPrompt: "Act as Lead Roblox Horror Game Designer. Brainstorm terror mechanics, entity AI behavior trees, atmospheric sound design, puzzle room keys, and jump-scare timing.",
    planPrompt: "Act as Lead Roblox Architect. Plan the full architecture for a Backrooms Horror game: SoundService atmosphere triggers, Flashlight battery timer, Entity line-of-sight AI, and Inventory keys.",
  },
  {
    id: "fps-arena",
    title: "Futuristic Laser Tag Arena FPS",
    genre: "fps",
    genreLabel: "FPS & Combat",
    tagline: "Raycast Ray Guns, Team Deathmatch & Kill Feed UI",
    description: "Fast-paced shooter with laser raycasting guns, health regen, team spawning (Red vs Blue), kill counter feed ScreenGui, and round timer.",
    difficulty: "Intermediate",
    icon: "🎯",
    buildPrompt: "Build a Laser Tag FPS Arena with raycast laser guns, ammo reload mechanics, Team Red vs Blue spawning, kill feed ScreenGui, round timer, and score leaderstats.",
    brainstormPrompt: "Act as Lead Roblox Shooter Designer. Brainstorm gun weapon balancing, map sightlines, game modes (CTF, TDM, Domination), and killstreak rewards.",
    planPrompt: "Act as Lead Roblox Architect. Plan the technical architecture for a Laser FPS: Raycast gun module, TeamSpawn manager, KillFeed ScreenGui, and Server-authoritative hit validation.",
  },
  {
    id: "hyper-racing",
    title: "Cyber City Vehicle Racing",
    genre: "racing",
    genreLabel: "Racing & Vehicles",
    tagline: "Chassis Car Physics, Lap Timers & Garage Customization",
    description: "High-speed racing game with vehicle spawner, lap checkpoint system, speedometer UI, nitrous boost ability, and race win rewards.",
    difficulty: "Intermediate",
    icon: "🏎️",
    buildPrompt: "Build a Cyber Vehicle Racing Game with vehicle spawner garage UI, lap checkpoint detector, speedometer ScreenGui, nitro boost script, and race result leaderboard.",
    brainstormPrompt: "Act as Lead Roblox Racing Game Designer. Brainstorm drift physics, car customization garage system, track hazard mechanics, and multiplayer matchmaking.",
    planPrompt: "Act as Lead Roblox Architect. Plan the full technical architecture for a Racing Game: VehicleSeat handling, Checkpoint sequence validator, Speedometer UI renderer, and LapTimer DataStore.",
  },
];

interface Props {
  onSelectBuild: (prompt: string) => void;
  onSelectBrainstorm: (prompt: string) => void;
  onSelectPlan: (prompt: string) => void;
  busy?: boolean;
  compact?: boolean;
}

export function GameBrainstormer({ onSelectBuild, onSelectBrainstorm, onSelectPlan, busy = false, compact = false }: Props) {
  const [selectedGenre, setSelectedGenre] = useState<string>("all");
  const [customIdea, setCustomIdea] = useState("");

  const genres = [
    { id: "all", label: "✨ All Genres" },
    { id: "obby", label: "🧗 Obby / Parkour" },
    { id: "tycoon", label: "🏭 Tycoon" },
    { id: "simulator", label: "⚡ Simulator" },
    { id: "rpg", label: "⚔️ RPG" },
    { id: "horror", label: "👻 Horror" },
    { id: "fps", label: "🎯 FPS" },
    { id: "racing", label: "🏎️ Racing" },
  ];

  const filteredConcepts = selectedGenre === "all"
    ? GAME_CONCEPTS
    : GAME_CONCEPTS.filter((c) => c.genre === selectedGenre);

  const handleCustomPlan = () => {
    if (!customIdea.trim()) return;
    const prompt = `Act as Lead Roblox Architect. Create a comprehensive, step-by-step Technical Build Plan & System Architecture for this game idea: "${customIdea.trim()}". List all required Roblox Services, Folder structure, RemoteEvents, ModuleScripts, ScreenGui layout, and step-by-step build sequence.`;
    onSelectPlan(prompt);
  };

  const handleCustomBrainstorm = () => {
    if (!customIdea.trim()) return;
    const prompt = `Act as Lead Roblox Architect & Designer. Help me brainstorm a complete, high-engagement Roblox game based on this idea: "${customIdea.trim()}". Detail the core loop, required Studio scripts/services, ScreenGui layout, monetization features, and step-by-step build roadmap.`;
    onSelectBrainstorm(prompt);
  };

  const handleCustomBuild = () => {
    if (!customIdea.trim()) return;
    const prompt = `Build a complete Roblox game based on this idea: "${customIdea.trim()}". Include all necessary ServerScripts, LocalScripts, ScreenGui interface, leaderstats, DataStore saving, and map environment setup.`;
    onSelectBuild(prompt);
  };

  return (
    <div className="rounded-2xl border border-indigo-500/30 bg-gradient-to-b from-[#11112e] via-[#0d0d26] to-[#09091a] p-4 sm:p-5 shadow-[0_0_40px_rgba(79,70,229,0.2)]">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-indigo-500/20 pb-3 mb-4">
        <div className="flex items-center gap-2">
          <div className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-cyan-500/20 to-indigo-500/20 border border-cyan-400/40 text-cyan-300 shadow-[0_0_15px_rgba(34,211,238,0.2)]">
            <Lightbulb className="h-5 w-5 text-amber-300 animate-pulse" />
          </div>
          <div>
            <h3 className="text-base font-black text-white tracking-wide flex items-center gap-2">
              Game Brainstormer & One-Tap Builder
              <span className="rounded-full bg-cyan-400/15 border border-cyan-400/30 px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wider text-cyan-300">
                AI Architect & Planner
              </span>
            </h3>
            <p className="text-xs text-slate-400">
              Brainstorm game concepts, generate an architectural plan, or click <strong className="text-cyan-300">Build</strong> to construct it live in Studio!
            </p>
          </div>
        </div>
      </div>

      {/* Custom Idea Input */}
      <div className="mb-4 rounded-xl border border-indigo-500/25 bg-black/40 p-2.5">
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1">
            <input
              type="text"
              value={customIdea}
              onChange={(e) => setCustomIdea(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleCustomBuild(); }}
              placeholder="Have a custom game idea? e.g. 'Underwater Pirate Treasure Hunt'..."
              className="w-full rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-xs text-white placeholder:text-slate-500 outline-none focus:border-cyan-400 focus:bg-white/[0.08] transition"
            />
          </div>
          <div className="flex flex-wrap gap-1.5 shrink-0">
            <button
              type="button"
              onClick={handleCustomPlan}
              disabled={!customIdea.trim() || busy}
              className="inline-flex items-center gap-1.5 rounded-lg border border-cyan-400/40 bg-cyan-500/20 px-2.5 py-2 text-xs font-extrabold text-cyan-200 hover:bg-cyan-500/35 hover:border-cyan-400 disabled:opacity-40 disabled:cursor-not-allowed transition"
              title="Ask AI to create a complete step-by-step Technical Build Plan"
            >
              <ClipboardList className="h-3.5 w-3.5 text-cyan-300" />
              Plan Architecture
            </button>
            <button
              type="button"
              onClick={handleCustomBrainstorm}
              disabled={!customIdea.trim() || busy}
              className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-400/40 bg-indigo-500/20 px-2.5 py-2 text-xs font-bold text-indigo-200 hover:bg-indigo-500/35 hover:border-indigo-400 disabled:opacity-40 disabled:cursor-not-allowed transition"
              title="Ask AI to brainstorm full Game Design Document & mechanics for this custom idea"
            >
              <MessageSquare className="h-3.5 w-3.5 text-indigo-300" />
              Brainstorm
            </button>
            <button
              type="button"
              onClick={handleCustomBuild}
              disabled={!customIdea.trim() || busy}
              className="inline-flex items-center gap-1.5 rounded-lg border border-cyan-400/50 bg-gradient-to-r from-indigo-600 to-cyan-600 px-3 py-2 text-xs font-black text-white shadow-[0_0_15px_rgba(34,211,238,0.3)] hover:brightness-110 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed transition"
              title="Build this custom game idea immediately in Roblox Studio!"
            >
              <Hammer className="h-3.5 w-3.5 text-amber-300" />
              ⚡ Build
            </button>
          </div>
        </div>
      </div>

      {/* Genre Pills */}
      <div className="mb-4 flex flex-wrap gap-1.5">
        {genres.map((g) => (
          <button
            key={g.id}
            type="button"
            onClick={() => setSelectedGenre(g.id)}
            className={`rounded-lg px-2.5 py-1 text-xs font-extrabold transition ${
              selectedGenre === g.id
                ? "border border-cyan-400/60 bg-cyan-400/20 text-cyan-200 shadow-[0_0_12px_rgba(34,211,238,0.25)]"
                : "border border-white/10 bg-white/[0.03] text-slate-400 hover:text-white hover:bg-white/[0.08]"
            }`}
          >
            {g.label}
          </button>
        ))}
      </div>

      {/* Concept Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {filteredConcepts.map((concept) => (
          <div
            key={concept.id}
            className="group relative flex flex-col justify-between rounded-xl border border-indigo-500/20 bg-black/40 p-3.5 transition hover:border-indigo-400/50 hover:bg-indigo-950/20"
          >
            <div>
              <div className="flex items-center justify-between gap-2 mb-1">
                <div className="flex items-center gap-2">
                  <span className="text-xl">{concept.icon}</span>
                  <h4 className="text-sm font-extrabold text-white group-hover:text-cyan-300 transition">
                    {concept.title}
                  </h4>
                </div>
                <span className="rounded bg-white/10 px-1.5 py-0.5 text-[10px] font-semibold text-slate-300">
                  {concept.difficulty}
                </span>
              </div>
              <p className="text-[11px] font-semibold text-indigo-300/90 mb-1.5">
                {concept.tagline}
              </p>
              <p className="text-[11.5px] text-slate-400 leading-relaxed mb-3">
                {concept.description}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-white/5">
              <button
                type="button"
                onClick={() => onSelectPlan(concept.planPrompt)}
                disabled={busy}
                className="flex-1 inline-flex items-center justify-center gap-1 rounded-lg border border-cyan-400/30 bg-cyan-500/15 py-1.5 px-2 text-[10.5px] font-extrabold text-cyan-200 hover:bg-cyan-500/30 hover:border-cyan-400 transition disabled:opacity-40 disabled:cursor-not-allowed"
                title="Generate complete step-by-step Technical Build Plan & System Architecture"
              >
                <ClipboardList className="h-3 w-3 text-cyan-300" />
                Plan Architecture
              </button>
              <button
                type="button"
                onClick={() => onSelectBrainstorm(concept.brainstormPrompt)}
                disabled={busy}
                className="flex-1 inline-flex items-center justify-center gap-1 rounded-lg border border-indigo-400/30 bg-indigo-500/15 py-1.5 px-2 text-[10.5px] font-extrabold text-indigo-200 hover:bg-indigo-500/30 hover:border-indigo-400 transition disabled:opacity-40 disabled:cursor-not-allowed"
                title="Brainstorm detailed GDD, mechanics, and design in Chat Mode"
              >
                <MessageSquare className="h-3 w-3 text-indigo-300" />
                Brainstorm
              </button>
              <button
                type="button"
                onClick={() => onSelectBuild(concept.buildPrompt)}
                disabled={busy}
                className="w-full sm:w-auto flex-1 inline-flex items-center justify-center gap-1 rounded-lg border border-cyan-400/50 bg-gradient-to-r from-indigo-600 via-indigo-500 to-cyan-500 py-1.5 px-2 text-[10.5px] font-black text-white shadow-[0_0_15px_rgba(99,102,241,0.3)] hover:brightness-110 active:scale-95 transition disabled:opacity-40 disabled:cursor-not-allowed"
                title="Immediately build all scripts, UI, and parts in Roblox Studio!"
              >
                <Hammer className="h-3 w-3 text-amber-300" />
                ⚡ Build Game
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
