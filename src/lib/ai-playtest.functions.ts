// AI Playtest — the AI "plays" your game by reading everything it can about
// your project (recent scripts, actions, chat prompts, Studio errors, and the
// scene digest) and produces a structured findings report. Results land in
// `playtest_reports` so the rest of the app can consume them like a real
// plugin playtest.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { summarizeSceneScan } from "./scene-digest.server";

const uuid = z.string().uuid();

const NVIDIA_URL = "https://integrate.api.nvidia.com/v1/chat/completions";
const MODEL = "meta/llama-3.3-70b-instruct";

const SYSTEM = `You are a Roblox QA autopilot. You "playtest" a Roblox project by reading its scripts, scene layout, recent chat prompts, and any captured Studio errors, then produce a rigorous audit.

Return STRICT JSON only, no markdown, in this exact shape:
{
  "summary": {
    "verdict": "clean" | "warnings" | "broken",
    "headline": "one-sentence takeaway",
    "score": 0-100,
    "narrative": "3-6 sentence walkthrough of what the AI 'saw' when it played",
    "highlights": ["short good thing", "..."],
    "next_steps": ["short recommendation", "..."]
  },
  "metrics": {
    "scripts_analyzed": integer,
    "critical": integer,
    "high": integer,
    "medium": integer,
    "low": integer
  },
  "findings": [
    {
      "severity": "critical" | "high" | "medium" | "low",
      "category": "script" | "gameplay" | "performance" | "security" | "ui" | "mobile" | "asset",
      "title": "short",
      "detail": "1-3 sentence explanation",
      "path": "optional Studio path such as ServerScriptService.Combat.Damage",
      "suggested_fix": "1 sentence, imperative"
    }
  ]
}

Rules:
- If nothing bad is found, set verdict=clean, findings=[], keep all metric counts at 0, and still write narrative + highlights.
- If some scripts are provided, ground every finding in real evidence from the code shown to you.
- Never invent files or paths that were not in the input; only flag issues you can point to.
- Cap findings at 20. Cap highlights/next_steps at 6 each.
- Be direct, no hedging, no marketing tone.`;

function safeJson(text: string): any | null {
  const trimmed = text.trim();
  // Try direct parse, then extract the largest brace block.
  try { return JSON.parse(trimmed); } catch {}
  const m = trimmed.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try { return JSON.parse(m[0]); } catch { return null; }
}

function clampInt(v: any, min: number, max: number, fallback = 0) {
  const n = Math.round(Number(v));
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

export const runAiPlaytest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ project_id: uuid }).parse(i))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as any;

    // Access check reuses the existing RPC used by the rest of the app.
    const { data: canAccess } = await sb.rpc("can_access_project", {
      _project_id: data.project_id,
      _user_id: context.userId,
    });
    if (!canAccess) throw new Error("No access to this project");

    const [{ data: project }, { data: actions }, { data: chats }, { data: errors }, { data: session }] = await Promise.all([
      sb.from("projects").select("name, description, game_type, build_count").eq("id", data.project_id).maybeSingle(),
      sb.from("plugin_actions")
        .select("kind, name, parent_path, payload, status, error, created_at")
        .eq("project_id", data.project_id)
        .order("created_at", { ascending: false })
        .limit(40),
      sb.from("chat_messages")
        .select("role, content, created_at")
        .eq("project_id", data.project_id)
        .order("created_at", { ascending: false })
        .limit(14),
      sb.from("studio_errors")
        .select("message, source, severity, created_at")
        .eq("project_id", data.project_id)
        .order("created_at", { ascending: false })
        .limit(20),
      sb.from("plugin_sessions")
        .select("last_scan, last_scan_at, plugin_version, place_id")
        .eq("user_id", context.userId)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    if (!project) throw new Error("Project not found");

    const digest = summarizeSceneScan(session?.last_scan ?? null);

    // Build the script sample: prefer scripts that are still queued/failed,
    // then most recent completed ones. Truncate individually to keep the
    // total prompt bounded.
    type ActRow = { kind: string; name: string; parent_path: string; payload: any; status: string; error: string | null };
    const rows: ActRow[] = (actions ?? []) as ActRow[];
    const scriptRows = rows.filter((r) => /script/i.test(r.kind) || r.kind === "run_lua");
    const failing = scriptRows.filter((r) => r.status === "failed" || r.error);
    const rest = scriptRows.filter((r) => !failing.includes(r));
    const chosen = [...failing, ...rest].slice(0, 8);

    const scriptSamples = chosen.map((r) => {
      const src = String(r?.payload?.source ?? r?.payload?.code ?? "").trim();
      const clipped = src.length > 3200 ? src.slice(0, 3200) + "\n-- (truncated)" : src;
      return {
        name: r.name,
        kind: r.kind,
        parent: r.parent_path,
        status: r.status,
        error: r.error ?? undefined,
        source: clipped || "(empty)",
      };
    });

    const chatSummary = (chats ?? []).slice(0, 10).map((c: any) => ({
      role: c.role,
      text: String(c.content ?? "").slice(0, 400),
    })).reverse();

    const payload = {
      project: {
        name: project.name,
        description: project.description,
        type: project.game_type,
        builds: project.build_count,
      },
      scene: digest.text,
      plugin_version: session?.plugin_version ?? null,
      last_scan_at: session?.last_scan_at ?? null,
      studio_errors: (errors ?? []).slice(0, 10),
      recent_chat: chatSummary,
      scripts: scriptSamples,
      action_stats: {
        total: rows.length,
        failed: rows.filter((r) => r.status === "failed").length,
        pending: rows.filter((r) => r.status === "pending" || r.status === "queued").length,
      },
    };

    const key = process.env.NVIDIA_API_KEY;
    if (!key) throw new Error("AI playtest is unavailable — NVIDIA API key not configured.");

    let parsed: any = null;
    let raw = "";
    try {
      const res = await fetch(NVIDIA_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${key}`,
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: MODEL,
          messages: [
            { role: "system", content: SYSTEM },
            { role: "user", content: `Playtest this Roblox project and return the JSON audit.\n\n${JSON.stringify(payload)}` },
          ],
          temperature: 0.2,
          top_p: 0.9,
          max_tokens: 3000,
          response_format: { type: "json_object" },
          stream: false,
        }),
      });
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        throw new Error(`AI playtest failed (${res.status}): ${body.slice(0, 300)}`);
      }
      const dataResp = await res.json();
      raw = String(dataResp?.choices?.[0]?.message?.content ?? "");
      parsed = safeJson(raw);
    } catch (e: any) {
      throw new Error(e?.message || "AI playtest request failed");
    }

    if (!parsed || typeof parsed !== "object") {
      throw new Error("AI returned no parseable playtest report");
    }

    const summary = parsed.summary && typeof parsed.summary === "object" ? parsed.summary : {};
    const findingsIn = Array.isArray(parsed.findings) ? parsed.findings.slice(0, 20) : [];
    const findings = findingsIn.map((f: any) => ({
      severity: ["critical", "high", "medium", "low"].includes(String(f?.severity)) ? f.severity : "medium",
      category: String(f?.category ?? "script"),
      title: String(f?.title ?? "Issue").slice(0, 160),
      detail: String(f?.detail ?? "").slice(0, 800),
      path: f?.path ? String(f.path).slice(0, 200) : undefined,
      suggested_fix: f?.suggested_fix ? String(f.suggested_fix).slice(0, 400) : undefined,
    }));

    const counts = {
      critical: findings.filter((f: any) => f.severity === "critical").length,
      high: findings.filter((f: any) => f.severity === "high").length,
      medium: findings.filter((f: any) => f.severity === "medium").length,
      low: findings.filter((f: any) => f.severity === "low").length,
    };

    const metricsIn = parsed.metrics && typeof parsed.metrics === "object" ? parsed.metrics : {};
    const metrics = {
      scripts_analyzed: clampInt(metricsIn.scripts_analyzed ?? scriptSamples.length, 0, 999, scriptSamples.length),
      critical: counts.critical,
      high: counts.high,
      medium: counts.medium,
      low: counts.low,
      simulated: true,
      model: MODEL,
    };

    const finalSummary = {
      verdict: ["clean", "warnings", "broken"].includes(String(summary.verdict)) ? summary.verdict : (counts.critical + counts.high > 0 ? "broken" : counts.medium > 0 ? "warnings" : "clean"),
      headline: String(summary.headline ?? "AI playtest complete").slice(0, 240),
      score: clampInt(summary.score, 0, 100, Math.max(0, 100 - counts.critical * 20 - counts.high * 10 - counts.medium * 4 - counts.low)),
      narrative: String(summary.narrative ?? "").slice(0, 1600),
      highlights: Array.isArray(summary.highlights) ? summary.highlights.slice(0, 6).map((s: any) => String(s).slice(0, 200)) : [],
      next_steps: Array.isArray(summary.next_steps) ? summary.next_steps.slice(0, 6).map((s: any) => String(s).slice(0, 240)) : [],
      project_id: data.project_id,
      project_name: project.name,
    };

    const { data: row, error } = await sb.from("playtest_reports").insert({
      user_id: context.userId,
      place_id: session?.place_id ?? null,
      summary: finalSummary,
      findings,
      metrics,
    }).select("id, created_at, summary, findings, metrics, place_id").single();
    if (error) throw new Error(error.message);

    // Nice-to-have: log activity so it shows up on the project timeline.
    try {
      await sb.from("project_activity").insert({
        project_id: data.project_id,
        user_id: context.userId,
        kind: "playtest.ai",
        summary: `AI playtest ran — ${counts.critical + counts.high} blocker(s), ${counts.medium + counts.low} note(s)`,
        meta: { report_id: row.id, verdict: finalSummary.verdict, score: finalSummary.score },
      });
    } catch { /* activity log is best-effort */ }

    return row;
  });

export const listAiPlaytest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ project_id: uuid.optional(), limit: z.number().int().min(1).max(20).default(5) }).parse(i ?? {}))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as any;
    let q = sb.from("playtest_reports")
      .select("id, created_at, summary, findings, metrics, place_id")
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false })
      .limit(data.limit);
    // Filter by project via the summary JSON we store above.
    if (data.project_id) q = q.filter("summary->>project_id", "eq", data.project_id);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return rows ?? [];
  });
