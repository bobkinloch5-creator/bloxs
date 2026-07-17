// Silent internal build planner.
// Runs BEFORE the main streaming call for broad game/system requests.
// Produces a compact structured outline that gets injected into the system
// prompt so the main model builds coherently end-to-end (right folders,
// remotes, scripts, UI, and datastore hooks) instead of scattering parts.
//
// This is silent: no DB writes, no UI, no user approval. It's a
// deterministic guardrail — a mini architect that briefs the coder.

import { generateText, Output } from "ai";
import { z } from "zod";
import { getProviderModel } from "./ai-gateway.server";

const OutlineShape = z.object({
  gameName: z.string().max(80),
  genre: z.string().max(60),
  coreLoop: z.string().max(300),
  systems: z.array(z.object({
    name: z.string().max(60),
    role: z.enum(["gameplay", "ui", "world", "economy", "progression", "combat", "social", "other"]),
    files: z.array(z.string().max(80)).max(8),
  })).min(1).max(10),
  folders: z.object({
    workspace: z.array(z.string().max(60)).max(8),
    replicated: z.array(z.string().max(60)).max(8),
    serverScripts: z.array(z.string().max(60)).max(8),
    starterPlayerScripts: z.array(z.string().max(60)).max(8),
  }),
  remotes: z.array(z.string().max(60)).max(15),
  uiScreens: z.array(z.string().max(60)).max(8),
  needsDataStore: z.boolean(),
  spawnStrategy: z.string().max(160),
  keyDependencies: z.array(z.string().max(140)).max(10),
});

export type BuildOutline = z.infer<typeof OutlineShape>;

const SYSTEM = `You are the BloxSmith silent architect. Given a Roblox game build request, return a strict JSON outline of what to build. This outline drives another AI that emits Studio actions, so it must be concrete, minimal, and coherent.

Rules:
- systems: 3–8 real systems the game needs (e.g. "SpawnSystem", "CombatSystem", "ShopSystem", "SaveSystem"). Each with 1–4 file names in Roblox naming.
- folders: exact top-level folder names, one per system where useful.
- remotes: RemoteEvent/RemoteFunction names only; only what the systems actually wire.
- uiScreens: ScreenGui names actually needed to play (HUD, Shop, Menu, etc.).
- needsDataStore: true only if the genre implies persistence (levels, coins, unlocks, tycoon).
- spawnStrategy: one sentence — how players spawn and where.
- keyDependencies: cross-system contracts ("CombatSystem fires 'DealDamage' RemoteEvent handled by SpawnSystem.Health").
- Output ONLY the JSON, no prose.`;

export async function generateSilentOutline(userText: string, timeoutMs = 12000): Promise<BuildOutline | null> {
  try {
    // Use a fast model for the outline — this must not block the main build.
    const { model, meta, extraBody, modelSettings } = getProviderModel("nvidia/nemotron-nano-9b-v2");
    void meta;
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort("silent-planner timeout"), timeoutMs);
    try {
      const { experimental_output } = await generateText({
        model,
        system: SYSTEM,
        prompt: `User request:\n${userText.slice(0, 3000)}\n\nReturn the JSON outline now.`,
        abortSignal: ctrl.signal,
        temperature: 0.25,
        maxOutputTokens: Math.min(modelSettings?.maxOutputTokens ?? 900, 1100),
        ...(extraBody ? { providerOptions: { nvidia: extraBody as Record<string, never> } as never } : {}),
        experimental_output: Output.object({ schema: OutlineShape }),
      });
      return experimental_output as BuildOutline;
    } finally {
      clearTimeout(t);
    }
  } catch (err) {
    console.warn("[silent-planner] failed, continuing without outline:", err instanceof Error ? err.message : err);
    return null;
  }
}

export function outlineToPromptBlock(outline: BuildOutline): string {
  const lines: string[] = [];
  lines.push("=== APPROVED INTERNAL BUILD OUTLINE (follow this — it is the contract for this turn) ===");
  lines.push(`Game: ${outline.gameName}  |  Genre: ${outline.genre}`);
  lines.push(`Core loop: ${outline.coreLoop}`);
  lines.push("");
  lines.push("Systems (build every one — no partials):");
  for (const s of outline.systems) {
    lines.push(`  • ${s.name} [${s.role}] — files: ${s.files.join(", ") || "(auto)"}`);
  }
  lines.push("");
  lines.push("Folder structure (create these containers, place assets inside them — never Workspace root):");
  if (outline.folders.workspace.length) lines.push(`  Workspace/: ${outline.folders.workspace.join(", ")}`);
  if (outline.folders.replicated.length) lines.push(`  ReplicatedStorage/: ${outline.folders.replicated.join(", ")}`);
  if (outline.folders.serverScripts.length) lines.push(`  ServerScriptService/: ${outline.folders.serverScripts.join(", ")}`);
  if (outline.folders.starterPlayerScripts.length) lines.push(`  StarterPlayerScripts/: ${outline.folders.starterPlayerScripts.join(", ")}`);
  if (outline.remotes.length) {
    lines.push("");
    lines.push(`RemoteEvents/Functions (create in ReplicatedStorage/Remotes, wire on both sides): ${outline.remotes.join(", ")}`);
  }
  if (outline.uiScreens.length) {
    lines.push(`UI screens (ScreenGui + real controls, no placeholders): ${outline.uiScreens.join(", ")}`);
  }
  lines.push(`Spawn strategy: ${outline.spawnStrategy}`);
  if (outline.needsDataStore) {
    lines.push("Persistence: implement a SaveSystem ModuleScript in ServerScriptService using DataStoreService with pcall + retry.");
  }
  if (outline.keyDependencies.length) {
    lines.push("");
    lines.push("Cross-system contracts (all must be wired end-to-end):");
    for (const d of outline.keyDependencies) lines.push(`  - ${d}`);
  }
  lines.push("");
  lines.push("Build EVERY listed system, folder, remote, and screen in this same actions block. End with autofix_project then scan_project.");
  lines.push("=== END BUILD OUTLINE ===");
  return "\n\n" + lines.join("\n") + "\n";
}
