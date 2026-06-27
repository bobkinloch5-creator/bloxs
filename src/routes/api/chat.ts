import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { convertToModelMessages, streamText, stepCountIs, tool, type UIMessage } from "ai";
import { z } from "zod";
import { getProviderModel, getFallbackModel } from "@/lib/ai-gateway.server";
import { BLOXSMITH_SYSTEM_PROMPT, parseActions } from "@/lib/bloxsmith-prompt";
import { DEFAULT_MODEL_ID, findModel, isSelectable } from "@/lib/models";
import { searchRobloxToolbox, type ToolboxCategory } from "@/lib/roblox-toolbox.server";
import { chargeCredits, creditCostForTier, BUILD_ACTIONS_BONUS } from "@/lib/credits.server";
import { describeImageWithNvidiaPaliGemma } from "@/lib/nvidia-vision.server";
import { generateUiConceptImage } from "@/lib/ui-concept-image.server";
import { normalizePluginAction } from "@/lib/plugin-actions";

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

          // Per-user asset preference (stored in profiles.settings.asset_mode).
          // Old "auto" / "primitives_only" settings are treated as toolbox-only
          // so visual builds do not silently become procedural placeholders.
          let assetMode: "toolbox_only" | "both" = "toolbox_only";
          try {
            const { data: prof } = await supabase
              .from("profiles")
              .select("settings")
              .eq("id", userId)
              .maybeSingle();
            const s = (prof?.settings && typeof prof.settings === "object" ? prof.settings : {}) as Record<string, unknown>;
            const m = s.asset_mode;
            if (m === "both") assetMode = "both";
          } catch { /* ignore */ }


          const lastUser = [...messages].reverse().find((m) => m.role === "user");
          const userText = lastUser?.parts.map((p) => (p.type === "text" ? p.text : "")).join("") ?? "";
          const imageParts = messages
            .flatMap((m) => (m.parts ?? []) as Array<Record<string, unknown>>)
            .filter((p): p is { type: "file"; mediaType: string; url: string } =>
              p?.type === "file" && typeof p.mediaType === "string" && (p.mediaType as string).startsWith("image/") && typeof p.url === "string",
            );
          const userImageUrl = imageParts.at(-1)?.url?.slice(0, 2_000_000) ?? null;
          if (userText) {
            await supabase.from("chat_messages").insert({
              project_id: projectId,
              user_id: userId,
              role: "user",
              content: userText,
              status: "done",
              image_url: userImageUrl,
            });
          }

          let modelChoice;
          try {
            modelChoice = getProviderModel(requestedId);
          } catch (e) {
            return jsonError(e instanceof Error ? e.message : "Model unavailable", 500, "provider_init_failed");
          }

          // ── CREDIT GATE ──
          // Charge upfront based on the model's tier; if a build is produced,
          // we charge a small bonus inside onFinish.
          const baseCost = creditCostForTier(requested.credits);
          const charge = await chargeCredits(supabase, userId, baseCost);
          if (!charge.ok) {
            return jsonError(
              charge.message ?? "Out of credits.",
              charge.code === "banned" ? 403 : 402,
              charge.code ?? "no_credits",
            );
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

          try {
            if (imageParts.length > 0) {
              const vision = await describeImageWithNvidiaPaliGemma(imageParts);
              if (vision) {
                contextBlock += `\n\n---\nNVIDIA PALIGEMMA VISION ANALYSIS:\n${vision}\nUse this as visual reference context only. Build with safe free Toolbox assets and clean Roblox systems; do not invent unsafe assets.`;
              }
            }
          } catch (e) {
            console.warn("[chat] NVIDIA PaliGemma vision analysis failed", e);
          }

          let generatedUiConceptUrl: string | null = null;
          const uiConceptRequested = mode === "build" && /(\bgenerate ui\b|\bimage to roblox ui\b|\bimage-to-roblox ui\b|loading screen|main menu|play button|settings menu|shop ui|inventory ui|gamepass ui|quest ui|\bhud\b|health bar|xp bar|currency display|mobile controls)/i.test(userText);
          if (uiConceptRequested) {
            try {
              generatedUiConceptUrl = await generateUiConceptImage({
                prompt: userText,
                style: "Premium Roblox UI",
              });
              contextBlock += `\n\n---\nAI IMAGE-TO-ROBLOX UI GENERATOR:\nA premium UI concept image has been generated and saved to this chat. Use it as the visual concept, then rebuild it as REAL Roblox UI: ScreenGui, Frames, Buttons, TextLabels, ImageLabels, UICorner, UIStroke, UIGradient, UIPadding, layouts, constraints, UIScale, LocalScripts, animations, remotes, and scan_project/autofix_project checks. Do not leave it as a flat image.`;
            } catch (e) {
              console.warn("[chat] UI concept image generation failed", e);
            }
          }

          const convertedMessages = await convertToModelMessages(messages);

          const persistFinish = (usedModelId: string, fallbackNotice: string | null) =>
            async ({ text }: { text: string }) => {
              try {
                const finalText = fallbackNotice ? `${fallbackNotice}\n\n${text}` : text;
                const parsed = parseActions(finalText);
                // In chat mode, hard-strip any actions block the model accidentally emitted
                // so it never gets shown to the user or queued for Studio.
                const cleanContent = parsed.cleanContent;
                const actions = mode === "chat" ? [] : parsed.actions.map(normalizePluginAction);
                const { data: msgRow } = await supabase.from("chat_messages").insert({
                  project_id: projectId,
                  user_id: userId,
                  role: "assistant",
                  content: cleanContent,
                  status: actions.length > 0 ? "sending" : "done",
                  model: usedModelId,
                  actions,
                  image_url: generatedUiConceptUrl,
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

                // Extra credit charge when the turn actually produces a build.
                if (actions.length > 0 && mode === "build") {
                  const bonus = BUILD_ACTIONS_BONUS + Math.min(4, Math.floor(actions.length / 8));
                  await chargeCredits(supabase, userId, bonus).catch(() => null);
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
            ? "The user is in CHAT MODE — brainstorming and conversation only. RULES:\n- You MUST NOT emit a `bloxsmith-actions` block this turn.\n- You MUST NOT call the search_toolbox tool (it isn't available this turn).\n- BUT — you are NOT capability-less. In Build Mode you CAN delete instances, clear the workspace, modify properties, rename, move, insert Toolbox assets, run arbitrary Luau via run_lua, and build complete systems. NEVER tell the user 'I don't have a tool for that' or 'I can't delete/modify your project' — that is FALSE and forbidden. The correct response is: 'I can do that in Build Mode — switch the toggle next to the send button to Build and re-send, and I'll <delete X / clear the workspace / modify Y> for you.' You may also show the exact Luau they could paste into the Command Bar themselves as a manual alternative, but ALWAYS offer the Build Mode path first.\n- Otherwise: help them think, plan, compare options, sketch systems in words, answer questions, give Roblox advice.\n- If the user explicitly types 'build it now', 'go build', 'yes build', or 'apply build' you MAY emit actions this turn.\nThis rule overrides every other instruction about emitting actions or using tools."
            : "You are using the shared BloxSmith Core Brain. This Core Brain applies to EVERY model/provider, including the currently selected model: Roblox knowledge, Luau rules, safe Toolbox/Creator Store asset rules, planning, plugin execution, testing/fixing, memory, and quality standards are mandatory and consistent across models. BloxSmith should behave like an autonomous Roblox development studio: senior Roblox developer, designer, builder, UI artist, scripter, tester, optimizer, and safe asset curator working together. The user wants you to act as a Roblox Studio game-building agent with Knowledge, Planning, Execution, Toolbox Asset, Testing, Fixing, Memory, and Quality brains. You have FULL EXECUTION CAPABILITY: insert Toolbox assets, build parts/UI/scripts/remotes, modify properties, rename, move, DELETE instances (use the `delete` action with target_path, or run_lua with :Destroy() for batch deletes like clearing the workspace except the Baseplate), and run arbitrary Luau via run_lua. If the user asks to erase / clear / wipe / delete everything except X, emit ONE run_lua action that iterates the relevant services (Workspace, StarterGui, StarterPack, etc.) and Destroys children whose name isn't in the keep-list — do not refuse and do not tell them to do it manually. Silently analyze genre, theme, art style, gameplay loop, map size, progression, multiplayer, UI, NPCs, required assets/scripts, performance, mobile support, and cleanup before building. Then summarize the relevant Asset/Builder/Scripter/UI/Tester/Optimizer/Memory agent work and emit a bloxsmith-actions block at the end that ships the FULL system end-to-end: every script, every premium UI surface, every RemoteEvent, every DataStore, every placement, all wired together and actually functional. Plan → execute → connect → optimize → test → fix: use live scan/workspace awareness and project memory to extend what already exists, avoid duplicates, organize services correctly, emit organize_project for large builds, autofix_project for repairs, and scan_project after major builds so failures are visible. Folders must only exist when they contain real content; never emit folder/create_folder actions, never create folder-only scaffolding, and remove/prune empty folders before saying the build is ready. You can build ANY Roblox game genre, custom hybrid, or standalone game system. For any game request, infer the genre, build a playable loop, map/world assets, spawn, UI/HUD/objective tracker, progression/rewards, server scripts, client scripts, remotes/modules, and a test/cleanup pass. Support tycoon, obby, simulator, RPG, horror, survival, fighting, racing, city, roleplay, pet, story, dungeon/quest, minigame, shooter, tower defense, sandbox, farming/cooking/shop management, social hangout, and any custom idea by combining proven Roblox systems. Any loading screen/menu/HUD/shop/inventory/settings/quest/notification UI must look modern, polished, animated, responsive, mobile-safe, and fully wired: no default grey UI, no broken buttons, no overlapping text, no placeholder panels. For visual Roblox content, use safe free Toolbox / Creator Store models via search_toolbox + insert_asset. Use run_lua for placement, scaling, rotation, terrain adjustments, scripts, UI wiring, Roblox service setup, AND deletion/cleanup batches. If no safe relevant Toolbox asset is found, ask the user before generating any fallback geometry. NO fake buttons, NO empty folders, NO placeholder scripts, NO TODOs. Stay on-topic but inside the topic build EVERYTHING the system needs. Aim for 10-30 actions for full systems."}\n`;

          const languageHeader = `\n[LANGUAGE: ${languageCode} / ${languageName}]\nRespond ENTIRELY in ${languageName}. Translate every sentence, heading, button name, status message, error message, and explanation into natural, fluent, idiomatic ${languageName}. Keep code identifiers, Roblox API names (Instance class names, services, property names like Workspace, Part, ScreenGui, HumanoidRootPart), and the bloxsmith-actions block contents in English exactly as required by Roblox. Translate UI strings the player will see (TextLabel.Text, button text, GUI titles, error notifications shown to players) into ${languageName}. Markdown formatting stays the same.\n`;

          const assetModeRule = mode === "chat" ? "" : (() => {
            switch (assetMode) {
              case "toolbox_only":
                return `\n[ASSET MODE: TOOLBOX ONLY]\nThe user has chosen Toolbox Assets Only. Hard rules for this turn:\n- For every visual model (trees, buildings, vehicles, NPCs, pets, weapons, props, decor, furniture, roads, shops, cities, forests, maps, worlds, and environment kits) you MUST call the search_toolbox tool and emit insert_asset actions with safe returned ids.\n- Do a WIDE Creator Store search: split broad prompts into categories and call search_toolbox separately for each needed category. Example city = road/street, building/skyscraper/shop, street light, car/vehicle, sign/decor. Example forest = tree, rock, bush, cabin, animal/NPC if needed.\n- DO NOT build trees, houses, roads, cars, NPCs, weapons, decorations, maps, or random scenery from primitives in run_lua. DO NOT emit raw "part" actions to fake real-world objects.\n- Only use run_lua for placement/scaling/rotation of inserted assets, clean organization, service setup, scripts, UI wiring, and non-visual support logic.\n- If search_toolbox returns source "none" for a required category, tell the user plainly that no safe free Toolbox asset was found and ASK whether to fall back to generated geometry.\n- Briefly list which assets you inserted (name + creatorName + id) in your explanation.\n`;
              case "both":
                return `\n[ASSET MODE: TOOLBOX + SCRIPTED SYSTEMS]\nUse Toolbox assets via search_toolbox + insert_asset for all visual models and environment content. Split broad prompts into multiple searches for each asset category before building. Use run_lua for placement, scaling, rotation, scripted systems, UI, remotes, storage organization, and light terrain/support edits only. If no safe relevant Toolbox asset exists, ask before generating fallback geometry.\n`;
              default:
                return `\n[ASSET MODE: TOOLBOX ONLY]\nUse safe free Roblox Toolbox / Creator Store assets for visual content. Ask before generating any fallback geometry.\n`;
            }
          })();

          const toolboxTool = tool({
            description:
              "Search the full public Roblox Toolbox/Creator Store for FREE public assets matching a keyword. Use this whenever the user asks for trees, buildings, cars, vehicles, roads, furniture, weapons, NPCs, pets, props, environment kits, sounds, or anything that should be a real Roblox model instead of generated primitives. The backend does a wide multi-query, multi-page free model search, filters unsafe/junk/broken-looking results, and returns ranked { id, name, creatorName, thumbnail, relevance, safety, sourceQuery } rows you can pass to insert_asset actions. Call once per distinct asset type you need.",
            inputSchema: z.object({
              keyword: z.string().describe("What to search for, e.g. 'oak tree', 'sports car', 'medieval house', 'zombie npc'."),
              category: z.enum(["Model", "Audio", "Decal", "Mesh"]).optional().describe("Asset category, defaults to Model."),
              limit: z.number().int().min(1).max(50).optional().describe("Max safe free results, default 18."),
            }),
            execute: async ({ keyword, category, limit }: { keyword: string; category?: ToolboxCategory; limit?: number }) => {
              const out = await searchRobloxToolbox(keyword, category ?? "Model", limit ?? 18);
              // Hide low-quality rows from the AI while allowing safe public Creator Store assets,
              // not only Roblox-owned assets. The helper has already removed junk and paid rows.
              const filtered = out.results.filter((r) => r.free !== false && (r.safety ?? 0) >= 0.62 && (r.relevance ?? 0) >= 0.18);
              const final = filtered;
              return {
                source: out.source,
                count: final.length,
                scanned: out.scanned,
                searchedTerms: out.searchedTerms,
                results: final,
                note: out.source === "fallback"
                  ? "Live search unavailable; these are curated verified-free Roblox-owned assets."
                  : out.source === "none"
                  ? "No safe free assets matched. Tell the user no Toolbox match was found and ASK before falling back to generated geometry."
                  : "Live results from Roblox public Toolbox/Creator Store. Use only safe, free, relevant rows, prefer higher safety/relevance, and list inserted asset names, creators, and ids for the user.",
              };
            },
          });

          const tryStream = (
            model: typeof modelChoice.model,
            usedModelId: string,
            notice: string | null,
            extraBody?: Record<string, unknown>,
            modelSettings?: { temperature?: number; topP?: number; maxOutputTokens?: number },
          ) => streamText({
            model,
            system: BLOXSMITH_SYSTEM_PROMPT + modeHeader + languageHeader + assetModeRule + contextBlock,
            messages: convertedMessages,
            ...(extraBody ? { providerOptions: { nvidia: extraBody as Record<string, never> } as never } : {}),
            ...(modelSettings?.temperature !== undefined ? { temperature: modelSettings.temperature } : {}),
            ...(modelSettings?.topP !== undefined ? { topP: modelSettings.topP } : {}),
            ...(modelSettings?.maxOutputTokens !== undefined ? { maxOutputTokens: modelSettings.maxOutputTokens } : {}),
            // In chat mode, do NOT expose the toolbox tool — the model can't build, so it doesn't need it.
            tools: mode === "chat" ? {} : { search_toolbox: toolboxTool },
            stopWhen: stepCountIs(50),
            onFinish: persistFinish(usedModelId, notice),
            onError: ({ error }) => {
              console.error(`[chat] upstream error on ${usedModelId}`, error);
            },
          });

          let result = tryStream(modelChoice.model, modelChoice.meta.id, modelChoice.usedFallback
            ? `_Switched to ${modelChoice.meta.label} because the selected model isn't available._`
            : null, modelChoice.extraBody, modelChoice.modelSettings);

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
              fb.extraBody,
              fb.modelSettings,
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
