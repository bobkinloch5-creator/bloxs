import { createFileRoute } from "@tanstack/react-router";
import { convertToModelMessages, streamText, type UIMessage } from "ai";
import { getProviderModel } from "@/lib/ai-gateway.server";

// Fast, small NVIDIA chat model — this widget answers short website questions,
// not code generation, so we deliberately avoid the heavy coder model.
const HELPER_MODEL_ID = "nvidia/nemotron-nano-9b-v2";

const SYSTEM_PROMPT = `You are the BloxSmith Help Assistant for https://bloxsmith.pro — a free AI Roblox game builder that turns prompts into Luau scripts, GUIs, maps, and full systems delivered live to Roblox Studio via the BloxSmith plugin.

Key facts:
- Get started: Sign up → Dashboard → create a new project → describe your build in the workspace chat → BloxSmith generates and sends code directly to Studio.
- Plugin install: Go to /plugin → download BloxSmithPlugin.lua → open Studio → Plugins tab → Plugins Folder → drop the file → restart Studio → open the plugin → paste your pairing code from /plugin.
- Building: Prompt in the project workspace. Narrow prompts (e.g. "add a shop button") create just that one thing. Broad prompts (e.g. "build a full tycoon") create the whole system.
- AI Models available:
  • Standard: GPT-5.6 Sol (fast, great for most builds)
  • Advanced: GPT-5.6 Terra (smarter reasoning, complex systems)
  • Premium: GPT-5.6 Luna (highest quality, full-game generation)
  • Claude Fable 5 (alternative premium model, excellent for scripting)
- Credits & pricing: Free plan includes monthly credits. Top up extra credits anytime via the /pricing page or the "Top Up" button in the dashboard. Credits reset monthly.
- Pages: / (home), /dashboard, /projects, /plugin, /pricing, /docs, /support, /contact, /showcase, /templates-market, /settings, /referrals.
- Troubleshooting:
  • Nothing appears in Studio → check plugin is paired (green status dot) and Studio is open and active.
  • Delete errors or script errors → update to plugin v2.1.23+ (re-download from /plugin).
  • Build not verified → re-open the plugin and wait for the green "Connected" status.
  • Slow responses → AI auto-falls back across providers; wait a moment.
  • Out of credits → top up on /pricing or wait for monthly reset.
- Community & support: /support, /contact, Discord https://discord.gg/YJ8xPFNSSX.

Style: friendly, very concise, short bullets. If unsure, point to /docs, /support, /contact, or Discord. Do NOT write Luau code here — redirect all build/code requests to the project workspace. Never mention internal infrastructure, API keys, or model provider names.`;

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
