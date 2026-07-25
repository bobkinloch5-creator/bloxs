// Tests for the Luau safety net that every generated script passes through.
import { describe, expect, it } from "vitest";
import {
  analyzeLuauPerformance,
  autoFixLuau,
  performanceScore,
  stripCodeFences,
  validateLuau,
} from "./luau-validator";

const GOOD_SCRIPT = `--!strict
local Players = game:GetService("Players")

local function onPlayerAdded(player: Player)
	print(player.Name)
end

Players.PlayerAdded:Connect(onPlayerAdded)
`;

describe("stripCodeFences", () => {
  it("removes markdown fences the model sometimes leaves in", () => {
    const fenced = "```lua\nprint(\"hi\")\n```";
    expect(stripCodeFences(fenced).trim()).toBe('print("hi")');
  });

  it("leaves clean source untouched", () => {
    expect(stripCodeFences(GOOD_SCRIPT).trim()).toBe(GOOD_SCRIPT.trim());
  });
});

describe("validateLuau", () => {
  it("accepts a well-formed script", () => {
    expect(validateLuau(GOOD_SCRIPT).filter((i) => i.severity === "error")).toHaveLength(0);
  });

  it("rejects empty source", () => {
    expect(validateLuau("")[0].severity).toBe("error");
  });

  it("rejects comment-only source", () => {
    const issues = validateLuau("-- just a note\n-- nothing runs");
    expect(issues.some((i) => i.severity === "error")).toBe(true);
  });

  it("flags a missing end", () => {
    const issues = validateLuau("local function broken()\n\tprint(1)\n");
    expect(issues.some((i) => i.severity === "error")).toBe(true);
  });

  it("does not false-fire on for/while loops that share one end", () => {
    const loops = `for i = 1, 10 do\n\tprint(i)\nend\n\nwhile true do\n\ttask.wait(1)\nend\n`;
    expect(validateLuau(loops).filter((i) => i.severity === "error")).toHaveLength(0);
  });

  it("ignores keywords that only appear inside strings and comments", () => {
    const tricky = `local msg = "if you end this function"\n-- if for while end\nprint(msg)\n`;
    expect(validateLuau(tricky).filter((i) => i.severity === "error")).toHaveLength(0);
  });

  it("catches JSON-style tables", () => {
    const json = 'local config = { "speed": 16, "jump": 50 }\nprint(config)\n';
    expect(validateLuau(json).some((i) => i.severity === "error")).toBe(true);
  });

  it("never throws on non-string input", () => {
    expect(validateLuau(undefined as unknown as string)[0].severity).toBe("error");
  });
});

describe("autoFixLuau", () => {
  it("returns source and a list of fixes", () => {
    const result = autoFixLuau("```lua\nprint(1)\n```");
    expect(typeof result.source).toBe("string");
    expect(Array.isArray(result.fixes)).toBe(true);
    expect(result.source).not.toContain("```");
  });

  it("is idempotent - fixing twice changes nothing further", () => {
    const once = autoFixLuau(GOOD_SCRIPT).source;
    const twice = autoFixLuau(once).source;
    expect(twice).toBe(once);
  });
});

describe("analyzeLuauPerformance", () => {
  it("flags a RemoteEvent fired every frame", () => {
    const bad = `local RunService = game:GetService("RunService")\nRunService.Heartbeat:Connect(function()\n\tremote:FireServer(1)\nend)\n`;
    const findings = analyzeLuauPerformance(bad);
    expect(findings.some((f) => f.category === "network")).toBe(true);
  });

  it("flags a tree walk inside a per-frame loop", () => {
    const bad = `RunService.RenderStepped:Connect(function()\n\tlocal parts = workspace:GetChildren()\n\tprint(#parts)\nend)\n`;
    expect(analyzeLuauPerformance(bad).some((f) => f.category === "lag")).toBe(true);
  });

  it("stays quiet on a clean script", () => {
    expect(analyzeLuauPerformance(GOOD_SCRIPT).filter((f) => f.severity === "error")).toHaveLength(0);
  });

  it("reports a line number for every finding", () => {
    const bad = `while true do\n\tprint(1)\nend\n`;
    for (const finding of analyzeLuauPerformance(bad)) {
      expect(finding.line).toBeGreaterThan(0);
      expect(finding.suggestion.length).toBeGreaterThan(0);
    }
  });
});

describe("performanceScore", () => {
  it("is 100 for a clean script", () => {
    expect(performanceScore([])).toBe(100);
  });

  it("never drops below zero", () => {
    const findings = analyzeLuauPerformance(
      Array.from({ length: 40 })
        .map(() => `RunService.Heartbeat:Connect(function() remote:FireServer(1) end)`)
        .join("\n"),
    );
    expect(performanceScore(findings)).toBeGreaterThanOrEqual(0);
    expect(performanceScore(findings)).toBeLessThanOrEqual(100);
  });
});
