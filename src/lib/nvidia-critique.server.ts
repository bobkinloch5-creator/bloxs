// Self-critique / repair pass over generated Luau. Called only when the local
// validator reports error-severity issues that the deterministic autofix in
// plugin-actions.ts could not resolve on its own. Uses NVIDIA-hosted
// meta/llama-3.3-70b-instruct via the OpenAI-compatible chat endpoint.
//
// Contract: returns a repaired Luau source string on success, or `null` if the
// key is missing, the request fails, or the model refuses. Never throws.

import { stripCodeFences, validateLuau } from "@/lib/luau-validator";

type CritiqueInput = {
  source: string;
  issues: Array<{ severity: string; message: string }>;
  actionName?: string;
  actionKind?: string;
  parentPath?: string;
  userRequest?: string;
};

type GenerateInput = {
  issues?: Array<{ severity: string; message: string }>;
  actionName?: string;
  actionKind?: string;
  parentPath?: string;
  userRequest?: string;
};

const NVIDIA_URL = "https://integrate.api.nvidia.com/v1/chat/completions";
const MODEL = "meta/llama-3.3-70b-instruct";

const SYSTEM_PROMPT = `You are a Roblox Luau repair pass. You receive one script that a code generator produced and a list of concrete static-analysis errors. Return the SAME script with ONLY the listed errors fixed, plus any strictly implied fixes (matching close/open, adding a missing WaitForChild for a referenced remote, correcting an obvious API name). Preserve every feature, comment, name, keybind, cooldown, and structural choice the original made. Do NOT add new features, do NOT reformat unrelated code, do NOT switch libraries. Output the repaired Luau source only — no markdown fences, no prose, no explanation.`;

const GENERATE_SYSTEM_PROMPT = `You are a Roblox Luau generation retry pass. The first generator produced an empty or invalid script action, so Studio must not receive it. Write a complete, production-ready Luau source for the requested action. Scope must stay literal: implement only the named action and required wiring. Use modern Roblox APIs, valid services, safe pcall where external services are involved, and server/client placement appropriate to Script vs LocalScript vs ModuleScript vs run_lua. Output Luau source only — no markdown fences, no prose, no explanation, no placeholders, no TODOs.`;

function issueLines(issues: Array<{ severity: string; message: string }> | undefined) {
  return (issues || [])
    .filter((i) => i && typeof i.message === "string")
    .slice(0, 12)
    .map((i) => `- [${i.severity}] ${i.message}`)
    .join("\n");
}

function metadata(input: { actionKind?: string; actionName?: string; parentPath?: string; userRequest?: string }) {
  return [
    input.actionKind ? `kind: ${input.actionKind}` : "",
    input.actionName ? `name: ${input.actionName}` : "",
    input.parentPath ? `parent: ${input.parentPath}` : "",
    input.userRequest ? `user request: ${input.userRequest.slice(0, 220)}` : "",
  ].filter(Boolean).join(" | ");
}

export async function repairLuauWithNvidia(input: CritiqueInput): Promise<string | null> {
  const key = process.env.NVIDIA_API_KEY;
  if (!key) return null;
  const src = String(input.source || "").trim();
  if (!src) return null;
  if (src.length > 24_000) return null; // avoid runaway cost on huge scripts
  const errorLines = issueLines(input.issues);
  if (!errorLines) return null;

  const meta = metadata(input);

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
  if (validateLuau(cleaned).some((i) => i.severity === "error")) return null;
  return cleaned;
}

export async function generateLuauReplacementWithNvidia(input: GenerateInput): Promise<string | null> {
  const key = process.env.NVIDIA_API_KEY;
  if (!key) return null;

  const meta = metadata(input);
  const errors = issueLines(input.issues);
  const userMsg = `${meta ? `Action metadata: ${meta}\n\n` : ""}The previous script source was empty or invalid and must be regenerated before Studio insertion.${errors ? `\n\nValidation errors:\n${errors}` : ""}\n\nReturn ONLY complete executable Luau for this action.`;

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
          { role: "system", content: GENERATE_SYSTEM_PROMPT },
          { role: "user", content: userMsg },
        ],
        temperature: 0.1,
        top_p: 0.85,
        max_tokens: 4096,
        stream: false,
      }),
    });
  } catch (e) {
    console.warn("[nvidia-critique] generation retry request failed", e);
    return null;
  }

  if (!response.ok) {
    console.warn("[nvidia-critique] generation retry non-200", response.status);
    return null;
  }

  let data: any;
  try { data = await response.json(); } catch { return null; }
  const content: string = data?.choices?.[0]?.message?.content ?? "";
  if (typeof content !== "string" || !content.trim()) return null;

  const cleaned = stripCodeFences(content).trim();
  if (cleaned.length < 40) return null;
  if (/^(i\s|sorry|as an ai|cannot|i can't|i'm unable)/i.test(cleaned)) return null;
  if (/TODO|placeholder|add your code here/i.test(cleaned)) return null;
  if (validateLuau(cleaned).some((i) => i.severity === "error")) return null;
  return cleaned;
}
