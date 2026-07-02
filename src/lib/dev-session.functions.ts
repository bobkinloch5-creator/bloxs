// Autonomous Development Sessions — a session is a goal (e.g. "make combat feel premium").
// The AI planner breaks the goal into agent-tagged tasks. Each task is
// executed by injecting its instruction as a chat prompt through the
// existing pipeline. Auto-advance is driven by execution reports.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { generateText } from "ai";
import { z } from "zod";
import { getProviderModel } from "./ai-gateway.server";
import { FALLBACK_MODEL_ID } from "./models";
import { summarizeSceneScan } from "./scene-digest.server";

const uuid = z.string().uuid();

const AGENTS = [
  "world_builder","scripter","ui_designer","asset_manager","toolbox_search",
  "performance_optimizer","qa_tester","security_auditor","audio_designer",
  "lighting_designer","game_designer","economy_designer","quest_designer","generalist",
] as const;
type Agent = typeof AGENTS[number];

const SYSTEM = `You are BloxSmith's autonomous development planner. Given a user goal for their Roblox game and a snapshot of the current project, produce an ordered plan of 5-10 concrete tasks that, when executed one after another, meaningfully progress the goal.

Each task is assigned to ONE specialized agent from this exact list:
${AGENTS.join(", ")}.

Task rules:
- Reference existing systems from the scene digest; do NOT recreate things that exist.
- Each task's "instruction" is a single natural-language prompt (1-3 sentences) that a Roblox developer AI can act on directly (it will be sent to the build pipeline verbatim). Include names/paths from the digest when applicable.
- Order tasks by dependency: foundations first (spawn, folders, terrain), then systems (combat, UI, data save), then polish (lighting, sfx), then QA/optimize.
- Titles are under 60 chars, imperative.

Return STRICT JSON ONLY:
{
  "summary": "1 sentence describing the plan",
  "tasks": [
    { "agent": "<one of the list>", "title": "...", "instruction": "..." }
  ]
}`;

function safeJson(t: string): any | null {
  const m = t.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try { return JSON.parse(m[0]); } catch { return null; }
}

export const listActiveDevSession = createServerFn({ method: "GET" })
  .inputValidator((i: unknown) => z.object({ project_id: uuid }).parse(i))
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    const sb = context.supabase as any;
    const { data: session } = await sb
      .from("dev_sessions")
      .select("id, goal, status, auto_run, summary, created_at, updated_at, finished_at")
      .eq("project_id", data.project_id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!session) return { session: null, tasks: [] };
    const { data: tasks } = await sb
      .from("dev_session_tasks")
      .select("id, position, agent, title, instruction, status, notes, started_at, finished_at")
      .eq("session_id", session.id)
      .order("position", { ascending: true });
    return { session, tasks: tasks ?? [] };
  });

export const stopDevSession = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) => z.object({ session_id: uuid, status: z.enum(["stopped","complete","paused"]).default("stopped") }).parse(i))
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    const sb = context.supabase as any;
    const { error } = await sb.from("dev_sessions")
      .update({ status: data.status, finished_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq("id", data.session_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const setDevSessionAutoRun = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) => z.object({ session_id: uuid, auto_run: z.boolean() }).parse(i))
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    const sb = context.supabase as any;
    const { error } = await sb.from("dev_sessions").update({ auto_run: data.auto_run, updated_at: new Date().toISOString() }).eq("id", data.session_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const startDevSession = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) => z.object({
    project_id: uuid,
    goal: z.string().min(4).max(500),
    quality_target: z.enum(["draft","polished","premium"]).default("polished"),
  }).parse(i))
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    const sb = context.supabase as any;
    const { data: canEdit } = await sb.rpc("can_edit_project", { _project_id: data.project_id, _user_id: context.userId });
    if (!canEdit) throw new Error("No edit access to this project");

    const [{ data: project }, { data: session }, { data: memory }] = await Promise.all([
      sb.from("projects").select("name, description, game_type").eq("id", data.project_id).maybeSingle(),
      sb.from("plugin_sessions").select("scene_digest, last_scan_at").eq("project_id", data.project_id).order("updated_at", { ascending: false }).limit(1).maybeSingle(),
      sb.from("project_memory").select("key, value, kind").eq("project_id", data.project_id).order("importance", { ascending: false }).limit(15),
    ]);
    const digest = summarizeSceneScan(session?.scene_digest);

    // Cancel any prior active session for this project.
    await sb.from("dev_sessions")
      .update({ status: "stopped", finished_at: new Date().toISOString() })
      .eq("project_id", data.project_id)
      .in("status", ["active","planning"]);

    const { model } = getProviderModel(FALLBACK_MODEL_ID);
    let plan: any = null;
    try {
      const { text } = await generateText({
        model,
        system: SYSTEM,
        prompt: `Goal: ${data.goal}\nQuality target: ${data.quality_target}\n\nProject: ${JSON.stringify({ name: project?.name, description: project?.description, type: project?.game_type })}\nScene digest:\n${digest.text}\nMemory:\n${JSON.stringify((memory ?? []).slice(0, 12))}\n\nReturn the JSON plan.`,
        temperature: 0.35,
        maxOutputTokens: 1800,
      });
      plan = safeJson(text);
    } catch (e: any) {
      throw new Error(e?.message || "Planner failed");
    }
    const rawTasks = Array.isArray(plan?.tasks) ? plan.tasks.slice(0, 12) : [];
    if (rawTasks.length === 0) throw new Error("Planner returned no tasks");

    const { data: sess, error: sErr } = await sb.from("dev_sessions").insert({
      project_id: data.project_id,
      user_id: context.userId,
      goal: data.goal,
      quality_target: data.quality_target,
      status: "active",
      auto_run: true,
      summary: plan?.summary ? String(plan.summary).slice(0, 400) : null,
    }).select("id").single();
    if (sErr) throw new Error(sErr.message);

    const rows = rawTasks.map((t: any, i: number) => ({
      session_id: sess.id,
      project_id: data.project_id,
      user_id: context.userId,
      position: i,
      agent: (AGENTS as readonly string[]).includes(String(t?.agent)) ? String(t.agent) : "generalist",
      title: String(t?.title ?? `Task ${i + 1}`).slice(0, 120),
      instruction: String(t?.instruction ?? "").slice(0, 1500),
      status: "pending",
    })).filter((r: any) => r.instruction.length > 0);

    if (rows.length === 0) throw new Error("No valid tasks generated");
    const { error: tErr } = await sb.from("dev_session_tasks").insert(rows);
    if (tErr) throw new Error(tErr.message);

    return { session_id: sess.id, task_count: rows.length, summary: plan?.summary ?? null };
  });

// Advance the session: if the current in-progress task has succeeded (a fresh
// execution_report with 0 fails landed after started_at), mark it done and
// return the next pending task's instruction for the client to send through
// the chat pipeline. If no more tasks remain, mark session complete.
export const advanceDevSession = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) => z.object({ session_id: uuid, force: z.boolean().default(false) }).parse(i))
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    const sb = context.supabase as any;
    const { data: session } = await sb.from("dev_sessions").select("id, project_id, status").eq("id", data.session_id).maybeSingle();
    if (!session) throw new Error("Session not found");
    if (session.status !== "active") return { advanced: false, reason: "not_active" };

    const now = new Date().toISOString();
    // Check current in_progress task, if any
    const { data: inProg } = await sb.from("dev_session_tasks")
      .select("id, started_at")
      .eq("session_id", data.session_id)
      .eq("status", "in_progress")
      .order("position", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (inProg) {
      let complete = data.force;
      if (!complete && inProg.started_at) {
        const { data: recent } = await sb.from("execution_reports")
          .select("created_at, fail_count")
          .eq("project_id", session.project_id)
          .gte("created_at", inProg.started_at)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (recent && (recent.fail_count ?? 0) === 0) complete = true;
      }
      if (!complete) return { advanced: false, reason: "waiting_for_build" };
      await sb.from("dev_session_tasks")
        .update({ status: "done", finished_at: now })
        .eq("id", inProg.id);
    }

    const { data: next } = await sb.from("dev_session_tasks")
      .select("id, agent, title, instruction, position")
      .eq("session_id", data.session_id)
      .eq("status", "pending")
      .order("position", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (!next) {
      await sb.from("dev_sessions")
        .update({ status: "complete", finished_at: now, updated_at: now })
        .eq("id", data.session_id);
      return { advanced: true, complete: true };
    }

    await sb.from("dev_session_tasks")
      .update({ status: "in_progress", started_at: now })
      .eq("id", next.id);
    await sb.from("dev_sessions").update({ updated_at: now }).eq("id", data.session_id);

    return {
      advanced: true,
      complete: false,
      task: { id: next.id, agent: next.agent, title: next.title, instruction: next.instruction, position: next.position },
    };
  });
