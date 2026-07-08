import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { generateText } from "ai";
import { z } from "zod";
import { getProviderModel } from "./ai-gateway.server";
import { FALLBACK_MODEL_ID } from "./models";

const uuid = z.string().uuid();

const SYSTEM = `You are a senior Roblox QA lead. Score the player-ready quality of a Roblox project across five axes:
- performance (FPS, memory, draw calls)
- bugs (broken refs, missing assets, runtime errors)
- security (RemoteEvent abuse, exploit surface, server validation)
- mobile (touch UI, scaling, performance on phones)
- ui (clarity, polish, missing screens)

You will be given: the project name + description + game type, recent chat prompts the user gave, the queue of plugin actions that ran in Studio, any Studio errors captured, and the latest scan/health hint.

Return STRICT JSON ONLY, no markdown, in this exact shape:
{
  "overall": 0-100 integer,
  "scores": {"performance":0-100,"bugs":0-100,"security":0-100,"mobile":0-100,"ui":0-100},
  "issues": [{"severity":"low|medium|high","area":"performance|bugs|security|mobile|ui","title":"short","detail":"1-2 sentence explanation"}],
  "recommendations": [{"title":"short action","detail":"how to do it","auto_fixable":true|false}]
}
Be realistic: a fresh empty project scores ~40-50 overall. Reward evidence of working systems, DataStores, UI, mobile support, tests, and security checks. Penalize missing assets, no DataStore, no mobile UI, exposed remotes, deprecated APIs, infinite loops, loadstring usage. Issue/recommendation lists: 3-8 each.`;

function safeJson(text: string): any | null {
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try { return JSON.parse(m[0]); } catch { return null; }
}

export const generateQaReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: unknown) => z.object({ project_id: uuid }).parse(i))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as any;

    // access check
    const { data: ok } = await sb.rpc("can_access_project", { _project_id: data.project_id, _user_id: context.userId });
    if (!ok) throw new Error("No access to this project");

    const [{ data: project }, { data: actions }, { data: chats }, { data: errors }, { data: session }] = await Promise.all([
      sb.from("projects").select("name, description, game_type, build_count").eq("id", data.project_id).maybeSingle(),
      sb.from("plugin_actions").select("kind, payload, status, error").eq("project_id", data.project_id).order("created_at", { ascending: false }).limit(40),
      sb.from("chat_messages").select("role, content").eq("project_id", data.project_id).order("created_at", { ascending: false }).limit(20),
      sb.from("studio_errors").select("message, source, level").eq("project_id", data.project_id).order("created_at", { ascending: false }).limit(20),
      sb.from("plugin_sessions").select("plugin_version, last_scan_at, last_scan").eq("project_id", data.project_id).order("last_seen", { ascending: false }).limit(1).maybeSingle(),
    ]);

    if (!project) throw new Error("Project not found");

    const summary = {
      project: { name: project.name, description: project.description, type: project.game_type, builds: project.build_count },
      recent_actions: (actions ?? []).slice(0, 25).map((a: any) => ({
        kind: a.kind,
        status: a.status,
        error: a.error ?? undefined,
        payload_keys: a.payload ? Object.keys(a.payload).slice(0, 8) : [],
      })),
      recent_chat: (chats ?? []).slice(0, 12).map((c: any) => ({
        role: c.role,
        text: String(c.content ?? "").slice(0, 300),
      })),
      studio_errors: (errors ?? []).slice(0, 10),
      scene_hint: session?.scene_digest ? { has_digest: true, last_scan_at: session.last_scan_at } : { has_digest: false },
    };

    const { model, meta } = getProviderModel(FALLBACK_MODEL_ID);
    let parsed: any = null;
    try {
      const { text } = await generateText({
        model,
        system: SYSTEM,
        prompt: `Analyze this Roblox project and return the JSON report.\n\n${JSON.stringify(summary)}`,
        temperature: 0.2,
        maxOutputTokens: 1500,
      });
      parsed = safeJson(text);
    } catch (e: any) {
      throw new Error(e?.message || "AI failed");
    }

    if (!parsed || typeof parsed !== "object") throw new Error("AI returned no parseable report");

    const overall = Math.max(0, Math.min(100, Math.round(Number(parsed.overall ?? 0))));
    const scores = parsed.scores && typeof parsed.scores === "object" ? parsed.scores : {};
    const issues = Array.isArray(parsed.issues) ? parsed.issues.slice(0, 20) : [];
    const recs = Array.isArray(parsed.recommendations) ? parsed.recommendations.slice(0, 20) : [];

    const { data: row, error } = await sb.from("project_qa_reports").insert({
      project_id: data.project_id,
      user_id: context.userId,
      overall_score: overall,
      scores,
      issues,
      recommendations: recs,
      model_used: meta?.id ?? FALLBACK_MODEL_ID,
    }).select().single();
    if (error) throw new Error(error.message);

    await sb.from("project_activity").insert({
      project_id: data.project_id,
      user_id: context.userId,
      kind: "qa.report",
      summary: `ran a QA report (score ${overall})`,
      meta: { report_id: row.id, overall },
    });

    return row;
  });

export const listQaReports = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((i: unknown) => z.object({ project_id: uuid, limit: z.number().int().min(1).max(20).default(5) }).parse(i))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as any;
    const { data: rows, error } = await sb
      .from("project_qa_reports")
      .select("*")
      .eq("project_id", data.project_id)
      .order("created_at", { ascending: false })
      .limit(data.limit);
    if (error) throw new Error(error.message);
    return rows ?? [];
  });
