// Smart Brain — BloxSmith's intelligent pre-generation pipeline.
//
// Stages:
//   1. Intent analysis                          (fast model)
//   2. Deterministic surface extraction         (regex; no model)
//   3. Context retrieval (scene + memory + chat)
//   4. Architecture planning                     (planner model)
//   5. Plan critique + COVERAGE GATE — re-plans until every required
//      surface is explicitly named in the plan (max 2 iterations)
//   6. Specialist routing + parallel drafts      (per-task models)
//   7. Emit an enriched build directive with a REQUIRED SURFACES contract
//
// The build directive is a compressed, high-signal instruction packet the
// existing chat executor consumes as its user turn.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { generateText } from "ai";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { getProviderModel, getPlannerModel, getFallbackModel } from "./ai-gateway.server";
import { summarizeSceneScan } from "./scene-digest.server";
import { pickModelForTask, estimateDifficulty, TASK_LABELS, type AutoTask } from "./model-router";
import { safeJsonParse } from "./safe-json";
import {
  extractRequiredSurfaces as extractRequiredSurfacesShared,
  checkPlanCoverage as checkPlanCoverageShared,
  type RequiredSurface,
} from "./surfaces";

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
  requiredSurfaces: RequiredSurface[];
};

// Serializable view — drops the actionCovered function so this shape is
// safe to return across the createServerFn RPC boundary.
type SerializableSurface = {
  id: string;
  label: string;
  planKeywords: string[];
  buildHint: string;
};

function toSerializable(s: RequiredSurface): SerializableSurface {
  return {
    id: s.id,
    label: s.label,
    planKeywords: s.planKeywords,
    buildHint: s.buildHint,
  };
}

type SerializableIntent = Omit<Intent, "requiredSurfaces"> & {
  requiredSurfaces: SerializableSurface[];
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
  intent: SerializableIntent;
  contextSummary: string;
  plan: string;
  specialists: Specialist[];
  directive: string;
  confidence: number;
  ranMs: number;
  coverage: { covered: string[]; missing: string[]; iterations: number };
};

// ── Required-surface catalogue ────────────────────────────────────────────
// A surface is a concrete, verifiable thing the user asked for. Extraction
// is deterministic (regex) so it never depends on a model getting it right.
// Each surface carries a plan-keyword set (all must appear in the plan for
// coverage to pass) and a build-hint the directive forwards to chat.ts so
// the executor cannot silently drop it.
// Required-surface catalogue lives in ./surfaces (shared with action-critic).
const extractRequiredSurfaces = extractRequiredSurfacesShared;
const checkPlanCoverage = checkPlanCoverageShared;

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
- Visual-effect requests such as "turn my character into flames", fire/lightning/magic/smoke/ice aura, glowing particles, trails, explosions, or humanoid elemental effects are scripting/polish work, NOT asset_search. Use category "scripting" or "polish", complexity "small" or "medium", systems containing "humanoid_vfx" and the element, needs including ["scripting","performance","testing"].
- For humanoid VFX, risks MUST mention body-part Attachment parenting, R15/R6 fallback, ParticleEmitter visibility, respawn re-apply, and server replication when everyone should see it.
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
- If the goal is humanoid VFX, plan a complete scripted effect: ModuleScript/Script or LocalScript as appropriate, Attachments inside the correct body BaseParts, ParticleEmitters with full Size/Transparency/Color/Lifetime/Rate/Speed/Acceleration values, PointLight/Sound for visibility, R15/R6 body-part fallback, CharacterAdded respawn handling, stale-effect cleanup, and performance caps. Do not plan a Toolbox model for this.
- If a REQUIRED SURFACES block is supplied, EVERY listed surface MUST appear by name in NEW TO CREATE and be referenced in BUILD ORDER — no exceptions.
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

  const requiredSurfaces = extractRequiredSurfaces(goal);
  const modelSystems = Array.isArray(parsed.systems) ? parsed.systems.slice(0, 12).map(String) : [];
  // Merge deterministic surfaces into systems so downstream logs & the
  // directive both reflect what the user actually asked for.
  const mergedSystems = Array.from(new Set([...modelSystems, ...requiredSurfaces.map((s) => s.id)]));

  // If the user asked for UI surfaces, force scripting+ui+testing into needs
  // even when the intent model omitted them.
  const finalNeeds = new Set<AutoTask>(needs.length ? needs : ["planning", "scripting"]);
  if (requiredSurfaces.some((s) => /_menu$|_ui$|_screen$|^hud$/.test(s.id) || s.id === "main_menu" || s.id === "loading_screen" || s.id === "hud")) {
    finalNeeds.add("ui");
    finalNeeds.add("scripting");
    finalNeeds.add("testing");
  }
  if (requiredSurfaces.some((s) => /_ability$|^dash|^sprint|^double_jump/.test(s.id))) {
    finalNeeds.add("scripting");
    finalNeeds.add("testing");
  }

  return {
    summary: String(parsed.summary ?? goal.slice(0, 200)),
    category: (parsed.category as Intent["category"]) ?? "mixed",
    complexity: (parsed.complexity as Intent["complexity"]) ?? "medium",
    systems: mergedSystems,
    needs: Array.from(finalNeeds),
    risks: Array.isArray(parsed.risks) ? parsed.risks.slice(0, 6).map(String) : [],
    requiredSurfaces,
  };
}

async function retrieveContext(sb: any, projectId: string) {
  const [projectRes, sessionRes, memoryRes, chatRes] = await Promise.all([
    sb.from("projects")
      .select("id, name, description, game_type, prompt")
      .eq("id", projectId).maybeSingle(),
    sb.from("plugin_sessions")
      .select("last_scan, last_seen")
      .eq("project_id", projectId)
      .order("last_seen", { ascending: false })
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

function renderRequiredSurfacesBlock(surfaces: RequiredSurface[]): string {
  if (!surfaces.length) return "(none extracted)";
  return surfaces.map((s) => `- ${s.label} — must appear by name in the plan. Build hint: ${s.buildHint}`).join("\n");
}

async function generatePlan(
  goal: string,
  contextSummary: string,
  intent: Intent,
  extraDirective?: string,
): Promise<string> {
  const planner = getPlannerModel();
  const surfacesBlock = renderRequiredSurfacesBlock(intent.requiredSurfaces);
  const promptParts = [
    `USER GOAL:\n${goal}`,
    `CLASSIFIED INTENT:\n${JSON.stringify({ ...intent, requiredSurfaces: intent.requiredSurfaces.map((s) => s.label) })}`,
    `REQUIRED SURFACES (every one MUST appear in NEW TO CREATE and BUILD ORDER):\n${surfacesBlock}`,
    `PROJECT CONTEXT:\n${contextSummary.slice(0, 6000)}`,
  ];
  if (extraDirective) promptParts.push(`ADDITIONAL DIRECTIVE:\n${extraDirective}`);
  const { text } = await generateText({
    model: planner.model,
    system: PLAN_SYSTEM,
    prompt: promptParts.join("\n\n"),
    ...(planner.extraBody ? { providerOptions: { nvidia: planner.extraBody as Record<string, never> } as never } : {}),
    temperature: planner.modelSettings?.temperature ?? 0.2,
    ...(planner.modelSettings?.topP !== undefined ? { topP: planner.modelSettings.topP } : {}),
    maxOutputTokens: Math.min(planner.modelSettings?.maxOutputTokens ?? 1400, 2200),
  });
  return text.trim();
}

// Critique the plan quality — one cheap call.
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

function scoreConfidence(intent: Intent, digestEmpty: boolean, specialists: Specialist[], coverageMissing: number): number {
  let score = 0.55;
  if (intent.needs.length >= 2) score += 0.08;
  if (!digestEmpty) score += 0.15;
  if (intent.risks.length) score -= 0.05;
  if (specialists.every((s) => !s.notes.startsWith("(specialist unavailable"))) score += 0.12;
  if (intent.complexity === "trivial") score += 0.05;
  if (intent.complexity === "large") score -= 0.05;
  score -= Math.min(0.3, coverageMissing * 0.1);
  return Math.max(0.2, Math.min(0.98, score));
}

function buildDirective(params: {
  goal: string;
  intent: Intent;
  plan: string;
  specialists: Specialist[];
  digestEmpty: boolean;
  coverage: { covered: string[]; missing: string[] };
}): string {
  const { goal, intent, plan, specialists, digestEmpty, coverage } = params;
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

  const surfacesBlock = intent.requiredSurfaces.length
    ? intent.requiredSurfaces
        .map((s, i) => `${i + 1}. ${s.label} — ${s.buildHint}`)
        .join("\n")
    : "(none — the user did not name a specific surface)";

  const coverageNote = intent.requiredSurfaces.length
    ? coverage.missing.length
      ? `⚠️ PLAN COVERAGE INCOMPLETE — missing: ${coverage.missing.join(", ")}. You MUST build these anyway using the build hints below; do not skip them.`
      : `✅ Plan covers all ${coverage.covered.length} required surface(s).`
    : "";

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
    "🎯 REQUIRED SURFACES — MUST-BUILD CONTRACT (non-negotiable):",
    surfacesBlock,
    coverageNote,
    "",
    "ARCHITECTURE PLAN (from planner):",
    plan,
    "",
    "SPECIALIST BRIEFS:",
    specialistBlock,
    "",
    "EXECUTION RULES:",
    "- Emit ONE bloxsmith-actions block containing the full ordered build.",
    "- Every REQUIRED SURFACE above MUST appear as concrete Instance actions in the batch. If the plan omits one, build it anyway from its build hint. Missing a required surface is a failed turn.",
    "- Reuse exact instance paths from the scene digest; do NOT duplicate existing systems.",
    "- Follow BUILD ORDER; earlier steps must exist before later steps reference them.",
    digestEmpty
      ? "- Scene digest is empty: begin the batch with a scan_project action."
      : "- Scene digest is fresh: skip a leading scan and only run scan_project at the end.",
    "- End with autofix_project then scan_project.",
    "- Do NOT add features outside the plan or required surfaces. Ask nothing; just build.",
  ]
    .filter(Boolean)
    .join("\n");
}

export const runSmartBrain = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => Input.parse(input))
  .handler(async ({ data, context }): Promise<BrainResult> => {
    const started = Date.now();
    const ctx = context as any;
    const sb = ctx.supabase as any;

    // Stage 1+2: intent (LLM) + deterministic surface extraction
    const intent = await analyzeIntent(data.goal);
    const difficulty = intent.complexity === "large"
      ? "hard"
      : intent.complexity === "trivial"
        ? "easy"
        : estimateDifficulty(data.goal);

    // Stage 3: context
    const { digest, contextSummary } = await retrieveContext(sb, data.projectId);

    // Stage 4+5: plan → critique + COVERAGE GATE.
    // Re-plan while either (a) critique < 7 with gaps, or (b) required surfaces are missing.
    // Hard cap: 2 additional iterations.
    let plan = await generatePlan(data.goal, contextSummary, intent);
    let critique = await critiquePlan(data.goal, plan);
    let coverage = checkPlanCoverage(plan, intent.requiredSurfaces);
    let iterations = 0;
    const MAX_ITER = 2;
    while (iterations < MAX_ITER && (coverage.missing.length > 0 || (critique.score < 7 && critique.gaps.length > 0))) {
      const gapLines: string[] = [];
      if (coverage.missing.length) {
        gapLines.push(
          `The previous plan FAILED to name these REQUIRED SURFACES in NEW TO CREATE / BUILD ORDER: ${coverage.missing.join(", ")}. In the revised plan, list each of them explicitly with a numbered BUILD ORDER step.`,
        );
      }
      if (critique.gaps.length) {
        gapLines.push(`Critic gaps to address: ${critique.gaps.join("; ")}.`);
      }
      const revised = await generatePlan(data.goal, contextSummary, intent, gapLines.join("\n\n"));
      const revisedCoverage = checkPlanCoverage(revised, intent.requiredSurfaces);
      const revisedCritique = await critiquePlan(data.goal, revised);
      const better =
        revisedCoverage.missing.length < coverage.missing.length ||
        (revisedCoverage.missing.length === coverage.missing.length && revisedCritique.score >= critique.score);
      if (better) {
        plan = revised;
        critique = revisedCritique;
        coverage = revisedCoverage;
      }
      iterations += 1;
      if (coverage.missing.length === 0 && critique.score >= 7) break;
    }

    // Stage 6: specialists (parallel, only those the intent flagged, cap at 4)
    const wantedTasks = Array.from(new Set(intent.needs)).slice(0, 4);
    const specialists = await Promise.all(
      wantedTasks.map((task) => runSpecialist(task, data.goal, plan, digest.text, difficulty)),
    );

    // Stage 7: directive
    const directive = buildDirective({
      goal: data.goal,
      intent,
      plan,
      specialists,
      digestEmpty: digest.isEmpty,
      coverage,
    });

    const confidence = Math.min(
      0.98,
      scoreConfidence(intent, digest.isEmpty, specialists, coverage.missing.length) * (critique.score / 10),
    );

    // Log the brain run into project_memory as a low-importance decision so
    // future turns can see what the brain decided.
    await sb.from("project_memory").upsert(
      {
        project_id: data.projectId,
        user_id: ctx.userId,
        key: "smart_brain_last_run",
        value: JSON.stringify({
          goal: data.goal.slice(0, 300),
          intent: { ...intent, requiredSurfaces: intent.requiredSurfaces.map(toSerializable) },
          specialist_models: specialists.map((s) => ({ task: s.task, model: s.modelLabel })),
          coverage,
          confidence,
          at: new Date().toISOString(),
        }).slice(0, 1800),
        kind: "system",
        importance: 6,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "project_id,key" },
    );

    const serializableIntent: SerializableIntent = {
      ...intent,
      requiredSurfaces: intent.requiredSurfaces.map(toSerializable),
    };

    return {
      ok: true,
      intent: serializableIntent,
      contextSummary: contextSummary.slice(0, 4000),
      plan,
      specialists,
      directive,
      confidence,
      ranMs: Date.now() - started,
      coverage: { ...coverage, iterations },
    };
  });
