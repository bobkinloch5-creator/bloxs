// Smart Brain — BloxSmith's intelligent pre-generation pipeline.
//
// Instead of piping the user prompt straight to a single model, this
// orchestrator runs a 6-stage plan-then-build pipeline:
//   1. Intent analysis                          (fast model)
//   2. Context retrieval (scene + memory + chat)
//   3. Architecture planning                     (planner model)
//   4. Specialist routing + parallel drafts      (per-task models)
//   5. Merge + validate + dedupe                 (deterministic)
//   6. Emit an enriched build directive          (returned to caller)
//
// The build directive is a compressed, high-signal instruction packet the
// existing chat executor consumes as its user turn — so the final Luau/UI
// generation still runs through the normal action-emitting pipeline, but
// with a real plan, real specialist context, and real project awareness.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { generateText } from "ai";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { getProviderModel, getPlannerModel, getFallbackModel } from "./ai-gateway.server";
import { summarizeSceneScan } from "./scene-digest.server";
import { pickModelForTask, estimateDifficulty, TASK_LABELS, type AutoTask } from "./model-router";
import { safeJsonParse } from "./safe-json";

const Input = z.object({
  projectId: z.string().uuid(),
  goal: z.string().min(3).max(4000),
});

type Intent = {
  summary: string;
  category:
    | "world_build"
    | "scripting"
    | "ui"
    | "gameplay_system"
    | "polish"
    | "bugfix"
    | "asset_search"
    | "mixed";
  complexity: "trivial" | "small" | "medium" | "large";
  systems: string[];
  needs: AutoTask[];
  risks: string[];
};

type Specialist = {
  task: AutoTask;
  label: string;
  modelId: string;
  modelLabel: string;
  reason: string;
  notes: string;
};

type BrainResult = {
  ok: true;
  intent: Intent;
  contextSummary: string;
  plan: string;
  specialists: Specialist[];
  directive: string;
  confidence: number;
  ranMs: number;
};

const INTENT_SYSTEM = `You are the BloxSmith Intent Router.
Classify a Roblox developer's build request into a strict JSON object.
Return ONLY JSON, no prose. Shape:
{
  "summary": "one sentence restating what the user actually wants",
  "category": "world_build"|"scripting"|"ui"|"gameplay_system"|"polish"|"bugfix"|"asset_search"|"mixed",
  "complexity": "trivial"|"small"|"medium"|"large",
  "systems": ["shop","inventory","npcs", ...],
  "needs": ["planning","scripting","ui","assets","bugfix","performance","testing","shortedit"],
  "risks": ["short risk phrases"]
}
Rules:
- "needs" MUST be a subset of the exact strings listed above.
- Trivial edits use ["shortedit"]. Bug reports use ["bugfix","testing"].
- Full games or multi-system builds use ["planning","scripting","ui","assets","performance","testing"].
- Never invent categories.`;

const PLAN_SYSTEM = `You are the BloxSmith Architect.
Given a Roblox project's current state and a user goal, produce a concise architecture plan
an experienced Roblox developer would follow. Output plain text with these labeled sections
(no markdown headings, use ALL-CAPS labels):

GOAL: one sentence.
ARCHITECTURE: 3-6 bullet lines describing services, folders, remotes, modules, boundaries.
BUILD ORDER: numbered list of ordered steps (1., 2., 3., ...). Each step is a single actionable line.
EXISTING TO REUSE: bullet lines naming exact paths from the scene digest to modify, or "(none)".
NEW TO CREATE: bullet lines of new instances/systems, or "(none)".
RISKS: bullet lines of failure modes to guard against.
DONE-WHEN: 3-6 bullet lines describing observable success criteria in Studio.

Rules:
- Reference real instance paths from the scene digest whenever possible.
- Never propose duplicating a system that already exists — extend it instead.
- Keep total output under 900 words.`;

const SPECIALIST_SYSTEM = `You are a BloxSmith specialist model. Produce a short, high-signal
brief (max 12 lines) covering ONLY your specialty for the given goal. Do NOT emit action JSON,
do NOT emit code fences, do NOT restate the plan. Be concrete: name services, properties,
paths, Toolbox categories, or API idioms the executor should use.`;

const SPECIALIST_TOPIC: Record<AutoTask, string> = {
  planning: "high-level Roblox architecture decisions",
  scripting: "Luau scripts, RemoteEvents, ModuleScripts, and script placement",
  ui: "ScreenGui structure, UDim2 layout, mobile-safe sizing, and button wiring",
  assets: "safe Roblox Creator Store / Toolbox asset categories and search queries",
  bugfix: "identifying root causes and safe corrective edits",
  performance: "part budget, unanchored risk, StreamingEnabled, loops, and mobile FPS",
  testing: "auto-test checks to run after the build",
  shortedit: "the smallest safe edit that satisfies the request",
  vision: "reading screenshots or thumbnails for visual verification",
};

async function analyzeIntent(goal: string): Promise<Intent> {
  const fb = getFallbackModel();
  const { text } = await generateText({
    model: fb.model,
    system: INTENT_SYSTEM,
    prompt: goal.slice(0, 2000),
    temperature: 0,
    maxOutputTokens: 400,
  });
  const parsed = safeJsonParse<Partial<Intent>>(text, {});
  const allowedNeeds: AutoTask[] = [
    "planning", "scripting", "ui", "assets", "bugfix",
    "performance", "testing", "shortedit",
  ];
  const needs = (Array.isArray(parsed.needs) ? parsed.needs : [])
    .filter((n: unknown): n is AutoTask => (allowedNeeds as string[]).includes(String(n)));
  return {
    summary: String(parsed.summary ?? goal.slice(0, 200)),
    category: (parsed.category as Intent["category"]) ?? "mixed",
    complexity: (parsed.complexity as Intent["complexity"]) ?? "medium",
    systems: Array.isArray(parsed.systems) ? parsed.systems.slice(0, 12).map(String) : [],
    needs: needs.length ? needs : ["planning", "scripting"],
    risks: Array.isArray(parsed.risks) ? parsed.risks.slice(0, 6).map(String) : [],
  };
}

async function retrieveContext(sb: any, projectId: string) {
  const [projectRes, sessionRes, memoryRes, chatRes] = await Promise.all([
    sb.from("projects")
      .select("id, name, description, game_type, prompt")
      .eq("id", projectId).maybeSingle(),
    sb.from("plugin_sessions")
      .select("last_scan, last_seen_at")
      .eq("project_id", projectId)
      .order("last_seen_at", { ascending: false })
      .limit(1).maybeSingle(),
    sb.from("project_memory")
      .select("key, value, kind, importance")
      .eq("project_id", projectId)
      .order("importance", { ascending: false })
      .order("updated_at", { ascending: false })
      .limit(20),
    sb.from("project_chat_messages")
      .select("role, content, created_at")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false })
      .limit(10),
  ]);

  const project = projectRes.data;
  const digest = summarizeSceneScan(sessionRes.data?.last_scan);
  const memories = (memoryRes.data ?? []) as Array<{ key: string; value: string; kind: string; importance: number }>;
  const chat = ((chatRes.data ?? []) as Array<{ role: string; content: string }>).reverse();

  const memoryText = memories.length
    ? memories.slice(0, 12).map((m) => `- [${m.kind}·${m.importance}] ${m.key}: ${String(m.value).slice(0, 300)}`).join("\n")
    : "(no persistent memory yet)";

  const chatText = chat.length
    ? chat.slice(-6).map((m) => `${m.role.toUpperCase()}: ${String(m.content).slice(0, 260)}`).join("\n")
    : "(no prior chat this project)";

  const projText = project
    ? `Name: ${project.name}\nType: ${project.game_type ?? "custom"}\nDescription: ${(project.description ?? "").slice(0, 300)}\nOriginal prompt: ${(project.prompt ?? "").slice(0, 300)}`
    : "(project metadata unavailable)";

  const contextSummary = [
    `PROJECT\n${projText}`,
    `SCENE DIGEST\n${digest.text}`,
    `PROJECT MEMORY\n${memoryText}`,
    `RECENT CHAT\n${chatText}`,
  ].join("\n\n");

  return { project, digest, memories, chat, contextSummary };
}

async function generatePlan(goal: string, contextSummary: string, intent: Intent): Promise<string> {
  const planner = getPlannerModel();
  const { text } = await generateText({
    model: planner.model,
    system: PLAN_SYSTEM,
    prompt: `USER GOAL:\n${goal}\n\nCLASSIFIED INTENT:\n${JSON.stringify(intent)}\n\nPROJECT CONTEXT:\n${contextSummary.slice(0, 6000)}`,
    ...(planner.extraBody ? { providerOptions: { nvidia: planner.extraBody as Record<string, never> } as never } : {}),
    temperature: planner.modelSettings?.temperature ?? 0.2,
    ...(planner.modelSettings?.topP !== undefined ? { topP: planner.modelSettings.topP } : {}),
    maxOutputTokens: Math.min(planner.modelSettings?.maxOutputTokens ?? 1400, 2200),
  });
  return text.trim();
}

// Critique the plan and re-plan once if the score is low. Cheap: one small call.
async function critiquePlan(goal: string, plan: string): Promise<{ score: number; gaps: string[]; note: string }> {
  const fb = getFallbackModel();
  try {
    const { text } = await generateText({
      model: fb.model,
      system: `You are a senior Roblox tech lead reviewing a build plan. Return ONLY JSON: {"score": 1-10, "gaps": ["short gap phrases"], "note": "one sentence verdict"}. Score reflects: coverage of the goal, correct folder/service placement, security (server-authoritative), completeness (config, remotes, UI). No prose outside JSON.`,
      prompt: `GOAL:\n${goal.slice(0, 800)}\n\nPLAN:\n${plan.slice(0, 4000)}`,
      temperature: 0,
      maxOutputTokens: 260,
    });
    const parsed = safeJsonParse<{ score?: number; gaps?: string[]; note?: string }>(text, {});
    const rawScore = Number(parsed.score ?? 7);
    const score = Number.isFinite(rawScore) ? Math.max(1, Math.min(10, rawScore)) : 7;
    return {
      score,
      gaps: Array.isArray(parsed.gaps) ? parsed.gaps.slice(0, 5).map(String) : [],
      note: String(parsed.note ?? "").slice(0, 240),
    };
  } catch {
    return { score: 7, gaps: [], note: "(critique unavailable)" };
  }
}

async function runSpecialist(task: AutoTask, goal: string, plan: string, digestText: string, difficulty: "easy" | "normal" | "hard" = "normal"): Promise<Specialist> {
  const pick = pickModelForTask(task, difficulty);
  const { model, meta, extraBody, modelSettings } = getProviderModel(pick.modelId);
  let notes = "";
  try {
    const { text } = await generateText({
      model,
      system: `${SPECIALIST_SYSTEM}\nSpecialty: ${SPECIALIST_TOPIC[task]}.`,
      prompt: `GOAL:\n${goal}\n\nPLAN:\n${plan.slice(0, 3000)}\n\nSCENE:\n${digestText.slice(0, 2500)}`,
      ...(extraBody ? { providerOptions: { nvidia: extraBody as Record<string, never> } as never } : {}),
      temperature: modelSettings?.temperature ?? 0.25,
      ...(modelSettings?.topP !== undefined ? { topP: modelSettings.topP } : {}),
      maxOutputTokens: Math.min(modelSettings?.maxOutputTokens ?? 500, 900),
    });
    notes = text.trim();
  } catch (err: any) {
    notes = `(specialist unavailable: ${String(err?.message ?? err).slice(0, 120)})`;
  }
  return {
    task,
    label: TASK_LABELS[task],
    modelId: pick.modelId,
    modelLabel: meta.label,
    reason: pick.reason,
    notes: notes.slice(0, 1600),
  };
}

function scoreConfidence(intent: Intent, digestEmpty: boolean, specialists: Specialist[]): number {
  let score = 0.55;
  if (intent.needs.length >= 2) score += 0.08;
  if (!digestEmpty) score += 0.15;
  if (intent.risks.length) score -= 0.05;
  if (specialists.every((s) => !s.notes.startsWith("(specialist unavailable"))) score += 0.12;
  if (intent.complexity === "trivial") score += 0.05;
  if (intent.complexity === "large") score -= 0.05;
  return Math.max(0.2, Math.min(0.98, score));
}

function buildDirective(params: {
  goal: string;
  intent: Intent;
  plan: string;
  specialists: Specialist[];
  digestEmpty: boolean;
}): string {
  const { goal, intent, plan, specialists, digestEmpty } = params;
  const specialistBlock = specialists.length
    ? specialists.map((s) => `[${s.label} — ${s.modelLabel}]\n${s.notes}`).join("\n\n")
    : "(no specialist input)";
  const modePrefix =
    intent.complexity === "trivial" || intent.category === "bugfix"
      ? "[REPAIR MODE]"
      : intent.category === "ui"
      ? "[UI MODE]"
      : intent.category === "world_build"
      ? "[MAP MODE]"
      : intent.complexity === "large"
      ? "[PRO BUILDER]"
      : "[SMART MODE]";

  return [
    `${modePrefix} ${goal.trim()}`,
    "",
    "🧠 SMART BRAIN DIRECTIVE — Follow this exact plan. Do not re-plan.",
    "",
    "INTENT:",
    `- Summary: ${intent.summary}`,
    `- Category: ${intent.category} · Complexity: ${intent.complexity}`,
    `- Systems: ${intent.systems.join(", ") || "(none flagged)"}`,
    `- Risks to guard: ${intent.risks.join("; ") || "(none flagged)"}`,
    "",
    "ARCHITECTURE PLAN (from planner):",
    plan,
    "",
    "SPECIALIST BRIEFS:",
    specialistBlock,
    "",
    "EXECUTION RULES:",
    "- Emit ONE bloxsmith-actions block containing the full ordered build.",
    "- Reuse exact instance paths from the scene digest; do NOT duplicate existing systems.",
    "- Follow BUILD ORDER above; earlier steps must exist before later steps reference them.",
    digestEmpty
      ? "- Scene digest is empty: begin the batch with a scan_project action."
      : "- Scene digest is fresh: skip a leading scan and only run scan_project at the end.",
    "- End with autofix_project then scan_project.",
    "- Do NOT add features outside the plan. Ask nothing; just build.",
  ].join("\n");
}

export const runSmartBrain = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => Input.parse(input))
  .handler(async ({ data, context }): Promise<BrainResult> => {
    const started = Date.now();
    const sb = context.supabase as any;

    // Stage 1: intent
    const intent = await analyzeIntent(data.goal);
    const difficulty = intent.complexity === "large"
      ? "hard"
      : intent.complexity === "trivial"
        ? "easy"
        : estimateDifficulty(data.goal);

    // Stage 2: context
    const { digest, contextSummary } = await retrieveContext(sb, data.projectId);

    // Stage 3: plan (+ critique + one re-plan if score < 7)
    let plan = await generatePlan(data.goal, contextSummary, intent);
    let critique = await critiquePlan(data.goal, plan);
    if (critique.score < 7 && critique.gaps.length) {
      const revisedGoal = `${data.goal}\n\n[BRAIN CRITIQUE — address these gaps in the revised plan:]\n- ${critique.gaps.join("\n- ")}`;
      const revised = await generatePlan(revisedGoal, contextSummary, intent);
      const revisedCritique = await critiquePlan(data.goal, revised);
      if (revisedCritique.score >= critique.score) {
        plan = revised;
        critique = revisedCritique;
      }
    }

    // Stage 4: specialists (parallel, only those the intent flagged, cap at 4)
    const wantedTasks = Array.from(new Set(intent.needs)).slice(0, 4);
    const specialists = await Promise.all(
      wantedTasks.map((task) => runSpecialist(task, data.goal, plan, digest.text, difficulty)),
    );

    // Stage 5+6: merge → directive
    const directive = buildDirective({
      goal: data.goal,
      intent,
      plan,
      specialists,
      digestEmpty: digest.isEmpty,
    });

    const confidence = Math.min(
      0.98,
      scoreConfidence(intent, digest.isEmpty, specialists) * (critique.score / 10),
    );

    // Log the brain run into project_memory as a low-importance decision so
    // future turns can see what the brain decided.
    await sb.from("project_memory").upsert(
      {
        project_id: data.projectId,
        user_id: context.userId,
        key: "smart_brain_last_run",
        value: JSON.stringify({
          goal: data.goal.slice(0, 300),
          intent,
          specialist_models: specialists.map((s) => ({ task: s.task, model: s.modelLabel })),
          confidence,
          at: new Date().toISOString(),
        }).slice(0, 1800),
        kind: "system",
        importance: 6,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "project_id,key" },
    );

    return {
      ok: true,
      intent,
      contextSummary: contextSummary.slice(0, 4000),
      plan,
      specialists,
      directive,
      confidence,
      ranMs: Date.now() - started,
    };
  });
