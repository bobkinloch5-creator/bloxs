import { describe, expect, it, beforeEach } from "vitest";
import {
  balanceCodeFences,
  estimateTokens,
  fitMessagesToWindow,
  trimTextToTokens,
  type SimpleMessage,
} from "@/lib/context-window";
import {
  cosineSimilarity,
  rerankMemories,
  rerankMemoriesSemantic,
} from "@/lib/semantic-memory";
import {
  anthropicCacheHint,
  cachedPrefix,
  fingerprint,
  promptCacheStats,
  resetPromptCache,
} from "@/lib/prompt-cache.server";
import { formatKnowledgeBlock } from "@/lib/kb-retrieve.server";
import {
  INTENT_ACCURACY_FLOOR,
  checkStructure,
  formatIntentReport,
  runIntentEval,
  scoreScript,
} from "@/lib/ai-eval";

const msg = (role: string, text: string): SimpleMessage => ({
  role,
  parts: [{ type: "text", text }],
});

describe("context window: token estimation", () => {
  const prose = "The quick brown fox jumps over the lazy dog. ".repeat(20);
  const code = "local x = game:GetService('Players'); x.PlayerAdded:Connect(function(p) print(p.Name) end)\n".repeat(20);

  it("estimates fewer tokens than characters", () => {
    expect(estimateTokens(prose)).toBeLessThan(prose.length);
  });

  it("treats code as denser than prose", () => {
    // This is the whole point of the module: a character budget cannot tell
    // these two apart, and a build turn is mostly code.
    expect(estimateTokens(code) / code.length).toBeGreaterThan(estimateTokens(prose) / prose.length);
  });

  it("returns zero for empty input", () => {
    expect(estimateTokens("")).toBe(0);
  });
});

describe("context window: boundary-safe trimming", () => {
  it("leaves short text untouched", () => {
    expect(trimTextToTokens("hello world", 100)).toBe("hello world");
  });

  it("shrinks long text and marks the cut", () => {
    const long = "The quick brown fox jumps over the lazy dog. ".repeat(50);
    const out = trimTextToTokens(long, 20);
    expect(out.length).toBeLessThan(long.length);
    expect(out).toContain("trimmed");
  });

  it("never leaves a dangling code fence", () => {
    const fences = (balanceCodeFences("text ```lua print(1)").match(/```/g) ?? []).length;
    expect(fences % 2).toBe(0);
  });

  it("leaves balanced fences alone", () => {
    expect(balanceCodeFences("a ```x``` b")).toBe("a ```x``` b");
  });
});

describe("context window: fitting a conversation", () => {
  const convo: SimpleMessage[] = [];
  for (let i = 0; i < 30; i++) {
    convo.push(msg(i % 2 === 0 ? "user" : "assistant", `message ${i} about my tycoon shop system `.repeat(30)));
  }
  convo.push(msg("user", "add a second floor"));

  const fitted = fitMessagesToWindow(convo, { budgetTokens: 3000, maxMessages: 12 });

  it("stays inside the token budget", () => {
    expect(fitted.estimatedTokens).toBeLessThanOrEqual(3200);
  });

  it("always keeps the newest message", () => {
    expect(fitted.messages.at(-1)?.parts?.[0]?.text).toContain("second floor");
  });

  it("honours the message ceiling", () => {
    expect(fitted.messages.length).toBeLessThanOrEqual(12);
  });

  it("summarizes what it dropped instead of losing it", () => {
    // The regression this guards: "add a second floor" 20 messages after
    // "build me a tycoon" used to arrive with no idea it was a tycoon.
    expect(fitted.droppedCount).toBeGreaterThan(0);
    expect(fitted.digest).toMatch(/tycoon|shop/);
    expect(fitted.digest).toContain("background only");
  });

  it("produces no digest when nothing is dropped", () => {
    const small = fitMessagesToWindow([msg("user", "hi")], { budgetTokens: 3000 });
    expect(small.messages).toHaveLength(1);
    expect(small.digest).toBe("");
  });

  it("handles an empty conversation", () => {
    expect(fitMessagesToWindow([], { budgetTokens: 100 }).messages).toHaveLength(0);
  });

  it("still sends an oversized newest message, trimmed", () => {
    const huge = fitMessagesToWindow([msg("user", "x".repeat(200_000))], { budgetTokens: 500 });
    expect(huge.messages).toHaveLength(1);
    expect(huge.messages[0].parts?.[0]?.text?.length).toBeLessThan(200_000);
  });
});

describe("memory ranking", () => {
  const rows = [
    { key: "shop_system", value: "the shop script sells swords for coins", kind: "system", importance: 1 },
    { key: "pet_system", value: "the pet script hatches eggs", kind: "system", importance: 1 },
    { key: "map_notes", value: "the map is a snowy village", kind: "world", importance: 1 },
    { key: "last_build_failures", value: "CoinServer failed to compile", kind: "ops", importance: 0 },
  ];

  it("always surfaces build failures first", () => {
    expect(rerankMemories(rows, "fix the shop script please", 4)[0].key).toBe("last_build_failures");
  });

  it("distinguishes rows that share domain words", () => {
    // Both rows contain "script". The old stoplist discarded that token along
    // with "shop" and "pet", making these two rows score identically.
    const ranked = rerankMemories(rows, "fix the shop script please", 4);
    expect(ranked.findIndex((r) => r.key === "shop_system")).toBeLessThan(
      ranked.findIndex((r) => r.key === "pet_system"),
    );

    const petFirst = rerankMemories(rows, "the pet egg thing is broken", 4);
    expect(petFirst.findIndex((r) => r.key === "pet_system")).toBeLessThan(
      petFirst.findIndex((r) => r.key === "shop_system"),
    );
  });

  it("handles empty inputs", () => {
    expect(rerankMemories([], "anything")).toHaveLength(0);
    expect(rerankMemories(rows, "", 2)).toHaveLength(2);
  });

  it("computes cosine similarity correctly", () => {
    expect(cosineSimilarity([1, 2, 3], [1, 2, 3])).toBeCloseTo(1);
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0);
    expect(cosineSimilarity([], [])).toBe(0);
  });

  it("falls back to keyword ranking when embeddings fail", async () => {
    // Embeddings are an enhancement. An outage must never break a build.
    const out = await rerankMemoriesSemantic(rows, "shop", 3, {
      embed: async () => {
        throw new Error("embedding endpoint down");
      },
    });
    expect(out).toHaveLength(3);
  });

  it("keeps operational rows on top even when ranking semantically", async () => {
    const vocab: Record<string, number> = { shop: 0, sell: 0, coin: 1, pet: 2, egg: 2, map: 3, snow: 3, money: 1 };
    const embed = async (t: string) => {
      const v = [0, 0, 0, 0];
      for (const w of t.toLowerCase().split(/[^a-z]+/)) if (vocab[w] !== undefined) v[vocab[w]] += 1;
      return v.some((x) => x) ? v : [0.01, 0.01, 0.01, 0.01];
    };
    const out = await rerankMemoriesSemantic(rows, "where does the money come from", 4, { embed });
    expect(out).toHaveLength(4);
    expect(out[0].key).toBe("last_build_failures");
  });
});

describe("prompt prefix cache", () => {
  beforeEach(() => resetPromptCache());

  it("builds each request shape only once", () => {
    let builds = 0;
    const build = () => {
      builds += 1;
      return "PROMPT".repeat(1000);
    };
    cachedPrefix("build|en|premium|both", build);
    cachedPrefix("build|en|premium|both", build);
    cachedPrefix("build|en|premium|both", build);

    expect(builds).toBe(1);
    const stats = promptCacheStats();
    expect(stats.hits).toBe(2);
    expect(stats.misses).toBe(1);
    expect(stats.charsSaved).toBeGreaterThan(0);
  });

  it("rebuilds when the request shape changes", () => {
    let builds = 0;
    const build = () => {
      builds += 1;
      return "x".repeat(10);
    };
    cachedPrefix("build|en|premium|both", build);
    cachedPrefix("chat|fr|basic|procedural", build);
    expect(builds).toBe(2);
  });

  it("fingerprints deterministically", () => {
    expect(fingerprint("abc")).toBe(fingerprint("abc"));
    expect(fingerprint("abc")).not.toBe(fingerprint("abd"));
  });

  it("only offers a cache hint where it would actually apply", () => {
    expect(anthropicCacheHint("x".repeat(9000), "nvidia/qwen-2.5-coder-32b")).toBeNull();
    expect(anthropicCacheHint("short", "claude-sonnet-4-6")).toBeNull();
    expect(anthropicCacheHint("x".repeat(9000), "claude-sonnet-4-6")).not.toBeNull();
  });
});

describe("knowledge base confidence gate", () => {
  const row = (title: string, similarity: number) => ({
    title,
    content: `content ${title}`,
    source: "docs",
    similarity,
  });

  it("injects nothing when every match is weak", () => {
    // Injecting a 0.2-similarity chunk under a "prefer this over memory"
    // header is worse than injecting nothing at all.
    expect(formatKnowledgeBlock([row("a", 0.2), row("b", 0.1)])).toBe("");
    expect(formatKnowledgeBlock([])).toBe("");
  });

  it("keeps strong matches and drops weak ones from the same result set", () => {
    const block = formatKnowledgeBlock([row("strong", 0.72), row("weak", 0.2)]);
    expect(block).toContain("strong");
    expect(block).not.toContain("] weak");
    expect(block).toContain("prefer these over memory");
  });

  it("softens the header for borderline matches", () => {
    const block = formatKnowledgeBlock([row("borderline", 0.4)]);
    expect(block).toContain("POSSIBLY RELEVANT");
    expect(block).not.toContain("prefer these over memory");
  });

  it("respects k and orders by similarity", () => {
    const block = formatKnowledgeBlock([row("a", 0.9), row("b", 0.8), row("c", 0.7)], 2);
    expect((block.match(/^\[\d\]/gm) ?? [])).toHaveLength(2);

    const ordered = formatKnowledgeBlock([row("low", 0.4), row("high", 0.9)]);
    expect(ordered.indexOf("high")).toBeLessThan(ordered.indexOf("low"));
  });
});

describe("generated script scoring", () => {
  const good = [
    'local Players = game:GetService("Players")',
    "local function onAdded(player)",
    "\tprint(player.Name)",
    "end",
    "Players.PlayerAdded:Connect(onAdded)",
    "",
  ].join("\n");

  const unbalanced = ['local x = 1', 'if x then', '\tprint("no end")', ""].join("\n");

  it("scores clean code highly", () => {
    expect(scoreScript(good).score).toBeGreaterThanOrEqual(70);
  });

  it("punishes code that will not compile", () => {
    const bad = scoreScript(unbalanced);
    expect(bad.score).toBeLessThan(scoreScript(good).score);
    expect(bad.errors).toBeGreaterThan(0);
    expect(bad.reasons.length).toBeGreaterThan(0);
  });

  it("is unaffected by code fences", () => {
    expect(scoreScript("```lua\n" + good + "\n```").score).toBe(scoreScript(good).score);
  });
});

describe("explorer structure checks", () => {
  it("accepts a correct layout", () => {
    expect(
      checkStructure([
        { className: "Script", path: "ServerScriptService/BloxSmith/Shop" },
        { className: "LocalScript", path: "StarterGui/ShopUi/Controller" },
        { className: "RemoteEvent", path: "ReplicatedStorage/Remotes/BuyItem" },
      ]),
    ).toHaveLength(0);
  });

  it("catches scripts parented where they can never run", () => {
    // These builds look correct in the explorer and do nothing at runtime,
    // which is the hardest class of bug for a user to diagnose.
    const issues = checkStructure([
      { className: "Script", path: "StarterGui/Thing" },
      { className: "LocalScript", path: "ServerScriptService/Thing" },
      { className: "RemoteEvent", path: "ServerStorage/Remote" },
      { className: "Script", path: "NotAService/Thing" },
    ]);

    expect(issues.some((i) => i.path === "StarterGui/Thing")).toBe(true);
    expect(issues.some((i) => i.path === "ServerScriptService/Thing")).toBe(true);
    expect(issues.some((i) => i.path === "ServerStorage/Remote")).toBe(true);
    expect(issues.some((i) => i.problem.includes("not a Roblox service"))).toBe(true);
  });
});

describe("UI intent golden set", () => {
  it("classifies realistic prompts above the accuracy floor", () => {
    // The user-reported bug: "Main menu with a big title, Play / Shop /
    // Settings buttons" rendered a shop, because the prompt mentions Shop.
    const report = runIntentEval();
    expect(report.accuracy, formatIntentReport(report)).toBeGreaterThanOrEqual(INTENT_ACCURACY_FLOOR);
  });

  it("still gets the exact prompt that was reported broken", () => {
    const report = runIntentEval();
    const menu = report.results.find((r) => r.id === "menu-basic");
    expect(menu?.actual).toBe("main-menu");
  });
});
