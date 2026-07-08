import { createFileRoute } from "@tanstack/react-router";
import { convertToModelMessages, streamText, type UIMessage } from "ai";
import { getProviderModel } from "@/lib/ai-gateway.server";

// Fast, small NVIDIA chat model — this widget answers short website questions,
// not code generation, so we deliberately avoid the heavy coder model.
const HELPER_MODEL_ID = "nvidia/nemotron-nano-9b-v2";

const SYSTEM_PROMPT = `You are the BloxSmith Help Assistant for https://bloxsmith.pro — a free AI Roblox game builder that turns prompts into Luau, GUIs, maps, and systems delivered live to Studio via the BloxSmith plugin.

Key facts:
- Start: sign up → Dashboard → new project → describe your build in the workspace chat.
- Plugin: /plugin → download BloxSmithPlugin.lua → Studio Plugins tab → Plugins Folder → drop file → restart Studio → open plugin → paste pairing code from /plugin.
- Building: prompt in the project workspace. Auto Build prefers Toolbox assets; full-game asks build the whole package, narrow asks stay exact-scope.
- Pages: /, /dashboard, /projects, /plugin, /docs, /support, /contact, /showcase, /templates-market, /settings, /referrals.
- Fixes: nothing appears → plugin paired + green status + Studio active. Delete errors → update plugin (v2.1.22+). Slow AI → auto-falls back across providers.
- Support: /support, /contact, Discord https://discord.gg/6QDYT3RUkv.

Style: friendly, very concise, short bullets. If unsure, point to /docs, /support, /contact, or Discord. Do NOT write Luau here — redirect code/build requests to the project workspace. Never mention infra, keys, or model providers.`;

export const Route = createFileRoute("/api/help-chat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const body = (await request.json()) as { messages?: unknown };
          if (!Array.isArray(body.messages)) {
            return new Response("Messages are required", { status: 400 });
          }
          const messages = body.messages as UIMessage[];
          // Keep only the last few turns so replies stay snappy.
          const recent = messages.slice(-6);
          const { model } = getProviderModel(HELPER_MODEL_ID);
          const result = streamText({
            model,
            system: SYSTEM_PROMPT,
            messages: await convertToModelMessages(recent),
            temperature: 0.3,
            maxOutputTokens: 260,
            abortSignal: request.signal,
          });
          return result.toUIMessageStreamResponse({ originalMessages: messages });
        } catch (err) {
          const msg = err instanceof Error ? err.message : "Unknown error";
          return new Response(JSON.stringify({ error: msg }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }
      },
    },
  },
});
