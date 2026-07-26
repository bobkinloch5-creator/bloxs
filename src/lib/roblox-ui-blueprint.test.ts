// Regression tests for the UI generator's blueprint engine.
// These lock in the bug that shipped a Shop layout for a Main Menu prompt.
import { describe, expect, it } from "vitest";
import {
  UI_CANVAS_HEIGHT,
  UI_CANVAS_WIDTH,
  UI_KIND_OPTIONS,
  createRobloxUiBlueprint,
  detectUiKind,
  kindLabelFor,
  paletteFor,
  renderRobloxUiBlueprintLuau,
  renderRobloxUiBlueprintSvg,
} from "./roblox-ui-blueprint";

/** The SVG renderer returns a data URI; decode it back to markup for assertions. */
function decodeSvg(dataUri: string) {
  return decodeURIComponent(dataUri.replace(/^data:image\/svg\+xml;charset=utf-8,/, ""));
}

/** Decorative glow blobs intentionally bleed past the canvas edge. */
const isDecorative = (name: string) => /^Glow/.test(name);

describe("detectUiKind", () => {
  it("picks the screen named first, not a later mention", () => {
    // The exact prompt that used to render a shop with a 'Creator Store' rail.
    expect(detectUiKind("Main menu with a big title, Play / Shop / Settings buttons, and hover animations")).toBe(
      "main-menu",
    );
  });

  it("still detects a real shop prompt", () => {
    expect(detectUiKind("Shop UI with gem packs and a buy button")).toBe("shop");
  });

  it.each([
    ["HUD with health bar, coins and a minimap", "hud"],
    ["Inventory grid with item rarity and an equip button", "inventory"],
    ["Settings menu with music and sfx sliders", "settings"],
    ["Loading screen with a progress bar and tips", "loading"],
    ["Leaderboard showing the top players this week", "leaderboard"],
    ["Quest log with objectives and rewards", "quests"],
    ["Pause menu with resume and quit", "pause"],
    ["Battle pass with free and premium tiers", "battlepass"],
    ["Crafting bench with material slots", "crafting"],
    ["NPC dialogue box with choices", "dialog"],
    ["Trading window with both player offers", "trading"],
  ])("detects %s", (prompt: any, expected: any) => {
    expect(detectUiKind(prompt)).toBe(expected);
  });

  it("falls back to a main menu when nothing matches", () => {
    expect(detectUiKind("something completely unrelated")).toBe("main-menu");
  });

  it("labels every option offered in the editor", () => {
    for (const option of UI_KIND_OPTIONS) {
      expect(kindLabelFor(option.kind)).toBe(option.label);
      expect(option.hint.length).toBeGreaterThan(0);
    }
    expect(new Set(UI_KIND_OPTIONS.map((o) => o.kind)).size).toBe(UI_KIND_OPTIONS.length);
  });
});

describe("createRobloxUiBlueprint", () => {
  it("builds a populated layout for every screen type", () => {
    for (const option of UI_KIND_OPTIONS) {
      const blueprint = createRobloxUiBlueprint(`${option.label} screen`, "modern");
      expect(blueprint.nodes.length).toBeGreaterThan(3);
      expect(blueprint.kindLabel).toBe(kindLabelFor(blueprint.kind));
      expect(blueprint.layers.length).toBeGreaterThan(0);
    }
  });

  it("honours the screen type prefix the editor sends", () => {
    expect(createRobloxUiBlueprint("Shop - a screen with buttons", "modern").kind).toBe("shop");
    expect(createRobloxUiBlueprint("Trading - a screen with buttons", "modern").kind).toBe("trading");
  });

  it("keeps every functional node inside the canvas bounds", () => {
    for (const option of UI_KIND_OPTIONS) {
      const blueprint = createRobloxUiBlueprint(`${option.label} screen`, "neon");
      for (const node of blueprint.nodes) {
        if (isDecorative(node.name)) continue;
        expect(node.w).toBeGreaterThan(0);
        expect(node.h).toBeGreaterThan(0);
        expect(node.x).toBeGreaterThanOrEqual(0);
        expect(node.y).toBeGreaterThanOrEqual(0);
        expect(node.x + node.w).toBeLessThanOrEqual(UI_CANVAS_WIDTH);
        expect(node.y + node.h).toBeLessThanOrEqual(UI_CANVAS_HEIGHT);
      }
    }
  });

  it("gives every node a unique name so the Luau tree cannot collide", () => {
    for (const option of UI_KIND_OPTIONS) {
      const names = createRobloxUiBlueprint(`${option.label} screen`, "modern").nodes.map((n) => n.name);
      expect(new Set(names).size).toBe(names.length);
    }
  });

  it("uses a custom title when the prompt names one", () => {
    const blueprint = createRobloxUiBlueprint('Main menu called "Sword Legends"', "modern");
    const titles = blueprint.nodes.map((n) => n.text).filter(Boolean).join(" ");
    expect(titles.toLowerCase()).toContain("sword legends");
  });

  it("creates a button for each menu action in the prompt", () => {
    const blueprint = createRobloxUiBlueprint("Main menu with Play, Shop and Settings buttons", "modern");
    const buttonText = blueprint.nodes
      .filter((n) => n.kind === "button")
      .map((n) => String(n.text || "").toLowerCase());
    expect(buttonText.some((t) => t.includes("play"))).toBe(true);
    expect(buttonText.some((t) => t.includes("shop"))).toBe(true);
    expect(buttonText.some((t) => t.includes("settings"))).toBe(true);
  });
});

describe("paletteFor", () => {
  it("returns valid hex colors for every editor style", () => {
    const styles = ["modern", "neon", "cartoon", "minimal", "fantasy", "sci-fi", "dark", "unknown-style"];
    for (const style of styles) {
      const palette = paletteFor(style);
      for (const value of Object.values(palette)) {
        if (typeof value === "string" && value.startsWith("#")) {
          expect(value).toMatch(/^#[0-9a-fA-F]{6}$/);
        }
      }
    }
  });
});

describe("renderers stay in sync", () => {
  it("renders an SVG data URI sized to the canvas", () => {
    const dataUri = renderRobloxUiBlueprintSvg(createRobloxUiBlueprint("Main menu with play button", "modern"));
    expect(dataUri.startsWith("data:image/svg+xml")).toBe(true);
    const svg = decodeSvg(dataUri);
    expect(svg).toContain(`viewBox="0 0 ${UI_CANVAS_WIDTH} ${UI_CANVAS_HEIGHT}"`);
    expect(svg.trimStart().startsWith("<svg")).toBe(true);
    expect(svg.trimEnd().endsWith("</svg>")).toBe(true);
  });

  it("escapes user text so markup cannot break out of the preview", () => {
    const svg = decodeSvg(renderRobloxUiBlueprintSvg(createRobloxUiBlueprint('Main menu called "A & B <script>"', "modern")));
    expect(svg).not.toContain("<script>");
    expect(svg.match(/<svg/g)?.length).toBe(1);
  });

  it("emits a strict LocalScript with a scaled 1280x720 canvas", () => {
    const luau = renderRobloxUiBlueprintLuau(createRobloxUiBlueprint("Shop with gem packs", "neon"));
    expect(luau.startsWith("--!strict")).toBe(true);
    expect(luau).toContain("PlayerGui");
    expect(luau).toContain("UIScale");
    expect(luau).toContain(String(UI_CANVAS_WIDTH));
    expect(luau).toContain(String(UI_CANVAS_HEIGHT));
  });

  it("never emits unresolved placeholders or NaN", () => {
    for (const option of UI_KIND_OPTIONS) {
      const blueprint = createRobloxUiBlueprint(`${option.label} screen`, "cartoon");
      const luau = renderRobloxUiBlueprintLuau(blueprint);
      expect(luau).not.toContain("undefined");
      expect(luau).not.toContain("NaN");
      expect(decodeSvg(renderRobloxUiBlueprintSvg(blueprint))).not.toContain("NaN");
    }
  });

  it("renders one Luau instance for every blueprint node", () => {
    const blueprint = createRobloxUiBlueprint("Inventory with 6 slots", "modern");
    const luau = renderRobloxUiBlueprintLuau(blueprint);
    for (const node of blueprint.nodes) {
      expect(luau).toContain(node.name);
    }
  });

  it("is deterministic for the same prompt and style", () => {
    const a = renderRobloxUiBlueprintLuau(createRobloxUiBlueprint("Quest log with rewards", "fantasy"));
    const b = renderRobloxUiBlueprintLuau(createRobloxUiBlueprint("Quest log with rewards", "fantasy"));
    expect(a).toBe(b);
  });
});
