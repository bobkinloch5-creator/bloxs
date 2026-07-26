// Smart Toolbox Engine — server functions exposing safe Creator Store search
// and one-click insert to the plugin queue.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { searchRobloxToolbox, sanitizeInsertAssetActions, testAssetAuthorization, type InsertSanitizeReport, type ToolboxCategory, type ToolboxResult } from "@/lib/roblox-toolbox.server";

const SearchInput = z.object({
  query: z.string().min(2).max(120),
  category: z.enum(["Model", "Audio", "Decal", "Mesh"]).optional(),
  limit: z.number().int().min(1).max(24).optional(),
  page: z.number().int().min(0).max(200).optional(),
  singleAssetOnly: z.boolean().optional(),
});

export const searchToolboxAssets = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => SearchInput.parse(input))
  .handler(async ({ data }) => {
    const cat: ToolboxCategory = data.category ?? "Model";
    const out = await searchRobloxToolbox(data.query, cat, data.limit ?? 12, {
      singleAssetOnly: data.singleAssetOnly,
      page: data.page ?? 0,
    });
    // Project a slim wire format so we don't ship internal scoring details.
    const results = out.results.map((r: ToolboxResult) => ({
      id: r.id,
      name: r.name,
      creatorName: r.creatorName,
      creatorType: r.creatorType,
      verifiedCreator: !!r.verifiedCreator,
      endorsed: !!r.endorsed,
      thumbnail: r.thumbnail ?? null,
      assetType: r.assetType ?? null,
      qualityTier: r.qualityTier ?? "usable",
      score: typeof r.score === "number" ? r.score : 0,
      relevance: typeof r.relevance === "number" ? r.relevance : 0,
      hasScripts: !!r.hasScripts,
      scriptCount: r.scriptCount ?? 0,
      upVotePercent: r.upVotePercent ?? null,
      reason: r.reason ?? null,
      sourceQuery: r.sourceQuery ?? data.query,
    }));
    return { source: out.source, query: data.query, category: cat, results, scanned: out.scanned, page: out.page, hasMore: out.hasMore };
  });

export const testToolboxAssetAuthorization = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ assetId: z.number().int().positive() }).parse(input))
  .handler(async ({ data }) => testAssetAuthorization(data.assetId));

const InsertInput = z.object({
  projectId: z.string().uuid(),
  parentPath: z.string().min(1).max(200).optional(),
  folderName: z.string().min(1).max(80).optional(),
  assets: z
    .array(
      z.object({
        id: z.number().int().positive(),
        name: z.string().min(1).max(120),
        creatorName: z.string().max(120).optional(),
        sourceQuery: z.string().max(120).optional(),
      }),
    )
    .min(1)
    .max(20),
});

export const queueToolboxInsert = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => InsertInput.parse(input))
  .handler(async ({ data, context }) => {
    const ctx = context as any;
    const supabase = ctx?.supabase;
    const userId = ctx?.userId;

    // Confirm the project belongs to the caller (defence-in-depth on top of RLS).
    const { data: project, error: projErr } = await supabase
      .from("projects")
      .select("id")
      .eq("id", data.projectId)
      .eq("user_id", userId)
      .maybeSingle();
    if (projErr) throw new Error(projErr.message);
    if (!project) throw new Error("Project not found");

    const singleAsset = data.assets.length === 1;
    const parentPath = data.parentPath?.trim() || "Workspace";
    const isMapLike = (q?: string | null, n?: string | null) => {
      const s = `${q ?? ""} ${n ?? ""}`.toLowerCase();
      return /\b(map|obby|world|place|scene|environment|biome|city|town|village|island|dungeon|arena|lobby|tycoon|racing|track|parkour|showcase|kit|pack|bundle|collection|game|forest|jungle|desert|mountain|terrain|building|interior|house\s*interior|street|neighbourhood|neighborhood|district)\b/.test(s);
    };
    const folder = (singleAsset ? "BloxSmith_Assets" : (data.folderName?.trim() || `BloxSmith_${niceFolder(data.assets[0]?.sourceQuery ?? "Toolbox")}`))
      .replace(/[^\w-]+/g, "_")
      .slice(0, 60);

    const rows = data.assets.map((a, i) => {
      const mapLike = isMapLike(a.sourceQuery, a.name);
      return ({
      project_id: data.projectId,
      user_id: userId,
      kind: "insert_asset",
      parent_path: `${parentPath}/${folder}`,
      name: cleanName(a.name),
      position: i,
      payload: {
        asset_id: a.id,
        asset_name: cleanName(a.name),
        creator_name: a.creatorName ?? null,
        source_query: a.sourceQuery ?? null,
        toolbox_only: true,
        free_only: true,
        no_scripts: true,
        strip_scripts: true,
        allow_scripts: false,
        disable_procedural_fallback: true,
        is_map: mapLike || undefined,
        ...(singleAsset ? (mapLike ? {
          // Maps/kits are large by design — insert the whole model as-is,
          // just strip scripts for safety. Don't cap children.
          single_asset_only: true,
          extract_single: false,
          exact_quantity: 1,
          reject_pack_names: false,
          stop_after_insert: true,
          preserve_hierarchy: true,
        } : {
          single_asset_only: true,
          extract_single: true,
          exact_quantity: 1,
          max_children: 25,
          max_scripts: 0,
          reject_pack_names: true,
          stop_after_insert: true,
        }) : {}),
        _bloxsmith: {
          source: "smart_toolbox_picker",
          execution_mode: "fast",
          ground_snap: true,
          anchor: true,
          dedupe: true,
          single_asset_mode: singleAsset,

        },
      },
    });
    });

    // Validate before queuing: Studio InsertService rejects many Creator Store
    // assets that appear public in search. Promote safe fallbacks or drop the
    // action so unauthorized IDs never reach Studio from the picker.
    const report: InsertSanitizeReport = { dropped: [], replaced: [] };
    const insertable = [...rows];
    await sanitizeInsertAssetActions(insertable as unknown as Array<Record<string, unknown>>, report);
    if (insertable.length === 0) {
      const first = report.dropped[0];
      return {
        ok: false as const,
        queued: 0,
        folder,
        reason: "no_authorized_assets" as const,
        dropReason: first?.reason ?? "unauthorized",
        dropped: report.dropped,
        replaced: report.replaced,
      };
    }
    const { data: queuedRows, error } = await supabase
      .from("plugin_actions")
      .insert(insertable)
      .select("id");
    if (error) throw new Error(error.message);
    return {
      ok: true as const,
      queued: insertable.length,
      actionIds: (queuedRows ?? []).map((row: any) => row.id),
      folder,
      dropped: rows.length - insertable.length,
      dropDetails: report.dropped,
      replaced: report.replaced,
    };
  });


function cleanName(s: string): string {
  const t = s.replace(/[\u0000-\u001f]+/g, " ").replace(/\s+/g, " ").trim();
  return (t.length ? t : "ToolboxAsset").slice(0, 80);
}
function niceFolder(s: string): string {
  return s
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 3)
    .map((w) => w[0].toUpperCase() + w.slice(1).toLowerCase())
    .join("");
}
