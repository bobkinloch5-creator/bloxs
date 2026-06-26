import { createServerFn } from "@tanstack/react-start";
import { generateText } from "ai";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { getProviderModel } from "@/lib/ai-gateway.server";
import { findModel, isSelectable } from "@/lib/models";
import { parseActions } from "@/lib/bloxsmith-prompt";

const OWNER_EMAIL = "bobkinloch5@gmail.com";

const ROBLOX_MODEL_TEST_SYSTEM = `You are BloxSmith's Roblox Studio model validation harness.
Every tested model must follow the shared BloxSmith Core Brain: Roblox knowledge, Luau rules, safe Toolbox/Creator Store asset discipline, build planning, plugin execution, testing/fixing, project memory, and premium quality. No model is allowed to behave like a generic chatbot.
Return a short answer plus exactly one fenced bloxsmith-actions JSON block.
The build must be Roblox/Luau-specific, safe, and executable by the BloxSmith plugin.
Rules:
- Create a complete tiny Roblox UI/system, not generic web code.
- Use Roblox services, Luau, RemoteEvent/RemoteFunction, StarterGui, ReplicatedStorage, and ServerScriptService correctly.
- Include server validation, testing/cleanup intent, and no TODO/placeholders.
- Use action kinds only from: folder, script, localscript, modulescript, screengui, remoteevent, remotefunction, frame, textlabel, textbutton, run_lua, organize_project.
- Do not mention copying code manually.`;

const ROBLOX_MODEL_TEST_PROMPT = `Build a premium Roblox coin HUD with:
- ReplicatedStorage.Remotes.AddCoins RemoteEvent
- ServerScriptService script that validates amount and updates leaderstats Coins
- StarterGui ScreenGui with polished currency HUD
- LocalScript that animates the coin text when the value changes
- organize_project at the end
- mention the shared Core Brain briefly in the explanation`;

function validateRobloxBuild(text: string) {
  const parsed = parseActions(text);
  const issues: string[] = [];
  const lower = text.toLowerCase();
  if (!text.includes("```bloxsmith-actions")) issues.push("missing bloxsmith-actions block");
  if (parsed.actions.length < 4) issues.push("too few actions");
  if (!parsed.actions.some((a) => a.kind === "remoteevent" || a.kind === "remotefunction")) issues.push("missing remote");
  if (!parsed.actions.some((a) => a.kind === "script" && String(a.parent_path).includes("ServerScriptService"))) issues.push("missing server script");
  if (!parsed.actions.some((a) => a.kind === "screengui" || String(a.parent_path).includes("StarterGui"))) issues.push("missing StarterGui UI");
  if (!parsed.actions.some((a) => a.kind === "localscript")) issues.push("missing LocalScript");
  if (!parsed.actions.some((a) => a.kind === "organize_project")) issues.push("missing organize_project");
  if (!lower.includes("game:getservice")) issues.push("missing Roblox service usage");
  if (!lower.includes("core brain")) issues.push("missing Core Brain acknowledgement");
  if (!lower.includes("leaderstats")) issues.push("missing leaderstats");
  if (!lower.includes("tweenservice")) issues.push("missing UI animation");
  if (lower.includes("todo") || lower.includes("placeholder")) issues.push("contains placeholder/TODO wording");
  if (lower.includes("copy") && lower.includes("paste")) issues.push("manual copy/paste instruction");
  return {
    ok: issues.length === 0,
    issues,
    actions: parsed.actions.length,
  };
}

async function assertOwner(context: { supabase: { auth: { getUser: () => Promise<{ data: { user: { email?: string | null } | null } }> } }; claims: Record<string, unknown> }) {
  const { data } = await context.supabase.auth.getUser();
  const email = (data.user?.email ?? (typeof context.claims.email === "string" ? context.claims.email : "")).toLowerCase();
  if (email !== OWNER_EMAIL) throw new Error("Not authorized");
}

export const testModel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => {
    const v = input as { modelId?: string };
    if (!v?.modelId || typeof v.modelId !== "string") throw new Error("modelId required");
    return { modelId: v.modelId };
  })
  .handler(async ({ data, context }) => {
    await assertOwner(context);

    const meta = findModel(data.modelId);
    if (!isSelectable(meta)) {
      return { ok: false, modelId: data.modelId, error: "Marked Coming Soon", durationMs: 0 };
    }

    const started = Date.now();
    try {
      const { model, extraBody } = getProviderModel(data.modelId);
      const result = await generateText({
        model,
        system: ROBLOX_MODEL_TEST_SYSTEM,
        prompt: ROBLOX_MODEL_TEST_PROMPT,
        ...(extraBody ? { providerOptions: { nvidia: extraBody } } : {}),
      });
      const durationMs = Date.now() - started;
      const text = (result.text ?? "").trim();
      const validation = validateRobloxBuild(text);
      return {
        ok: text.length > 0 && validation.ok,
        modelId: data.modelId,
        reply: text.slice(0, 240),
        actions: validation.actions,
        issues: validation.issues,
        durationMs,
        error: text.length === 0
          ? "Empty response"
          : validation.ok
          ? undefined
          : validation.issues.join("; "),
      };
    } catch (e) {
      return {
        ok: false,
        modelId: data.modelId,
        error: e instanceof Error ? e.message : "Unknown error",
        durationMs: Date.now() - started,
      };
    }
  });
