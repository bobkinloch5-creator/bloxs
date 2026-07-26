// AI Project Manager: auto-generates a roadmap from the project's prompt,
// stores it in project_memory under the `roadmap` key, tracks percent done,
// and assembles an auto-changelog from plugin_actions + project_activity +
// build_milestones so the user always sees what shipped.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { generateText } from "ai";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { getProviderModel } from "./ai-gateway.server";
import { FALLBACK_MODEL_ID } from "./models";

const ProjectInput = z.object({ projectId: z.string().uuid() });

const ROADMAP_KEY = "roadmap";

type Milestone = {
  id: string;
  title: string;
  detail: string;
  done: boolean;
  prompt: string;
};

const ROADMAP_SYSTEM = `You are the AI Project Manager for a Roblox Studio game.
Given the project name, description, and any recent build context, output a JSON roadmap
with 6-10 concrete milestones a beginner can ship in order. Each milestone has:
- id: short kebab-case string
- title: short user-facing label (max 50 chars)
- detail: one sentence on what it covers (max 140 chars)
- prompt: a single-line BloxSmith chat prompt that builds this milestone end-to-end in Studio.
Return ONLY JSON like: {"milestones":[{"id":"core-loop","title":"Core Gameplay Loop","detail":"…","prompt":"…"}, …]}`;

function safeJson(t: string): any {
  try { return JSON.parse(t); } catch {
    const m = t.match(/\{[\s\S]*\}/);
    if (m) { try { return JSON.parse(m[0]); } catch {} }
    return null;
  }
}

async function loadRoadmap(sb: any, projectId: string): Promise<Milestone[]> {
  const { data } = await sb.from("project_memory")
    .select("value")
    .eq("project_id", projectId)
    .eq("key", ROADMAP_KEY)
    .maybeSingle();
  if (!data?.value) return [];
  try {
    const arr = JSON.parse(data.value);
    return Array.isArray(arr) ? arr : [];
  } catch { return []; }
}

async function saveRoadmap(sb: any, projectId: string, userId: string, milestones: Milestone[]) {
  const value = JSON.stringify(milestones);
  await sb.from("project_memory").upsert(
    {
      project_id: projectId,
      user_id: userId,
      key: ROADMAP_KEY,
      value,
      kind: "system",
      importance: 9,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "project_id,key" },
  );
}

export const generateRoadmap = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: unknown) => ProjectInput.parse(i))
  .handler(async ({ data, context }) => {
    const ctx = context as any;
    const sb = ctx.supabase as any;
    const { data: project } = await sb.from("projects")
      .select("id, name, description, game_type, prompt")
      .eq("id", data.projectId).maybeSingle();
    if (!project) throw new Error("Project not found");

    const { model } = getProviderModel(FALLBACK_MODEL_ID);
    const { text } = await generateText({
      model,
      system: ROADMAP_SYSTEM,
      prompt: `Project: ${project.name}\nType: ${project.game_type ?? "custom"}\nDescription: ${project.description ?? ""}\nOriginal prompt: ${(project.prompt ?? "").slice(0, 400)}`,
      temperature: 0.3,
      maxOutputTokens: 1200,
    });
    const parsed = safeJson(text);
    const raw = Array.isArray(parsed?.milestones) ? parsed.milestones : [];

    const milestones: Milestone[] = raw.slice(0, 10).map((m: any, idx: number) => ({
      id: String(m.id ?? `m-${idx}`).slice(0, 40),
      title: String(m.title ?? `Milestone ${idx + 1}`).slice(0, 60),
      detail: String(m.detail ?? "").slice(0, 200),
      prompt: String(m.prompt ?? m.title ?? "").slice(0, 600),
      done: false,
    }));

    if (!milestones.length) throw new Error("AI returned an empty roadmap");
    await saveRoadmap(sb, data.projectId, ctx.userId, milestones);

    await sb.from("project_activity").insert({
      project_id: data.projectId,
      user_id: ctx.userId,
      kind: "pm.roadmap_generated",
      summary: `generated a ${milestones.length}-step roadmap`,
      meta: { count: milestones.length },
    });

    return { ok: true, milestones };
  });

export const getRoadmap = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((i: unknown) => ProjectInput.parse(i))
  .handler(async ({ data, context }) => {
    const ctx = context as any;
    const sb = ctx.supabase as any;
    const milestones = await loadRoadmap(sb, data.projectId);
    const done = milestones.filter((m) => m.done).length;
    return {
      milestones,
      total: milestones.length,
      done,
      percent: milestones.length ? Math.round((done / milestones.length) * 100) : 0,
    };
  });

export const toggleMilestone = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: unknown) => z.object({
    projectId: z.string().uuid(),
    milestoneId: z.string(),
    done: z.boolean(),
  }).parse(i))
  .handler(async ({ data, context }) => {
    const ctx = context as any;
    const sb = ctx.supabase as any;
    const milestones = await loadRoadmap(sb, data.projectId);
    const updated = milestones.map((m) => m.id === data.milestoneId ? { ...m, done: data.done } : m);
    await saveRoadmap(sb, data.projectId, ctx.userId, updated);

    if (data.done) {
      const target = updated.find((m) => m.id === data.milestoneId);
      await sb.from("project_activity").insert({
        project_id: data.projectId,
        user_id: ctx.userId,
        kind: "pm.milestone_done",
        summary: `completed milestone: ${target?.title ?? data.milestoneId}`,
        meta: { milestone_id: data.milestoneId },
      });
    }

    return { ok: true };
  });

export const getAutoChangelog = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((i: unknown) => ProjectInput.parse(i))
  .handler(async ({ data, context }) => {
    const ctx = context as any;
    const sb = ctx.supabase as any;

    const [acts, snaps, activity] = await Promise.all([
      sb.from("plugin_actions")
        .select("id, kind, name, created_at, status")
        .eq("project_id", data.projectId)
        .order("created_at", { ascending: false })
        .limit(50),
      sb.from("build_milestones")
        .select("id, label, summary, created_at, parts_count, scripts_count, gui_count")
        .eq("project_id", data.projectId)
        .order("created_at", { ascending: false })
        .limit(20),
      sb.from("project_activity")
        .select("id, kind, summary, created_at, meta")
        .eq("project_id", data.projectId)
        .order("created_at", { ascending: false })
        .limit(50),
    ]);

    const entries: Array<{
      id: string;
      ts: string;
      kind: string;
      label: string;
      detail?: string;
    }> = [];

    for (const a of acts.data ?? []) {
      entries.push({
        id: `act-${a.id}`,
        ts: a.created_at,
        kind: a.kind,
        label: a.name ?? a.kind,
        detail: a.status ? `status: ${a.status}` : undefined,
      });
    }
    for (const s of snaps.data ?? []) {
      entries.push({
        id: `snap-${s.id}`,
        ts: s.created_at,
        kind: "milestone",
        label: s.label,
        detail: `${s.parts_count ?? 0} parts • ${s.scripts_count ?? 0} scripts • ${s.gui_count ?? 0} UI`,
      });
    }
    for (const ev of activity.data ?? []) {
      entries.push({
        id: `act2-${ev.id}`,
        ts: ev.created_at,
        kind: ev.kind,
        label: ev.summary,
      });
    }

    entries.sort((a, b) => (a.ts < b.ts ? 1 : -1));
    return { entries: entries.slice(0, 80) };
  });
