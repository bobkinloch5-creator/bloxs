import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// BloxSmith ElevenLabs Conversational AI Agent
export const BLOXSMITH_AGENT_ID = "JBFqnCBsd6RMkjVDRZzb";

export const getVoiceAgentToken = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const apiKey = process.env.ELEVENLABS_API_KEY;
    if (!apiKey) {
      return { ok: false as const, error: "voice_not_configured" };
    }

    const resp = await fetch(
      `https://api.elevenlabs.io/v1/convai/conversation/token?agent_id=${BLOXSMITH_AGENT_ID}`,
      { headers: { "xi-api-key": apiKey } },
    );

    if (!resp.ok) {
      const detail = await resp.text().catch(() => "");
      return {
        ok: false as const,
        error:
          resp.status === 401 ? "auth_failed" :
          resp.status === 404 ? "agent_not_found" :
          "token_failed",
        status: resp.status,
        detail: detail.slice(0, 300),
      };
    }

    const json = (await resp.json()) as { token?: string };
    if (!json.token) {
      return { ok: false as const, error: "no_token" };
    }
    return { ok: true as const, token: json.token, agentId: BLOXSMITH_AGENT_ID };
  });
