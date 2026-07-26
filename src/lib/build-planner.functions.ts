// ============================================================================
// AI Build Planner — feature 1 of the BloxSmith top-5 roadmap.
// ----------------------------------------------------------------------------
// Given a user prompt + the current project context, ask the LLM to produce
// a short, structured "build plan" (steps + estimates) BEFORE any plugin
// action runs. The UI surfaces the plan so the user can edit/confirm/cancel.
// On confirm, executeBuildPlan returns a locked-in `finalPrompt` the client
// sends through the normal chat transport — keeping all the existing
// pipeline behaviour intact for execution.
// ============================================================================
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { generateText, Output } from "ai";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { getFallbackModel } from "@/lib/ai-gateway.server";
import { detectSingleAssetIntent } from "@/lib/roblox-toolbox.server";

const PlanInput = z.object({
  projectId: z.string().uuid(),
  prompt: z.string().min(3).max(4000),
});

const StepKind = z.enum([
  "terrain",
  "assets",
  "scripts",
  "ui",
  "npcs",
  "lighting",
  "systems",
  "audio",
  "polish",
  "other",
]);

const PlanStep = z.object({
  id: z.string().min(1).max(64),
  kind: StepKind,
  label: z.string().min(1).max(120),
  detail: z.string().max(400).default(""),
  assetQuery: z.string().max(120).optional().default(""),
  quantity: z.number().int().min(1).max(50).default(1),
  estCredits: z.number().int().min(0).max(200).default(2),
  estSeconds: z.number().int().min(1).max(120).default(8),
});
export type PlanStep = z.infer<typeof PlanStep>;

const PlanShape = z.object({
  title: z.string().min(1).max(120),
  summary: z.string().min(1).max(400),
  steps: z.array(PlanStep).min(1).max(20),
});

const UpdateInput = z.object({
  planId: z.string().uuid(),
  steps: z.array(PlanStep).max(20).optional(),
  status: z.enum(["pending", "running", "done", "cancelled"]).optional(),
});

const ExecuteInput = z.object({ planId: z.string().uuid() });
const SimpleId = z.object({ planId: z.string().uuid() });
const ListInput = z.object({ projectId: z.string().uuid() });

function shouldSkipPlanner(prompt: string): { skip: boolean; reason?: string } {
  const text = prompt.trim();
  if (text.length < 16) return { skip: true, reason: "prompt too short to plan" };
  if (detectSingleAssetIntent(text)) return { skip: true, reason: "single-asset request goes straight through" };
  return { skip: false };
}

function fallbackPlan(prompt: string) {
  return {
    title: prompt.slice(0, 80),
    summary: "Quick plan generated from your prompt.",
    steps: [
      {
        id: "build",
        kind: "systems" as const,
        label: "Build the request",
        detail: prompt.slice(0, 200),
        assetQuery: "",
        quantity: 1,
        estCredits: 6,
        estSeconds: 18,
      },
    ],
  };
}

const SYSTEM = `You are the BloxSmith Build Planner. Given a Roblox build request, produce a short, realistic plan the user can preview before any action runs.

Rules:
- Output 3–10 concrete steps, in execution order.
- Each step is one focused task (terrain, an asset insert group, a script system, a UI, a polish pass).
- Estimate credits (1–10 per step, realistic) and seconds (2–60 per step).
- Use plain user-facing language for label/detail — no JSON jargon, no action kind names.
- assetQuery: ONLY when the step inserts Toolbox/Creator-Store models. Short query string ("modern house", "low-poly tree"). Omit otherwise.
- quantity: how many of that asset to insert. 1 unless the user asked for more or a group obviously needs it.
- Do NOT pad with empty folders, placeholders, or "review the project" filler steps.
- Title: under 60 chars summarising the build.
- Summary: 1–2 sentences, plain English.`;

export const planBuild = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => PlanInput.parse(input))
  .handler(async ({ data, context }) => {
    const ctx = context as any;
    const { supabase, userId } = ctx;

    // Ownership check (RLS also enforces, this gives a friendlier error).
    const { data: project, error: pErr } = await supabase
      .from("projects")
      .select("id, name, description, game_type")
      .eq("id", data.projectId)
      .maybeSingle();
    if (pErr) throw new Error(pErr.message);
    if (!project) throw new Error("Project not found");

    const skip = shouldSkipPlanner(data.prompt);
    if (skip.skip) {
      return { ok: false as const, skipped: true as const, reason: skip.reason };
    }

    let plan: z.infer<typeof PlanShape>;
    let modelUsed = "fallback";
    try {
      const { model, meta, extraBody, modelSettings } = getFallbackModel();
      modelUsed = meta?.id ?? "lovable";
      const { experimental_output } = await generateText({
        model,
        system: SYSTEM,
        prompt: `Project: ${project.name}\nType: ${project.game_type ?? "unspecified"}\nDescription: ${project.description ?? "(none)"}\n\nUser request:\n${data.prompt}`,
        ...(extraBody ? { providerOptions: { nvidia: extraBody as Record<string, never> } as never } : {}),
        temperature: modelSettings?.temperature ?? 0.3,
        ...(modelSettings?.topP !== undefined ? { topP: modelSettings.topP } : {}),
        maxOutputTokens: Math.min(modelSettings?.maxOutputTokens ?? 900, 1200),
        experimental_output: Output.object({ schema: PlanShape }),
      });
      plan = experimental_output as z.infer<typeof PlanShape>;
    } catch (e) {
      // If structured output fails, fall back to a single-step plan rather
      // than failing the user's build attempt entirely.
      plan = fallbackPlan(data.prompt);
    }

    const steps = plan.steps.slice(0, 20).map((s, i) => ({
      ...s,
      id: s.id || `step_${i + 1}`,
    }));
    const estCredits = steps.reduce((n, s) => n + (s.estCredits ?? 0), 0);
    const estSeconds = steps.reduce((n, s) => n + (s.estSeconds ?? 0), 0);

    const { data: row, error } = await supabase
      .from("build_plans")
      .insert({
        project_id: data.projectId,
        user_id: userId,
        prompt: data.prompt,
        steps,
        est_credits: estCredits,
        est_seconds: estSeconds,
        status: "pending",
        model_used: modelUsed,
        notes: plan.summary,
      })
      .select()
      .single();
    if (error) throw new Error(error.message);

    return {
      ok: true as const,
      skipped: false as const,
      plan: {
        id: row.id as string,
        title: plan.title,
        summary: plan.summary,
        steps,
        estCredits,
        estSeconds,
        status: "pending" as const,
        prompt: data.prompt,
      },
    };
  });

export const updateBuildPlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => UpdateInput.parse(input))
  .handler(async ({ data, context }) => {
    const ctx = context as any;
    const { supabase, userId } = ctx;
    const patch: {
      steps?: PlanStep[];
      est_credits?: number;
      est_seconds?: number;
      status?: "pending" | "running" | "done" | "cancelled";
    } = {};
    if (data.steps) {
      patch.steps = data.steps;
      patch.est_credits = data.steps.reduce((n, s) => n + (s.estCredits ?? 0), 0);
      patch.est_seconds = data.steps.reduce((n, s) => n + (s.estSeconds ?? 0), 0);
    }
    if (data.status) patch.status = data.status;
    const { data: row, error } = await supabase
      .from("build_plans")
      .update(patch as any)
      .eq("id", data.planId)
      .eq("user_id", userId)
      .select()
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("Plan not found");
    return { ok: true as const, plan: row };
  });

export const cancelBuildPlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => SimpleId.parse(input))
  .handler(async ({ data, context }) => {
    const ctx = context as any;
    const { supabase, userId } = ctx;
    const { error } = await supabase
      .from("build_plans")
      .update({ status: "cancelled" })
      .eq("id", data.planId)
      .eq("user_id", userId);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

export const executeBuildPlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => ExecuteInput.parse(input))
  .handler(async ({ data, context }) => {
    const ctx = context as any;
    const { supabase, userId } = ctx;
    const { data: row, error } = await supabase
      .from("build_plans")
      .select("*")
      .eq("id", data.planId)
      .eq("user_id", userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("Plan not found");
    if (row.status !== "pending") throw new Error("Plan is not pending");

    const steps = (row.steps as PlanStep[]) ?? [];
    const lines = steps.map((s, i) => {
      const qty = s.quantity > 1 ? ` ×${s.quantity}` : "";
      const q = s.assetQuery ? ` (Toolbox query: "${s.assetQuery}")` : "";
      const detail = s.detail ? ` — ${s.detail}` : "";
      return `${i + 1}. [${s.kind}]${qty} ${s.label}${q}${detail}`;
    });
    const finalPrompt = `[APPROVED BUILD PLAN — execute these steps in order, do not invent extra work]\n\nOriginal request: ${row.prompt}\n\nPlan:\n${lines.join("\n")}\n\nRules:\n- Execute ONLY the steps above.\n- Use free authorized Toolbox/Creator-Store models for any asset insert; respect the quantity on each step.\n- Do not add steps, props, lights, decorations, or systems the plan did not ask for.\n- Finish with one organize_project + scan_project so the user can verify.`;

    await supabase
      .from("build_plans")
      .update({ status: "running", executed_at: new Date().toISOString() })
      .eq("id", data.planId)
      .eq("user_id", userId);

    return { ok: true as const, finalPrompt };
  });

export const getActiveBuildPlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => ListInput.parse(input))
  .handler(async ({ data, context }) => {
    const ctx = context as any;
    const { supabase, userId } = ctx;
    const { data: row, error } = await supabase
      .from("build_plans")
      .select("*")
      .eq("project_id", data.projectId)
      .eq("user_id", userId)
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return { ok: true as const, plan: row };
  });
