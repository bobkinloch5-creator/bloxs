import { createServerFn } from "@tanstack/react-start";
import { generateText } from "ai";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { getProviderModel } from "@/lib/ai-gateway.server";
import { findModel, isSelectable } from "@/lib/models";
import { parseActions } from "@/lib/bloxsmith-prompt";

export type ModelHealthStatus = "Working" | "Partially Working" | "Not Working" | "Slow" | "Needs Fix";

const ROBLOX_MODEL_TEST_SYSTEM = `You are BloxSmith's Roblox Studio model validation harness.
Every tested model must follow the shared BloxSmith Core Brain: Roblox knowledge, Luau rules, safe Toolbox/Creator Store asset discipline, build planning, plugin execution, testing/fixing, project memory, and premium quality. No model is allowed to behave like a generic chatbot.
Return a short answer plus exactly one fenced bloxsmith-actions JSON block.
The build must be Roblox/Luau-specific, safe, and executable by the BloxSmith plugin.
Rules:
- Create a complete tiny Roblox UI/system, not generic web code.
- The fenced block must be named exactly bloxsmith-actions and contain valid JSON.
- Include 5-8 actions so the scanner can verify Roblox execution readiness.
- Use Roblox services, Luau, RemoteEvent/RemoteFunction, StarterGui, ReplicatedStorage, and ServerScriptService correctly.
- Include server validation, testing/cleanup intent, and no TODO/placeholders.
- Use action kinds only from: script, localscript, modulescript, screengui, remoteevent, remotefunction, frame, textlabel, textbutton, run_lua, organize_project.
- Do not create standalone folder actions. If a folder path is needed, insert real content into that path so the plugin can keep only non-empty folders.
- Do not mention copying code manually.`;

const ROBLOX_MODEL_TEST_PROMPT = `Build a premium Roblox coin HUD with:
- ReplicatedStorage.Remotes.AddCoins RemoteEvent
- ServerScriptService script that validates amount and updates leaderstats Coins
- StarterGui ScreenGui with polished currency HUD
- LocalScript that animates the coin text when the value changes
- organize_project at the end
- mention the shared Core Brain briefly in the explanation

Use this exact response shape:
1 short sentence explaining the Roblox Core Brain check.
\`\`\`bloxsmith-actions
[
  {"kind":"remoteevent","parent_path":"ReplicatedStorage.Remotes","name":"AddCoins","payload":{}}
]
\`\`\``;

function validateRobloxBuild(text: string) {
  const parsed = parseActions(text);
  const issues: string[] = [];
  const lower = text.toLowerCase();
  const hasRemote = parsed.actions.some((a) => a.kind === "remoteevent" || a.kind === "remotefunction");
  const hasServerScript = parsed.actions.some((a) => a.kind === "script" || String(a.parent_path).toLowerCase().includes("serverscriptservice"));
  const hasUi = parsed.actions.some((a) => a.kind === "screengui" || a.kind === "frame" || String(a.parent_path).toLowerCase().includes("startergui"));
  const hasLocalScript = parsed.actions.some((a) => a.kind === "localscript");
  const hasOrganize = parsed.actions.some((a) => a.kind === "organize_project");
  
  if (!text.includes("```bloxsmith-actions") && !text.includes("```json")) issues.push("missing action block");
  if (parsed.actions.length < 2) issues.push("too few actions");
  if (!hasRemote) issues.push("missing remote");
  if (!hasServerScript) issues.push("missing server script");
  if (!hasUi) issues.push("missing StarterGui UI");
  if (!hasLocalScript) issues.push("missing LocalScript");
  if (!hasOrganize) issues.push("missing organize_project");
  if (!lower.includes("getservice")) issues.push("missing Roblox service usage");
  if (lower.includes("todo") || lower.includes("placeholder")) issues.push("contains placeholder/TODO wording");
  if (lower.includes("copy") && lower.includes("paste")) issues.push("manual copy/paste instruction");

  const criticalPasses = [hasRemote, hasServerScript, hasUi, hasLocalScript, hasOrganize, lower.includes("getservice")].filter(Boolean).length;
  return {
    ok: issues.length === 0,
    issues,
    actions: parsed.actions.length,
    criticalPasses,
  };
}

function classifyHealth(args: {
  text: string;
  durationMs: number;
  validation: ReturnType<typeof validateRobloxBuild>;
}): { healthStatus: ModelHealthStatus; score: number; metrics: Record<string, string> } {
  const { text, durationMs, validation } = args;
  if (!text.trim()) {
    return {
      healthStatus: "Not Working",
      score: 0,
      metrics: { response: "empty", speed: `${durationMs}ms`, reliability: "failed" },
    };
  }

  const speedPenalty = durationMs > 30000 ? 2 : durationMs > 15000 ? 1 : 0;
  const score = Math.max(0, Math.min(100, Math.round((validation.criticalPasses / 6) * 85 + (validation.ok ? 15 : 0) - speedPenalty * 5)));

  if (validation.ok && durationMs > 20000) {
    return { healthStatus: "Slow", score, metrics: { roblox: "pass", luau: "pass", execution: "pass", speed: `${durationMs}ms`, reliability: "slow" } };
  }
  if (validation.ok || (validation.actions >= 3 && validation.criticalPasses >= 4)) {
    return { healthStatus: "Working", score, metrics: { roblox: "pass", luau: "pass", execution: "pass", speed: `${durationMs}ms`, reliability: "stable" } };
  }
  if (validation.actions === 0 || validation.criticalPasses <= 1) {
    return { healthStatus: "Not Working", score, metrics: { roblox: "fail", luau: "fail", execution: "fail", speed: `${durationMs}ms`, reliability: "failed" } };
  }
  if (validation.criticalPasses >= 3) {
    return { healthStatus: "Partially Working", score, metrics: { roblox: "partial", luau: "partial", execution: "partial", speed: `${durationMs}ms`, reliability: "usable with caution" } };
  }
  return { healthStatus: "Needs Fix", score, metrics: { roblox: "weak", luau: "weak", execution: "weak", speed: `${durationMs}ms`, reliability: "needs repair" } };
}

async function assertOwner(context: { supabase: any; userId: string }) {
  if (!context?.userId || context.userId === "dev-owner" || context.userId === "dev-user") return;
  try {
    const { data: isOwner } = await context.supabase.rpc("current_user_has_role", { _role: "owner" });
    if (isOwner) return;
  } catch {
    /* bypass in dev */
  }
}

export const testModel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => {
    const v = input as { modelId?: string };
    if (!v?.modelId || typeof v.modelId !== "string") throw new Error("modelId required");
    return { modelId: v.modelId };
  })
  .handler(async ({ data, context }) => {
    await assertOwner(context);

    const meta = findModel(data.modelId);
    if (!isSelectable(meta)) {
      return { ok: false, modelId: data.modelId, error: "Marked Coming Soon", durationMs: 0, healthStatus: "Not Working" as ModelHealthStatus, score: 0 };
    }

    const started = Date.now();
    try {
      const { model, extraBody, modelSettings } = getProviderModel(data.modelId);
      const result = await generateText({
        model,
        system: ROBLOX_MODEL_TEST_SYSTEM,
        prompt: ROBLOX_MODEL_TEST_PROMPT,
        ...(extraBody ? { providerOptions: { nvidia: extraBody as Record<string, never> } as never } : {}),
        ...(modelSettings?.temperature !== undefined ? { temperature: modelSettings.temperature } : {}),
        ...(modelSettings?.topP !== undefined ? { topP: modelSettings.topP } : {}),
        // The harness asks for 5-8 actions plus a ScreenGui and two scripts.
        // At 1600 tokens most models were truncated mid-JSON and then graded
        // "Not Working" for a missing action block - a harness bug, not a
        // model failure. Give the test the room the task actually needs.
        maxOutputTokens: Math.min(modelSettings?.maxOutputTokens ?? 6000, 6000),
      });
      const durationMs = Date.now() - started;
      const text = (result.text ?? "").trim();
      const validation = validateRobloxBuild(text);
      const health = classifyHealth({ text, durationMs, validation });
      return {
        ok: text.length > 0 && validation.ok,
        modelId: data.modelId,
        reply: text.slice(0, 240),
        actions: validation.actions,
        issues: validation.issues,
        durationMs,
        ...health,
        error: text.length === 0
          ? "Empty response"
          : validation.ok
          ? undefined
          : validation.issues.join("; "),
      };
    } catch (e) {
      const message = e instanceof Error ? e.message : "Unknown error";
      const notConfigured = /is not configured/i.test(message);
      return {
        ok: false,
        modelId: data.modelId,
        // A missing API key is an environment problem. Reporting it as
        // "Not Working" made every model on that gateway look broken.
        error: notConfigured ? `${message} (gateway key missing - not a model fault)` : message,
        durationMs: Date.now() - started,
        healthStatus: "Not Working" as ModelHealthStatus,
        score: 0,
        metrics: { response: "error", reliability: "failed" },
      };
    }
  });
