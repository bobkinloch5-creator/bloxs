// BloxSmith Game Builder server functions
// ---------------------------------------------------------------------------
// The professional builder surface: plan a whole game, queue it to the Studio
// plugin, regenerate only selected scripts, install marketplace packs, import
// existing Lua, analyse project health and export a Studio-ready project.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { planBuild, regenerateSelected, describePlan, type BuildPlan } from "@/lib/build-orchestrator";
import { GENRE_BLUEPRINTS } from "@/lib/game-genres";
import { GAME_SYSTEMS } from "@/lib/game-systems";
import { GAMEPLAY_FEATURES } from "@/lib/gameplay-features";
import { UI_SCREENS, SCREEN_LABELS, UI_THEMES } from "@/lib/roblox-ui-kit";
import { TERRAIN_PRESETS, TERRAIN_LABELS } from "@/lib/roblox-terrain";
import { MARKETPLACE_PACKS, getPack, searchPacks } from "@/lib/plugin-marketplace";
import { buildStudioExport } from "@/lib/studio-export";
import { compileAssetPrompt, defaultAssetPlan, ASSET_PRESETS } from "@/lib/asset-generator-catalog";
import { formatLua, importScripts, searchScripts, replaceInScripts, outlineLua, mergeScript } from "@/lib/lua-format";
import { analyzeLuauPerformance, performanceScore, validateLuau, autoFixLuau } from "@/lib/luau-validator";
import { canonicalizeActions } from "@/lib/action-canonicalizer";

type QueueAction = {
  kind: string;
  parent_path: string;
  name: string;
  payload: Record<string, unknown>;
};

const ScreenEnum = z.enum(UI_SCREENS as unknown as [string, ...string[]]);
const TerrainEnum = z.enum(TERRAIN_PRESETS as unknown as [string, ...string[]]);

const PlanInput = z.object({
  prompt: z.string().min(3).max(20000),
  title: z.string().max(80).optional(),
  genre: z.string().max(40).optional(),
  systems: z.array(z.string().max(40)).max(40).optional(),
  features: z.array(z.string().max(40)).max(40).optional(),
  screens: z.array(ScreenEnum).max(30).optional(),
  terrain: TerrainEnum.nullable().optional(),
  packs: z.array(z.string().max(60)).max(20).optional(),
  theme: z.string().max(20).optional(),
  includeTerrain: z.boolean().optional(),
  includeWorld: z.boolean().optional(),
});

function toPlanRequest(data: z.infer<typeof PlanInput>) {
  return {
    prompt: data.prompt,
    title: data.title,
    genre: data.genre,
    systems: data.systems,
    features: data.features,
    screens: data.screens as never,
    terrain: (data.terrain ?? undefined) as never,
    packs: data.packs,
    theme: data.theme,
    includeTerrain: data.includeTerrain,
    includeWorld: data.includeWorld,
  };
}

/** Slim wire projection of a plan (sources are large; only send what the UI needs). */
function projectPlan(plan: BuildPlan) {
  return {
    title: plan.title,
    genre: { key: plan.genre.key, label: plan.genre.label, pitch: plan.genre.pitch },
    systems: plan.systems.map((system) => ({ key: system.key, name: system.name, label: system.label, category: system.category })),
    features: plan.features,
    screens: plan.screens.map((screen) => ({ key: screen, label: SCREEN_LABELS[screen] })),
    terrain: plan.terrain ? { preset: plan.terrain, label: TERRAIN_LABELS[plan.terrain] } : null,
    remotes: plan.remotes,
    artifacts: plan.artifacts.map((artifact) => ({
      id: artifact.id,
      name: artifact.name,
      className: artifact.className,
      parentPath: artifact.parentPath,
      group: artifact.group,
      why: artifact.why,
      lines: artifact.source.split("\n").length,
    })),
    actionCount: plan.actions.length,
    summary: plan.summary,
    issues: plan.issues,
    markdown: describePlan(plan),
  };
}

/** Catalog for the builder UI: everything installable in one payload. */
export const getBuilderCatalog = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => ({
    genres: GENRE_BLUEPRINTS.map((genre) => ({
      key: genre.key,
      label: genre.label,
      pitch: genre.pitch,
      systems: genre.systems,
      features: genre.features,
      screens: genre.screens,
      terrain: genre.terrain ?? null,
    })),
    systems: GAME_SYSTEMS.map((system) => ({
      key: system.key,
      name: system.name,
      label: system.label,
      category: system.category,
      description: system.description,
      requires: system.requires ?? [],
    })),
    features: GAMEPLAY_FEATURES.map((feature) => ({
      key: feature.key,
      label: feature.label,
      summary: feature.summary,
      requiresSystems: feature.requiresSystems ?? [],
    })),
    screens: UI_SCREENS.map((screen) => ({ key: screen, label: SCREEN_LABELS[screen] })),
    themes: Object.keys(UI_THEMES),
    terrain: TERRAIN_PRESETS.map((preset) => ({ key: preset, label: TERRAIN_LABELS[preset] })),
    packs: MARKETPLACE_PACKS.map((pack) => ({
      id: pack.id,
      name: pack.name,
      category: pack.category,
      description: pack.description,
      tags: pack.tags,
    })),
    assetKinds: Object.values(ASSET_PRESETS).map((preset) => ({
      kind: preset.kind,
      label: preset.label,
      width: preset.width,
      height: preset.height,
      usage: preset.usage,
    })),
  }));

/** Preview a full game build without touching the project. */
export const planGameBuild = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => PlanInput.parse(input))
  .handler(async ({ data }) => projectPlan(planBuild(toPlanRequest(data))));

async function assertProject(
  supabase: { from: (table: string) => any },
  projectId: string,
  userId: string,
) {
  const { data: project, error } = await supabase
    .from("projects")
    .select("id")
    .eq("id", projectId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!project) throw new Error("Project not found");
  return project;
}

async function queue(
  supabase: { from: (table: string) => any },
  projectId: string,
  userId: string,
  actions: QueueAction[],
) {
  const canonical = canonicalizeActions(actions as never);
  const rows = (canonical.actions as QueueAction[]).map((action, index) => ({
    project_id: projectId,
    user_id: userId,
    kind: action.kind,
    parent_path: action.parent_path,
    name: action.name,
    position: index,
    payload: action.payload ?? {},
  }));

  // Insert in chunks: a full game build can be hundreds of rows.
  for (let start = 0; start < rows.length; start += 100) {
    const { error } = await supabase.from("plugin_actions").insert(rows.slice(start, start + 100));
    if (error) throw new Error(error.message);
  }

  return {
    queued: rows.length,
    notes: canonical.notes ?? [],
    fixedLuauCount: canonical.fixedLuauCount ?? 0,
    droppedEmptyScripts: canonical.droppedEmptyScripts ?? 0,
  };
}

/** Build the whole game and queue every action for the Studio plugin. */
export const queueGameBuild = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => PlanInput.extend({ projectId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const ctx = context as any;
    const { supabase, userId } = ctx;
    await assertProject(supabase, data.projectId, userId);

    const plan = planBuild(toPlanRequest(data));
    const result = await queue(supabase, data.projectId, userId, plan.actions as QueueAction[]);

    return { ...result, plan: projectPlan(plan) };
  });

/** Regenerate only the selected scripts, merging into existing sources. */
export const regenerateScripts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    PlanInput.extend({
      projectId: z.string().uuid(),
      selectors: z.array(z.string().min(1).max(160)).min(1).max(80),
      strategy: z.enum(["keep_existing", "append_section", "replace"]).optional(),
      existingSources: z.record(z.string(), z.string().max(200000)).optional(),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const ctx = context as any;
    const { supabase, userId } = ctx;
    await assertProject(supabase, data.projectId, userId);

    const plan = planBuild(toPlanRequest(data));
    const result = regenerateSelected({
      plan,
      selectors: data.selectors,
      existingSources: data.existingSources ?? {},
      strategy: data.strategy ?? "append_section",
    });

    if (result.actions.length === 0) {
      return { queued: 0, regenerated: [], skipped: result.skipped, notes: ["Nothing needed regenerating"] };
    }

    const queued = await queue(supabase, data.projectId, userId, result.actions as QueueAction[]);
    return { ...queued, regenerated: result.regenerated, skipped: result.skipped };
  });

/** Install a marketplace pack into a project. */
export const installMarketplacePack = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ projectId: z.string().uuid(), packId: z.string().min(1).max(60) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const ctx = context as any;
    const { supabase, userId } = ctx;
    await assertProject(supabase, data.projectId, userId);

    const pack = getPack(data.packId);
    if (!pack) throw new Error(`Unknown pack: ${data.packId}`);

    const actions: QueueAction[] = pack.build().map((artifact) => ({
      kind:
        artifact.className === "ModuleScript"
          ? "modulescript"
          : artifact.className === "LocalScript"
            ? "localscript"
            : "script",
      parent_path: artifact.parentPath,
      name: artifact.name,
      payload: { source: artifact.source, _bloxsmith: { pack: pack.id } },
    }));

    const result = await queue(supabase, data.projectId, userId, actions);
    return { ...result, pack: { id: pack.id, name: pack.name, description: pack.description } };
  });

/** Search the marketplace. */
export const browseMarketplace = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ query: z.string().max(80).optional() }).parse(input))
  .handler(async ({ data }) =>
    searchPacks(data.query ?? "").map((pack) => ({
      id: pack.id,
      name: pack.name,
      category: pack.category,
      description: pack.description,
      tags: pack.tags,
      artifactCount: pack.build().length,
    })),
  );

/** Import uploaded / pasted Lua and queue it into the right services. */
export const importProjectScripts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        projectId: z.string().uuid(),
        files: z
          .array(z.object({ path: z.string().min(1).max(400), content: z.string().max(400000) }))
          .min(1)
          .max(120),
        autoFormat: z.boolean().optional(),
        strategy: z.enum(["keep_existing", "append_section", "replace"]).optional(),
        existingSources: z.record(z.string(), z.string().max(200000)).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const ctx = context as any;
    const { supabase, userId } = ctx;
    await assertProject(supabase, data.projectId, userId);

    const imported = importScripts(data.files);
    const actions: QueueAction[] = [];
    const report: Array<{
      name: string;
      className: string;
      parentPath: string;
      notes: string[];
      issues: ReturnType<typeof validateLuau>;
      perf: ReturnType<typeof analyzeLuauPerformance>;
      mergeNote: string;
    }> = [];

    for (const script of imported) {
      const fixed = autoFixLuau(script.source);
      let source = data.autoFormat === false ? fixed.source : formatLua(fixed.source);

      const key = `${script.parentPath}.${script.name}`;
      const existing = data.existingSources?.[key] ?? data.existingSources?.[script.name];
      const merged = mergeScript(existing, source, data.strategy ?? "append_section");
      source = merged.source;

      report.push({
        name: script.name,
        className: script.className,
        parentPath: script.parentPath,
        notes: [...script.notes, ...fixed.fixes],
        issues: validateLuau(source),
        perf: analyzeLuauPerformance(source),
        mergeNote: merged.note,
      });

      actions.push({
        kind:
          script.className === "ModuleScript"
            ? "modulescript"
            : script.className === "LocalScript"
              ? "localscript"
              : "script",
        parent_path: script.parentPath,
        name: script.name,
        payload: { source, _bloxsmith: { source: "script_inserter" } },
      });
    }

    const result = await queue(supabase, data.projectId, userId, actions);
    return { ...result, scripts: report };
  });

/** Format, search, replace and outline helpers for the script editor. */
export const analyzeProjectScripts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        scripts: z
          .array(
            z.object({
              path: z.string().min(1).max(300),
              name: z.string().min(1).max(120),
              className: z.enum(["Script", "LocalScript", "ModuleScript"]),
              source: z.string().max(400000),
            }),
          )
          .min(1)
          .max(200),
        search: z.string().max(200).optional(),
        replaceWith: z.string().max(200).optional(),
        regex: z.boolean().optional(),
        caseSensitive: z.boolean().optional(),
        format: z.boolean().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const files = data.scripts;

    const perFile = files.map((file) => {
      const perf = analyzeLuauPerformance(file.source);
      return {
        path: file.path,
        name: file.name,
        className: file.className,
        lines: file.source.split("\n").length,
        issues: validateLuau(file.source),
        perf,
        score: performanceScore(perf),
        outline: outlineLua(file.source),
        formatted: data.format ? formatLua(file.source) : undefined,
      };
    });

    const hits = data.search
      ? searchScripts(files, data.search, { regex: data.regex, caseSensitive: data.caseSensitive })
      : [];

    const replaced =
      data.search && typeof data.replaceWith === "string"
        ? replaceInScripts(files, data.search, data.replaceWith, {
            regex: data.regex,
            caseSensitive: data.caseSensitive,
          })
        : null;

    const allPerf = perFile.flatMap((file) => file.perf);

    return {
      files: perFile,
      hits,
      replaced: replaced
        ? {
            replacements: replaced.replacements,
            changedPaths: replaced.changedPaths,
            files: replaced.files.map((file) => ({ path: file.path, source: file.source })),
          }
        : null,
      health: {
        score: performanceScore(allPerf),
        errors: allPerf.filter((finding) => finding.severity === "error").length,
        warnings: allPerf.filter((finding) => finding.severity === "warn").length,
        byCategory: allPerf.reduce<Record<string, number>>((acc, finding) => {
          acc[finding.category] = (acc[finding.category] ?? 0) + 1;
          return acc;
        }, {}),
      },
    };
  });

/** Prompt set for the AI asset generator. */
export const planGameAssets = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        title: z.string().min(1).max(80),
        theme: z.string().min(1).max(200),
        style: z.enum(["neon", "cartoon", "realistic", "low_poly", "pixel", "anime"]).optional(),
        requests: z
          .array(
            z.object({
              kind: z.enum(Object.keys(ASSET_PRESETS) as [string, ...string[]]),
              subject: z.string().min(1).max(200),
              extra: z.string().max(300).optional(),
            }),
          )
          .max(30)
          .optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    if (data.requests && data.requests.length > 0) {
      return {
        prompts: data.requests.map((request) =>
          compileAssetPrompt({
            kind: request.kind as never,
            subject: request.subject,
            style: data.style,
            extra: request.extra,
          }),
        ),
      };
    }
    return { prompts: defaultAssetPlan(data.title, data.theme, data.style ?? "cartoon") };
  });

/** One-click export: a complete Studio project (Rojo + installer + README). */
export const exportStudioProject = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    PlanInput.extend({
      projectName: z.string().max(80).optional(),
      extraScripts: z
        .array(
          z.object({
            className: z.enum(["Script", "LocalScript", "ModuleScript"]),
            name: z.string().min(1).max(120),
            parentPath: z.string().min(1).max(240),
            source: z.string().max(400000),
          }),
        )
        .max(200)
        .optional(),
      assetIds: z.array(z.object({ label: z.string().max(80), assetId: z.string().max(80) })).max(60).optional(),
    }).parse(input),
  )
  .handler(async ({ data }) => {
    const plan = planBuild(toPlanRequest(data));
    const scripts = [
      ...plan.artifacts.map((artifact) => ({
        className: artifact.className,
        name: artifact.name,
        parentPath: artifact.parentPath,
        source: artifact.source,
      })),
      ...(data.extraScripts ?? []),
    ];

    const exported = buildStudioExport(data.projectName || plan.title, scripts, {
      assetIds: data.assetIds,
      notes: plan.summary,
    });

    return {
      projectName: exported.projectName,
      scriptCount: exported.scriptCount,
      files: exported.files,
      summary: plan.summary,
    };
  });
