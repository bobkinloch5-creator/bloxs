// ============================================================================
// Auto Genius Mode — BloxSmith "Auto Build Perfect Game"
// ----------------------------------------------------------------------------
// One-button automation that:
//   1. Analyzes the user's game idea (type, complexity, features, scripts, UI).
//   2. Picks the best AI model for each task via model-router.
//   3. Generates a full build plan + quality targets.
//   4. Returns an enriched master prompt the existing agent pipeline runs end-to-end.
// The client then calls startAgentPipeline with the enriched prompt and displays
// the analysis (picked models + plan + quality criteria) alongside the live run.
// ============================================================================
import { createServerFn } from "@tanstack/react-start";
import { generateText } from "ai";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { getFallbackModel } from "@/lib/ai-gateway.server";
import { pickAllTaskModels, TASK_LABELS, type ModelPick } from "@/lib/model-router";

const Input = z.object({
  projectId: z.string().uuid(),
  idea: z.string().trim().min(3, "Tell us your game idea (at least a few words).").max(4000),
});

const AnalysisSchema = z.object({
  detectedType: z.string().describe("Short label: Obby, Tycoon, Simulator, FPS, RPG, Survival, Tower Defense, Roleplay, Story, Racing, Showcase, etc."),
  complexity: z.enum(["Tiny", "Small", "Medium", "Large", "Huge"]),
  estimatedScripts: z.number().int().min(0).max(40),
  features: z.array(z.string()).min(1).max(10).describe("Concrete gameplay features the game needs."),
  systems: z.array(z.string()).min(1).max(10).describe("Required systems: leaderstats, DataStore, RemoteEvents, combat, shop, quests, etc."),
  uiStyle: z.string().describe("UI style: Minimal, Cartoon, Neon, Retro, Realistic, etc."),
  assetCategories: z.array(z.string()).min(1).max(6).describe("Toolbox categories or asset themes to search."),
  buildPlan: z.array(z.string()).min(4).max(12).describe("Ordered build steps the pipeline will execute."),
  qualityCriteria: z.array(z.string()).min(3).max(8).describe("What 'shipped and high quality' means for this game."),
  predictedQualityScore: z.number().min(1).max(10),
});

export type AutoGeniusAnalysis = z.infer<typeof AnalysisSchema>;

export interface AutoGeniusResult {
  analysis: AutoGeniusAnalysis;
  modelPicks: ModelPick[];
  enrichedPrompt: string;
  modelUsed: string;
  usedFallback: boolean;
}

function buildEnrichedPrompt(idea: string, analysis: AutoGeniusAnalysis, picks: ModelPick[]): string {
  const pickLines = picks
    .map((p) => `  • ${TASK_LABELS[p.task]}: ${p.label} (${p.provider}) — ${p.reason}`)
    .join("\n");
  return [
    `AUTO GENIUS MODE — Auto Build Perfect Game`,
    ``,
    `USER IDEA:`,
    idea,
    ``,
    `DETECTED PROJECT PROFILE:`,
    `• Type: ${analysis.detectedType}`,
    `• Complexity: ${analysis.complexity}`,
    `• UI Style: ${analysis.uiStyle}`,
    `• Estimated scripts: ${analysis.estimatedScripts}`,
    `• Features: ${analysis.features.join(", ")}`,
    `• Systems: ${analysis.systems.join(", ")}`,
    `• Asset themes: ${analysis.assetCategories.join(", ")}`,
    ``,
    `AUTO-PICKED SPECIALIST MODELS (informational — current agent runs use the configured pipeline model):`,
    pickLines,
    ``,
    `BUILD PLAN (execute in order):`,
    ...analysis.buildPlan.map((s, i) => `  ${i + 1}. ${s}`),
    ``,
    `QUALITY TARGETS (the Critic must verify before scoring ≥ 8):`,
    ...analysis.qualityCriteria.map((c) => `  • ${c}`),
    ``,
    `EXECUTION RULES:`,
    `• Only insert safe, free, Toolbox-verified assets. Quarantine any scripts inside them.`,
    `• All Luau must be runnable — no stubs, no TODOs, no placeholder names.`,
    `• Place buildings on the ground, trees on grass, spawn near map center; nothing floating or underground.`,
    `• Wire every remote on both server and client. Anchor what should be anchored.`,
    `• Finish with a playtest + autofix + scan pass so the result is playable.`,
  ].join("\n");
}

export const runAutoGenius = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => Input.parse(input))
  .handler(async ({ data, context }): Promise<AutoGeniusResult> => {
    const ctx = context as any;
    // Verify project belongs to caller (RLS would also enforce, but explicit check = friendly error).
    try {
      const { data: project, error } = await ctx.supabase
        .from("projects")
        .select("id, name, game_type")
        .eq("id", data.projectId)
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (!project) throw new Error("Project not found — refresh the page and try again.");
    } catch (e) {
      throw new Error(
        `Couldn't load this project. ${e instanceof Error ? e.message : ""}`.trim(),
      );
    }

    const modelPicks = pickAllTaskModels();
    const { model, meta, extraBody, modelSettings } = getFallbackModel();

    let analysis: AutoGeniusAnalysis;
    try {
      const { text } = await generateText({
        model,
        system:
          "You are BloxSmith Auto Genius — a Roblox game architect. Read the user's idea and return ONLY a JSON object (no prose, no markdown, no code fences) matching the schema. Be concrete (no vague words like 'fun system' or 'good UI'). Tailor every field to THIS idea.\n\nSchema fields:\n- detectedType (string: Obby/Tycoon/Simulator/FPS/RPG/Survival/Tower Defense/Roleplay/Story/Racing/Showcase/etc.)\n- complexity (one of: Tiny, Small, Medium, Large, Huge)\n- estimatedScripts (integer 0-40)\n- features (array of 1-10 concrete strings)\n- systems (array of 1-10 strings: leaderstats, DataStore, RemoteEvents, combat, shop, quests, etc.)\n- uiStyle (string: Minimal/Cartoon/Neon/Retro/Realistic/etc.)\n- assetCategories (array of 1-6 strings)\n- buildPlan (array of 4-12 ordered step strings)\n- qualityCriteria (array of 3-8 strings — what 'shipped and high quality' means)\n- predictedQualityScore (number 1-10)",
        prompt: `User idea:\n${data.idea}\n\nReturn the JSON object now.`,
        ...(extraBody ? { providerOptions: { nvidia: extraBody as Record<string, never> } as never } : {}),
        ...(modelSettings?.temperature !== undefined ? { temperature: modelSettings.temperature } : {}),
        ...(modelSettings?.topP !== undefined ? { topP: modelSettings.topP } : {}),
        ...(modelSettings?.maxOutputTokens !== undefined ? { maxOutputTokens: Math.min(modelSettings.maxOutputTokens, 3000) } : {}),
        maxRetries: 1,
      });
      const cleaned = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/```$/i, "").trim();
      let parsed: unknown;
      try {
        parsed = JSON.parse(cleaned);
      } catch {
        // Try to extract the first {...} block as a recovery.
        const match = cleaned.match(/\{[\s\S]*\}/);
        if (!match) throw new Error("Model didn't return JSON.");
        parsed = JSON.parse(match[0]);
      }
      analysis = AnalysisSchema.parse(parsed);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (/402|credits/i.test(msg)) {
        throw new Error("AI credits exhausted — add credits to use Auto Genius Mode.");
      }
      if (/429|rate/i.test(msg)) {
        throw new Error("AI gateway is busy. Wait a moment and click Auto Build again.");
      }
      throw new Error(`Auto Genius couldn't analyze your idea. ${msg}`);
    }

    const enrichedPrompt = buildEnrichedPrompt(data.idea, analysis, modelPicks);

    return {
      analysis,
      modelPicks,
      enrichedPrompt,
      modelUsed: meta.label,
      usedFallback: false,
    };
  });
