// Self-critique / repair pass over generated Luau. Called only when the local
// validator reports error-severity issues that the deterministic autofix in
// plugin-actions.ts could not resolve on its own. Uses NVIDIA-hosted
// meta/llama-3.3-70b-instruct via the OpenAI-compatible chat endpoint.
//
// Contract: returns a repaired Luau source string on success, or `null` if the
// key is missing, the request fails, or the model refuses. Never throws.

import { stripCodeFences } from "@/lib/luau-validator";

type CritiqueInput = {
  source: string;
  issues: Array<{ severity: string; message: string }>;
  actionName?: string;
  actionKind?: string;
  parentPath?: string;
  userRequest?: string;
};

const NVIDIA_URL = "https://integrate.api.nvidia.com/v1/chat/completions";
const MODEL = "meta/llama-3.3-70b-instruct";

const SYSTEM_PROMPT = `You are a Roblox Luau repair pass. You receive one script that a code generator produced and a list of concrete static-analysis errors. Return the SAME script with ONLY the listed errors fixed, plus any strictly implied fixes (matching close/open, adding a missing WaitForChild for a referenced remote, correcting an obvious API name). Preserve every feature, comment, name, keybind, cooldown, and structural choice the original made. Do NOT add new features, do NOT reformat unrelated code, do NOT switch libraries. Output the repaired Luau source only — no markdown fences, no prose, no explanation.`;

export async function repairLuauWithNvidia(input: CritiqueInput): Promise<string | null> {
  const key = process.env.NVIDIA_API_KEY;
  if (!key) return null;
  const src = String(input.source || "").trim();
  if (!src) return null;
  if (src.length > 24_000) return null; // avoid runaway cost on huge scripts
  const errorLines = (input.issues || [])
    .filter((i) => i && typeof i.message === "string")
    .slice(0, 12)
    .map((i) => `- [${i.severity}] ${i.message}`)
    .join("\n");
  if (!errorLines) return null;

  const meta = [
    input.actionKind ? `kind: ${input.actionKind}` : "",
    input.actionName ? `name: ${input.actionName}` : "",
    input.parentPath ? `parent: ${input.parentPath}` : "",
    input.userRequest ? `user request: ${input.userRequest.slice(0, 160)}` : "",
  ].filter(Boolean).join(" | ");

  const userMsg = `${meta ? `Action metadata: ${meta}\n\n` : ""}Static analysis errors that must be fixed:\n${errorLines}\n\nOriginal Luau source:\n\`\`\`lua\n${src}\n\`\`\`\n\nReturn ONLY the repaired Luau source.`;

  let response: Response;
  try {
    response = await fetch(NVIDIA_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userMsg },
        ],
        temperature: 0.15,
        top_p: 0.9,
        max_tokens: 4096,
        stream: false,
      }),
    });
  } catch (e) {
    console.warn("[nvidia-critique] request failed", e);
    return null;
  }

  if (!response.ok) {
    console.warn("[nvidia-critique] non-200", response.status);
    return null;
  }

  let data: any;
  try { data = await response.json(); } catch { return null; }
  const content: string = data?.choices?.[0]?.message?.content ?? "";
  if (typeof content !== "string" || !content.trim()) return null;

  const cleaned = stripCodeFences(content).trim();
  // Sanity: repair must not be trivially empty or a refusal.
  if (cleaned.length < Math.min(40, Math.floor(src.length * 0.3))) return null;
  if (/^(i\s|sorry|as an ai|cannot|i can't|i'm unable)/i.test(cleaned)) return null;
  return cleaned;
}
