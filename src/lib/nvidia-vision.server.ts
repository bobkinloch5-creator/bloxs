type VisionPart = {
  mediaType?: string;
  url?: string;
};

function parseDataImage(url: string): { mime: string; base64: string } | null {
  const match = /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/.exec(url);
  if (!match) return null;
  return { mime: match[1], base64: match[2] };
}

function extractText(json: unknown): string {
  const data = json as {
    choices?: Array<{ message?: { content?: string }; delta?: { content?: string }; text?: string }>;
    output?: Array<{ content?: Array<{ text?: string }> }>;
  };
  const choiceText = data.choices?.map((c) => c.message?.content ?? c.delta?.content ?? c.text ?? "").join("").trim();
  if (choiceText) return choiceText;
  const outputText = data.output?.flatMap((o) => o.content ?? []).map((c) => c.text ?? "").join("").trim();
  return outputText || "";
}

export async function describeImageWithNvidiaPaliGemma(parts: VisionPart[]): Promise<string | null> {
  const key = process.env.NVIDIA_API_KEY;
  if (!key) return null;

  const image = parts
    .map((part) => (part.url ? parseDataImage(part.url) : null))
    .find((img): img is { mime: string; base64: string } => Boolean(img));
  if (!image) return null;

  // NVIDIA's sample recommends the Assets API above this limit.
  if (image.base64.length >= 180_000) {
    return "PaliGemma vision scan skipped because the uploaded image is larger than NVIDIA's inline image limit.";
  }

  const response = await fetch("https://ai.api.nvidia.com/v1/vlm/google/paligemma", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messages: [
        {
          role: "user",
          content: `Analyze this reference image for a Roblox Studio build. Identify map theme, colors, lighting, objects, UI style, mood, and likely safe Toolbox asset categories. <img src="data:${image.mime};base64,${image.base64}" />`,
        },
      ],
      max_tokens: 512,
      temperature: 0.35,
      top_p: 0.7,
      stream: false,
    }),
  });

  if (!response.ok) {
    return `PaliGemma vision scan failed: NVIDIA returned ${response.status}.`;
  }

  const text = extractText(await response.json());
  return text || null;
}
