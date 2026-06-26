import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { generateText } from "ai";
import { z } from "zod";
import { getProviderModel } from "./ai-gateway.server";

const SYS = `You are a Roblox UI engineer. Produce a SINGLE, self-contained Luau script that builds a polished ScreenGui at runtime.
Hard rules:
- Output ONLY Luau code, no markdown fences, no commentary, no explanations.
- Parent: local player = game:GetService("Players").LocalPlayer; local gui = Instance.new("ScreenGui"); gui.Parent = player:WaitForChild("PlayerGui").
- Use modern Roblox UI: rounded corners (UICorner), gradients (UIGradient), strokes (UIStroke), padding (UIPadding), and UIListLayout / UIGridLayout for structure.
- Use anchor points and Scale-based UDim2 so it looks correct on phone, tablet, and desktop.
- Include hover/press color feedback on every interactive Button (TweenService).
- Use semantic, descriptive Instance .Name values.
- Use a tasteful color palette that matches the requested style.
- Code must run as-is when pasted into a LocalScript in StarterPlayerScripts.
- Do NOT use deprecated APIs (no Frame.SizeConstraint, no GuiObject.Selectable hacks).
- Always set BackgroundTransparency where appropriate so layering reads correctly.`;

export const generateRobloxUi = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({
    prompt: z.string().min(3).max(2000),
    style: z.string().min(1).max(40),
  }).parse(input))
  .handler(async ({ data }) => {
    const { model } = getProviderModel("google/gemini-3.5-flash");
    const userPrompt = `Style: ${data.style}
What to build: ${data.prompt}

Requirements: Center the screen, frosted glass surface (BackgroundColor3 dark, BackgroundTransparency 0.15, UIStroke white 0.85 transparency), bold title, clean sub-elements, responsive Scale sizing, and meaningful Names. Include comments above each section so a beginner can understand it.`;

    const { text } = await generateText({
      model,
      system: SYS,
      prompt: userPrompt,
      temperature: 0.4,
    });

    // Strip accidental code fences if model emitted them.
    const cleaned = text
      .replace(/^```(?:lua|luau)?\s*/i, "")
      .replace(/```\s*$/i, "")
      .trim();

    return { code: cleaned };
  });
