import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { convertToModelMessages, streamText, type UIMessage } from "ai";
import { getProviderModel, getFallbackModel } from "@/lib/ai-gateway.server";
import { BLOXSMITH_SYSTEM_PROMPT, parseActions } from "@/lib/bloxsmith-prompt";
import { DEFAULT_MODEL_ID, findModel, isSelectable } from "@/lib/models";

function jsonError(message: string, status: number, code?: string) {
  return new Response(JSON.stringify({ error: message, code }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export const Route = createFileRoute("/api/chat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const auth = request.headers.get("authorization") ?? "";
          const token = auth.replace(/^Bearer\s+/i, "");
          if (!token) return jsonError("Please sign in again before sending a message.", 401, "no_auth");

          let body: { messages?: UIMessage[]; projectId?: string; modelId?: string; autoExecute?: boolean; mode?: "chat" | "build"; language?: string; languageName?: string };
          try {
            body = (await request.json()) as typeof body;
          } catch {
            return jsonError("Invalid JSON in request body.", 400, "bad_json");
          }
          const mode: "chat" | "build" = body.mode === "chat" ? "chat" : "build";
          const languageName = (body.languageName || "English").toString().slice(0, 60);
          const languageCode = (body.language || "en").toString().slice(0, 8);
          const { messages, projectId } = body;
          if (!Array.isArray(messages) || messages.length === 0) {
            return jsonError("No messages were sent — type something and try again.", 400, "missing_messages");
          }
          if (!projectId || typeof projectId !== "string") {
            return jsonError("Missing project id — open a project before chatting.", 400, "missing_project");
          }

          const requestedId = body.modelId || DEFAULT_MODEL_ID;
          const requested = findModel(requestedId);
          if (!isSelectable(requested)) {
            return jsonError(
              `Model "${requested.label}" is marked Coming Soon and isn't available yet. Pick a different model.`,
              400,
              "model_unavailable",
            );
          }

          const supabase = createClient(
            process.env.SUPABASE_URL!,
            process.env.SUPABASE_PUBLISHABLE_KEY!,
            { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false } },
          );

          const { data: userData } = await supabase.auth.getUser();
          if (!userData.user) return jsonError("Your session expired. Please sign in again.", 401, "expired");
          const userId = userData.user.id;

          const { data: project, error: projErr } = await supabase
            .from("projects")
            .select("id, user_id, name, description, game_type, build_count")
            .eq("id", projectId)
            .maybeSingle();
          if (projErr || !project) return jsonError("Project not found or you don't have access to it.", 404, "project_not_found");

          const lastUser = [...messages].reverse().find((m) => m.role === "user");
          const userText = lastUser?.parts.map((p) => (p.type === "text" ? p.text : "")).join("") ?? "";
          if (userText) {
            await supabase.from("chat_messages").insert({
              project_id: projectId,
              user_id: userId,
              role: "user",
              content: userText,
              status: "done",
            });
          }

          let modelChoice;
          try {
            modelChoice = getProviderModel(requestedId);
          } catch (e) {
            return jsonError(e instanceof Error ? e.message : "Model unavailable", 500, "provider_init_failed");
          }

          // ── MEMORY + STUDIO CONTEXT ──
          // Pull project metadata, recent builds, latest game scan, recent errors,
          // and existing queued actions so the AI knows what already exists and
          // doesn't rebuild or duplicate things across turns.
          let contextBlock = "";
          try {
            const [{ data: session }, { data: recentErrors }, { data: recentBuilds }, { data: existingActions }] = await Promise.all([
              supabase
                .from("plugin_sessions")
                .select("last_scan, last_scan_at, online")
                .eq("user_id", userId)
                .maybeSingle(),
              supabase
                .from("studio_errors")
                .select("level, source, message, created_at")
                .eq("user_id", userId)
                .order("created_at", { ascending: false })
                .limit(15),
              supabase
                .from("build_history")
                .select("prompt, files_count, created_at")
                .eq("project_id", projectId)
                .order("created_at", { ascending: false })
                .limit(10),
              supabase
                .from("plugin_actions")
                .select("kind, name, parent_path, status")
                .eq("project_id", projectId)
                .order("created_at", { ascending: false })
                .limit(40),
            ]);

            const parts: string[] = [];
            parts.push(
              `PROJECT MEMORY:\n- Name: ${project.name ?? "(unnamed)"}\n- Type: ${project.game_type ?? "(unspecified)"}\n- Description: ${project.description ?? "(none)"}\n- Total builds so far: ${project.build_count ?? 0}`,
            );
            if (recentBuilds && recentBuilds.length > 0) {
              parts.push(
                `RECENT USER REQUESTS in this project (newest first) — do NOT redo these unless asked, build ON TOP of them:\n${recentBuilds.map((b) => `• ${new Date(b.created_at).toISOString().slice(0, 10)} (${b.files_count} actions): ${String(b.prompt).slice(0, 200)}`).join("\n")}`,
              );
            }
            if (existingActions && existingActions.length > 0) {
              const byKind = existingActions.reduce<Record<string, string[]>>((acc, a) => {
                const k = a.kind ?? "unknown";
                (acc[k] ||= []).push(`${a.parent_path}.${a.name}`);
                return acc;
              }, {});
              const summary = Object.entries(byKind)
                .map(([k, names]) => `  ${k}: ${names.slice(0, 12).join(", ")}${names.length > 12 ? ` (+${names.length - 12} more)` : ""}`)
                .join("\n");
              parts.push(
                `ALREADY-QUEUED/BUILT INSTANCES in this project (avoid duplicating — modify via set_properties / rename / delete instead):\n${summary}`,
              );
            }
            if (session?.last_scan) {
              const scanStr = JSON.stringify(session.last_scan);
              parts.push(
                `CURRENT ROBLOX STUDIO GAME TREE (uploaded ${session.last_scan_at ?? "recently"}). Use this to avoid duplicating things that already exist; reference existing instances by path when appropriate:\n${scanStr.length > 12000 ? scanStr.slice(0, 12000) + "…[truncated]" : scanStr}`,
              );
            }
            if (recentErrors && recentErrors.length > 0) {
              const errLines = recentErrors
                .map((e) => `[${e.level}] ${e.source}: ${e.message}`)
                .join("\n");
              parts.push(
                `RECENT ROBLOX STUDIO OUTPUT (newest first). If any of these were caused by your previous builds, emit corrected actions to fix them in this response:\n${errLines}`,
              );
            }
            contextBlock = "\n\n---\nLIVE CONTEXT (auto-injected memory + Studio state):\n\n" + parts.join("\n\n---\n");
          } catch (e) {
            console.warn("[chat] failed to load studio context", e);
          }

          const convertedMessages = await convertToModelMessages(messages);

          const persistFinish = (usedModelId: string, fallbackNotice: string | null) =>
            async ({ text }: { text: string }) => {
              try {
                const finalText = fallbackNotice ? `${fallbackNotice}\n\n${text}` : text;
                const { cleanContent, actions } = parseActions(finalText);
                const { data: msgRow } = await supabase.from("chat_messages").insert({
                  project_id: projectId,
                  user_id: userId,
                  role: "assistant",
                  content: cleanContent,
                  status: actions.length > 0 ? "sending" : "done",
                  model: usedModelId,
                  actions,
                }).select("id").single();

                if (actions.length > 0 && mode === "build") {
                  await supabase.from("plugin_actions").insert(
                    actions.map((a, i) => ({
                      project_id: projectId,
                      user_id: userId,
                      message_id: msgRow?.id ?? null,
                      kind: a.kind,
                      parent_path: a.parent_path,
                      name: a.name,
                      payload: a.payload,
                      position: i,
                    })),
                  );
                }

                const { data: currentProject } = await supabase
                  .from("projects")
                  .select("build_count")
                  .eq("id", projectId)
                  .single();

                await supabase
                  .from("projects")
                  .update({
                    last_model_used: usedModelId,
                    build_count: (currentProject?.build_count ?? 0) + (actions.length > 0 ? 1 : 0),
                    updated_at: new Date().toISOString(),
                  })
                  .eq("id", projectId);

                if (userText) {
                  await supabase.from("build_history").insert({
                    project_id: projectId,
                    user_id: userId,
                    prompt: userText,
                    model: usedModelId,
                    files_count: actions.length,
                    plugin_status: "Disconnected",
                  });
                }
              } catch (e) {
                console.error("onFinish persist error", e);
              }
            };

          // Try the requested model. On upstream error, retry once with fallback.
          const modeHeader = `\n\n[MODE: ${mode}]\n${mode === "chat"
            ? "The user is BRAINSTORMING — respond conversationally and DO NOT emit any bloxsmith-actions block. Help them think, plan, and explore ideas."
            : "The user wants you to BUILD — emit a bloxsmith-actions block at the end with ONLY what they explicitly asked for, polished to the premium quality bar."}\n`;
          const tryStream = (
            model: typeof modelChoice.model,
            usedModelId: string,
            notice: string | null,
          ) => streamText({
            model,
            system: BLOXSMITH_SYSTEM_PROMPT + modeHeader + contextBlock,
            messages: convertedMessages,
            onFinish: persistFinish(usedModelId, notice),
            onError: ({ error }) => {
              console.error(`[chat] upstream error on ${usedModelId}`, error);
            },
          });

          let result = tryStream(modelChoice.model, modelChoice.meta.id, modelChoice.usedFallback
            ? `_Switched to ${modelChoice.meta.label} because the selected model isn't available._`
            : null);

          // Wrap in fallback: if the stream errors before any tokens, retry with fallback.
          try {
            return result.toUIMessageStreamResponse({
              onError: (err) => {
                console.error("[chat] stream error", err);
                if (err instanceof Error) {
                  if (/402|credit/i.test(err.message)) return "AI credits are exhausted. Add more credits in Settings → Plans.";
                  if (/429|rate/i.test(err.message)) return "AI is rate-limited right now. Wait a few seconds and try again.";
                  return `AI request failed: ${err.message}`;
                }
                return "AI request failed.";
              },
            });
          } catch (streamErr) {
            console.error("[chat] requested model failed, trying fallback", streamErr);
            const fb = getFallbackModel();
            result = tryStream(
              fb.model,
              fb.meta.id,
              `_The selected model failed, so BloxSmith switched to ${fb.meta.label} (fallback)._`,
            );
            return result.toUIMessageStreamResponse();
          }
        } catch (e) {
          console.error("[chat] fatal", e);
          return jsonError(e instanceof Error ? e.message : "Unknown error", 500, "fatal");
        }
      },
    },
  },
});
