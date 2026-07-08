// Build Insights — post-build AI suggestions & execution history for a project.
// Reads the latest execution report + scene digest + project memory, asks the
// AI for 3-6 concrete, actionable improvements, and stores them in
// `ai_suggestions`. Also lists prior execution reports for a health timeline.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { generateText } from "ai";
import { z } from "zod";
import { getProviderModel } from "./ai-gateway.server";
import { FALLBACK_MODEL_ID } from "./models";
import { summarizeSceneScan } from "./scene-digest.server";

const uuid = z.string().uuid();

const SYSTEM = `You are BloxSmith's senior Roblox development partner. Given a snapshot of the user's Roblox Studio project (current scene digest, recent build results, existing memory), produce 3 to 6 SHORT, HIGH-VALUE suggestions that would meaningfully improve the game.

Prefer concrete, low-friction wins:
- missing systems (spawn, leaderboard, sounds, mobile controls, DataStore save)
- polish (lighting mood, UI consistency, SFX)
- reliability (unanchored parts, oversized parts, broken refs, exposed remotes)
- structure (folder cleanup, script modularization)
- performance (draw calls, part count, StreamingEnabled)

Do NOT suggest things that already exist in the digest. Do NOT invent instance paths.

Return STRICT JSON ONLY, no markdown:
{
  "suggestions": [
    {
      "area": "performance|bugs|security|mobile|ui|structure|polish|systems",
      "severity": "low|medium|high",
      "title": "under 60 chars, imperative",
      "detail": "1-2 sentences explaining why + how",
      "suggested_prompt": "one-line natural-language prompt the user could send to the AI to implement this",
      "auto_fixable": true|false
    }
  ]
}`;

function safeJson(text: string): any | null {
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try { return JSON.parse(m[0]); } catch { return null; }
}

const ALLOWED_AREAS = new Set(["performance","bugs","security","mobile","ui","structure","polish","systems","general"]);
const ALLOWED_SEV = new Set(["low","medium","high"]);

export const listBuildInsights = createServerFn({ method: "GET" })
  .inputValidator((i: unknown) => z.object({ project_id: uuid, limit: z.number().int().min(1).max(30).default(12) }).parse(i))
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    const sb = context.supabase as any;
    const [{ data: sugg }, { data: reports }] = await Promise.all([
      sb.from("ai_suggestions")
        .select("id, area, severity, title, detail, suggested_prompt, auto_fixable, source, dismissed_at, created_at")
        .eq("project_id", data.project_id)
        .is("dismissed_at", null)
        .order("created_at", { ascending: false })
        .limit(data.limit),
      sb.from("execution_reports")
        .select("id, created_at, total, ok_count, fail_count, skip_count, repair_count, retry_count, duration_ms, summary")
        .eq("project_id", data.project_id)
        .order("created_at", { ascending: false })
        .limit(5),
    ]);
    return { suggestions: sugg ?? [], reports: reports ?? [] };
  });

export const dismissBuildSuggestion = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) => z.object({ id: uuid }).parse(i))
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    const sb = context.supabase as any;
    const { error } = await sb
      .from("ai_suggestions")
      .update({ dismissed_at: new Date().toISOString() })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const generateBuildInsights = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) => z.object({ project_id: uuid }).parse(i))
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    const sb = context.supabase as any;

    const { data: ok } = await sb.rpc("can_access_project", { _project_id: data.project_id, _user_id: context.userId });
    if (!ok) throw new Error("No access to this project");

    const [{ data: project }, { data: session }, { data: report }, { data: memory }] = await Promise.all([
      sb.from("projects").select("name, description, game_type").eq("id", data.project_id).maybeSingle(),
      sb.from("plugin_sessions").select("scene_digest, last_scan_at").eq("project_id", data.project_id).order("last_seen", { ascending: false }).limit(1).maybeSingle(),
      sb.from("execution_reports").select("total, ok_count, fail_count, skip_count, repair_count, steps, summary, created_at").eq("project_id", data.project_id).order("created_at", { ascending: false }).limit(1).maybeSingle(),
      sb.from("project_memory").select("key, value, kind, importance").eq("project_id", data.project_id).order("importance", { ascending: false }).limit(15),
    ]);
    if (!project) throw new Error("Project not found");

    const digest = summarizeSceneScan(session?.scene_digest);

    const context_payload = {
      project: { name: project.name, description: project.description, type: project.game_type },
      scene_digest: digest.text,
      spawn_count: digest.spawnLocations.length,
      totals: digest.totals,
      last_build: report ? {
        at: report.created_at,
        total: report.total, ok: report.ok_count, failed: report.fail_count,
        skipped: report.skip_count, repaired: report.repair_count,
        summary: report.summary,
        step_kinds: Array.isArray(report.steps) ? (report.steps as any[]).slice(0, 60).map((s: any) => ({ kind: s?.kind, status: s?.status, path: s?.path })) : [],
      } : null,
      memory: (memory ?? []).map((m: any) => ({ key: m.key, kind: m.kind, value: String(m.value ?? "").slice(0, 240) })),
    };

    const { model } = getProviderModel(FALLBACK_MODEL_ID);
    const { text } = await generateText({
      model,
      system: SYSTEM,
      prompt: `Snapshot:\n${JSON.stringify(context_payload)}\n\nReturn the JSON.`,
      temperature: 0.3,
      maxOutputTokens: 1400,
    });

    const parsed = safeJson(text);
    const list = Array.isArray(parsed?.suggestions) ? parsed.suggestions.slice(0, 8) : [];
    if (!list.length) return { inserted: 0 };

    // Clear stale non-dismissed suggestions so the panel stays fresh.
    await sb.from("ai_suggestions").delete()
      .eq("project_id", data.project_id)
      .is("dismissed_at", null);

    const rows = list.map((s: any) => ({
      project_id: data.project_id,
      user_id: context.userId,
      area: ALLOWED_AREAS.has(String(s?.area)) ? String(s.area) : "general",
      severity: ALLOWED_SEV.has(String(s?.severity)) ? String(s.severity) : "medium",
      title: String(s?.title ?? "Suggestion").slice(0, 120),
      detail: s?.detail ? String(s.detail).slice(0, 600) : null,
      suggested_prompt: s?.suggested_prompt ? String(s.suggested_prompt).slice(0, 400) : null,
      auto_fixable: !!s?.auto_fixable,
      source: "post_build",
    }));

    const { error } = await sb.from("ai_suggestions").insert(rows);
    if (error) throw new Error(error.message);
    return { inserted: rows.length };
  });
