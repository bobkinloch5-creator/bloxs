import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { convertToModelMessages, streamText, type UIMessage } from "ai";
import { getProviderModel } from "@/lib/ai-gateway.server";
import { BLOXSMITH_SYSTEM_PROMPT, parseActions } from "@/lib/bloxsmith-prompt";
import { DEFAULT_MODEL_ID } from "@/lib/models";

export const Route = createFileRoute("/api/chat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const auth = request.headers.get("authorization") ?? "";
          const token = auth.replace(/^Bearer\s+/i, "");
          if (!token) return new Response("Please sign in again before sending a message.", { status: 401 });

          const body = (await request.json()) as {
            messages?: UIMessage[];
            projectId?: string;
            modelId?: string;
          };
          const { messages, projectId } = body;
          const modelId = body.modelId || DEFAULT_MODEL_ID;
          if (!Array.isArray(messages) || !projectId) {
            return new Response("Bad request", { status: 400 });
          }

          const supabase = createClient(
            process.env.SUPABASE_URL!,
            process.env.SUPABASE_PUBLISHABLE_KEY!,
            { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false } },
          );

          const { data: userData } = await supabase.auth.getUser();
          if (!userData.user) return new Response("Your session expired. Please sign in again.", { status: 401 });
          const userId = userData.user.id;

          // Verify project ownership (RLS would also block, but fail fast)
          const { data: project, error: projErr } = await supabase
            .from("projects")
            .select("id, user_id")
            .eq("id", projectId)
            .maybeSingle();
          if (projErr || !project) return new Response("Project not found", { status: 404 });

          // Persist the latest user message
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

          // Pick model + provider (may throw if BYOK key missing)
          let modelChoice;
          try {
            modelChoice = getProviderModel(modelId);
          } catch (e) {
            return Response.json(
              { error: e instanceof Error ? e.message : "Model unavailable" },
              { status: 400 },
            );
          }

          const result = streamText({
            model: modelChoice.model,
            system: BLOXSMITH_SYSTEM_PROMPT,
            messages: await convertToModelMessages(messages),
            onFinish: async ({ text }) => {
              try {
                const { cleanContent, actions } = parseActions(text);
                // Save assistant message
                const { data: msgRow } = await supabase.from("chat_messages").insert({
                  project_id: projectId,
                  user_id: userId,
                  role: "assistant",
                  content: cleanContent,
                  status: actions.length > 0 ? "sending" : "done",
                  model: modelId,
                  actions,
                }).select("id").single();

                // Queue plugin actions
                if (actions.length > 0) {
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

                // Bump build counter + last model
                const { data: currentProject } = await supabase
                  .from("projects")
                  .select("build_count")
                  .eq("id", projectId)
                  .single();

                await supabase
                  .from("projects")
                  .update({
                    last_model_used: modelId,
                    build_count: (currentProject?.build_count ?? 0) + (actions.length > 0 ? 1 : 0),
                    updated_at: new Date().toISOString(),
                  })
                  .eq("id", projectId);

                // Build history
                if (userText) {
                  await supabase.from("build_history").insert({
                    project_id: projectId,
                    user_id: userId,
                    prompt: userText,
                    model: modelId,
                    files_count: actions.length,
                    plugin_status: "Disconnected",
                  });
                }
              } catch (e) {
                console.error("onFinish persist error", e);
              }
            },
          });

          return result.toUIMessageStreamResponse();
        } catch (e) {
          console.error(e);
          return Response.json(
            { error: e instanceof Error ? e.message : "Unknown error" },
            { status: 500 },
          );
        }
      },
    },
  },
});
